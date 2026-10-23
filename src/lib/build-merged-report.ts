import { mergePdfBuffers } from "@/lib/merge-pdf-buffers"
import { fetchPdf } from "@/lib/pdf-client"
import { PdfRequestError } from "@/lib/pdf-request-error"
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
        // ★報告年月日は点検日ではない（消防署へ出す日・lib/soukatsu-cover.ts）。空なら表紙は空欄で印字される
        report_date: input.soukatsuData.report_date,
        fire_department_name: input.soukatsuData.fire_department_name,
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
            // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 並べ替えに使った formNo を外して返すため（受け取るだけで使わない）
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
            // ★PDF のルートは src/lib/pdf-client.ts の fetchPdf からだけ呼ぶ（失敗の分類と警告の読み取りも共通）
            let result: Awaited<ReturnType<typeof fetchPdf>>
            try {
                result = await fetchPdf(task.route, task.body)
            } catch (e) {
                // 422 は「枠に収まらない項目がある」= 業者が直せる。本文（どの項目が何文字超過か）を捨てずに運ぶ
                const detail: FitFailureDetail | null =
                    e instanceof PdfRequestError && e.failure.kind === "fit" && e.failure.items.length > 0
                        ? { label: task.label, items: e.failure.items }
                        : null
                const err = new Error(`${task.label}: ${e instanceof PdfRequestError ? e.failure.status : "network"}`) as Error & { detail?: FitFailureDetail | null }
                err.detail = detail
                throw err
            }
            // ⑨ 縮小警告はヘッダで運ばれる（PDF本体は正常）。読めなければ警告なし（fetchPdf が null を返す）
            const w = result.warnings
            const warning: ShrinkWarningDetail | null =
                w && w.items.length ? { label: task.label, items: w.items, omitted: w.omitted } : null
            const belowMinWarning: BelowMinWarningDetail | null =
                w && w.belowMin.length ? { label: task.label, items: w.belowMin } : null
            const choiceWarning: ChoiceWarningDetail | null =
                w && w.choices.length ? { label: task.label, items: w.choices } : null
            const buf = await result.blob.arrayBuffer()
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

    // ★結合は merge-pdf-buffers.ts に寄せた（同じフォントが様式の数だけ入って 50MB を超えていた・#27）
    const { bytes: mergedBytes } = await mergePdfBuffers(successBuffers)
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
