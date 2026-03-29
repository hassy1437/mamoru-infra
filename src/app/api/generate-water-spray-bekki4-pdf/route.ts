import { NextRequest, NextResponse } from "next/server"
import { PDFDocument, rgb, PDFPage, StandardFonts } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"
import fs from "fs"
import path from "path"
import { drawWrappedTextInCell, formatJapaneseDateText } from "@/lib/pdf-form-helpers"

type Bekki4Row = {
    content?: string
    judgment?: string
    bad_content?: string
    action_content?: string
    current_value?: string  // 電圧計・電流計行の電流値（A）
    flow_value?: string     // 性能行のL/min値
}

type DeviceRow = {
    name?: string
    model?: string
    calibrated_at?: string
    maker?: string
}

type Bekki4Payload = {
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
    page1_rows?: Bekki4Row[]
    page2_rows?: Bekki4Row[]
    page3_rows?: Bekki4Row[]
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
    318, 339, 360, 381, 402, 423, 444, 465, 486, 507,
    528, 549, 570, 591, 612, 633, 654, 675, 696,
]

const P2_ROW_BOUNDS = [
    83, 100, 117, 134, 151, 175, 199, 216, 233, 257,
    274, 291, 308, 325, 342, 359, 376, 393, 410, 427,
    444, 461, 478, 495, 512, 529, 546, 563, 580, 597,
    614, 631, 648, 665, 682, 699,
]

const P3_ROW_BOUNDS = [
    83, 101, 119, 137, 155, 173, 201, 219, 237, 255,
    273, 291, 309, 327, 345, 363, 381, 399, 417, 435,
    453, 471, 489, 507, 525,
]

