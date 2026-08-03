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
        // ★別記様式は綴じ順（様式番号）に並べる。
        //   applicableStepIds は入力フローの並び（STEPS）なので 1→12→13…22→2→3…11の2 と
        //   バラバラで、綴じたときに探せなかった（実機で指摘）。
        //   入力の導線と綴じ順は別の関心事なので、STEPS は触らずここで並べ替える。
        ...input.applicableStepIds
            .filter((id) => input.bekkiPayloads[id])
            .map((id) => {
                const config = PDF_MERGE_CONFIG[id as ItiranInputStepId]
                return { label: id, route: config.apiRoute, body: input.bekkiPayloads[id], formNo: config.formNo }
            })
            .sort((a, b) => a.formNo - b.formNo)
            .map(({ formNo: _formNo, ...task }) => task),
    ]
}

/** ボタンラベルの「(N件)」表示用。tasks を作らずに件数だけ知りたいとき。 */
export function reportTaskCount(input: ReportInputs): number {
    return buildTasks(input).length
}

/** 枠に収まらなかった項目（各様式ルートが 422 で返す内容） */
export type FitFailureDetail = {
    label: string
    items: { label: string; input: number; fits: number; over: number; hint: string }[]
}

/** ⑨ 設計値から大きく縮んで描かれた項目（PDFは正常に返っている） */
export type ShrinkWarningDetail = {
    label: string
    items: { label: string; design: number; actual: number; deviation: number; text: string }[]
    /** ヘッダ長の都合で省いた件数（0なら全件） */
    omitted: number
}

/** 選択肢欄の値がどの選択肢とも一致しなかった項目（PDFは正常に返っているが○が描かれていない） */
export type ChoiceWarningDetail = {
    label: string
    items: { label: string; text: string; choices: string[]; hint: string }[]
}

export type BelowMinWarningDetail = {
    label: string
    items: { label: string; size: number; text: string }[]
}

export type BuildResult = {
    blob: Blob
    failedLabels: string[]
    /**
     * ★成功レスポンスにも運ぶべき情報がある。⑧で 422 の本文を捨てていたのと同じ轍。
     *   サーバが警告を返してもここで落とすと UI に届かない。
     */
    shrinkWarnings: ShrinkWarningDetail[]
    /**
     * ★422（枠に収まらない）は業者が自分で直せる情報なので、ここまで運ぶ。
     *   以前は !res.ok を `${label}: ${status}` にして本文を捨てていたため、
     *   せっかく様式・項目・超過文字数を返しても UI に届かなかった。
     */
    fitFailures: FitFailureDetail[]
    /**
     * ★○が1つも描かれないまま PDF は正常に出る経路。ここで落とすと
     *   「全検査が緑のまま情報だけ欠落」がそのまま業者に届く。
     */
    choiceWarnings: ChoiceWarningDetail[]
    /**
     * ★絶対下限(5.0pt)を割って描かれた項目。縮小警告(shrinkWarnings)とは別経路。
     *   ⑨は「設計値からの逸脱30%以上」かつ「純数値を除外」なので、
     *   設計値が元から小さいセルと数値欄の下限割れは原理的にそこから出ない。
     */
    belowMinWarnings: BelowMinWarningDetail[]
}

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
            if (!res.ok) {
                // 422 は「枠に収まらない項目がある」= 業者が直せる。本文を捨てずに運ぶ
                let detail: FitFailureDetail | null = null
                if (res.status === 422) {
                    try {
                        const body = await res.json()
                        if (body?.error === "FIT_FAILED" && Array.isArray(body.items)) {
                            detail = { label: task.label, items: body.items }
                        }
                    } catch {
                        // 本文が読めなければラベルだけで扱う
                    }
                }
                const err = new Error(`${task.label}: ${res.status}`) as Error & { detail?: FitFailureDetail | null }
                err.detail = detail
                throw err
            }
            // ⑨ 縮小警告はヘッダで運ばれる（PDF本体は正常）。日本語を含むので base64
            const warnHeader = res.headers.get("X-Fit-Warnings")
            let warning: ShrinkWarningDetail | null = null
            let choiceWarning: ChoiceWarningDetail | null = null
            let belowMinWarning: BelowMinWarningDetail | null = null
            if (warnHeader) {
                try {
                    const json = new TextDecoder().decode(
                        Uint8Array.from(atob(warnHeader), (c) => c.charCodeAt(0)),
                    )
                    const parsed = JSON.parse(json)
                    if (Array.isArray(parsed?.items) && parsed.items.length) {
                        warning = { label: task.label, items: parsed.items, omitted: parsed.omitted ?? 0 }
                    }
                    if (Array.isArray(parsed?.belowMin) && parsed.belowMin.length) {
                        belowMinWarning = { label: task.label, items: parsed.belowMin }
                    }
                    if (Array.isArray(parsed?.choices) && parsed.choices.length) {
                        choiceWarning = { label: task.label, items: parsed.choices }
                    }
                } catch {
                    // 読めなければ警告なしとして扱う（PDF自体は正常なので止めない）
                }
            }
            const buf = await res.arrayBuffer()
            done += 1
            onProgress?.(done, tasks.length)
            return { index, buf, warning, choiceWarning, belowMinWarning }
        }),
    )

    const pdfBuffers: (ArrayBuffer | null)[] = tasks.map(() => null)
    const failedLabels: string[] = []
    const fitFailures: FitFailureDetail[] = []
    const shrinkWarnings: ShrinkWarningDetail[] = []
    const choiceWarnings: ChoiceWarningDetail[] = []
    const belowMinWarnings: BelowMinWarningDetail[] = []
    results.forEach((result, i) => {
        if (result.status === "fulfilled") {
            pdfBuffers[result.value.index] = result.value.buf
            if (result.value.warning) shrinkWarnings.push(result.value.warning)
            if (result.value.choiceWarning) choiceWarnings.push(result.value.choiceWarning)
            if (result.value.belowMinWarning) belowMinWarnings.push(result.value.belowMinWarning)
        } else {
            failedLabels.push(tasks[i]?.label ?? "unknown")
            const detail = (result.reason as { detail?: FitFailureDetail | null } | undefined)?.detail
            if (detail) fitFailures.push(detail)
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
    return { blob, failedLabels, fitFailures, shrinkWarnings, choiceWarnings, belowMinWarnings }
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
