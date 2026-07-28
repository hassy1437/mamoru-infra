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
            const { blob, failedLabels, fitFailures, shrinkWarnings, choiceWarnings } = await buildMergedReport(
                input,
                (done, total) => setProgress({ done, total }),
            )
            triggerDownload(blob, `点検報告書_一括_${buildingName || "報告書"}.pdf`)
            // ★選択肢欄の値がどの選択肢とも一致せず、○が1つも描かれていない。
            //   PDFは正常に出ているので止めないが、**黙って情報が落ちている**ので最初に知らせる。
            //   縮小警告とは意味が違う（縮小は情報が残っている／これは消えている）ので、
            //   同じ一覧に混ぜず別のメッセージにする。
            if (choiceWarnings.length > 0) {
                alert(
                    [
                        "次の項目は選択肢と一致せず、様式に○が付いていません（値は出力されません）:",
                        ...choiceWarnings.flatMap((w) => [
                            `【${w.label}】`,
                            ...w.items.map((it) => `  ${it.hint}`),
                        ]),
                    ].join("\n"),
                )
            }
            // ⑨ 設計より大きく縮んで描かれた項目。PDFは出ているので止めず、確認を促すだけ。
            //   重複はサーバ側で畳んである（同じ値が何行にも出るため）。
            if (shrinkWarnings.length > 0) {
                alert(
                    [
                        "次の項目は枠に収めるため小さく表示されています。印刷して読めるかご確認ください:",
                        ...shrinkWarnings.flatMap((w) => [
                            `【${w.label}】`,
                            ...w.items.map(
                                (it) =>
                                    `  ${it.label}: ${it.design}pt → ${it.actual}pt（${Math.round(it.deviation)}%縮小）\n${it.text.slice(0, 24)}`,
                            ),
                            ...(w.omitted > 0 ? [`   …他 ${w.omitted} 件`] : []),
                        ]),
                    ].join("\n"),
                )
            }
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
