"use client"

import { Button } from "@/components/ui/button"
import { FileDown, Loader2 } from "lucide-react"
import { PDF_GATE_MESSAGE } from "@/lib/finalization"
import { useState } from "react"
import { pdfRequestError, pdfErrorText } from "@/lib/pdf-request-error"

type SoukatsuPdfData = {
    building_name?: string | null
} & Record<string, unknown>

export default function SoukatsuPdfButton({
    data,
    // ★既定は true（通す）。呼び出し側を触り忘れても本番は止まらない＝fail-open。
    canDownload = true,
}: { data: SoukatsuPdfData; canDownload?: boolean }) {
    const [loading, setLoading] = useState(false)
    const [gateMsg, setGateMsg] = useState<string | null>(null)

    const handleDownload = async () => {
        // ★確定前は出力しない（規約 第12条3項: 確定前の下書きには課金しない）。
        //   ボタンは消さずに案内を出す（消すと「なぜ無いのか」が分からない）。
        if (!canDownload) {
            setGateMsg(PDF_GATE_MESSAGE)
            return
        }
        setLoading(true)
        try {
            const response = await fetch("/api/generate-soukatu-pdf", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            })

            if (!response.ok) throw await pdfRequestError(response)


            const blob = await response.blob()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `総括表_${data.building_name || "点検結果"}.pdf`
            document.body.appendChild(a)
            a.click()
            a.remove()
        } catch (err) {
            alert(pdfErrorText(err, "PDF作成に失敗しました"))
        } finally {
            setLoading(false)
        }
    }

    return (
        <div>
            <Button onClick={handleDownload} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                総括表PDF出力
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
