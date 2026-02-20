"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { FileDown, Loader2 } from "lucide-react"
import type { InspectionItiran } from "@/types/database"

interface Props {
    data: InspectionItiran
    buildingName?: string
}

export default function ItiranPdfButton({ data, buildingName }: Props) {
    const [loading, setLoading] = useState(false)

    const handleDownload = async () => {
        setLoading(true)
        try {
            const res = await fetch("/api/generate-itiran-pdf", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            })

            if (!res.ok) {
                alert("PDF生成に失敗しました")
                return
            }

            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `点検者一覧_${buildingName ?? "報告書"}.pdf`
            a.click()
            URL.revokeObjectURL(url)
        } catch {
            alert("PDF生成中にエラーが発生しました")
        } finally {
            setLoading(false)
        }
    }

    return (
        <Button onClick={handleDownload} disabled={loading} variant="outline" className="gap-2">
            {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" />生成中...</>
            ) : (
                <><FileDown className="w-4 h-4" />点検者一覧PDF出力</>
            )}
        </Button>
    )
}
