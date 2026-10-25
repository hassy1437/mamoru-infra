/**
 * 表紙の欄（報告年月日・宛名）の画面だけの短い要点（2026-10-25・橋本さん「注意書きは長すぎると読まなくなる」）。
 *   全文（lib/soukatsu-cover.ts の COVER_*_NOTE）は「詳しく見る」の中に出す。
 * ★lib/soukatsu-cover.ts は PDF の出力にも使うので、画面だけの文言はこちらに置く（変えると PDF の照合の登録し直しが要る）。
 */
export const COVER_REPORT_DATE_POINT = "消防署へ出す日です（点検日ではありません）。"
