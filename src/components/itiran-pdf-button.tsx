"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { FileDown, Loader2 } from "lucide-react"
import type { InspectionItiran } from "@/types/database"
import { pdfErrorText, pdfRequestError } from "@/lib/pdf-request-error"
import { PDF_GATE_MESSAGE } from "@/lib/finalization"

interface Props {
    data: InspectionItiran
    buildingName?: string
    /** ★既定 true（通す）。呼び出し側を触り忘れても本番は止まらない＝fail-open。 */
    canDownload?: boolean
}

export default function ItiranPdfButton({ data, buildingName, canDownload = true }: Props) {
    const [gateMsg, setGateMsg] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    const handleDownload = async () => {
        // ★確定前は出力しない。ボタンは消さずに案内を出す（fail-open は Props の既定値）。
        if (!canDownload) {
            setGateMsg(PDF_GATE_MESSAGE)
            return
        }
        setLoading(true)
        try {
            const res = await fetch("/api/generate-itiran-pdf", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            })

            if (!res.ok) throw await pdfRequestError(res)

            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `点検者一覧_${buildingName ?? "報告書"}.pdf`
            a.click()
            URL.revokeObjectURL(url)
        } catch (err) {
            alert(pdfErrorText(err, "PDF生成中にエラーが発生しました"))
        } finally {
            setLoading(false)
        }
    }

    return (
        <div>
            <Button onClick={handleDownload} disabled={loading} variant="outline" className="gap-2">
                {loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />生成中...</>
                ) : (
                    <><FileDown className="w-4 h-4" />点検者一覧PDF出力</>
                )}
            </Button>
            {/* ★ボタンは消さずに案内を出す。消すと「なぜ無いのか」が分からない。 */}
            {gateMsg && (
                <p className="mt-2 max-w-md rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
                    {gateMsg}
                </p>
            )}
        </div>
    )
}
