/**
 * 点検票の行の欄を 1 つ替える（定期テスト第11回の 79・2026-11-16）。
 *
 * ■ なぜ要るか
 *   判定を「否」にして不良内容を書いたあと「良」に戻しても、不良内容が欄に残っていた。
 *   確定前の確認にも出ず、PDF では判定「○（良）」の行に不良内容がそのまま印字された（消防署に出す点検票が食い違う）。
 *
 * ■ 決まり
 *   ★判定を「否」から「良」に替えたときだけ、その行の不良内容と不良個数（消火器の票）を消す。
 *   ★措置内容は残す（良の行に措置を書くことはある・清掃した など）。
 *   ★「否」をもう一度押して未入力に戻したとき（""）は消さない（押し間違えて戻すと書いた字が消えないように）。
 *   ★すでに保存された「良」の行の不良内容は、確定前の確認（src/lib/report-readiness.ts の bekki_good_with_bad）が知らせる。
 *   点検票 9 つ（共通の土台と第1〜8）の行の書き換えは、どれもこの関数を通す。
 */
type JudgedRow = { judgment?: string; bad_content?: string; bad_count?: string }

export function changeRowField<R extends JudgedRow>(row: R, field: keyof R & string, value: string): R {
    const next = { ...row, [field]: value } as R
    if (field !== "judgment" || value !== "良" || row.judgment !== "否") return next
    return {
        ...next,
        ...("bad_content" in row ? { bad_content: "" } : {}),
        ...("bad_count" in row ? { bad_count: "" } : {}),
    }
}
