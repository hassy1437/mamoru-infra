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
