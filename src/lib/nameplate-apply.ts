/**
 * 銘板の読み取り: 画面で使う決まり（2026-11-03）。★ブラウザで読む（キー・サーバの部品は入れない）。
 * 設計: docs/銘板の読み取り_使いながら学ぶ_設計_20261103.md（2. 使うときの流れ）
 *
 * ・どこで何の欄を見せるか（測定機器の台帳／様式の「製造者名」「型式等」）
 * ・様式の欄の組（<prefix>_maker と <prefix>_model）を拾う
 * ・校正年月日を日付の欄（YYYY-MM-DD）に入れられる形にする
 * ・写真を縮める大きさ
 */
import type { NameplatePurpose } from "./nameplate-api.ts"
import type { NameplateConsensus } from "./nameplate-consensus.ts"
import { normalizeNameplateText, type NameplateFieldKey } from "./nameplate-reading.ts"

/**
 * 画面に出す欄（★ここに出した欄だけが答え合わせに数えられる・nameplateOutcomes）
 *   測定機器 … 台帳の 4 つ（製造者名・型式・製造番号・校正年月日）
 *   設備     … 様式の「製造者名」「型式等」。型式等は「型式（型式番号）」で入れる（転記の Q2）
 */
export const NAMEPLATE_DIALOG_FIELDS: Record<NameplatePurpose, readonly NameplateFieldKey[]> = {
    instrument: ["maker", "model", "serial_number", "calibrated_at"],
    device: ["maker", "model", "approval_number"],
}

export type NameplateValues = Partial<Record<NameplateFieldKey, string>>

/** 多数決の値を入れた最初の値（★none の欄は空のまま。推測で埋めない） */
export function nameplateInitialValues(consensus: NameplateConsensus, keys: readonly NameplateFieldKey[]): NameplateValues {
    return Object.fromEntries(keys.map((k) => [k, consensus.fields[k]?.value ?? ""])) as NameplateValues
}

/** 答え合わせに送る値（空は null・前後の空白は落とす） */
export function nameplateConfirmValues(values: NameplateValues, keys: readonly NameplateFieldKey[]): Partial<Record<NameplateFieldKey, string | null>> {
    return Object.fromEntries(keys.map((k) => [k, (values[k] ?? "").trim() || null]))
}

const ERA_START: Record<string, number> = { 令和: 2018, R: 2018, 平成: 1988, H: 1988, 昭和: 1925, S: 1925 }

/**
 * 校正年月日を日付の欄（YYYY-MM-DD）の形に。年・月・日がそろわない・ありえない日付なら null（★欄は変えない）。
 * 2024.4.12・2024/04/12・2024年4月12日・２０２４－０４－１２・R6.4.12・令和元年5月1日 → YYYY-MM-DD
 */
export function nameplateIsoDate(value: string | null | undefined): string | null {
    if (!value) return null
    const s = normalizeNameplateText(value)
    const era = /^(令和|平成|昭和|R|H|S)(元|\d{1,2})\D+(\d{1,2})\D+(\d{1,2})\D*$/.exec(s)
    const nums = era ? [String(ERA_START[era[1]] + (era[2] === "元" ? 1 : Number(era[2]))), era[3], era[4]] : s.match(/\d+/g)
    if (!nums || nums.length !== 3) return null
    const [ys, ms, ds] = nums
    if (!/^(19|20)\d{2}$/.test(ys)) return null
    const y = Number(ys)
    const m = Number(ms)
    const d = Number(ds)
    if (m < 1 || m > 12 || d < 1 || d > 31) return null
    const dt = new Date(Date.UTC(y, m - 1, d))
    if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
    return `${ys}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

/** 様式の「製造者名」「型式等」の組（<prefix>_maker と <prefix>_model がそろっているもの） */
export type NameplateFieldPair = { prefix: string; device: string; makerKey: string; modelKey: string }

/**
 * 様式の追加の欄から組を拾う。device は欄の名前から「製造者名」を除いたもの（例：「受信機 製造者名」→「受信機」）。
 * ★欄の名前が「製造者名」だけ（第18 排煙機など）のときは空（ボタンは「銘板を撮って読む」だけ）。
 */
export function nameplateFieldPairs(fields: readonly { key: string; label: string; type?: string }[]): NameplateFieldPair[] {
    const keys = new Set(fields.filter((f) => f.type !== "checkbox").map((f) => f.key))
    const out: NameplateFieldPair[] = []
    for (const f of fields) {
        const m = /^(.+)_maker$/.exec(f.key)
        if (!m || f.type === "checkbox") continue
        const modelKey = `${m[1]}_model`
        if (!keys.has(modelKey)) continue
        out.push({ prefix: m[1], device: f.label.replace(/\s*製造者名\s*$/, "").trim(), makerKey: f.key, modelKey })
    }
    return out
}

/** 写真を縮める大きさ（長い辺を max に。小さい写真は大きくしない） */
export function nameplateTargetSize(width: number, height: number, max: number): { width: number; height: number } {
    const long = Math.max(width, height)
    if (!(long > max)) return { width: Math.round(width), height: Math.round(height) }
    const r = max / long
    return { width: Math.max(1, Math.round(width * r)), height: Math.max(1, Math.round(height * r)) }
}
