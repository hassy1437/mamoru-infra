import { NextRequest, NextResponse } from "next/server"
import { PDFDocument, rgb, PDFPage, StandardFonts } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"
import fs from "fs"
import path from "path"
import { drawWrappedTextInCell, formatJapaneseDateText } from "@/lib/pdf-form-helpers"

type Bekki3Row = {
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

type Bekki3Payload = {
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
    page1_rows?: Bekki3Row[]
    page2_rows?: Bekki3Row[]
    page3_rows?: Bekki3Row[]
    page4_rows?: Bekki3Row[]
    page5_rows?: Bekki3Row[]
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

type ResultColumns = {
    contentX: number
    contentW: number
    judgmentX: number
    judgmentW: number
    badX: number
    badW: number
    actionX: number
    actionW: number
}

const P1_ROW_BOUNDS = [
    311, 332, 353, 374, 395, 416, 437, 458, 479, 500,
    521, 542, 563, 584, 605, 626, 647, 668, 689, 710,
]

const P2_ROW_BOUNDS = [
    83, 100, 117, 134, 151, 177, 202, 227, 253, 278,
    296, 313, 329, 346, 364, 380, 397, 415, 431, 448,
    466, 482, 499, 517, 533, 550, 568, 584, 602, 619,
    635, 653, 670, 686, 703,
]

const P3_ROW_BOUNDS = [
    76, 94, 113, 131, 149, 168, 186, 205, 223, 242,
    260, 279, 297, 316, 334, 352, 371, 389, 417, 436,
    454, 473, 491, 505, 520, 534, 559, 573, 588, 602,
    616, 631, 645, 660, 674, 689, 708,
]

const P4_ROW_BOUNDS = [
    105, 132, 160, 186, 214, 241, 268, 295, 322,
    349, 377, 405, 434, 462, 490, 519, 547, 575, 604,
    632, 659, 686, 712,
]

const P5_ROW_BOUNDS = [79, 104, 130, 155, 181, 206, 232, 257, 283, 308, 334, 359]

const PERIOD_ROW = { top: 161, h: 18 }
const PERIOD_START_ANCHORS = { year: 303.2, month: 340.0, day: 377.0 }
const PERIOD_END_ANCHORS = { year: 424.3, month: 460.5, day: 497.8 }

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
        const body = (await req.json()) as Bekki3Payload

        const candidatePdfPaths = [
            path.join(process.cwd(), "public", "PDF", "s50_kokuji14_bekki3.pdf"),
            path.join(process.cwd(), "public", "s50_kokuji14_bekki3.pdf"),
        ]
        const pdfPath = candidatePdfPaths.find((p) => fs.existsSync(p))
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf")

        if (!pdfPath) {
            throw new Error("Template PDF not found: s50_kokuji14_bekki3.pdf")
        }

        const existingPdfBytes = fs.readFileSync(pdfPath)
        const fontBytes = fs.readFileSync(fontPath)

        const pdfDoc = await PDFDocument.load(existingPdfBytes)
        pdfDoc.registerFontkit(fontkit)
        const customFont = await pdfDoc.embedFont(fontBytes)
        const latinFont = await pdfDoc.embedFont(StandardFonts.Helvetica)

        const [page1, page2, page3, page4, page5] = pdfDoc.getPages()
        const p1Height = page1.getSize().height
        const p2Height = page2.getSize().height
        const p3Height = page3.getSize().height
        const p4Height = page4.getSize().height
        const p5Height = page5.getSize().height

        const truncateToFitWidth = (value: string, size: number, maxWidth: number) => {
            if (!value) return ""
            if (customFont.widthOfTextAtSize(value, size) <= maxWidth) return value

            const suffix = "..."
            if (customFont.widthOfTextAtSize(suffix, size) > maxWidth) return ""

            let cut = value.length
            while (cut > 0) {
                const candidate = `${value.slice(0, cut).trimEnd()}${suffix}`
                if (customFont.widthOfTextAtSize(candidate, size) <= maxWidth) return candidate
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

            const maxWidth = Math.max(1, (cellW - paddingX * 2) * 0.85)
            const maxHeight = Math.max(1, cellH - paddingY * 2)

            const widthAtCurrent = customFont.widthOfTextAtSize(normalized, currentSize)
            if (widthAtCurrent > maxWidth) {
                currentSize = currentSize * (maxWidth / widthAtCurrent)
            }

            const heightAtCurrent = customFont.heightAtSize(currentSize, { descender: true })
            if (heightAtCurrent > maxHeight) {
                currentSize = currentSize * (maxHeight / heightAtCurrent)
            }

            currentSize = Math.max(currentSize, minFontSize)

            const textToDraw = truncateToFitWidth(normalized, currentSize, maxWidth)
            if (!textToDraw) return

            const textWidth = customFont.widthOfTextAtSize(textToDraw, currentSize)
            const textHeight = customFont.heightAtSize(currentSize, { descender: true })
            let textX = cellX + paddingX
            if (options?.align === "center") {
                textX = cellX + (cellW - textWidth) / 2
            }
            const textTopFromTop = cellTopFromTop + (cellH - textHeight) / 2
            const baselineOffset = textHeight * 0.78

            page.drawText(textToDraw, {
                x: textX,
                y: pageHeight - (textTopFromTop + baselineOffset),
                size: currentSize,
                font: customFont,
                color: rgb(0, 0, 0),
            })
        }

        const drawInCellWithFont = (
            page: PDFPage,
            pageHeight: number,
            font: typeof customFont,
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
            const maxWidth = Math.max(1, (cellW - paddingX * 2) * 0.85)
            const maxHeight = Math.max(1, cellH - paddingY * 2)
            const w = font.widthOfTextAtSize(normalized, currentSize)
            if (w > maxWidth) currentSize = currentSize * (maxWidth / w)
            const h = font.heightAtSize(currentSize, { descender: true })
            if (h > maxHeight) currentSize = currentSize * (maxHeight / h)
            currentSize = Math.max(currentSize, minFontSize)
            let textToDraw = normalized
            if (font.widthOfTextAtSize(normalized, currentSize) > maxWidth + 0.1) {
                const suffix = "..."
                let cut = normalized.length
                while (cut > 0) {
                    const candidate = `${normalized.slice(0, cut).trimEnd()}${suffix}`
                    if (font.widthOfTextAtSize(candidate, currentSize) <= maxWidth) { textToDraw = candidate; break }
                    cut -= 1
                }
            }
            const textWidth = font.widthOfTextAtSize(textToDraw, currentSize)
            const textHeight = font.heightAtSize(currentSize, { descender: true })
            let textX = cellX + paddingX
            if (options?.align === "center") textX = cellX + (cellW - textWidth) / 2
            const textTopFromTop = cellTopFromTop + (cellH - textHeight) / 2
            const baselineOffset = textHeight * 0.78
            page.drawText(textToDraw, {
                x: textX,
                y: pageHeight - (textTopFromTop + baselineOffset),
                size: currentSize,
                font,
                color: rgb(0, 0, 0),
            })
        }

        const drawWrappedInCell = (
            page: PDFPage,
            pageHeight: number,
            text: unknown,
            cellX: number,
            cellTopFromTop: number,
            cellW: number,
            cellH: number,
            fontSize = 7.1,
        ) => drawWrappedTextInCell({
            page,
            pageHeight,
            font: customFont,
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
            rows: Bekki3Row[],
            rowBounds: number[],
            columns: ResultColumns,
            contentOverrides: Record<number, {x: number; w: number}> = {},
            skipContentRows: Set<number> = new Set(),
        ) => {
            for (let i = 0; i < rowBounds.length - 1; i += 1) {
                const row = rows[i]
                if (!row) continue
                const top = rowBounds[i]
                const h = rowBounds[i + 1] - rowBounds[i]

                if (!skipContentRows.has(i)) {
                    const cx = contentOverrides[i]?.x ?? columns.contentX
                    const cw = contentOverrides[i]?.w ?? columns.contentW
                    drawWrappedInCell(page, pageHeight, row.content, cx, top, cw, h, 6.7)
                }
                drawInCell(page, pageHeight, row.judgment, columns.judgmentX, top, columns.judgmentW, h, 8.4, { align: "center" })
                drawWrappedInCell(page, pageHeight, row.bad_content, columns.badX, top, columns.badW, h, 6.7)
                drawWrappedInCell(page, pageHeight, row.action_content, columns.actionX, top, columns.actionW, h, 6.7)
            }
        }

        const drawSelectionCircle = (
            page: PDFPage,
            pageHeight: number,
            content: string,
            choices: Array<{label: string; cx: number; cy: number; rx: number; ry: number}>,
        ) => {
            const match = choices.find(c => content.includes(c.label))
            if (!match) return
            page.drawEllipse({
                x: match.cx,
                y: pageHeight - match.cy,
                xScale: match.rx,
                yScale: match.ry,
                borderColor: rgb(0, 0, 0),
                borderWidth: 0.7,
            })
        }

        const drawRightAt = (
            page: PDFPage,
            pageHeight: number,
            text: string,
            anchorX: number,
            rowTop: number,
            rowH: number,
            size = 7.9,
        ) => {
            if (!text) return
            const textHeight = customFont.heightAtSize(size, { descender: true })
            const textTop = rowTop + (rowH - textHeight) / 2
            const y = pageHeight - (textTop + textHeight * 0.78)
            const textWidth = customFont.widthOfTextAtSize(text, size)
            page.drawText(text, { x: anchorX - textWidth, y, size, font: customFont, color: rgb(0, 0, 0) })
        }

        const drawPeriodDate = (
            dateValue: unknown,
            anchors: { year: number; month: number; day: number },
        ) => {
            const parts = parseDateParts(dateValue)
            if (!parts) return
            drawRightAt(page1, p1Height, parts.year, anchors.year, PERIOD_ROW.top, PERIOD_ROW.h, 7.9)
            drawRightAt(page1, p1Height, parts.month, anchors.month, PERIOD_ROW.top, PERIOD_ROW.h, 7.9)
            drawRightAt(page1, p1Height, parts.day, anchors.day, PERIOD_ROW.top, PERIOD_ROW.h, 7.9)
        }

        drawInCell(page1, p1Height, body.form_name, 119, 108, 224, 26, 9)
        drawInCell(page1, p1Height, body.fire_manager, 413, 108, 117, 26, 8.6)
        drawInCell(page1, p1Height, body.location, 119, 134, 224, 27, 8.8)
        drawInCell(page1, p1Height, body.witness, 413, 134, 117, 27, 8.6)

        // 点検種別はテンプレートに「機器・総合」が印刷済みのため描画しない
        const periodStart = formatDateText(body.period_start)
        const periodEnd = formatDateText(body.period_end)
        if (parseDateParts(body.period_start) || parseDateParts(body.period_end)) {
            drawPeriodDate(body.period_start, PERIOD_START_ANCHORS)
            drawPeriodDate(body.period_end, PERIOD_END_ANCHORS)
        } else {
            const periodText = periodStart && periodEnd ? `${periodStart} - ${periodEnd}` : (periodStart || periodEnd)
            drawInCell(page1, p1Height, periodText, 238, PERIOD_ROW.top, 292, PERIOD_ROW.h, 8.3)
        }

        drawInCell(page1, p1Height, body.inspector_name, 119, 179, 87, 42, 8.2)
        // 「社名」ラベル x=276.6-297.7 の右から開始 → x=299, w=424-299-2=123
        drawInCell(page1, p1Height, body.inspector_company, 299, 179, 123, 21, 8.2)
        // 「TEL」ラベル x=423.7-455.3 の右から開始 → x=457, w=530-457-3=70
        drawInCell(page1, p1Height, body.inspector_tel, 457, 179, 70, 21, 8.2)
        // 「住所」ラベル x=276.6-297.7 の右から開始 → x=299, w=530-299-3=228
        drawInCell(page1, p1Height, body.inspector_address, 299, 200, 228, 21, 8.0)

        // equipment_name はテンプレートに印刷済みのため描画しない
        // ポンプ「製造者名」ラベル x=162-205 の右から: x=206, 列右端x=317, w=317-206-3=108
        drawInCell(page1, p1Height, body.pump_maker, 206, 221, 108, 18, 7.1)
        drawInCell(page1, p1Height, body.pump_model, 206, 239, 108, 18, 7.1)
        // 電動機「製造者名」ラベル x=369-412 の右から: x=413, 列右端x=530, w=530-413-3=114
        drawInCell(page1, p1Height, body.motor_maker, 413, 221, 114, 18, 7.1)
        drawInCell(page1, p1Height, body.motor_model, 413, 239, 114, 18, 7.1)

        drawResultRows(page1, p1Height, body.page1_rows ?? [], P1_ROW_BOUNDS, {
            contentX: 238, contentW: 105,
            judgmentX: 343, judgmentW: 37,
            badX: 380, badW: 75,
            actionX: 455, actionW: 75,
        }, {
            // 貯水槽: 「種別」印刷済み (x=244-265) → x=267から
            0: { x: 267, w: 74 },
            // 水量: 右側に「ｍ³」印刷済み (x=324.1) → x=238, w=84
            1: { x: 238, w: 84 },
            // 電圧計・電流計: 「Ｖ」(x=275.4)・「Ａ」(x=328)印刷済み → Vの前まで
            10: { x: 238, w: 35 },
            // 回転数: 「ｒ／ｍｉｎ」印刷済み (x=285.8) → x=238, w=46
            11: { x: 238, w: 46 },
            // ヒューズ類: 「Ａ」印刷済み (x=327.8) → x=238, w=88
            13: { x: 238, w: 88 },
            // 接地: 「種接地」印刷済み (x=306.8) → x=238, w=67
            17: { x: 238, w: 67 },
        }, new Set([10])) // row 10: V/A split — handled manually below

        // 電圧計・電流計 (row 10): 「Ｖ」(x=275.4) / 「Ａ」(x=328) 自動分割
        const p1Rows3 = body.page1_rows ?? []
        const voltRow3 = p1Rows3[10]
        if (voltRow3) {
            const voltTop = P1_ROW_BOUNDS[10]
            const voltH = P1_ROW_BOUNDS[11] - P1_ROW_BOUNDS[10]
            const voltContent = normalizeText(voltRow3.content)

            if (voltRow3.current_value) {
                drawWrappedInCell(page1, p1Height, voltContent, 238, voltTop, 35, voltH, 6.7)
                drawWrappedInCell(page1, p1Height, voltRow3.current_value, 286, voltTop, 40, voltH, 6.7)
            } else if (voltContent.includes("/")) {
                const slashIdx = voltContent.indexOf("/")
                const voltage = voltContent.slice(0, slashIdx).trim()
                const current = voltContent.slice(slashIdx + 1).trim()
                drawWrappedInCell(page1, p1Height, voltage, 238, voltTop, 35, voltH, 6.7)
                drawWrappedInCell(page1, p1Height, current, 286, voltTop, 40, voltH, 6.7)
            } else if (voltContent) {
                drawWrappedInCell(page1, p1Height, voltContent, 238, voltTop, 35, voltH, 6.7)
            }
        }

        const p2Rows3 = body.page2_rows ?? []
        drawResultRows(page2, p2Height, p2Rows3, P2_ROW_BOUNDS, {
            contentX: 237, contentW: 101,
            judgmentX: 338, judgmentW: 38,
            badX: 376, badW: 77,
            actionX: 453, actionW: 77,
        }, {
            // 設定圧力: 「設定圧力」+「MPa」両方印刷済み → MPaの前(x=300)の間のみ
            4: { x: 286, w: 12 },
            // 設定圧力下段: 右側に「MPa」印刷済み (x=300.2) → x=237, w=61
            5: { x: 237, w: 61 },
            // 作動圧力: 「設定圧力」+「MPa」両方印刷済み → MPaの前の間のみ
            6: { x: 286, w: 12 },
            // 流量+L/min・MPa: 右側に「MPa＋L/min」印刷済み (x=277.8) → x=237, w=38
            20: { x: 237, w: 38 },
            // 放水量: 右側に「Ｌ」印刷済み (x=328.3) → x=237, w=89
            21: { x: 237, w: 89 },
            // 放水圧力1: 右側に「MPa」印刷済み (x=317.6) → x=237, w=79
            31: { x: 237, w: 79 },
            // 放水圧力2: 右側に「MPa」印刷済み (x=307.3) → x=237, w: 68
            32: { x: 237, w: 68 },
        }, new Set([
            4,  // 設定圧力(上段): 超狭セル(14px) → latinFont手動描画
            6,  // 作動圧力: 同上
            7,  // 専用/兼用: テンプレートに選択肢が印刷済み → skip+circle
            20, // 性能（MPa/L/min）: 自動分割のため手動描画
        ]))

        // P2 rows 4, 6: 「設定圧力」/「作動圧力」(x=242-285) と「MPa」(x=300) の間 → latinFont
        for (const ri of [4, 6] as const) {
            const pressRow = p2Rows3[ri]
            if (!pressRow) continue
            const pTop = P2_ROW_BOUNDS[ri]
            const pH = P2_ROW_BOUNDS[ri + 1] - P2_ROW_BOUNDS[ri]
            drawInCellWithFont(page2, p2Height, latinFont, pressRow.content, 285, pTop, 14, pH, 6.5, { paddingX: 0.5 })
        }

        // 性能 (p2 row 20): 「MPa」/ 「L/min」自動分割
        const perfRow3 = p2Rows3[20]
        if (perfRow3) {
            const perfTop = P2_ROW_BOUNDS[20]
            const perfH = P2_ROW_BOUNDS[21] - P2_ROW_BOUNDS[20]
            const perfContent = normalizeText(perfRow3.content)

            const drawMpaVal = (v: string) => drawWrappedInCell(page2, p2Height, v, 237, perfTop, 38, perfH, 6.7)
            const drawFlowVal = (v: string) => drawInCellWithFont(page2, p2Height, latinFont, v, 294, perfTop, 9, perfH, 6.0, { paddingX: 0.5 })

            if (perfRow3.flow_value) {
                if (perfContent) drawMpaVal(perfContent)
                drawFlowVal(perfRow3.flow_value)
            } else if (perfContent.includes("/")) {
                const slashIdx = perfContent.indexOf("/")
                const mpa = perfContent.slice(0, slashIdx).trim()
                const flow = perfContent.slice(slashIdx + 1).trim()
                if (mpa) drawMpaVal(mpa)
                if (flow) drawFlowVal(flow)
            } else if (perfContent) {
                drawMpaVal(perfContent)
            }
        }

        drawSelectionCircle(page2, p2Height, p2Rows3[7]?.content ?? "", [
            { label: "専用", cx: 267.2, cy: 239.4, rx: 14, ry: 7 },
            { label: "兼用", cx: 309.2, cy: 239.4, rx: 14, ry: 7 },
        ])

        drawResultRows(page3, p3Height, body.page3_rows ?? [], P3_ROW_BOUNDS, {
            contentX: 238, contentW: 105,
            judgmentX: 343, judgmentW: 37,
            badX: 380, badW: 75,
            actionX: 455, actionW: 75,
        }, {
            // 放水圧力: 右側に「MPa」印刷済み (x=322.6) → x=238, w=83
            15: { x: 238, w: 83 },
        }, new Set([
            17, // 設定圧力/作動圧力: 複合セル → 手動描画
            25, // ホース/ノズル径: 複合セル → 手動描画
        ]))

        // P3 row 17: 圧力スイッチ「設定圧力 ___ MPa | 作動圧力 ___ MPa」
        // content="0.85/0.82" → 設定圧力=0.85, 作動圧力=0.82
        const p3Rows3 = body.page3_rows ?? []
        const switchRow = p3Rows3[17]
        if (switchRow) {
            const swTop = P3_ROW_BOUNDS[17]
            const swH = P3_ROW_BOUNDS[18] - P3_ROW_BOUNDS[17]
            const swContent = normalizeText(switchRow.content)
            // 値は行の下半分（MPaラベルと同じ高さ y≈403-414）に配置
            const valTop = swTop + swH / 2 - 2
            const valH = swH / 2 + 2
            if (swContent.includes("/")) {
                const parts = swContent.split("/")
                // 設定圧力値: 「設定圧力」(x=244-286)の下、「MPa」(x=273)の左
                drawInCellWithFont(page3, p3Height, latinFont, parts[0]?.trim(), 244, valTop, 28, valH, 6.5, { paddingX: 0.5 })
                // 作動圧力値: 「作動圧力」(x=296-338)の下、「MPa」(x=326)の左
                drawInCellWithFont(page3, p3Height, latinFont, parts[1]?.trim(), 296, valTop, 28, valH, 6.5, { paddingX: 0.5 })
            } else if (swContent) {
                drawInCellWithFont(page3, p3Height, latinFont, swContent, 244, valTop, 28, valH, 6.5, { paddingX: 0.5 })
            }
        }

        // P3 row 25: ホース/ノズル径「ホース ___m× ___本 | ノズル径 ___mm」
        // content="25/2/19" → ホース25m × 2本, ノズル径19mm
        const hoseRow = p3Rows3[25]
        if (hoseRow) {
            const hTop = P3_ROW_BOUNDS[25]
            const hH = P3_ROW_BOUNDS[26] - P3_ROW_BOUNDS[25]
            const hContent = normalizeText(hoseRow.content)
            // 値は行の下半分（m×, 本, mmラベルと同じ高さ）に配置
            const hValTop = hTop + hH / 2 - 2
            const hValH = hH / 2 + 2
            const parts = hContent.split("/")
            if (parts.length >= 3) {
                // ホース長(m): 「m×」(x=265)の左 → x=244, w=20
                drawInCellWithFont(page3, p3Height, latinFont, parts[0]?.trim(), 244, hValTop, 20, hValH, 6.5, { paddingX: 0.5 })
                // 本数: 「本」(x=296)の左 → x=287, w=9
                drawInCellWithFont(page3, p3Height, latinFont, parts[1]?.trim(), 287, hValTop, 9, hValH, 6.0, { paddingX: 0 })
                // ノズル径(mm): 「mm」(x=307)の前... 「本」(x=307)の右から
                // Actually: value before "mm" but after "本" → We need space between them
                // Template shows: ___ 本 ___ mm. So nozzle goes before "mm"
                // "本" ends at x≈307, "mm" starts from x≈307 (adjacent)
                // ノズル径の値は右半分「ノズル径」ヘッダーの下に配置
                drawInCellWithFont(page3, p3Height, latinFont, parts[2]?.trim(), 310, hValTop, 15, hValH, 6.0, { paddingX: 0 })
            } else if (parts.length === 2) {
                drawInCellWithFont(page3, p3Height, latinFont, parts[0]?.trim(), 244, hValTop, 20, hValH, 6.5, { paddingX: 0.5 })
                drawInCellWithFont(page3, p3Height, latinFont, parts[1]?.trim(), 310, hValTop, 15, hValH, 6.0, { paddingX: 0 })
            } else if (hContent) {
                drawInCellWithFont(page3, p3Height, latinFont, hContent, 244, hValTop, 28, hValH, 6.5, { paddingX: 0.5 })
            }
        }

        drawResultRows(page4, p4Height, body.page4_rows ?? [], P4_ROW_BOUNDS, {
            contentX: 242, contentW: 106,
            judgmentX: 348, judgmentW: 36,
            badX: 384, badW: 71,
            actionX: 455, actionW: 75,
        }, {
            // 閉鎖型 電動機の運転電流: 右側に「Ａ」印刷済み (x=332.9) → x=242, w=89
            2: { x: 242, w: 89 },
            // 閉鎖型 放水圧力: 右側に「MPa」印刷済み (x=327.7) → x=242, w=84
            4: { x: 242, w: 84 },
            7: { x: 242, w: 84 },
            9: { x: 242, w: 84 },
            // 開放型 電動機の運転電流: 右側に「Ａ」印刷済み (x=332.9) → x=242, w=89
            13: { x: 242, w: 89 },
        })

        drawResultRows(page5, p5Height, body.page5_rows ?? [], P5_ROW_BOUNDS, {
            contentX: 242, contentW: 106,
            judgmentX: 348, judgmentW: 36,
            badX: 384, badW: 71,
            actionX: 455, actionW: 75,
        }, {
            // 電動機の運転電流: 右側に「Ａ」印刷済み (x=332.9) → x=242, w=89
            2: { x: 242, w: 89 },
            // 放水圧力: 右側に「MPa」印刷済み (x=327.7) → x=242, w=84
            4: { x: 242, w: 84 },
            // 放水量: 右側に「L/min」印刷済み (x=317.2) → x=242, w=73
            5: { x: 242, w: 73 },
            // 高架水槽 放水圧力
            8: { x: 242, w: 84 },
            // 高架水槽 放水量
            9: { x: 242, w: 73 },
        })

        drawWrappedInCell(page5, p5Height, body.notes, 83, 359, 447, 280, 7.4)

        const device1 = body.device1 ?? {}
        const device2 = body.device2 ?? {}
        const devOpts: DrawOptions = { paddingX: 1 }
        drawInCell(page5, p5Height, device1.name, 83, 658, 56, 19, 7.2, devOpts)
        drawInCellWithFont(page5, p5Height, latinFont, device1.model, 139, 658, 55, 19, 7.2, devOpts)
        drawInCell(page5, p5Height, formatJapaneseDateText(device1.calibrated_at), 194, 658, 56, 19, 7.2, devOpts)

        const drawDeviceMaker = (text: unknown, page: PDFPage, pageH: number, cellX: number, cellW: number, cellTop: number, cellH: number) => {
            const norm = normalizeText(text)
            if (!norm) return
            const padX = 1
            const availW = cellW - padX * 2
            let sz = 7.2
            const w = customFont.widthOfTextAtSize(norm, sz)
            if (w > availW) sz = sz * (availW / w) * 0.98
            sz = Math.max(sz, 3.5)
            const drawn = truncateToFitWidth(norm, sz, availW)
            if (!drawn) return
            const th = customFont.heightAtSize(sz, { descender: true })
            const textTop = cellTop + (cellH - th) / 2
            page.drawText(drawn, {
                x: cellX + padX,
                y: pageH - (textTop + th * 0.78),
                size: sz,
                font: customFont,
                color: rgb(0, 0, 0),
            })
        }
        drawDeviceMaker(device1.maker, page5, p5Height, 250, 56, 658, 19)

        drawInCell(page5, p5Height, device2.name, 306, 658, 56, 19, 7.2, devOpts)
        drawInCellWithFont(page5, p5Height, latinFont, device2.model, 362, 658, 56, 19, 7.2, devOpts)
        drawInCell(page5, p5Height, formatJapaneseDateText(device2.calibrated_at), 418, 658, 56, 19, 7.2, devOpts)
        drawDeviceMaker(device2.maker, page5, p5Height, 474, 56, 658, 19)

        const pdfBytes = await pdfDoc.save()
        return new NextResponse(pdfBytes as unknown as BodyInit, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": 'attachment; filename="s50_kokuji14_bekki3_filled.pdf"',
            },
        })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 })
    }
}
