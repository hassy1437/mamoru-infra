"use client"

import { Button } from "@/components/ui/button"
import { FileDown, Loader2 } from "lucide-react"
import { useState } from "react"

export default function PdfOverlayButton({ data }: { data: any }) {
    const [loading, setLoading] = useState(false)

    const handleDownload = async () => {
        setLoading(true)
        try {
            const response = await fetch("/api/generate-pdf", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            })

            if (!response.ok) throw new Error("Failed")

            const blob = await response.blob()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `点検報告書_${data.building_name}.pdf`
            document.body.appendChild(a)
            a.click()
            a.remove()
        } catch (e) {
            alert("PDF作成に失敗しました")
        } finally {
            setLoading(false)
        }
    }

    return (
        <Button onClick={handleDownload} disabled={loading} className="bg-red-600 hover:bg-red-700 text-white">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
            PDFで出力 (公式様式)
        </Button>
    )
}