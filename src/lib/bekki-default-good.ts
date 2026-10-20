/**
 * 判定の初期値を「良」にする（2026-10-20・打合せ録音 102 で決定）。
 *
 * ■ なぜ
 *   録音 102「全良のボタンは便利だが、都度押す手間も省きたい。最初から良が入っていて、問題のある所だけ否に変えればよい」。
 *
 * ■ 決めたこと（橋本さん・2026-10-20）
 *   ・★まだ一度も保存していない様式（savedPayload が無い）を開いたら、「この様式の空欄をすべて良にする」と
 *     同じ処理を 1 回だけ自動でかける（src/lib/bekki-bulk-good.ts の planBulkGood / applyBulkGood）。
 *     ＝ 見出しの行・畳んである行・機器点検だけのときの総合点検の行には入れない（ボタンと同じ決まり）
 *   ・★見ていない項目が「良」のまま消防署への報告書に出るおそれがあるので、確定の前に知らせる（止めない）:
 *     初期値を入れた様式には印（payload.judgments_defaulted = true）を付け、様式の「確かめました」を押すまで
 *     出力前の確認（src/lib/report-readiness.ts）に「初期値のまま」と出す。
 *   ・既に保存してある様式（今まで入力した分・前回の複製）は変えない。
 *
 * ★scripts/check-bekki-default-good.mjs が、24 様式の配線（新しい様式で 1 回だけ・印の保存・確かめのボタン）を見張る。
 */

/** 保存する印の名前（payload のキー） */
export const JUDGMENTS_DEFAULTED_KEY = "judgments_defaulted"

/** 様式に出す案内（★24 様式で同じ） */
export const DEFAULT_GOOD_NOTICE =
    "判定には最初から「良」が入っています。問題のある行だけ「否」に変えてください。全部の行を確かめたら「確かめました」を押してください。"

/** 確かめのボタン */
export const DEFAULT_GOOD_CONFIRM_LABEL = "確かめました"

/** 出力前の確認に出す文言 */
export const DEFAULT_GOOD_READINESS_MESSAGE =
    "判定が初期値（良）のままです。点検した内容と合っているかを確かめ、様式の「確かめました」を押してください"

/** 保存してある payload の印を読む（★true のときだけ「初期値のまま」） */
export function isJudgmentsDefaulted(payload: Record<string, unknown> | null | undefined): boolean {
    return payload?.[JUDGMENTS_DEFAULTED_KEY] === true
}
