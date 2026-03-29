"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, RefreshCw } from "lucide-react"

type ItiranPdfData = Record<string, unknown>

export default function ItiranPdfPreview({ data }: { data: ItiranPdfData }) {
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [pdfUrl, setPdfUrl] = useState<string | null>(null)
    const pdfUrlRef = useRef<string | null>(null)

    const setNextPdfUrl = (nextUrl: string | null) => {
        if (pdfUrlRef.current) {
            window.URL.revokeObjectURL(pdfUrlRef.current)
        }
        pdfUrlRef.current = nextUrl
        setPdfUrl(nextUrl)
    }

    const loadPreview = useCallback(async () => {
        setLoading(true)
        setError(null)

        try {
            const response = await fetch("/api/generate-itiran-pdf", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            })

            if (!response.ok) {
                throw new Error("PDF generation failed")
            }

            const blob = await response.blob()
            const nextUrl = window.URL.createObjectURL(blob)
            setNextPdfUrl(nextUrl)
        } catch {
            setError("PDFプレビューの生成に失敗しました。")
            setNextPdfUrl(null)
        } finally {
            setLoading(false)
        }
    }, [data])

    useEffect(() => {
        void loadPreview()
    }, [loadPreview])

    useEffect(() => {
        return () => {
            if (pdfUrlRef.current) {
                window.URL.revokeObjectURL(pdfUrlRef.current)
            }
        }
    }, [])

    if (loading) {
        return (
            <div className="w-full bg-white border border-slate-200 rounded-xl p-8 flex items-center justify-center min-h-[60vh]">
                <div className="flex items-center gap-2 text-slate-600">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>PDFを生成しています...</span>
                </div>
            </div>
        )
    }

    if (error || !pdfUrl) {
        return (
            <div className="w-full bg-white border border-red-200 rounded-xl p-8 min-h-[40vh] flex flex-col items-center justify-center gap-4">
                <p className="text-red-600">{error ?? "PDFプレビューを表示できませんでした。"}</p>
                <Button onClick={loadPreview} className="bg-slate-700 hover:bg-slate-800 text-white">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    再試行
                </Button>
            </div>
        )
    }

    return (
        <div className="w-full bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <iframe
                src={pdfUrl}
                title="点検者一覧表PDFプレビュー"
                className="w-full h-[75vh] md:h-[calc(100vh-220px)]"
            />
        </div>
    )
}
