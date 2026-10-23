"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { FileDown, Loader2 } from "lucide-react"
import type { InspectionItiran } from "@/types/database"
import { pdfErrorText } from "@/lib/pdf-request-error"
import { fetchPdf } from "@/lib/pdf-client"
import { PDF_GATE_MESSAGE } from "@/lib/finalization"

interface Props {
    data: InspectionItiran
    buildingName?: string
    /** ★既定 true（通す）。呼び出し側を触り忘れても本番は止まらない＝fail-open。 */
    canDownload?: boolean
    /** 確定前に押したときの案内（解約日を迎えた業者には「確定してから」と言わない・pdfGateMessage） */
    gateMessage?: string
}

export default function ItiranPdfButton({ data, buildingName, canDownload = true, gateMessage = PDF_GATE_MESSAGE }: Props) {
    const [gateMsg, setGateMsg] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    const handleDownload = async () => {
        // ★確定前は出力しない。ボタンは消さずに案内を出す（fail-open は Props の既定値）。
        if (!canDownload) {
            setGateMsg(gateMessage)
            return
        }
        setLoading(true)
        try {
            const { blob } = await fetchPdf("/api/generate-itiran-pdf", data)
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
