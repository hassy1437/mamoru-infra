"use client"

import { Button } from "@/components/ui/button"
import { FileDown, Loader2 } from "lucide-react"
import { useState } from "react"
import {
    ALL_PDF_FAILED,
    buildMergedReport,
    reportTaskCount,
    triggerDownload,
    type ReportInputs,
} from "@/lib/build-merged-report"

interface CombinedPdfButtonProps {
    soukatsuData: Record<string, unknown>
    itiranData: Record<string, unknown>
    bekkiPayloads: Record<string, Record<string, unknown>>
    applicableStepIds: string[]
    buildingName?: string
    equipmentTypes?: string[]
}

export default function CombinedPdfButton({
    soukatsuData,
    itiranData,
    bekkiPayloads,
    applicableStepIds,
    buildingName,
    equipmentTypes,
}: CombinedPdfButtonProps) {
    const [loading, setLoading] = useState(false)
    const [progress, setProgress] = useState({ done: 0, total: 0 })

    const input: ReportInputs = {
        soukatsuData,
        itiranData,
        bekkiPayloads,
        applicableStepIds,
        equipmentTypes,
    }
    const taskCount = reportTaskCount(input)

    const handleDownload = async () => {
        setLoading(true)
        setProgress({ done: 0, total: 0 })

        try {
            const { blob, failedLabels, fitFailures } = await buildMergedReport(input, (done, total) =>
                setProgress({ done, total }),
            )
            triggerDownload(blob, `点検報告書_一括_${buildingName || "報告書"}.pdf`)
            if (failedLabels.length > 0) {
                alert(
                    [
                    // ★枠に収まらない項目は「どの様式のどの項目が何字超過か」まで出す。
                    //   ここを「PDF出力に失敗しました」で潰すと業者は直しようがなくなる。
                    ...fitFailures.flatMap((f) => [
                        `【${f.label}】`,
                        ...f.items.map(
                            (it) =>
                                `  ${it.label}: ${it.input}文字（${it.over}文字超過・${it.fits}文字まで）\n→ ${it.hint}`,
                        ),
                    ]),
                    ...(failedLabels.filter((l) => !fitFailures.some((f) => f.label === l)).length
                        ? [`PDF生成に失敗しました: ${failedLabels.filter((l) => !fitFailures.some((f) => f.label === l)).join(", ")}`]
                        : []),
                    "それ以外のPDFは結合されています。",
                    ].filter(Boolean).join("\n"),
                )
            }
        } catch (e) {
            if (e instanceof Error && e.message === ALL_PDF_FAILED) {
                alert("全てのPDF生成に失敗しました")
            } else {
                alert("PDF結合中にエラーが発生しました")
            }
        } finally {
            setLoading(false)
            setProgress({ done: 0, total: 0 })
        }
    }

    return (
        <Button
            onClick={handleDownload}
            disabled={loading || taskCount === 0}
            className="bg-blue-600 hover:bg-blue-700 text-white"
        >
            {loading ? (
                <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    PDF結合中... ({progress.done}/{progress.total})
                </>
            ) : (
                <>
                    <FileDown className="mr-2 h-4 w-4" />
                    PDF一括出力 ({taskCount}件)
                </>
            )}
        </Button>
    )
}
