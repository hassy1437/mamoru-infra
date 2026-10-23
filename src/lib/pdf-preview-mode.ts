/**
 * PDF のプレビューを、開いたときにページ全体が見える形で出す（2026-10-23・iPhone で全体が見えず見にくい）。
 *
 * ■ 端末で出し方を分ける
 *   ・スマホ・タブレット（iPhone・iPad・Android）… アプリの中で PDF をページの画像にして出す
 *     （src/components/pdf-preview-host.tsx・pdf-fit-pages.tsx）。
 *     ★iPhone の Safari は、画面に埋め込んだ PDF を縮めずに等倍で出し、1 ページ目しか見せない
 *       （総括表・点検者一覧の埋め込みプレビューで、はみ出して全体が見えなかった）。
 *     ★Android の Chrome は、埋め込んだ PDF をそもそも表示できない。
 *   ・パソコン … 今までどおりブラウザの PDF 表示。開いたときにページ全体で出す指定（PDF_FIT_FRAGMENT）を付ける。
 */

/** スマホ・タブレットか（アプリの中でページの画像として出す端末） */
export function prefersInAppPdfViewer(): boolean {
    if (typeof navigator === "undefined") return false
    const ua = navigator.userAgent
    // ★iPadOS の Safari は Mac と名乗る。タッチ点の数で見分ける
    const ipadAsMac = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1
    return /iPhone|iPad|iPod|Android/.test(ua) || ipadAsMac
}

/**
 * パソコンのブラウザの PDF 表示で、開いたときにページ全体を出す指定。
 * Chrome・Edge は view=Fit、Firefox は zoom=page-fit を読む（読まないブラウザは無視するだけ）。
 */
export const PDF_FIT_FRAGMENT = "#view=Fit&zoom=page-fit"

// ---- アプリの中のプレビュー（画面のどこからでも開けるように、1 か所の受け皿に渡す）----

export type PdfPreviewRequest = {
    /** 見出し（例: 総括表のプレビュー） */
    title: string
    /** PDF を作る（失敗したら投げる。文言は受け皿が pdfErrorText で出す） */
    load: () => Promise<Blob>
}

type Listener = (req: PdfPreviewRequest) => void
const listeners = new Set<Listener>()

/** 受け皿（src/components/pdf-preview-host.tsx）が受け取る。画面ごとに 1 つ */
export function subscribePdfPreview(listener: Listener): () => void {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}

/** アプリの中でプレビューを開く。受け皿が無ければ false（呼び出し側は今までの開き方に戻す） */
export function openInAppPdfPreview(req: PdfPreviewRequest): boolean {
    if (listeners.size === 0) return false
    for (const l of listeners) l(req)
    return true
}
