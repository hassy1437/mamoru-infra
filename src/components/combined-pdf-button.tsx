"use client"

import { Button } from "@/components/ui/button"
import { FileDown, Loader2 } from "lucide-react"
import { useState } from "react"
import { PDFDocument } from "pdf-lib"
import { PDF_MERGE_CONFIG } from "@/lib/pdf-merge-config"
import type { ItiranInputStepId } from "@/lib/itiran-input-flow"

interface CombinedPdfButtonProps {
    soukatsuData: Record<string, unknown>
    itiranData: Record<string, unknown>
    bekkiPayloads: Record<string, Record<string, unknown>>
    applicableStepIds: string[]
    buildingName?: string
    equipmentTypes?: string[]
}

type PdfTask = {
    label: string
    route: string
    body: Record<string, unknown>
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

    const houkokuBody: Record<string, unknown> = {
        report_date: soukatsuData.inspection_date,
        notifier_address: soukatsuData.notifier_address,
        notifier_name: soukatsuData.notifier_name,
        notifier_phone: soukatsuData.notifier_phone,
        building_address: soukatsuData.building_address,
        building_name: soukatsuData.building_name,
        building_usage: soukatsuData.building_usage,
        floor_above: soukatsuData.floor_above,
        floor_below: soukatsuData.floor_below,
        total_floor_area: soukatsuData.total_floor_area,
        equipment_types: equipmentTypes,
    }

    const tasks: PdfTask[] = [
        { label: "報告書", route: "/api/generate-pdf", body: houkokuBody },
        { label: "総括表", route: "/api/generate-soukatu-pdf", body: soukatsuData },
        { label: "点検者一覧", route: "/api/generate-itiran-pdf", body: itiranData },
        ...applicableStepIds
            .filter((id) => bekkiPayloads[id])
            .map((id) => {
                const config = PDF_MERGE_CONFIG[id as ItiranInputStepId]
                return { label: id, route: config.apiRoute, body: bekkiPayloads[id] }
            }),
    ]

    const handleDownload = async () => {
        setLoading(true)
        setProgress({ done: 0, total: tasks.length })

        try {
            const pdfBuffers: (ArrayBuffer | null)[] = []
            const failedLabels: string[] = []

            const results = await Promise.allSettled(
                tasks.map(async (task, index) => {
                    const res = await fetch(task.route, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(task.body),
                    })
                    if (!res.ok) throw new Error(`${task.label}: ${res.status}`)
                    const buf = await res.arrayBuffer()
                    setProgress((prev) => ({ ...prev, done: prev.done + 1 }))
                    return { index, buf }
                })
            )

            for (let i = 0; i < tasks.length; i++) {
                pdfBuffers.push(null)
            }
            for (const result of results) {
                if (result.status === "fulfilled") {
                    pdfBuffers[result.value.index] = result.value.buf
                } else {
                    failedLabels.push(tasks[results.indexOf(result)]?.label ?? "unknown")
                }
            }

            const successBuffers = pdfBuffers.filter((buf): buf is ArrayBuffer => buf !== null)

            if (successBuffers.length === 0) {
                alert("全てのPDF生成に失敗しました")
                return
            }

            const merged = await PDFDocument.create()
            for (const buf of successBuffers) {
                const donor = await PDFDocument.load(buf)
                const pages = await merged.copyPages(donor, donor.getPageIndices())
                for (const page of pages) {
                    merged.addPage(page)
                }
            }

            const mergedBytes = await merged.save()
            const blob = new Blob([new Uint8Array(mergedBytes)], { type: "application/pdf" })
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `点検報告書_一括_${buildingName || "報告書"}.pdf`
            document.body.appendChild(a)
            a.click()
            a.remove()
            window.URL.revokeObjectURL(url)

            if (failedLabels.length > 0) {
                alert(`一部のPDF生成に失敗しました: ${failedLabels.join(", ")}\nそれ以外のPDFは結合されています。`)
            }
        } catch {
            alert("PDF結合中にエラーが発生しました")
        } finally {
            setLoading(false)
            setProgress({ done: 0, total: 0 })
        }
    }

    return (
        <Button
            onClick={handleDownload}
            disabled={loading || tasks.length === 0}
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
                    PDF一括出力 ({tasks.length}件)
                </>
            )}
        </Button>
    )
}
