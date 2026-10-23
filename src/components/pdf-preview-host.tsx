"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ExternalLink, Loader2, Maximize2, MoveHorizontal, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import PdfFitPages from "@/components/pdf-fit-pages"
import { pdfErrorText } from "@/lib/pdf-request-error"
import { subscribePdfPreview, type PdfPreviewRequest } from "@/lib/pdf-preview-mode"

/**
 * スマホ・タブレットの PDF プレビュー（全画面）。画面のどこからでも openInAppPdfPreview で開く
 * （src/lib/pdf-preview-mode.ts）。ルートのレイアウトに 1 つだけ置く。
 *
 * ・開いたらページ全体が見える大きさ（全体表示）。「幅に合わせる」で細かい字を読める。指でも拡大できる
 * ・「PDFを開く」で、端末の PDF 表示（共有・印刷ができる）でも開ける
 * ・閉じたら入力画面に戻る（新しいタブを開かないので、タブが増えない）
 * ★開いている間はチャットのボタンを隠す（全画面の上に重なる。src/app/layout.tsx の pdf-preview-open）
 */
type State =
    | { kind: "closed" }
    | { kind: "loading"; title: string; id: number }
    | { kind: "ready"; title: string; id: number; blob: Blob }
    | { kind: "error"; title: string; id: number; message: string }

export default function PdfPreviewHost() {
    const [state, setState] = useState<State>({ kind: "closed" })
    const [fit, setFit] = useState<"page" | "width">("page")
    const seq = useRef(0)
    const closeRef = useRef<HTMLButtonElement>(null)

    const open = useCallback((req: PdfPreviewRequest) => {
        const id = ++seq.current
        setFit("page")
        setState({ kind: "loading", title: req.title, id })
        req.load().then(
            (blob) => setState((s) => (s.kind !== "closed" && s.id === id ? { kind: "ready", title: req.title, id, blob } : s)),
            (err) => setState((s) => (s.kind !== "closed" && s.id === id
                ? { kind: "error", title: req.title, id, message: pdfErrorText(err, "PDFプレビューの生成に失敗しました。") }
                : s)),
        )
    }, [])

    useEffect(() => subscribePdfPreview(open), [open])

    const close = useCallback(() => setState({ kind: "closed" }), [])

    const isOpen = state.kind !== "closed"
    useEffect(() => {
        if (!isOpen) return
        // 後ろの画面がスクロールしないようにし、チャットのボタンを隠す
        const prevOverflow = document.body.style.overflow
        document.body.style.overflow = "hidden"
        document.body.classList.add("pdf-preview-open")
        closeRef.current?.focus()
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") close()
        }
        window.addEventListener("keydown", onKey)
        return () => {
            document.body.style.overflow = prevOverflow
            document.body.classList.remove("pdf-preview-open")
            window.removeEventListener("keydown", onKey)
        }
    }, [isOpen, close])

    const openNative = useCallback(() => {
        if (state.kind !== "ready") return
        const url = URL.createObjectURL(state.blob)
        window.open(url, "_blank")
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    }, [state])

    if (state.kind === "closed") return null

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={state.title}
            className="fixed inset-0 z-[80] flex flex-col bg-slate-100"
        >
            <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{state.title}</p>
                {state.kind === "ready" && (
                    <>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="min-h-11 px-3"
                            onClick={() => setFit(fit === "page" ? "width" : "page")}
                            aria-label={fit === "page" ? "幅に合わせる" : "全体を表示"}
                        >
                            {fit === "page" ? <MoveHorizontal className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                            <span className="ml-1 hidden sm:inline">{fit === "page" ? "幅に合わせる" : "全体を表示"}</span>
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="min-h-11 px-3" onClick={openNative} aria-label="PDFを開く">
                            <ExternalLink className="h-4 w-4" />
                            <span className="ml-1 hidden sm:inline">PDFを開く</span>
                        </Button>
                    </>
                )}
                <Button ref={closeRef} type="button" variant="ghost" size="sm" className="min-h-11 px-3" onClick={close} aria-label="閉じる">
                    <X className="h-5 w-5" />
                    <span className="ml-1">閉じる</span>
                </Button>
            </div>
            <div className="flex-1 overflow-auto p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                {state.kind === "loading" && (
                    <p className="flex h-full items-center justify-center gap-2 text-slate-600">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        PDFを生成しています…
                    </p>
                )}
                {state.kind === "error" && (
                    <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{state.message}</p>
                )}
                {state.kind === "ready" && (
                    <PdfFitPages blob={state.blob} fit={fit} pageMaxHeightClass="max-h-[calc(100dvh-6rem)]" />
                )}
            </div>
        </div>
    )
}
