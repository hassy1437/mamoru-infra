// ★クライアントの型はアプリ既定の AppSupabaseClient を使う（スキーマは inspection 固定）。
//   inspection-progress.ts と同じ受け方に揃える。
import type { AppSupabaseClient } from "@/lib/supabase/server"

/**
 * 総括表の「確定」まわりの読み取り。
 *
 * ■ ★マイグレーション（20260811090000）が未適用の間は、機能ごと出さない
 *   規約ゲート（マッチング側 loadTermsGateInput）は「止める機能」なので、
 *   判定できないときは止めない（fail-open）側に倒した。
 *   ★今回は逆で「足す機能」なので、判定できないときは出さない側に倒す。
 *   どちらも原則は同じ ―― 不確かなときは利用者の操作を妨げないほうを選ぶ。
 *   出してしまうと「押せるのにエラーになるボタン」になり、業者は原因が分からない。
 *
 * ■ 判定の仕方
 *   preview_finalization を実際に呼び、関数が無いエラー（PostgREST の PGRST202 /
 *   Postgres の 42883）なら未適用とみなす。★存在確認の別経路（information_schema を
 *   引く等）を作らない。実際に呼ぶ経路と判定の経路が違うと、片方だけ通る状態が生まれる。
 */

export type FinalizationPreview = {
    equipment_codes: string[]
    billable_codes: string[]
    unit_price_yen: number
    amount_yen: number
    duplicate_of: string[] | null
    needs_duplicate_confirm: boolean
}

export type FinalizationRow = {
    id: string
    acted_at: string
    actor_id: string
    equipment_codes: string[]
    billable_codes: string[]
    unit_price_yen: number
    duplicate_confirmed: boolean
}

/** 関数そのものが無い＝マイグレーション未適用 */
function isMissingFunction(err: { code?: string; message?: string } | null): boolean {
    if (!err) return false
    if (err.code === "PGRST202" || err.code === "42883") return true
    return /Could not find the function|does not exist/i.test(err.message ?? "")
}

/** 重複している相手（★「別の点検ですか」と聞く以上、何と比べているかを示す） */
export type DuplicateInfo = {
    soukatsu_id: string
    building_name: string | null
    inspection_date: string | null
    inspection_type: string | null
    finalized_at: string
    equipment_codes: string[]
}

export type FinalizationState =
    /**
     * ★available:false は「確定の仕組みが使えない」。理由を2つに分けて残す。
     *   missing … マイグレーション未適用（関数が無い）
     *   error   … 判定そのものに失敗した（権限・ネットワーク等）
     * ★どちらも PDF のゲートは素通りさせる（fail-open）。区別するのは、
     *   ログと将来の読み手のため ―― 「未適用しか考えていない」と誤読させないこと。
     */
    | { available: false; reason: "missing" | "error" }
    | {
          available: true
          preview: FinalizationPreview | null
          finalized: FinalizationRow[]
          duplicates: DuplicateInfo[]
      }

/**
 * 確定の状態を読む。★未適用なら { available: false } を返し、画面は導線を出さない。
 */
export async function loadFinalizationState(
    supabase: AppSupabaseClient,
    soukatsuId: string,
): Promise<FinalizationState> {
    const { data, error } = await supabase.rpc("preview_finalization", {
        p_soukatsu_id: soukatsuId,
    })

    if (error) {
        if (isMissingFunction(error)) return { available: false, reason: "missing" }
        // ★関数はあるが失敗した。原因を残して、機能は出さない（黙って0円にしない）。
        console.error("[loadFinalizationState] preview_finalization failed:", error)
        return { available: false, reason: "error" }
    }

    // setof を返すので配列で来る
    const preview = (Array.isArray(data) ? data[0] : data) as FinalizationPreview | undefined

    const { data: rows, error: rErr } = await supabase
        .from("soukatsu_finalizations")
        .select("id, acted_at, actor_id, equipment_codes, billable_codes, unit_price_yen, duplicate_confirmed, kind")
        .eq("soukatsu_id", soukatsuId)
        .eq("kind", "finalize")
        .order("acted_at", { ascending: true })
    if (rErr) console.error("[loadFinalizationState] finalizations select failed:", rErr)

    // ★取り消されたものを除く判定は DB 側（active_finalizations）が正だが、
    //   表示のためだけに RPC をもう1本呼ばない。取消済みの表示は F4 以降で扱う。
    // ★重複の相手を引く。preview.duplicate_of は「確定行の id」なので、
    //   そこから総括表まで辿らないと「何と重複しているか」を示せない。
    let duplicates: DuplicateInfo[] = []
    if (preview?.duplicate_of?.length) {
        const { data: dups, error: dErr } = await supabase
            .from("soukatsu_finalizations")
            .select("soukatsu_id, acted_at, equipment_codes")
            .in("id", preview.duplicate_of)
        if (dErr) console.error("[loadFinalizationState] duplicates select failed:", dErr)
        const ids = [...new Set((dups ?? []).map((d) => d.soukatsu_id as string))]
        const { data: souks } = ids.length
            ? await supabase
                  .from("inspection_soukatsu")
                  .select("id, building_name, inspection_date, inspection_type")
                  .in("id", ids)
            : { data: [] as { id: string; building_name: string | null; inspection_date: string | null; inspection_type: string | null }[] }
        const byId = new Map((souks ?? []).map((x) => [x.id as string, x]))
        duplicates = (dups ?? []).map((d) => {
            const s2 = byId.get(d.soukatsu_id as string)
            return {
                soukatsu_id: d.soukatsu_id as string,
                building_name: s2?.building_name ?? null,
                inspection_date: s2?.inspection_date ?? null,
                inspection_type: s2?.inspection_type ?? null,
                finalized_at: d.acted_at as string,
                equipment_codes: (d.equipment_codes as string[]) ?? [],
            }
        })
    }

    return {
        available: true,
        preview: preview ?? null,
        finalized: ((rows ?? []) as unknown as FinalizationRow[]),
        duplicates,
    }
}

/** 金額の表示（★0円も必ず出す。出ないと「課金されたのか分からない」になる） */
export function formatAmount(yen: number): string {
    return `${yen.toLocaleString("ja-JP")}円`
}

/**
 * ★PDF をダウンロードしてよいか（ゲートの判断はここだけが持つ）。
 *
 * ■ ★fail-open
 *   規約 第12条3項は「確定前の下書き作成には課金しない」と定めており、
 *   確定を挟むのはそのため。だが確定の仕組みが使えないときに止めると、
 *   ★確定しようがないのに PDF が出せない ―― 本番が止まる。
 *   ＝ 判定できないときは必ず通す。
 *
 *   通す:  available:false（missing も error も）／確定済みが1件以上
 *   止める: available:true かつ 確定が0件（＝確定できる状態なのに、していない）
 *
 * ■ ★「判定できない」と「確定していない」の区別
 *   前者は available:false、後者は available:true && finalized.length===0。
 *   型で分かれているので、取り違えるとコンパイルが通らない。
 */
export function canDownloadPdf(state: FinalizationState): boolean {
    if (!state.available) return true // ★fail-open
    return state.finalized.length > 0
}

/**
 * ★確定前にPDFを押したときの案内。
 *   「確定してください」だけでは、内容を確認する手段が無いように読める。
 *   下書きの確認手段がプレビューであることが、確定を必須にした判断の根拠なので、
 *   そこを必ず併記する。
 */
export const PDF_GATE_MESSAGE =
    "PDFの出力は、点検を確定してからになります。確定する前でも、下の「プレビュー」で内容はそのままご確認いただけます。"
