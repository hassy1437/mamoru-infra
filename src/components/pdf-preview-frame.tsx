"use client"

import { useSyncExternalStore } from "react"
import { Maximize2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import PdfFitPages from "@/components/pdf-fit-pages"
import { PDF_FIT_FRAGMENT, openInAppPdfPreview, prefersInAppPdfViewer } from "@/lib/pdf-preview-mode"

const noSubscribe = () => () => {}

/**
 * 画面に埋め込む PDF プレビュー（総括表・点検者一覧。2026-10-23）。
 * ・スマホ・タブレット … ページの画像を並べ、1 ページ全体が見える大きさにする。「全画面で見る」で大きく見られる
 *   ★iPhone の Safari は、埋め込んだ PDF を等倍のまま 1 ページ目しか出さず、はみ出して全体が見えなかった
 * ・パソコン … 今までどおりブラウザの PDF 表示。開いたときにページ全体で出す（PDF_FIT_FRAGMENT）
 */
export default function PdfPreviewFrame({ blob, url, title }: { blob: Blob; url: string; title: string }) {
    // ★端末の判定は画面に出してから（サーバーで描く時点では分からない）
    const inApp = useSyncExternalStore(noSubscribe, prefersInAppPdfViewer, () => false)
    if (inApp) {
        return (
            <div className="w-full space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
                <div className="flex justify-end">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-h-11"
                        onClick={() => openInAppPdfPreview({ title, load: async () => blob })}
                    >
                        <Maximize2 className="mr-1 h-4 w-4" />
                        全画面で見る
                    </Button>
                </div>
                <PdfFitPages blob={blob} fit="page" pageMaxHeightClass="max-h-[75vh]" />
            </div>
        )
    }
    return (
        <div className="w-full bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <iframe src={url + PDF_FIT_FRAGMENT} title={title} className="w-full h-[75vh] md:h-[calc(100vh-220px)]" />
        </div>
    )
}
