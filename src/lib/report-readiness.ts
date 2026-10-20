import { BEKKI_ROW_LABELS } from "@/lib/bekki-row-labels"
import { isBekkiHeadingLabel } from "@/lib/bekki-heading-row"
import { PDF_MERGE_CONFIG } from "@/lib/pdf-merge-config"
import { bekkiInspectorInitial, normalizeInspectorData } from "@/lib/inspector-helpers"
import { INSPECTOR_FIELD_LABELS, inspectorDiff, itiranInspectorFields } from "@/lib/inspector-sync"
import { DEFAULT_GOOD_READINESS_MESSAGE, isJudgmentsDefaulted } from "@/lib/bekki-default-good"
import { buildItiranInputHref, getItiranInputPageTitle, type ItiranInputStepId } from "@/lib/itiran-input-flow"

/**
 * 確定の前・出力の前の不備チェック（2026-10-19・打合せ録音 #101 で決定）。
 *
 * ■ なぜ要るか
 *   確定の前に見ているのは、総括表の入力画面の HTML の required だけだった。DB の確定（finalize_soukatsu）は
 *   所有者・契約・設備の有無・重複しか見ない。複製・物件マスタの転記・編集で空になった欄は、そのまま
 *   確定（＝利用料。業者都合では取り消せない・規約 第12条5項）まで進めた。
 *   出力画面も「報告書（様式第１）」をいつも準備済みと出し、何が足りないかを言わなかった。
 *
 * ■ 決めたこと
 *   ・必須（missing）… 届出者の氏名・住所／名称／所在地／用途／延べ面積／地上階数／点検年月日／設備 1 つ以上。
 *     ★止めるのは画面の確定ボタンだけ。DB では止めない
 *       （src/lib/finalization.ts の「判定できないときは止めない」。ここを DB に入れると、判定を誤ったときに確定ごと止まる）
 *   ・注意（warnings）… 止めない。知らせて、直す画面へのリンクを出す
 *     - 総括表で「要改善」なのに不良内容（bad_detail）が空（様式の備考2「不良の場合は不良内容欄に記入」）
 *     - 点検者1の氏名・資格（免状）・電話番号が無い ★itiran を渡したときだけ（確定の前は点検者一覧がまだ無いのが普通）
 *     - 表紙の報告年月日が空（★空欄で印字する＝手書き用なので止めない・2026-10-20・録音 102）
 *     ★点検者 1 の氏名・資格・電話番号と報告年月日は、赤で目立たせる（urgent・録音 102）
 *     - 別記で「否」なのに不良内容（bad_content）が空 ★stepIds を渡したときだけ
 *     - 様式が未入力 ★同上
 *     - ★判定が初期値（良）のまま（2026-10-20・録音 102・src/lib/bekki-default-good.ts）★同上。止めない
 *   ・関数は純粋（DB を読まない）。画面は読んだ行を渡すだけ ＝ scripts/check-report-readiness.mjs が直接動かせる
 */

export type ReadinessLevel = "required" | "warning"

/** 直す画面（リンクは readinessFixHref で作る） */
export type ReadinessFix =
    | { kind: "soukatsu"; anchor?: string }
    | { kind: "property" }
    | { kind: "itiran" }
    | { kind: "bekki"; stepId: string }

export type ReadinessItem = {
    id: string
    level: ReadinessLevel
    label: string
    ok: boolean
    /** 何が足りないか（ok のときは空文字） */
    message: string
    /** 該当する設備・行の名前（多いときは先頭だけ＋「ほか N 件」） */
    details: string[]
    /** 直す画面。直せる画面が無ければ null */
    fix: ReadinessFix | null
    /**
     * ★赤で目立たせる注意（2026-10-20・録音 102「点検者の電話番号・資格区分・報告日など、不足している項目は一覧で赤く光らせる」）。
     *   止めないのは他の注意と同じ（確定・出力はできる）
     */
    urgent?: boolean
}

export type ReportReadiness = {
    /** 必須の項目すべて（★入っているものも含む＝チェックリストとして全部出す） */
    required: ReadinessItem[]
    /** 必須のうち空のもの。★1 つでもあれば確定のボタンを押せない（画面だけ） */
    missing: ReadinessItem[]
    /** 注意（★入っていないものだけ）。止めない */
    warnings: ReadinessItem[]
    canFinalize: boolean
}

