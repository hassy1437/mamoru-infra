"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

/**
 * PDF をページの画像にして縦に並べる（スマホ・タブレット用。src/lib/pdf-preview-mode.ts）。
 *
 * ・fit="page"  … ページ全体が見える大きさ（幅と高さ pageMaxHeightClass の両方に収める）＝ 全体表示
 * ・fit="width" … 幅いっぱい（細かい字を読むとき）
 *   どちらも指で拡大できる（画面の拡大は止めていない）。
 * ★画像は 1 度だけ描く（横 1,600px 相当）。向きを変えても描き直さない。
 * ★描いたキャンバスはすぐ捨てる（iPhone はキャンバスに使える記憶が小さく、ページが多いと落ちる）。
 * ★古い iPhone でも動くよう、PDF.js は互換版（legacy）を使う。プレビューを開いたときだけ読み込む。
 */
type Page = { url: string; width: number; height: number }
type Rendered = { blob: Blob; pages: Page[]; total: number | null; error: string | null }

const RENDER_WIDTH_PX = 1600

export default function PdfFitPages({
    blob,
    fit,
    pageMaxHeightClass,
}: {
    blob: Blob
    fit: "page" | "width"
    /** fit="page" のときの 1 ページの高さの上限（Tailwind の class。例: max-h-[70vh]） */
    pageMaxHeightClass: string
}) {
    // ★描いた結果はどの PDF の分かを一緒に持つ（PDF が替わったら古いページを出さない）
    const [rendered, setRendered] = useState<Rendered | null>(null)

    useEffect(() => {
        let cancelled = false
        const made: string[] = []
        // ★読み込みの後始末は loadingTask.destroy()（PDF.js v6）。途中で閉じたときも止める
        let task: { destroy: () => Promise<void> } | null = null
        const update = (f: (r: Rendered) => Rendered) =>
            setRendered((prev) => f(prev && prev.blob === blob ? prev : { blob, pages: [], total: null, error: null }))
        void (async () => {
            try {
                const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
                pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString()
                const loading = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) })
                task = loading
                const doc = await loading.promise
                if (cancelled) return
                update((r) => ({ ...r, total: doc.numPages }))
                for (let i = 1; i <= doc.numPages && !cancelled; i++) {
                    const page = await doc.getPage(i)
                    const base = page.getViewport({ scale: 1 })
                    const viewport = page.getViewport({ scale: RENDER_WIDTH_PX / base.width })
                    const canvas = document.createElement("canvas")
                    canvas.width = Math.round(viewport.width)
                    canvas.height = Math.round(viewport.height)
                    await page.render({ canvas, viewport }).promise
                    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
                    canvas.width = 0
                    canvas.height = 0
                    page.cleanup()
                    if (cancelled) break // ★閉じたあとに描き終わったページは、画像にせず捨てる（解放漏れを作らない）
                    if (!png) throw new Error(`${i} ページ目を画像にできませんでした`)
                    const url = URL.createObjectURL(png)
                    made.push(url)
                    update((r) => ({ ...r, pages: [...r.pages, { url, width: viewport.width, height: viewport.height }] }))
                }
                void loading.destroy()
                task = null
            } catch (e) {
                if (!cancelled) update((r) => ({ ...r, error: e instanceof Error ? e.message : String(e) }))
            }
        })()
        return () => {
            cancelled = true
            void task?.destroy()
            for (const u of made) URL.revokeObjectURL(u)
        }
    }, [blob])

    const r = rendered && rendered.blob === blob ? rendered : null
    if (r?.error) {
        return (
            <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                プレビューを表示できませんでした（{r.error}）。「PDFを開く」で開いてください。
            </p>
        )
    }
    const pages = r?.pages ?? []
    const total = r?.total ?? null
    return (
        <div className="flex flex-col items-center gap-3">
            {pages.map((p, i) => (
                // eslint-disable-next-line @next/next/no-img-element -- 端末の中で作った画像（blob:）。next/image の最適化は使えない
                <img
                    key={p.url}
                    src={p.url}
                    width={Math.round(p.width)}
                    height={Math.round(p.height)}
                    alt={`${i + 1} ページ目`}
                    className={
                        fit === "page"
                            ? `block h-auto w-auto max-w-full ${pageMaxHeightClass} bg-white shadow-sm ring-1 ring-slate-200`
                            : "block h-auto w-full bg-white shadow-sm ring-1 ring-slate-200"
                    }
                />
            ))}
            {(total === null || pages.length < total) && (
                <p className="flex items-center gap-2 py-6 text-sm text-slate-600">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {total === null ? "ページを準備しています…" : `${pages.length + 1} / ${total} ページ目を準備しています…`}
                </p>
            )}
        </div>
    )
}
