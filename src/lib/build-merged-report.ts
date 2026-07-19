import { PDFDocument } from "pdf-lib"
import { PDF_MERGE_CONFIG } from "@/lib/pdf-merge-config"
import type { ItiranInputStepId } from "@/lib/itiran-input-flow"

/**
 * 報告書PDFのマージ処理（各様式のサーバ生成→ブラウザ結合）を共有化する。
 *
 * これまで combined-pdf-button.tsx の handleDownload に埋まっていたロジックを抽出し、
 * 「一括ダウンロード」と「オーナーへ納品」の両方から呼べるようにする。
 * ★納品時は buildMergedReport() が返す 1つの Blob をそのまま upload と download の
 *   両方に使うことで、オーナーが受け取るPDFと業者の手元控えをバイト単位で同一にする
 *   （生成を2回に分けない）。
 */

export type ReportInputs = {
    soukatsuData: Record<string, unknown>
    itiranData: Record<string, unknown>
    bekkiPayloads: Record<string, Record<string, unknown>>
    applicableStepIds: string[]
    equipmentTypes?: string[]
}

type PdfTask = { label: string; route: string; body: Record<string, unknown> }

function buildTasks(input: ReportInputs): PdfTask[] {
    const houkokuBody: Record<string, unknown> = {
        report_date: input.soukatsuData.inspection_date,
        notifier_address: input.soukatsuData.notifier_address,
        notifier_name: input.soukatsuData.notifier_name,
        notifier_phone: input.soukatsuData.notifier_phone,
        building_address: input.soukatsuData.building_address,
        building_name: input.soukatsuData.building_name,
        building_usage: input.soukatsuData.building_usage,
        floor_above: input.soukatsuData.floor_above,
        floor_below: input.soukatsuData.floor_below,
        total_floor_area: input.soukatsuData.total_floor_area,
        equipment_types: input.equipmentTypes,
    }

    return [
        { label: "報告書", route: "/api/generate-pdf", body: houkokuBody },
        { label: "総括表", route: "/api/generate-soukatu-pdf", body: input.soukatsuData },
        { label: "点検者一覧", route: "/api/generate-itiran-pdf", body: input.itiranData },
        ...input.applicableStepIds
            .filter((id) => input.bekkiPayloads[id])
            .map((id) => {
                const config = PDF_MERGE_CONFIG[id as ItiranInputStepId]
                return { label: id, route: config.apiRoute, body: input.bekkiPayloads[id] }
            }),
    ]
}

/** ボタンラベルの「(N件)」表示用。tasks を作らずに件数だけ知りたいとき。 */
export function reportTaskCount(input: ReportInputs): number {
    return buildTasks(input).length
}

export type BuildResult = { blob: Blob; failedLabels: string[] }

/** 全PDF生成に失敗したときに投げるエラーの識別子。 */
export const ALL_PDF_FAILED = "ALL_PDF_FAILED"

/**
 * 各様式PDFをサーバから取得し、pdf-lib でブラウザ内結合して 1つの Blob を返す。
 * - 一部様式が失敗しても、成功分だけ結合して返す（failedLabels に失敗ラベル）。
 * - 全滅時は Error(ALL_PDF_FAILED) を投げる。
 */
export async function buildMergedReport(
    input: ReportInputs,
    onProgress?: (done: number, total: number) => void,
): Promise<BuildResult> {
    const tasks = buildTasks(input)
    let done = 0
    onProgress?.(0, tasks.length)

    const results = await Promise.allSettled(
        tasks.map(async (task, index) => {
            const res = await fetch(task.route, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(task.body),
            })
            if (!res.ok) throw new Error(`${task.label}: ${res.status}`)
            const buf = await res.arrayBuffer()
            done += 1
            onProgress?.(done, tasks.length)
            return { index, buf }
        }),
    )

    const pdfBuffers: (ArrayBuffer | null)[] = tasks.map(() => null)
    const failedLabels: string[] = []
    results.forEach((result, i) => {
        if (result.status === "fulfilled") {
            pdfBuffers[result.value.index] = result.value.buf
        } else {
            failedLabels.push(tasks[i]?.label ?? "unknown")
        }
    })

    const successBuffers = pdfBuffers.filter((b): b is ArrayBuffer => b !== null)
    if (successBuffers.length === 0) {
        throw new Error(ALL_PDF_FAILED)
    }

    const merged = await PDFDocument.create()
    for (const buf of successBuffers) {
        const donor = await PDFDocument.load(buf)
        const pages = await merged.copyPages(donor, donor.getPageIndices())
        for (const page of pages) merged.addPage(page)
    }
    const mergedBytes = await merged.save()
    const blob = new Blob([new Uint8Array(mergedBytes)], { type: "application/pdf" })
    return { blob, failedLabels }
}

/** Blob を端末にダウンロードさせる。納品時は upload と同一の Blob をここに渡す。 */
export function triggerDownload(blob: Blob, fileName: string) {
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
}