export type ReadinessInput = {
    /** inspection_soukatsu の行（select("*") のまま） */
    soukatsu: Record<string, unknown> | null | undefined
    /** 点検者一覧の行。★省略（undefined）なら点検者の確認をしない（確定の前はまだ無いのが普通） */
    itiran?: { inspector1?: unknown } | null
    /** 別記の保存内容（stepId → payload） */
    bekkiPayloads?: Record<string, Record<string, unknown>>
    /** この物件で入力する別記の stepId。★省略なら別記の確認をしない */
    stepIds?: readonly string[]
}

/** 前後の空白を除いた文字列。数値は文字にする（それ以外は空） */
const text = (v: unknown): string =>
    typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : ""

/** 数として読めれば数（numeric 列は文字列で来ることがある）。読めなければ null */
const num = (v: unknown): number | null => {
    if (typeof v === "number") return Number.isFinite(v) ? v : null
    if (typeof v === "string" && v.trim() !== "") {
        const n = Number(v)
        return Number.isFinite(n) ? n : null
    }
    return null
}

/** 多いときは先頭だけ出す（画面が縦に伸びすぎないように） */
const DETAIL_LIMIT = 5
const clip = (list: string[]): string[] =>
    list.length <= DETAIL_LIMIT ? list : [...list.slice(0, DETAIL_LIMIT), `ほか ${list.length - DETAIL_LIMIT} 件`]

type FieldRule = {
    /** inspection_soukatsu の列名 */
    column: string
    label: string
    /** 総括表の編集画面（soukatsu-edit-form.tsx）の入力欄の id */
    anchor: string
    filled: (v: unknown) => boolean
}

/**
 * 必須の欄（総括表の列）。★並びは画面のチェックリストの並び。
 *   ★延べ面積は 0 も空とみなす（様式第１に「0㎡」と刷られた報告書は出せない）。
 *   ★地上階数は 0 を通す（入力は 1 階からだが、地下だけの建物で 0 が正しいことがある）。
 */
const REQUIRED_FIELDS: readonly FieldRule[] = [
    { column: "notifier_name", label: "届出者の氏名", anchor: "notifierName", filled: (v) => text(v) !== "" },
    { column: "notifier_address", label: "届出者の住所", anchor: "notifierAddress", filled: (v) => text(v) !== "" },
    { column: "building_name", label: "防火対象物の名称", anchor: "buildingName", filled: (v) => text(v) !== "" },
    { column: "building_address", label: "防火対象物の所在地", anchor: "buildingAddress", filled: (v) => text(v) !== "" },
    { column: "building_usage", label: "用途", anchor: "buildingUsage", filled: (v) => text(v) !== "" },
    { column: "total_floor_area", label: "延べ面積", anchor: "totalFloorArea", filled: (v) => (num(v) ?? 0) > 0 },
    { column: "floor_above", label: "地上階数", anchor: "floorAbove", filled: (v) => num(v) !== null },
    { column: "inspection_date", label: "点検年月日", anchor: "inspectionDate", filled: (v) => text(v) !== "" },
]

/** 必須の欄の列名（検査スクリプトが 1 つずつ空にして確かめる） */
export const READINESS_REQUIRED_COLUMNS: readonly string[] = REQUIRED_FIELDS.map((f) => f.column)

type EquipmentRow = { name?: unknown; result?: unknown; bad_detail?: unknown }

const equipmentRows = (v: unknown): EquipmentRow[] =>
    Array.isArray(v) ? v.map((e) => (e && typeof e === "object" ? (e as EquipmentRow) : {})) : []

/** 免状が 1 枚でも入っているか（itiran-form.tsx の isInspectorFilled と同じ見方＝どれかの欄に値があれば入っている） */
function hasLicense(raw: unknown): boolean {
    const d = normalizeInspectorData(raw)
    const filled = (l: object) => Object.values(l).some((v) => typeof v === "string" && v.trim() !== "")
    return Object.values(d.shoubou_licenses).some(filled) || Object.values(d.kensa_licenses).some(filled)
}

