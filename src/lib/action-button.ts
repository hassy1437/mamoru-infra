/**
 * ★主な操作のボタン（保存・確定・納品・出力・登録）の大きさ（2026-10-24）。
 *
 * ■ なぜ
 *   橋本さん「提出などのボタンをこれくらいはっきりした大きさにしてほしい」（銀行アプリの「同意する」の画面）。
 *   マッチングサイト（mamoruinfra-web の lib/action-button.ts）と同じ大きさにそろえる。
 *   以前は高さ 40〜44px・14px の文字で、スマホでは押す場所が小さかった。
 *
 * ■ 形
 *   スマホ（640px 未満）… 横いっぱい・高さ 56px・18px の太字
 *   それより広い画面 … 横幅は中身に合わせ、最低 15rem（横いっぱいにすると間延びする）
 *   色 … ボタンごとに今のまま（保存＝濃い灰・プレビュー＝青・PDF＝緑・確定＝青・納品＝ティール）。色の意味は変えない
 *
 * ■ ★使わないところ
 *   ・スマホの画面下の帯（form-action-bar）… 常に出ているので、大きくすると入力欄が隠れる
 *   ・キャンセル・削除など戻せない操作（目立たせると押し間違える）
 *   ・表の中の小さな操作（「この表の空欄を良にする」など）
 *
 * ★Button（components/ui/button.tsx）は tailwind-merge で後ろの class が勝つ。
 *   className に渡せば、既定の h-10・text-sm・rounded-md を上書きできる。
 */

const BASE = "h-auto min-h-14 w-full gap-2 rounded-xl px-6 text-lg font-bold"

/** 主な操作のボタンの大きさ（色は呼ぶ側で足す） */
export const ACTION_BUTTON = `${BASE} sm:w-auto sm:min-w-60`

/** どの画面幅でも横いっぱい（ログインのように細いカードの中で使う） */
export const ACTION_BUTTON_FULL = BASE

/** 点検票のいちばん下の 3 つ（保存・プレビュー・PDF） */
export const SAVE_BUTTON = `${ACTION_BUTTON} bg-slate-700 hover:bg-slate-800 text-white`
export const PREVIEW_BUTTON = `${ACTION_BUTTON} bg-blue-600 hover:bg-blue-700 text-white`
export const DOWNLOAD_BUTTON = `${ACTION_BUTTON} bg-emerald-600 hover:bg-emerald-700 text-white`

/**
 * 「キャンセル」と主な操作を並べる行（確認の窓の下端）。
 *   スマホは主な操作を上に・どちらも横いっぱい。広い画面は右寄せで横に並べる。
 *   ★並べる順は「キャンセル → 主な操作」のまま書く（flex-col-reverse でスマホだけ主な操作が上に来る）
 */
export const ACTION_ROW = "flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end"

/** 行の中の「キャンセル・やめておく」（主な操作より控えめ・押す場所は十分に） */
export const ACTION_ROW_SECONDARY = "h-auto min-h-12 w-full text-base sm:w-auto"
