"use client"

import { Button } from "@/components/ui/button"
import { Eye, FileDown, Loader2 } from "lucide-react"
import { useState } from "react"

type PdfOverlayData = {
    building_name?: string | null
} & Record<string, unknown>

export default function PdfOverlayButton({ data }: { data: PdfOverlayData }) {
    const [loadingPreview, setLoadingPreview] = useState(false)
    const [loadingDownload, setLoadingDownload] = useState(false)

    const fetchPdfBlob = async () => {
        const response = await fetch("/api/generate-pdf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        })

        if (!response.ok) throw new Error("Failed")
        return response.blob()
    }

    const handlePreview = async () => {
        const previewTab = window.open("", "_blank")
        if (!previewTab) {
            alert("プレビューウィンドウを開けませんでした")
            return
        }

        setLoadingPreview(true)
        try {
            const blob = await fetchPdfBlob()
            const url = window.URL.createObjectURL(blob)

            previewTab.location.href = url
            window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000)
        } catch {
            previewTab.close()
            alert("PDFプレビューの作成に失敗しました")
        } finally {
            setLoadingPreview(false)
        }
    }

    const handleDownload = async () => {
        setLoadingDownload(true)
        try {
            const blob = await fetchPdfBlob()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `点検報告書_${data.building_name}.pdf`
            document.body.appendChild(a)
            a.click()
            a.remove()
            window.URL.revokeObjectURL(url)
        } catch {
            alert("PDF作成に失敗しました")
        } finally {
            setLoadingDownload(false)
        }
    }

    const busy = loadingPreview || loadingDownload

    return (
        <>
            <Button onClick={handlePreview} disabled={busy} className="bg-blue-600 hover:bg-blue-700 text-white">
                {loadingPreview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
                PDFプレビュー
            </Button>
            <Button onClick={handleDownload} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {loadingDownload ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                PDFで出力 (公式様式)
            </Button>
        </>
    )
}
