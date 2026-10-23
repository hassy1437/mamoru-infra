/**
 * PDF のルート（/api/generate-*）が本文を読む口（2026-10-23）。
 *
 * ■ なぜ要るか（docs/BACKLOG.md「Unexpected end of JSON input」）
 *   どのルートも `await req.json()` を try の中で呼び、例外は全部「サーバの失敗（500）」にしていた。
 *   プレビュー中にページを閉じると本文を送り切る前に接続が切れ、空の本文が届く。
 *   ＝ サーバは壊れていないのに 500 とログの SyntaxError が残る（2026-09-23 に 1 回）。
 *   ★本文が空・壊れている・オブジェクトでないときは PdfBodyError を投げ、ルートが 400 で返す。
 */

export class PdfBodyError extends Error {}

/** 400 で返す本文（★画面は 400 を「通信状況をご確認のうえ再試行」と読む・pdf-request-error.ts） */
export const PDF_INVALID_BODY = { error: "INVALID_BODY" } as const

/**
 * 本文を JSON のオブジェクトとして読む。
 * ★戻り値は req.json() と同じ any（各ルートが自分の Payload 型で受ける。ここで型を決めない）。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- req.json() と同じ形で置き換えるため
export async function readPdfBody(req: Request): Promise<any> {
    const text = await req.text()
    if (!text.trim()) throw new PdfBodyError("本文が空")
    let value: unknown
    try {
        value = JSON.parse(text)
    } catch {
        throw new PdfBodyError("本文が JSON でない")
    }
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new PdfBodyError("本文がオブジェクトでない")
    }
    return value
}
