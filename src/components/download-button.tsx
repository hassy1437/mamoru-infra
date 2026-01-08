"use client"

import { Button } from "@/components/ui/button"
import { FileText, Loader2 } from "lucide-react"
import { useState } from "react"

export default function DownloadButton({ data }: { data: any }) {
    const [loading, setLoading] = useState(false)

    const handleDownload = async () => {
        setLoading(true)
        try {
            const response = await fetch("/api/generate-docx", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            })

            if (!response.ok) throw new Error("Download failed")

            // ファイルをブラウザでダウンロードさせる処理
            const blob = await response.blob()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            // ファイル名: 報告書_建物名.docx
            a.download = `報告書_${data.building_name || "名称未設定"}.docx`
            document.body.appendChild(a)
            a.click()
            a.remove()
        } catch (e) {
            alert("ダウンロードに失敗しました")
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Button onClick={handleDownload} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
            Wordでダウンロード
        </Button>
    )
}