/** 別記の「否」なのに不良内容が空の行（見出し行は紙に出ないので数えない） */
function badRowsWithoutContent(stepId: string, payload: Record<string, unknown>): string[] {
    const config = PDF_MERGE_CONFIG[stepId as ItiranInputStepId]
    const labelsByKey = config ? BEKKI_ROW_LABELS[`別記様式第${String(config.formNo).replace(".", "の")}`] ?? {} : {}
    const keys = [...new Set([...Object.keys(labelsByKey), ...Object.keys(payload)])]
        .filter((k) => /^page\d+_rows$/.test(k))
        .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]))
    const multi = Object.keys(labelsByKey).length > 1
    const out: string[] = []
    for (const key of keys) {
        const rows = Array.isArray(payload[key]) ? (payload[key] as unknown[]) : []
        const labels = labelsByKey[key] ?? []
        rows.forEach((raw, i) => {
            const row = (raw && typeof raw === "object" ? raw : {}) as { judgment?: unknown; bad_content?: unknown }
            if (row.judgment !== "否" || text(row.bad_content) !== "") return
            const label = labels[i] ?? ""
            if (isBekkiHeadingLabel(label)) return
            const name = label || `${i + 1}行目`
            out.push(multi ? `その${key.match(/\d+/)?.[0]}「${name}」` : `「${name}」`)
        })
    }
    return out
}

const stepTitle = (stepId: string): string =>
    PDF_MERGE_CONFIG[stepId as ItiranInputStepId] ? getItiranInputPageTitle(stepId as ItiranInputStepId) : stepId

