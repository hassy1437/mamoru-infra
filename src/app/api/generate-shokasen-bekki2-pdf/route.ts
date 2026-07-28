import { NextRequest, NextResponse } from "next/server"
import { PDFDocument, rgb, PDFPage, StandardFonts } from "pdf-lib"
import {
    buildFitError,
    createFitCollector,
    fitWarningHeader,
    logFitDebug,
    systemFitFailures,
} from "@/lib/pdf-fit-report"
import fontkit from "@pdf-lib/fontkit"
import fs from "fs"
import path from "path"
import { FIT_EPSILON, drawChoiceCircle, drawTextRuns, drawWrappedTextInCell, formatJapaneseDateText, formatJudgment, measureRuns, pickFont, reportIfBelowMinSize, type ReportFonts } from "@/lib/pdf-form-helpers"

/**
 * テストデータ生成が読む「数値しか入らない欄」の宣言。
 *
 * ★推論してはいけない。以前は contentOverrides / skipContentRows があれば数値欄と
 *   見なしていたが、override の幅は実測で 12〜97pt に連続しており、数値欄と
 *   「単に x をずらしただけの文字欄」を分離できない。その結果、現実値セットの
 *   100セル/14様式に "0.45" が入り、その範囲では切り詰めもはみ出しも測れていなかった。
 *   ＝ ここに書いてあるものだけが数値欄。書き忘れは検査データが甘くなるだけで
 *   済まないので、宣言が無いとテストデータ生成が失敗する。
 *
 * 添字は payload 配列の添字（drawResultRows の startIndex を適用した後の値）。
 * 分類は scripts/classify-numeric-rows.py が出す「内容セルの刷り込み」の実測による。
 */
export const NUMERIC_ROWS: Record<string, number[]> = {
    page1_rows: [1, 10, 12],
    page2_rows: [11, 12, 13, 24, 25, 31, 32],
    page3_rows: [8, 9, 24, 26, 27, 29, 30],
}

type Bekki2Row = {
    content?: string
    judgment?: string
    bad_content?: string
    action_content?: string
    current_value?: string  // 電圧計・電流計行の電流値（A）
    flow_value?: string     // 性能行のL/min値（MPaラベルとL/minラベルの間）
}

type DeviceRow = {
    name?: string
    model?: string
    calibrated_at?: string
    maker?: string
}

type Bekki2Payload = {
    form_name?: string
    fire_manager?: string
    witness?: string
    location?: string
    inspection_type?: string
    period_start?: string
    period_end?: string
    inspector_name?: string
    inspector_company?: string
    inspector_address?: string
    inspector_tel?: string
    equipment_name?: string
    pump_maker?: string
    pump_model?: string
    motor_maker?: string
    motor_model?: string
    page1_rows?: Bekki2Row[]
    page2_rows?: Bekki2Row[]
    page3_rows?: Bekki2Row[]
    notes?: string
    device1?: DeviceRow
    device2?: DeviceRow
}

type DrawOptions = {
    align?: "left" | "center"
    paddingX?: number
    paddingY?: number
    minFontSize?: number
    maxFontSize?: number
}

const P1_ROW_BOUNDS = [
    312, 333, 354, 375, 396, 417, 438, 459, 480, 501,
    522, 543, 564, 585, 606, 627, 648, 669, 690,
]

const P2_ROW_BOUNDS = [
    74, 92, 110, 128, 146, 164, 182, 200, 218, 237,
    256, 275, 293, 311, 329, 347, 365, 383, 401, 419,
    437, 455, 473, 491, 509, 527, 545, 563, 581, 599,
    617, 635, 653, 671, 689,
]

const P3_ROW_BOUNDS_A = [
    74, 91, 108, 125, 142, 159, 174, 188, 202, 230, 259, 273,
    287, 300, 314, 328, 342, 356, 371, 385, 399, 413, 430,
]

const P3_ROW_BOUNDS_B = [
    447, 461, 475, 490, 504, 518, 532, 546, 560, 574, 589,
]

const PERIOD_ROW = { top: 144, h: 21 }
const PERIOD_START_ANCHORS = { year: 328.8, month: 359.8, day: 392.5 }
const PERIOD_END_ANCHORS = { year: 451.0, month: 482.0, day: 514.8 }

const normalizeText = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim()

