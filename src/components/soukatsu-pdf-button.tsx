"use client"

import { Button } from "@/components/ui/button"
import { FileDown, Loader2 } from "lucide-react"
import { PDF_GATE_MESSAGE } from "@/lib/finalization"
import { useState } from "react"
import { pdfErrorText } from "@/lib/pdf-request-error"
import { fetchPdf } from "@/lib/pdf-client"

type SoukatsuPdfData = {
    building_name?: string | null
} & Record<string, unknown>

export default function SoukatsuPdfButton({
    data,
    // ★既定は true（通す）。呼び出し側を触り忘れても本番は止まらない＝fail-open。
    canDownload = true,
    // ★確定前に押したときの案内（解約日を迎えた業者には「確定してから」と言わない・pdfGateMessage）
    gateMessage = PDF_GATE_MESSAGE,
}: { data: SoukatsuPdfData; canDownload?: boolean; gateMessage?: string }) {
    const [loading, setLoading] = useState(false)
    const [gateMsg, setGateMsg] = useState<string | null>(null)

    const handleDownload = async () => {
        // ★確定前は出力しない（規約 第12条3項: 確定前の下書きには課金しない）。
        //   ボタンは消さずに案内を出す（消すと「なぜ無いのか」が分からない）。
        if (!canDownload) {
            setGateMsg(gateMessage)
            return
        }
        setLoading(true)
        try {
            const { blob } = await fetchPdf("/api/generate-soukatu-pdf", data)
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
            {/* ★控えめな見た目（2026-10-21）。以前は「次へ」と同じ緑で並び、どちらが次にやることか分からなかった */}
            <Button onClick={handleDownload} disabled={loading} variant="outline" className="min-h-11 gap-0">
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