export function checkReportReadiness(input: ReadinessInput): ReportReadiness {
    const s = input.soukatsu ?? {}

    const required: ReadinessItem[] = REQUIRED_FIELDS.map((f) => {
        const ok = f.filled(s[f.column])
        return {
            id: f.column,
            level: "required",
            label: f.label,
            ok,
            message: ok ? "" : `${f.label}が入っていません`,
            details: [],
            fix: { kind: "soukatsu", anchor: f.anchor },
        }
    })

    // ★設備の数え方は DB の inspection.normalize_equipment_codes と同じ（名前が空でない行）。
    //   ずれると「画面は押せるのに DB が弾く」か「DB は通すのに画面が止める」になる。
    const rows = equipmentRows(s.equipment_results)
    const equipmentOk = rows.some((r) => text(r.name) !== "")
    required.push({
        id: "equipment",
        level: "required",
        label: "点検した設備（1 つ以上）",
        ok: equipmentOk,
        // ★総括表の編集では設備を足せない（設備名と判定は作成画面で決めたまま・soukatsu-edit-form.tsx）
        message: equipmentOk ? "" : "点検結果に設備が 1 つもありません。物件に設備を登録してから、総括表を作り直してください（総括表の編集では設備を足せません）",
        details: [],
        fix: text(s.property_id) ? { kind: "property" } : null,
    })

    const warnings: ReadinessItem[] = []
    const warn = (id: string, label: string, message: string, details: string[], fix: ReadinessFix | null, urgent = false) =>
        warnings.push({ id, level: "warning", label, ok: false, message, details: clip(details), fix, ...(urgent ? { urgent: true } : {}) })

    // ★表紙の報告年月日（2026-10-20・録音 102）。空なら空欄で印字する（手書き用）ので止めない
    if (text(s.report_date) === "") {
        warn("report_date", "報告年月日", "表紙の報告年月日が空です（空欄のまま印字します。手書きにする場合はそのままで構いません）", [], { kind: "soukatsu", anchor: "reportDate" }, true)
    }

    const noDetail = rows.filter((r) => r.result === "要改善" && text(r.bad_detail) === "").map((r) => text(r.name) || "（設備名なし）")
    if (noDetail.length) {
        warn("soukatsu_bad_detail", "総括表の不良内容", "「要改善」の設備に不良内容が入っていません", noDetail, { kind: "soukatsu", anchor: "equipment-results" })
    }

    // ★点検者は itiran を渡したときだけ（確定の前は点検者一覧がまだ無いのが普通・出力画面で見る）
    if (input.itiran !== undefined) {
        const inspector = normalizeInspectorData(input.itiran?.inspector1)
        if (inspector.name.trim() === "") {
            warn("inspector1_name", "点検者1の氏名", "点検者一覧表に点検者1の氏名が入っていません（総括表の点検実施責任者の欄にも使います）", [], { kind: "itiran" }, true)
        }
        if (!hasLicense(input.itiran?.inspector1)) {
            warn("inspector1_license", "点検者1の資格", "点検者一覧表に点検者1の免状（消防設備士・消防設備点検資格者）が入っていません", [], { kind: "itiran" }, true)
        }
        // ★電話番号（2026-10-20・録音 102）。別記の TEL の欄にも使う（inspector-helpers の inspector_tel）
        if (inspector.phone.trim() === "") {
            warn("inspector1_phone", "点検者1の電話番号", "点検者一覧表に点検者1の電話番号が入っていません（別記の TEL の欄の最初の値にもなります）", [], { kind: "itiran" }, true)
        }
    }

    // ★別記は stepIds を渡したときだけ（出力画面）
    // ★点検者一覧表の点検者 1（別記の点検者の最初の値）。保存済みの別記には、あとで直しても届かない（録音 102・src/lib/inspector-sync.ts）
    const itiranInspector = input.itiran ? itiranInspectorFields((({ inspector_name, inspector_company, inspector_address, inspector_tel }) =>
        ({ name: inspector_name, company: inspector_company, address: inspector_address, tel: inspector_tel }))(bekkiInspectorInitial(input.itiran.inspector1))) : null
    for (const stepId of input.stepIds ?? []) {
        const payload = input.bekkiPayloads?.[stepId]
        if (!payload) {
            warn(`bekki_missing:${stepId}`, stepTitle(stepId), "まだ入力していません（入力済みの様式だけが PDF に入ります）", [], { kind: "bekki", stepId })
            continue
        }
        if (itiranInspector) {
            const diff = inspectorDiff({ name: payload.inspector_name, company: payload.inspector_company, address: payload.inspector_address, tel: payload.inspector_tel }, itiranInspector)
            if (diff.length) {
                warn(`bekki_inspector:${stepId}`, stepTitle(stepId), "点検者の欄が点検者一覧表と違います（開いて「点検者一覧表の内容に合わせる」で直せます）",
                    diff.map((k) => INSPECTOR_FIELD_LABELS[k]), { kind: "bekki", stepId })
            }
        }
        const bad = badRowsWithoutContent(stepId, payload)
        if (bad.length) {
            warn(`bekki_bad_content:${stepId}`, stepTitle(stepId), "「否」の行に不良内容が入っていません", bad, { kind: "bekki", stepId })
        }
        // ★初期値の「良」を入れたまま「確かめました」を押していない（見ていない行が良のまま出るおそれ）
        if (isJudgmentsDefaulted(payload)) {
            warn(`bekki_defaulted:${stepId}`, stepTitle(stepId), DEFAULT_GOOD_READINESS_MESSAGE, [], { kind: "bekki", stepId })
        }
    }

    const missing = required.filter((r) => !r.ok)
    return { required, missing, warnings, canFinalize: missing.length === 0 }
}

/** 直す画面のリンク。★作れないとき（点検者一覧がまだ無い・物件が無い）は null */
export function readinessFixHref(
    fix: ReadinessFix | null,
    ctx: { soukatsuId: string; itiranId?: string | null; propertyId?: string | null },
): string | null {
    if (!fix) return null
    switch (fix.kind) {
        case "soukatsu":
            return `/inspection/${ctx.soukatsuId}/edit${fix.anchor ? `#${fix.anchor}` : ""}`
        case "property":
            return ctx.propertyId ? `/properties/${ctx.propertyId}/edit` : null
        case "itiran":
            return ctx.itiranId ? `/inspection/${ctx.soukatsuId}/itiran/${ctx.itiranId}/edit` : null
        case "bekki":
            return ctx.itiranId && PDF_MERGE_CONFIG[fix.stepId as ItiranInputStepId]
                ? buildItiranInputHref(fix.stepId as ItiranInputStepId, ctx.soukatsuId, ctx.itiranId)
                : null
    }
}