const PERIOD_ROW = { top: 159, h: 18 }
const PERIOD_START_ANCHORS = { year: 323.2, month: 355.0, day: 387.2 }
const PERIOD_END_ANCHORS = { year: 450.8, month: 482.5, day: 514.5 }

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
        const body = (await req.json()) as Bekki4Payload

        const candidatePdfPaths = [
            path.join(process.cwd(), "public", "PDF", "s50_kokuji14_bekki4.pdf"),
            path.join(process.cwd(), "public", "s50_kokuji14_bekki4.pdf"),
        ]
        const pdfPath = candidatePdfPaths.find((p) => fs.existsSync(p))
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf")

        if (!pdfPath) {
            throw new Error("Template PDF not found: s50_kokuji14_bekki4.pdf")
        }

        const existingPdfBytes = fs.readFileSync(pdfPath)
        const fontBytes = fs.readFileSync(fontPath)

        const pdfDoc = await PDFDocument.load(existingPdfBytes)
        pdfDoc.registerFontkit(fontkit)
        const customFont = await pdfDoc.embedFont(fontBytes)
        const latinFont = await pdfDoc.embedFont(StandardFonts.Helvetica)

        const [page1, page2, page3] = pdfDoc.getPages()
        const p1Height = page1.getSize().height
        const p2Height = page2.getSize().height
        const p3Height = page3.getSize().height

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
            rows: Bekki4Row[],
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

        drawInCell(page1, p1Height, body.form_name, 118, 113, 225, 23, 9)
        drawInCell(page1, p1Height, body.fire_manager, 406, 113, 123, 23, 8.6)
        drawInCell(page1, p1Height, body.location, 118, 136, 225, 23, 8.8)
        drawInCell(page1, p1Height, body.witness, 406, 136, 123, 23, 8.6)

        // 点検種別はテンプレートに「機器・総合」が印刷済みのため描画しない
        const periodStart = formatDateText(body.period_start)
        const periodEnd = formatDateText(body.period_end)
        if (parseDateParts(body.period_start) || parseDateParts(body.period_end)) {
            drawPeriodDate(body.period_start, PERIOD_START_ANCHORS)
            drawPeriodDate(body.period_end, PERIOD_END_ANCHORS)
        } else {
            const periodText = periodStart && periodEnd ? `${periodStart} - ${periodEnd}` : (periodStart || periodEnd)
            drawInCell(page1, p1Height, periodText, 238, PERIOD_ROW.top, 291, PERIOD_ROW.h, 8.3)
        }

        drawInCell(page1, p1Height, body.inspector_name, 118, 177, 88, 42, 8.2)
        // 「社名」ラベル x=280.3-301.4 の右から: x=302, w=424-302-2=120 (TELラベル開始前まで)
        drawInCell(page1, p1Height, body.inspector_company, 302, 177, 120, 21, 8.2)
        // 「TEL」ラベル x=424-455(推定) の右から: x=456, w=530-456-3=71
        drawInCell(page1, p1Height, body.inspector_tel, 456, 177, 71, 21, 8.2)
        // 「住所」ラベル x=280.3-301.4 の右から: x=302, w=530-302-3=225
        drawInCell(page1, p1Height, body.inspector_address, 302, 198, 225, 21, 8.0)

        // equipment_name はテンプレートに印刷済みのため描画しない
        // ポンプ「製造者名」ラベル x=164.8-206.9 の右から: x=207, 列右端x=312, w=102
        drawInCell(page1, p1Height, body.pump_maker, 207, 219, 102, 18, 7.1)
        drawInCell(page1, p1Height, body.pump_model, 207, 237, 102, 18, 7.1)
        // 電動機「製造者名」ラベル x=364.3-406.4 の右から: x=407, 列右端x=530, w=120
        drawInCell(page1, p1Height, body.motor_maker, 407, 219, 120, 18, 7.1)
        drawInCell(page1, p1Height, body.motor_model, 407, 237, 120, 18, 7.1)

        drawResultRows(page1, p1Height, body.page1_rows ?? [], P1_ROW_BOUNDS, {
            contentX: 238, contentW: 105,
            judgmentX: 343, judgmentW: 37,
            badX: 380, badW: 75,
            actionX: 455, actionW: 74,
        }, {
            // 貯水槽: 「種別」印刷済み (x=244-265) → x=267から
            0: { x: 267, w: 74 },
            // 水量: 右側に「ｍ³」印刷済み (x=324.5) → x=238, w=84
            1: { x: 238, w: 84 },
            // 電圧計・電流計: 「Ｖ」(x=275.8)・「Ａ」(x=328.3)印刷済み → Vの前まで
            10: { x: 238, w: 36 },
            // ヒューズ類: 「Ａ」印刷済み (x=328.2) → x=238, w=88
            12: { x: 238, w: 88 },
        }, new Set([10])) // row 10: V/A split — handled manually below

        // 電圧計・電流計 (row 10): 「Ｖ」(x=275.8) / 「Ａ」(x=328.3) 自動分割
        const p1Rows4 = body.page1_rows ?? []
        const voltRow4 = p1Rows4[10]
        if (voltRow4) {
            const voltTop = P1_ROW_BOUNDS[10]
            const voltH = P1_ROW_BOUNDS[11] - P1_ROW_BOUNDS[10]
            const voltContent = normalizeText(voltRow4.content)

            if (voltRow4.current_value) {
                drawWrappedInCell(page1, p1Height, voltContent, 238, voltTop, 36, voltH, 6.7)
                drawWrappedInCell(page1, p1Height, voltRow4.current_value, 286, voltTop, 40, voltH, 6.7)
            } else if (voltContent.includes("/")) {
                const slashIdx = voltContent.indexOf("/")
                const voltage = voltContent.slice(0, slashIdx).trim()
                const current = voltContent.slice(slashIdx + 1).trim()
                drawWrappedInCell(page1, p1Height, voltage, 238, voltTop, 36, voltH, 6.7)
                drawWrappedInCell(page1, p1Height, current, 286, voltTop, 40, voltH, 6.7)
            } else if (voltContent) {
                drawWrappedInCell(page1, p1Height, voltContent, 238, voltTop, 36, voltH, 6.7)
            }
        }

        const p2Rows4 = body.page2_rows ?? []
        drawResultRows(page2, p2Height, p2Rows4, P2_ROW_BOUNDS, {
            contentX: 234, contentW: 105,
            judgmentX: 339, judgmentW: 37,
            badX: 376, badW: 77,
            actionX: 453, actionW: 76,
        }, {
            // 設定圧力: 「設定圧力」+「MPa」両方印刷済み → MPaの前の間のみ
            4: { x: 283, w: 13 },
            // 設定圧力下段: 右側に「MPa」印刷済み (x=318.8) → x=234, w=83
            5: { x: 234, w: 83 },
            // 作動圧力: 「設定圧力」+「MPa」両方印刷済み → MPaの前の間のみ
            6: { x: 283, w: 13 },
            // 流量+L/min・MPa: 右側に「MPa＋L/min」印刷済み (x=271.6) → x=234, w=36
            19: { x: 234, w: 36 },
            // 放水量: 右側に「Ｌ」印刷済み (x=329.3) → x=234, w=93
            20: { x: 234, w: 93 },
            // 放水圧力1: 右側に「MPa」印刷済み (x=318.8) → x=234, w=83
            26: { x: 234, w: 83 },
            // 放水圧力2: 右側に「MPa」印刷済み (x=318.8) → x=234, w=83
            27: { x: 234, w: 83 },
        }, new Set([
            // 設定圧力(上段): w=13の超狭セル → latinFont手動描画
            4,
            // 作動圧力: w=13の超狭セル → latinFont手動描画
            6,
            // 専用/兼用: テンプレートに選択肢が印刷済み → skip+circle
            7,
            // 性能（MPa/L/min）: 自動分割のため手動描画
            19,
        ]))

        // P2 rows 4, 6: 設定圧力・作動圧力 (w=13 超狭セル → latinFont)
        for (const ri of [4, 6] as const) {
            const pressRow = p2Rows4[ri]
            if (!pressRow) continue
            const pTop = P2_ROW_BOUNDS[ri]
            const pH = P2_ROW_BOUNDS[ri + 1] - P2_ROW_BOUNDS[ri]
            drawInCellWithFont(page2, p2Height, latinFont, pressRow.content, 283, pTop, 14, pH, 6.5, { paddingX: 0.5 })
        }

        // 性能 (p2 row 19): 「MPa」/ 「L/min」自動分割
        const perfRow4 = p2Rows4[19]
        if (perfRow4) {
            const perfTop = P2_ROW_BOUNDS[19]
            const perfH = P2_ROW_BOUNDS[20] - P2_ROW_BOUNDS[19]
            const perfContent = normalizeText(perfRow4.content)

            const drawMpaVal = (v: string) => drawWrappedInCell(page2, p2Height, v, 234, perfTop, 36, perfH, 6.7)
            const drawFlowVal = (v: string) => drawInCellWithFont(page2, p2Height, latinFont, v, 292, perfTop, 15, perfH, 6.5, { paddingX: 1 })

            if (perfRow4.flow_value) {
                if (perfContent) drawMpaVal(perfContent)
                drawFlowVal(perfRow4.flow_value)
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

        drawSelectionCircle(page2, p2Height, p2Rows4[7]?.content ?? "", [
            { label: "専用", cx: 266.4, cy: 224.05, rx: 13, ry: 7 },
            { label: "兼用", cx: 308.5, cy: 224.05, rx: 13, ry: 7 },
        ])

        drawResultRows(page3, p3Height, body.page3_rows ?? [], P3_ROW_BOUNDS, {
            contentX: 238, contentW: 105,
            judgmentX: 343, judgmentW: 36,
            badX: 379, badW: 75,
            actionX: 454, actionW: 75,
        }, {
            // 放水圧力: 右側に「MPa」印刷済み (x=322.3) → x=238, w=82
            3: { x: 238, w: 82 },
            // 電流: 右側に「Ａ」印刷済み (x=327.5) → x=238, w=88
            15: { x: 238, w: 88 },
        }, new Set([
            // 設定圧力/作動圧力: 複合4項目が印刷済み → skip + 手動描画
            5,
            // 総合点検セクションヘッダー: 印刷済み → skip
            12,
        ]))

        // P3 row 5: 設定圧力/作動圧力 複合セル (設定圧力 x=244 + 作動圧力 x=296)
        const p3Rows4 = body.page3_rows ?? []
        const switchRow4 = p3Rows4[5]
        if (switchRow4) {
            const swTop = P3_ROW_BOUNDS[5]
            const swH = P3_ROW_BOUNDS[6] - P3_ROW_BOUNDS[5]
            const swContent = normalizeText(switchRow4.content)
            // Values go in the bottom half of the compound row
            const valTop = swTop + swH / 2 - 2
            const valH = swH / 2 + 2
            if (swContent.includes("/")) {
                const parts = swContent.split("/")
                drawInCellWithFont(page3, p3Height, latinFont, parts[0]?.trim(), 244, valTop, 28, valH, 6.5, { paddingX: 0.5 })
                drawInCellWithFont(page3, p3Height, latinFont, parts[1]?.trim(), 296, valTop, 28, valH, 6.5, { paddingX: 0.5 })
            } else if (swContent) {
                drawInCellWithFont(page3, p3Height, latinFont, swContent, 244, valTop, 28, valH, 6.5, { paddingX: 0.5 })
            }
        }

        drawWrappedInCell(page3, p3Height, body.notes, 82, 525, 447, 115, 7.3)

        const device1 = body.device1 ?? {}
        const device2 = body.device2 ?? {}
        const devOpts: DrawOptions = { paddingX: 1 }
        drawInCell(page3, p3Height, device1.name, 82, 658, 56, 18, 7.2, devOpts)
        drawInCellWithFont(page3, p3Height, latinFont, device1.model, 138, 658, 56, 18, 7.2, devOpts)
        drawInCell(page3, p3Height, formatJapaneseDateText(device1.calibrated_at), 194, 658, 56, 18, 7.2, devOpts)

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
        drawDeviceMaker(device1.maker, page3, p3Height, 250, 56, 658, 18)

        drawInCell(page3, p3Height, device2.name, 306, 658, 56, 18, 7.2, devOpts)
        drawInCellWithFont(page3, p3Height, latinFont, device2.model, 362, 658, 56, 18, 7.2, devOpts)
        drawInCell(page3, p3Height, formatJapaneseDateText(device2.calibrated_at), 418, 658, 56, 18, 7.2, devOpts)
        drawDeviceMaker(device2.maker, page3, p3Height, 474, 55, 658, 18)

        const pdfBytes = await pdfDoc.save()
        return new NextResponse(pdfBytes as unknown as BodyInit, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": 'attachment; filename="s50_kokuji14_bekki4_filled.pdf"',
            },
        })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 })
    }
}