const formatDateText = (value: unknown) => {
    const raw = normalizeText(value)
    if (!raw) return ""
    const date = new Date(raw)
    if (Number.isNaN(date.getTime())) return raw
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
}

const parseDateParts = (value: unknown) => {
    const raw = normalizeText(value)
    if (!raw) return null

    const date = new Date(raw)
    if (!Number.isNaN(date.getTime())) {
        return {
            year: String(date.getFullYear()),
            month: String(date.getMonth() + 1),
            day: String(date.getDate()),
        }
    }

    const match = raw.match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})$/)
    if (!match) return null
    return {
        year: match[1],
        month: String(Number(match[2])),
        day: String(Number(match[3])),
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = (await req.json()) as Bekki2Payload

        const candidatePdfPaths = [
            path.join(process.cwd(), "public", "PDF", "s50_kokuji14_bekki2.pdf"),
            path.join(process.cwd(), "public", "s50_kokuji14_bekki2.pdf"),
        ]
        const pdfPath = candidatePdfPaths.find((p) => fs.existsSync(p))
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf")

        if (!pdfPath) {
            throw new Error("Template PDF not found: s50_kokuji14_bekki2.pdf")
        }

        const existingPdfBytes = fs.readFileSync(pdfPath)
        const fontBytes = fs.readFileSync(fontPath)

        const pdfDoc = await PDFDocument.load(existingPdfBytes)
        pdfDoc.registerFontkit(fontkit)
        const customFont = await pdfDoc.embedFont(fontBytes)
        // ASCII(型式・番号・日付等)は Helvetica で描く。NotoSansJP は「英字+ハイフン+数字」で
        // 数字がCJK拡張Aのグリフに化け、計測幅と実描画幅が最大+41.6%ズレて枠をはみ出すため。
        const latinFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
        const fonts: ReportFonts = { jp: customFont, latin: latinFont, fit: createFitCollector() }

        const [page1, page2, page3] = pdfDoc.getPages()
        const p1Height = page1.getSize().height
        const p2Height = page2.getSize().height
        const p3Height = page3.getSize().height

        const truncateToFitWidth = (value: string, size: number, maxWidth: number) => {
            if (!value) return ""
            if (measureRuns(fonts, String(value ?? ""), size) <= maxWidth + FIT_EPSILON) return value

            const suffix = "..."
            if (measureRuns(fonts, String(suffix ?? ""), size) > maxWidth) return ""

            let cut = value.length
            while (cut > 0) {
                const candidate = `${value.slice(0, cut).trimEnd()}${suffix}`
                if (measureRuns(fonts, String(candidate ?? ""), size) <= maxWidth + FIT_EPSILON) {
                    fonts.fit?.report(value, cut)
                    return candidate
                }
                cut -= 1
            }

            return suffix
        }

        const drawInCell = (
            page: PDFPage,
            pageHeight: number,
            text: unknown,
            cellX: number,
            cellTopFromTop: number,
            cellW: number,
            cellH: number,
            fontSize = 9,
            options?: DrawOptions,
        ) => {
            const normalized = normalizeText(text)
            if (!normalized) return

            const paddingX = options?.paddingX ?? 3
            const paddingY = options?.paddingY ?? 2
            const minFontSize = options?.minFontSize ?? 3.5
            let currentSize = Math.min(fontSize, options?.maxFontSize ?? fontSize)
            const designSize = currentSize

            // 安全係数は撤廃済み（①bで計測が実描画と一致し、②③④でセル座標を実測値に直したため）
            const maxWidth = Math.max(1, cellW - paddingX * 2)
            const maxHeight = Math.max(1, cellH - paddingY * 2)

            const widthAtCurrent = measureRuns(fonts, String(normalized ?? ""), currentSize)
            if (widthAtCurrent > maxWidth) {
                currentSize = currentSize * (maxWidth / widthAtCurrent)
            }

            const heightAtCurrent = fonts.jp.heightAtSize(currentSize, { descender: true })
            if (heightAtCurrent > maxHeight) {
                currentSize = currentSize * (maxHeight / heightAtCurrent)
            }

            currentSize = Math.max(currentSize, minFontSize)

            fonts.fit?.reportShrink(normalized, designSize, currentSize)

            reportIfBelowMinSize(fonts, normalized, currentSize, maxWidth)

            const textToDraw = truncateToFitWidth(normalized, currentSize, maxWidth)
            if (!textToDraw) return

            const textWidth = measureRuns(fonts, String(textToDraw ?? ""), currentSize)
            const textHeight = fonts.jp.heightAtSize(currentSize, { descender: true })
            let textX = cellX + paddingX
            if (options?.align === "center") {
                textX = cellX + (cellW - textWidth) / 2
            }
            const textTopFromTop = cellTopFromTop + (cellH - textHeight) / 2
            const baselineOffset = textHeight * 0.78

            drawTextRuns(page, fonts, String(textToDraw ?? ""), textX, pageHeight - (textTopFromTop + baselineOffset), currentSize)
        }

        // 別フォントを指定して drawInCell と同等の描画を行うヘルパー（型式など ASCII 主体のセル用）
        const drawInCellWithFont = (
            page: PDFPage,
            pageHeight: number,
            font: ReportFonts,
            text: unknown,
            cellX: number,
            cellTopFromTop: number,
            cellW: number,
            cellH: number,
            fontSize = 9,
            options?: DrawOptions,
        ) => {
            const normalized = normalizeText(text)
            if (!normalized) return
            const paddingX = options?.paddingX ?? 3
            const paddingY = options?.paddingY ?? 2
            const minFontSize = options?.minFontSize ?? 3.5
            let currentSize = Math.min(fontSize, options?.maxFontSize ?? fontSize)
            const designSize = currentSize
            // 安全係数は撤廃済み（①bで計測が実描画と一致し、②③④でセル座標を実測値に直したため）
            const maxWidth = Math.max(1, cellW - paddingX * 2)
            const maxHeight = Math.max(1, cellH - paddingY * 2)
            const w = measureRuns(font, String(normalized ?? ""), currentSize)
            if (w > maxWidth) currentSize = currentSize * (maxWidth / w)
            const h = font.jp.heightAtSize(currentSize, { descender: true })
            if (h > maxHeight) currentSize = currentSize * (maxHeight / h)
            currentSize = Math.max(currentSize, minFontSize)
            fonts.fit?.reportShrink(normalized, designSize, currentSize)
            reportIfBelowMinSize(fonts, normalized, currentSize, maxWidth)
            // truncate if still too wide (+ 0.1 tolerance for floating point)
            let textToDraw = normalized
            if (measureRuns(font, String(normalized ?? ""), currentSize) > maxWidth + 0.1) {
                const suffix = "..."
                let cut = normalized.length
                while (cut > 0) {
                    const candidate = `${normalized.slice(0, cut).trimEnd()}${suffix}`
                    if (measureRuns(font, String(candidate ?? ""), currentSize) <= maxWidth + FIT_EPSILON) {
                        font.fit?.report(normalized, cut)
                        textToDraw = candidate
                        break
                    }
                    cut -= 1
                }
            }
            const textWidth = measureRuns(font, String(textToDraw ?? ""), currentSize)
            const textHeight = font.jp.heightAtSize(currentSize, { descender: true })
            let textX = cellX + paddingX
            if (options?.align === "center") textX = cellX + (cellW - textWidth) / 2
            const textTopFromTop = cellTopFromTop + (cellH - textHeight) / 2
            const baselineOffset = textHeight * 0.78
            drawTextRuns(page, font, String(textToDraw ?? ""), textX, pageHeight - (textTopFromTop + baselineOffset), currentSize)
        }

        const drawWrappedInCell = (
            page: PDFPage,
            pageHeight: number,
            text: unknown,
            cellX: number,
            cellTopFromTop: number,
            cellW: number,
            cellH: number,
            fontSize = 7.2,
        ) => drawWrappedTextInCell({
            page,
            pageHeight,
            fonts,
            text,
            cellX,
            cellTopFromTop,
            cellW,
            cellH,
            fontSize,
            options: {
                paddingX: 2.5,
                paddingY: 1.5,
                minFontSize: 3.5,
                lineGap: 0.9,
            },
        })

        const drawResultRows = (
            page: PDFPage,
            pageHeight: number,
            rows: Bekki2Row[],
            rowBounds: number[],
            startIndex = 0,
            contentOverrides: Record<number, {x: number; w: number}> = {},
            skipContentRows: Set<number> = new Set(),
        ) => {
            for (let i = 0; i < rowBounds.length - 1; i += 1) {
                const row = rows[startIndex + i]
                if (!row) continue
                const top = rowBounds[i]
                const h = rowBounds[i + 1] - rowBounds[i]

                if (!skipContentRows.has(i)) {
                    const cx = contentOverrides[i]?.x ?? 239
                    const cw = contentOverrides[i]?.w ?? 104
                    drawWrappedInCell(page, pageHeight, row.content, cx, top, cw, h, 6.8)
                }
                drawInCell(page, pageHeight, formatJudgment(row.judgment), 343, top, 37, h, 8.6, { align: "center" })
                drawWrappedInCell(page, pageHeight, row.bad_content, 380, top, 75, h, 6.8)
                drawWrappedInCell(page, pageHeight, row.action_content, 455, top, 74, h, 6.8)
            }
        }

        // 専用/兼用など選択式セルに〇を描画

        const drawRightAt = (
            page: PDFPage,
            pageHeight: number,
            text: string,
            anchorX: number,
            rowTop: number,
            rowH: number,
            size = 8.1,
        ) => {
            if (!text) return
            const textHeight = fonts.jp.heightAtSize(size, { descender: true })
            const textTop = rowTop + (rowH - textHeight) / 2
            const y = pageHeight - (textTop + textHeight * 0.78)
            const textWidth = measureRuns(fonts, String(text ?? ""), size)
            drawTextRuns(page, fonts, String(text ?? ""), anchorX - textWidth, y, size)
        }

        const drawPeriodDate = (
            dateValue: unknown,
            anchors: { year: number; month: number; day: number },
        ) => {
            const parts = parseDateParts(dateValue)
            if (!parts) return
            drawRightAt(page1, p1Height, parts.year, anchors.year, PERIOD_ROW.top, PERIOD_ROW.h, 8.1)
            drawRightAt(page1, p1Height, parts.month, anchors.month, PERIOD_ROW.top, PERIOD_ROW.h, 8.1)
            drawRightAt(page1, p1Height, parts.day, anchors.day, PERIOD_ROW.top, PERIOD_ROW.h, 8.1)
        }

        drawInCell(page1, p1Height, body.form_name, 119, 100, 224, 23, 9)
        drawInCell(page1, p1Height, body.fire_manager, 406, 100, 123, 23, 8.6)
        drawInCell(page1, p1Height, body.location, 119, 123, 224, 21, 8.8)
        drawInCell(page1, p1Height, body.witness, 406, 123, 123, 21, 8.6)

        // 点検種別はテンプレートに「機器・総合」が印刷済みのため描画しない
        const periodStart = formatDateText(body.period_start)
        const periodEnd = formatDateText(body.period_end)
        if (parseDateParts(body.period_start) || parseDateParts(body.period_end)) {
            drawPeriodDate(body.period_start, PERIOD_START_ANCHORS)
            drawPeriodDate(body.period_end, PERIOD_END_ANCHORS)
        } else {
            const periodText = periodStart && periodEnd ? `${periodStart} - ${periodEnd}` : (periodStart || periodEnd)
            drawInCell(page1, p1Height, periodText, 238, PERIOD_ROW.top, 291, PERIOD_ROW.h, 8.5)
        }

        // 刷り込みに重ねない: 前置ラベル氏名(-144.1) の右から（テンプレート実測）
        drawInCell(page1, p1Height, body.inspector_name, 144.6, 165, 66.4, 42, 8.4)
        // 「社名」ラベル x=285.7-306.8 の右から開始 → x=309, w=422-309-2=111
        drawInCell(page1, p1Height, body.inspector_company, 309, 165, 111, 21, 8.2)
        // 「TEL」ラベル x=422.4-438.1 の右から開始 → x=440, w=530-440-2=88
        drawInCell(page1, p1Height, body.inspector_tel, 440, 165, 88, 21, 8.2)
        // 「住所」ラベル x=285.7-306.8 の右から開始 → x=309, w=530-309-3=218
        drawInCell(page1, p1Height, body.inspector_address, 309, 186, 218, 21, 8.2)

        // equipment_name はテンプレートに印刷済みのため描画しない
        // 「製造者名」ラベル x=170.3-212.4 の右から開始 → x=215, w=311.6-215-2=94
        drawInCell(page1, p1Height, body.pump_maker, 215, 207, 94, 21, 7.4)
        drawInCell(page1, p1Height, body.pump_model, 215, 228, 94, 21, 7.4)
        // 「製造者名」ラベル x=364.4-406.6 の右から開始 → x=409, w=530-409-3=118
        drawInCell(page1, p1Height, body.motor_maker, 409, 207, 118, 21, 7.4)
        drawInCell(page1, p1Height, body.motor_model, 409, 228, 118, 21, 7.4)

        const p1Rows = body.page1_rows ?? []
        drawResultRows(page1, p1Height, p1Rows, P1_ROW_BOUNDS, 0, {
            // 貯水槽: 「種別」印刷済み (x=244-265) → x=267から
            0: { x: 267, w: 74 },
            // 水量: 「ｍ³」印刷済み (x=323-338) → x=321まで
            1: { x: 239, w: 82 },
            // ヒューズ類: 「Ａ」印刷済み (x=327-338) → x=325まで
            12: { x: 239, w: 86 },
            // 接地: 「種接地」印刷済み (x=306-338) → x=304まで
            16: { x: 239, w: 65 },
        }, new Set([10])) // row 10: V/A split — handled manually below

        // 電圧計・電流計 (row 10): 「Ｖ」(x=275-286) / 「Ａ」(x=327-338) 自動分割
        const voltRow = p1Rows[10]
        if (voltRow) {
            const voltTop = P1_ROW_BOUNDS[10]
            const voltH = P1_ROW_BOUNDS[11] - P1_ROW_BOUNDS[10]
            const voltContent = normalizeText(voltRow.content)

            if (voltRow.current_value) {
                // 明示的フィールド: content=電圧, current_value=電流
                drawWrappedInCell(page1, p1Height, voltContent, 239, voltTop, 34, voltH, 6.8)
                drawWrappedInCell(page1, p1Height, voltRow.current_value, 289, voltTop, 36, voltH, 6.8)
            } else if (voltContent.includes("/")) {
                // "AC200/15.5" → "AC200" before V, "15.5" before A
                const slashIdx = voltContent.indexOf("/")
                const voltage = voltContent.slice(0, slashIdx).trim()
                const current = voltContent.slice(slashIdx + 1).trim()
                drawWrappedInCell(page1, p1Height, voltage, 239, voltTop, 34, voltH, 6.8)
                drawWrappedInCell(page1, p1Height, current, 289, voltTop, 36, voltH, 6.8)
            } else if (voltContent) {
                drawWrappedInCell(page1, p1Height, voltContent, 239, voltTop, 34, voltH, 6.8)
            }
        }

        const p2Rows = body.page2_rows ?? []
        drawResultRows(page2, p2Height, p2Rows, P2_ROW_BOUNDS, 0, {
            // 圧力スイッチ設定圧力: 「設定圧力」(x=245-287)+「MPa」(x=323-355) → x=289〜321
            11: { x: 289, w: 32 },
            // 起動用圧力タンク: 「MPa」印刷済み (x=323-355) → x=321まで
            12: { x: 239, w: 82 },
            // 機能作動圧力: 「作動圧力」(x=245-287)+「MPa」(x=323-355) → x=289〜321
            13: { x: 289, w: 32 },
            // 呼水槽: 「Ｌ」印刷済み (x=334-345) → x=332まで
            25: { x: 239, w: 93 },
            // 高架水槽方式: 「MPa」印刷済み (x=323-345) → x=321まで
            31: { x: 239, w: 82 },
            // 圧力水槽方式: 「MPa」印刷済み (x=323-345) → x=321まで
            32: { x: 239, w: 82 },
        }, new Set([
            7,  // 機能（専用/兼用）: 〇で選択するためコンテンツ描画をスキップ
            24, // 性能（MPa/L/min）: 自動分割のため手動描画
        ]))

        // 性能 (p2 row 24): 「MPa」(x=268-300) / 「L/min」(x=310-344) 自動分割
        const perfRow = p2Rows[24]
        if (perfRow) {
            const perfTop = P2_ROW_BOUNDS[24]
            const perfH = P2_ROW_BOUNDS[25] - P2_ROW_BOUNDS[24]
            const perfContent = normalizeText(perfRow.content)

            const drawMpaVal = (v: string) => drawWrappedInCell(page2, p2Height, v, 239, perfTop, 27, perfH, 6.8)
            const drawFlowVal = (v: string) => drawInCellWithFont(page2, p2Height, fonts, v, 297, perfTop, 15, perfH, 6.5, { paddingX: 1 })

            if (perfRow.flow_value) {
                // 明示的フィールド: content=MPa値, flow_value=L/min値
                if (perfContent) drawMpaVal(perfContent)
                drawFlowVal(perfRow.flow_value)
            } else if (perfContent.includes("/")) {
                // "0.25/300" → "0.25" before MPa, "300" before L/min
                const slashIdx = perfContent.indexOf("/")
                const mpa = perfContent.slice(0, slashIdx).trim()
                const flow = perfContent.slice(slashIdx + 1).trim()
                if (mpa) drawMpaVal(mpa)
                if (flow) drawFlowVal(flow)
            } else if (perfContent) {
                drawMpaVal(perfContent)
            }
        }

        // P2 row 7: 機能（専用/兼用）の選択を〇で表示
        drawChoiceCircle(page2, p2Height, fonts, p2Rows[7]?.content ?? "", [
            { label: "専用", cx: 266,   cy: 209, rx: 14, ry: 7 },
            { label: "兼用", cx: 318.6, cy: 209, rx: 14, ry: 7 },
        ])

        const p3Rows = body.page3_rows ?? []
        drawResultRows(page3, p3Height, p3Rows, P3_ROW_BOUNDS_A, 0, {}, new Set([
            8,   // 1号消火栓 ホース/ノズル径: 複雑な印刷済みのためスキップ
            9,   // 易操作性1号/2号消火栓 ホース/ノズル径: 同上
            13,  // 表示灯（専用/兼用）: 〇で選択
        ]))

        // P3A row 13: 表示灯（専用/兼用）の選択を〇で表示
        drawChoiceCircle(page3, p3Height, fonts, p3Rows[13]?.content ?? "", [
            { label: "専用", cx: 270,   cy: 306.75, rx: 14, ry: 7 },
            { label: "兼用", cx: 312.1, cy: 306.75, rx: 14, ry: 7 },
        ])

        // P3A row 8, 9: ホース/ノズル径「ホース ___m× ___本 ｜ ノズル径 ___mm」を手動3分割描画
        // content="20/2/19" → ホース20m × 2本, ノズル径19mm（skipContentRows で content をスキップ済）
        // bekki3(row25)/bekki20(row7) と同手法。公式PDF実測座標を使用。
        for (const hi of [8, 9]) {
            const hoseRow = p3Rows[hi]
            if (!hoseRow) continue
            const hTop = P3_ROW_BOUNDS_A[hi]
            const hH = P3_ROW_BOUNDS_A[hi + 1] - P3_ROW_BOUNDS_A[hi]
            const hContent = normalizeText(hoseRow.content)
            // 値は行の下半分（m×/本/mm ラベルと同じ高さ）に配置
            const hValTop = hTop + hH / 2 - 2
            const hValH = hH / 2 + 2
            const parts = hContent.split("/")
            if (parts.length >= 3) {
                // ホース長(m): 「m」(x=264.6)の左
                drawInCellWithFont(page3, p3Height, fonts, parts[0]?.trim(), 244, hValTop, 20, hValH, 6.5, { paddingX: 0.5 })
                // 本数: 「×」(x=285.7)と「本」(x=301.4)の間
                drawInCellWithFont(page3, p3Height, fonts, parts[1]?.trim(), 287, hValTop, 12, hValH, 6.0, { paddingX: 0 })
                // ノズル径(mm): 「本」(x=312)と「mm」(x=327.7)の間
                drawInCellWithFont(page3, p3Height, fonts, parts[2]?.trim(), 313, hValTop, 14, hValH, 6.0, { paddingX: 0 })
            } else if (parts.length === 2) {
                drawInCellWithFont(page3, p3Height, fonts, parts[0]?.trim(), 244, hValTop, 20, hValH, 6.5, { paddingX: 0.5 })
                drawInCellWithFont(page3, p3Height, fonts, parts[1]?.trim(), 313, hValTop, 14, hValH, 6.0, { paddingX: 0 })
            } else if (hContent) {
                drawInCellWithFont(page3, p3Height, fonts, hContent, 244, hValTop, 20, hValH, 6.5, { paddingX: 0.5 })
            }
        }

        drawResultRows(page3, p3Height, p3Rows, P3_ROW_BOUNDS_B, 22, {
            // 電動機の運転電流: 「Ａ」印刷済み (x=327-338) → x=325まで
            2: { x: 239, w: 86 },
            // 放水圧力(ポンプ): 「MPa」印刷済み (x=322-354) → x=320まで
            4: { x: 239, w: 81 },
            // 放水量(ポンプ): 「L/min」印刷済み (x=311-343) → x=309まで
            5: { x: 239, w: 70 },
            // 放水圧力(高架/圧力水槽): 「MPa」印刷済み (x=322-354) → x=320まで
            7: { x: 239, w: 81 },
            // 放水量(高架/圧力水槽): 「L/min」印刷済み (x=311-343) → x=309まで
            8: { x: 239, w: 70 },
        })

        drawWrappedInCell(page3, p3Height, body.notes, 83, 589, 446, 43, 7.3)

        const device1 = body.device1 ?? {}
        const device2 = body.device2 ?? {}
        const devOpts: DrawOptions = { paddingX: 1 }
        drawInCell(page3, p3Height, device1.name, 83, 649, 55, 14, 7.2, devOpts)
        drawInCellWithFont(page3, p3Height, fonts, device1.model, 138, 649, 56, 14, 7.2, devOpts)
        drawInCell(page3, p3Height, formatJapaneseDateText(device1.calibrated_at), 194, 649, 56, 14, 7.2, devOpts)
        // 製造者名は長い社名が多いため、0.85安全マージンなしで描画
        const drawDeviceMaker = (text: unknown, cellX: number, cellW: number) => {
            const norm = normalizeText(text)
            if (!norm) return
            const padX = 1
            const availW = cellW - padX * 2
            let sz = 7.2
            const w = measureRuns(fonts, String(norm ?? ""), sz)
            // 0.98 の余白は撤廃（2026-07-24 実測: はみ出し・切り詰め・フォントサイズ分布のどれも変化なし。
            // 丸め防御を名乗るには2%は大きすぎ、0.85/0.90 と同じ「症状を隠す係数」の系統だった）
            if (w > availW) sz = sz * (availW / w)
            sz = Math.max(sz, 3.5)
            const drawn = truncateToFitWidth(norm, sz, availW)
            if (!drawn) return
            const th = fonts.jp.heightAtSize(sz, { descender: true })
            const textTop = 649 + (14 - th) / 2
            drawTextRuns(page3, fonts, String(drawn ?? ""), cellX + padX, p3Height - (textTop + th * 0.78), sz)
        }
        drawDeviceMaker(device1.maker, 250, 56)

        drawInCell(page3, p3Height, device2.name, 306, 649, 56, 14, 7.2, devOpts)
        drawInCellWithFont(page3, p3Height, fonts, device2.model, 362, 649, 56, 14, 7.2, devOpts)
        drawInCell(page3, p3Height, formatJapaneseDateText(device2.calibrated_at), 418, 649, 56, 14, 7.2, devOpts)
        drawDeviceMaker(device2.maker, 474, 55)

        // ⑧ 枠に収まらなかった項目があればPDFを返さずに一覧を返す。
        //   黙って "..." で切り詰めると、法定書類から情報が静かに欠落するため。
        fonts.fit?.resolve(body)
        const systemOverflow = systemFitFailures(fonts.fit!)
        if (systemOverflow.length) {
            // 業者には直せない（テンプレート固定文言・整形済みの値）＝実装側の不具合として記録
            console.error("[pdf] 収容不能(システム由来)", { form: "別記様式第2", items: systemOverflow })
        }
        const fitFormLabel = "別記様式第2"
        logFitDebug(fitFormLabel, fonts.fit!)
        if (fonts.fit?.smalls.length) {
            // 判読しづらい大きさで描かれた項目。単独では止められない（上記コメント参照）ので記録のみ
            console.warn("[pdf] 極小フォントで描画", { count: fonts.fit.smalls.length })
        }
        const fitError = buildFitError("別記様式第2", fonts.fit!)
        if (fitError) return NextResponse.json(fitError, { status: 422 })

        const pdfBytes = await pdfDoc.save()
        return new NextResponse(pdfBytes as unknown as BodyInit, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                // ⑨ 設計値から大きく縮んだ項目があれば警告として運ぶ（PDFは返す）
                ...fitWarningHeader(fitFormLabel, fonts.fit!),
                "Content-Disposition": 'attachment; filename="s50_kokuji14_bekki2_filled.pdf"',
            },
        })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 })
    }
}
