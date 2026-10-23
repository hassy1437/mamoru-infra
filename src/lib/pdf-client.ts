import { pdfRequestError } from "@/lib/pdf-request-error"

/**
 * PDF を作るルート（/api/generate-*-pdf）を呼ぶ口（2026-10-23）。
 * ★画面・ライブラリから PDF のルートを呼ぶのは、ここだけにする。
 *
 * ■ なぜ 1 つにするか（docs/BACKLOG.md「PDF生成の呼び出し口を1つにする」）
 *   以前は呼ぶ所が 15 か所あり、それぞれが `!response.ok` を自分で扱っていた。
 *   ⑧で 422 に「どの項目が何文字超過か」を載せたのに、呼ぶ側が本文を捨てていて業者に届かなかった。
 *   検査（scripts/check-pdf-error-handling.py）で 1 か所ずつ数えていたが、検査が対象を探しに行く形なので、
 *   apiPath を prop で受ける bekki-result-form-base.tsx（16 様式）が一度すり抜けた。
 *   ＝ 口を 1 つにして「ここ以外に fetch が無い」だけを見れば、探し漏れが起きない。
 *
 * ■ 失敗のしかた
 *   ・ルートが失敗を返した … PdfRequestError（pdf-request-error.ts の分類：fit / auth / server / network）
 *   ・通信そのものが失敗した … fetch の例外をそのまま投げる（呼ぶ側の pdfErrorText が「通信エラーの可能性」を添える）
 *
 * ★プレビューの別タブは、呼ぶ側がクリックと同時に開く（ポップアップを止められないように）。
 *   タブの扱いをここに持ってこないこと（クリックとの間に await が挟まると止められる）。
 */

/** 縮小・選択肢・5pt 未満の警告（ルートが X-Fit-Warnings ヘッダで返す。PDF 自体は正常） */
export type PdfFitWarnings = {
    /** ⑨ 設計値から大きく縮んで描かれた項目 */
    items: { label: string; design: number; actual: number; deviation: number; text: string }[]
    /** ヘッダの長さの都合で省いた件数（0 なら全件） */
    omitted: number
    /** 選択肢欄の値がどの選択肢とも一致しなかった項目（○が描かれていない） */
    choices: { label: string; text: string; choices: string[]; hint: string }[]
    /** 絶対下限（5.0pt）を割って描かれた項目 */
    belowMin: { label: string; size: number; text: string }[]
}

/**
 * X-Fit-Warnings ヘッダ（日本語を含むので base64 の JSON）を読む。
 * 無い・読めないときは null（★PDF 自体は正常なので止めない）。
 */
export function parseFitWarnings(header: string | null): PdfFitWarnings | null {
    if (!header) return null
    try {
        const json = new TextDecoder().decode(Uint8Array.from(atob(header), (c) => c.charCodeAt(0)))
        const parsed = JSON.parse(json)
        return {
            items: Array.isArray(parsed?.items) ? parsed.items : [],
            omitted: typeof parsed?.omitted === "number" ? parsed.omitted : 0,
            choices: Array.isArray(parsed?.choices) ? parsed.choices : [],
            belowMin: Array.isArray(parsed?.belowMin) ? parsed.belowMin : [],
        }
    } catch {
        return null
    }
}

/** PDF のルートに入力を送り、PDF と警告を受け取る。失敗は上のとおり投げる。 */
export async function fetchPdf(route: string, body: unknown): Promise<{ blob: Blob; warnings: PdfFitWarnings | null }> {
    const response = await fetch(route, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    })
    if (!response.ok) throw await pdfRequestError(response)
    const warnings = parseFitWarnings(response.headers.get("X-Fit-Warnings"))
    return { blob: await response.blob(), warnings }
}
