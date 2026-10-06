/**
 * 別記の入力画面の「見出し行」（2026-10-07）。
 *
 * ■ なぜ要るか（2026-10-07 のフル印字テストで実測）
 *   行ラベルに「見出し行・通常入力不要」とある行は、紙では全幅の見出し（「機器点検」「総合点検」）で、route は描かない
 *   （blankPrintedRows・scripts/check-header-rows.py が両側の一致を見る）。
 *   ところが入力画面は普通の行として 判定・内容・不良内容・措置内容 の欄を出していた
 *   ＝ 「否」と不良内容を入れても紙には出ず、黙って消える。「すべて良にする」もこの行に「良」を入れていた。
 *
 * ■ 決めたこと
 *   見出し行は入力欄を出さず、見出しとして表示する。行の数と添字は変えない（payload の行の位置は今までどおり）。
 */
export const isBekkiHeadingLabel = (label: string): boolean => label.includes("見出し行")

/** 見出しとして見せる文字（「（見出し行・通常入力不要）」の注記は外す） */
export const bekkiHeadingText = (label: string): string =>
    label.replace(/（見出し行[^）]*）/, "").trim() || label
