/**
 * 日付文字列ユーティリティ（クライアント安全・純粋関数）。
 *
 * 注意: PDF描画用の `pdf-form-helpers.ts` は pdf-lib を import するため、
 * フォーム（クライアント）からは流用しない。日付の表示正規化はここに集約する。
 */

/**
 * 任意の日付文字列を `<input type="date">` 用の `yyyy-MM-dd` に正規化する。
 * - "2026/1/31"  -> "2026-01-31"
 * - "2026-01-15" -> "2026-01-15"
 * - "2026/12/5"  -> "2026-12-05"
 * - ""           -> ""
 * - 解析不能/範囲外 -> ""（type=date は無効値を表示できないため空にする）
 *
 * 年は4桁前提。月日はゼロ埋め。区切りは非数字なら何でも可（/ - . 年月日 等）。
 * 既存の手入力データ（スラッシュ区切り等）との後方互換のために用いる。
 */
export function toDateInputValue(value: unknown): string {
    const raw = String(value ?? "").trim()
    if (!raw) return ""

    const m = raw.match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})\D*$/)
    if (!m) return ""

    const month = Number(m[2])
    const day = Number(m[3])
    if (month < 1 || month > 12 || day < 1 || day > 31) return ""

    return `${m[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

/**
 * 年/月/日 別フィールド (3 分割) を `<input type="date">` 用の `yyyy-MM-dd` に組み立てる。
 * - "2026","2","15"  -> "2026-02-15"
 * - "2026","12","5"  -> "2026-12-05"
 * - "","","" or 部分入力 -> ""（type=date は無効値を表示できないため空にする）
 *
 * 既存の年/月/日 別フィールドデータ（itiran-form の交付年月日 / 有効期限）からの
 * 後方互換組み立てに用いる。
 */
export function toDateInputValueFromParts(year: unknown, month: unknown, day: unknown): string {
    const y = String(year ?? "").trim()
    const m = String(month ?? "").trim()
    const d = String(day ?? "").trim()
    if (!y || !m || !d) return ""
    if (!/^\d{4}$/.test(y)) return ""
    const mn = Number(m)
    const dn = Number(d)
    if (!Number.isFinite(mn) || !Number.isFinite(dn)) return ""
    if (mn < 1 || mn > 12 || dn < 1 || dn > 31) return ""
    return `${y}-${String(mn).padStart(2, "0")}-${String(dn).padStart(2, "0")}`
}

/**
 * `<input type="date">` の戻り値 (`yyyy-MM-dd` or `""`) を年/月/日に分解する。
 * - "2026-02-15" -> { year: "2026", month: "2", day: "15" }
 * - "" or 不正  -> { year: "", month: "", day: "" }
 *
 * 月日はゼロ埋めなしの数値文字列（既存 PDF 描画 / 別フィールド保存と互換）。
 */
export function splitDateInputValue(value: unknown): { year: string; month: string; day: string } {
    const raw = String(value ?? "").trim()
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!m) return { year: "", month: "", day: "" }
    return { year: m[1], month: String(Number(m[2])), day: String(Number(m[3])) }
}

/**
 * 年/月 別フィールド (2 分割) を `<input type="month">` 用の `yyyy-MM` に組み立てる。
 * - "2026","3"  -> "2026-03"
 * - "" or 部分入力 -> ""
 *
 * 講習受講年月の組み立てに用いる。
 */
export function toMonthInputValueFromParts(year: unknown, month: unknown): string {
    const y = String(year ?? "").trim()
    const m = String(month ?? "").trim()
    if (!y || !m) return ""
    if (!/^\d{4}$/.test(y)) return ""
    const mn = Number(m)
    if (!Number.isFinite(mn) || mn < 1 || mn > 12) return ""
    return `${y}-${String(mn).padStart(2, "0")}`
}

/**
 * `<input type="month">` の戻り値 (`yyyy-MM` or `""`) を年/月に分解する。
 * - "2026-03" -> { year: "2026", month: "3" }
 * - "" or 不正 -> { year: "", month: "" }
 */
export function splitMonthInputValue(value: unknown): { year: string; month: string } {
    const raw = String(value ?? "").trim()
    const m = raw.match(/^(\d{4})-(\d{2})$/)
    if (!m) return { year: "", month: "" }
    return { year: m[1], month: String(Number(m[2])) }
}
