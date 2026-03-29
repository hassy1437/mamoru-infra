import { NextRequest, NextResponse } from "next/server"
import { PDFDocument, rgb, PDFPage } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"
import fs from "fs"
import path from "path"
import { drawWrappedTextInCell, formatJapaneseDateText } from "@/lib/pdf-form-helpers"

type Bekki5Row = {
    content?: string
    judgment?: string
    bad_content?: string
    action_content?: string
    current_value?: string  // 電圧計・電流計行の電流値（A）
}

type DeviceRow = {
    name?: string
    model?: string
    calibrated_at?: string
    maker?: string
}

type Bekki5Payload = {
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
    foam_maker?: string
    foam_model?: string
    page1_rows?: Bekki5Row[]
    page2_rows?: Bekki5Row[]
    page3_rows?: Bekki5Row[]
    page4_rows?: Bekki5Row[]
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
    317, 337, 357, 377, 397, 417, 437, 457, 477, 497,
    517, 537, 557, 577, 597, 617, 637, 657, 677, 697,
]

const P2_ROW_BOUNDS = [
    83, 100, 117, 134, 151, 177, 203, 220, 237, 263,
    280, 297, 314, 331, 348, 365, 382, 399, 416, 433,
    450, 467, 484, 501, 518, 535, 552, 569, 586, 603,
    620, 637, 654, 671, 688,
]

const P3_ROW_BOUNDS = [
    83, 105, 127, 149, 171, 193, 215, 237, 259, 281,
    303, 325, 347, 379, 401, 423, 445, 467, 495, 517,
    539, 561, 589, 611, 633, 655, 677, 699,
]

const P4_ROW_BOUNDS = [
    83, 104, 125, 146, 167, 188, 209, 230, 251, 272,
    293, 314, 335, 356, 377, 398, 419, 440, 461, 482,
    503, 524, 545, 566,
]

const PERIOD_ROW = { top: 161, h: 20 }
const PERIOD_START_ANCHORS = { year: 320.0, month: 357.0, day: 394.0 }
const PERIOD_END_ANCHORS = { year: 441.0, month: 477.5, day: 515.0 }

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
        const body = (await req.json()) as Bekki5Payload

        const candidatePdfPaths = [
            path.join(process.cwd(), "public", "PDF", "s50_kokuji14_bekki5.pdf"),
            path.join(process.cwd(), "public", "s50_kokuji14_bekki5.pdf"),
        ]
        const pdfPath = candidatePdfPaths.find((p) => fs.existsSync(p))
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf")

        if (!pdfPath) {
            throw new Error("Template PDF not found: s50_kokuji14_bekki5.pdf")
        }

        const existingPdfBytes = fs.readFileSync(pdfPath)
        const fontBytes = fs.readFileSync(fontPath)

        const pdfDoc = await PDFDocument.load(existingPdfBytes)
        pdfDoc.registerFontkit(fontkit)
        const customFont = await pdfDoc.embedFont(fontBytes)

        const [page1, page2, page3, page4] = pdfDoc.getPages()
        const p1Height = page1.getSize().height
        const p2Height = page2.getSize().height
        const p3Height = page3.getSize().height
        const p4Height = page4.getSize().height

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
            rows: Bekki5Row[],
            rowBounds: number[],
            columns: ResultColumns,
            contentOverrides: Record<number, { x: number; w: number }> = {},
        ) => {
            for (let i = 0; i < rowBounds.length - 1; i += 1) {
                const row = rows[i]
                if (!row) continue
                const top = rowBounds[i]
                const h = rowBounds[i + 1] - rowBounds[i]
                const ov = contentOverrides[i]
                const cx = ov?.x ?? columns.contentX
                const cw = ov?.w ?? columns.contentW

                drawWrappedInCell(page, pageHeight, row.content, cx, top, cw, h, 6.7)
                drawInCell(page, pageHeight, row.judgment, columns.judgmentX, top, columns.judgmentW, h, 8.4, { align: "center" })
                drawWrappedInCell(page, pageHeight, row.bad_content, columns.badX, top, columns.badW, h, 6.7)
                drawWrappedInCell(page, pageHeight, row.action_content, columns.actionX, top, columns.actionW, h, 6.7)
            }
        }

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
            drawRightAt(page1, p1Height, parts.year, anchors.year, PERIOD_ROW.top, PERIOD_ROW.h, 8.1)
            drawRightAt(page1, p1Height, parts.month, anchors.month, PERIOD_ROW.top, PERIOD_ROW.h, 8.1)
            drawRightAt(page1, p1Height, parts.day, anchors.day, PERIOD_ROW.top, PERIOD_ROW.h, 8.1)
        }

        drawInCell(page1, p1Height, body.form_name, 113, 109, 262, 26, 9)
        drawInCell(page1, p1Height, body.fire_manager, 421, 109, 109, 26, 8.6)
        drawInCell(page1, p1Height, body.location, 113, 135, 262, 26, 8.8)
        drawInCell(page1, p1Height, body.witness, 421, 135, 109, 26, 8.6)

        drawInCell(page1, p1Height, body.inspection_type || "機器・総合", 112, 161, 109, 20, 8.3, { align: "center" })
        const periodStart = formatDateText(body.period_start)
        const periodEnd = formatDateText(body.period_end)
        if (parseDateParts(body.period_start) || parseDateParts(body.period_end)) {
            drawPeriodDate(body.period_start, PERIOD_START_ANCHORS)
            drawPeriodDate(body.period_end, PERIOD_END_ANCHORS)
        } else {
            const periodText = periodStart && periodEnd ? `${periodStart} - ${periodEnd}` : (periodStart || periodEnd)
            drawInCell(page1, p1Height, periodText, 222, PERIOD_ROW.top, 308, PERIOD_ROW.h, 8.3)
        }

        drawInCell(page1, p1Height, body.inspector_name, 112, 181, 109, 56, 8.2)
        drawInCell(page1, p1Height, body.inspector_company, 312, 181, 105, 28, 8.2)
        drawInCell(page1, p1Height, body.inspector_tel, 433, 181, 95, 28, 8.2)
        drawInCell(page1, p1Height, body.inspector_address, 312, 209, 216, 28, 8.0)

        drawInCell(page1, p1Height, body.equipment_name, 112, 237, 45, 40, 7.2)
        drawInCell(page1, p1Height, body.pump_maker, 206, 237, 87, 20, 7.1)
        drawInCell(page1, p1Height, body.pump_model, 206, 257, 87, 20, 7.1)
        drawInCell(page1, p1Height, body.motor_maker, 343, 237, 34, 20, 7.1)
        drawInCell(page1, p1Height, body.motor_model, 343, 257, 34, 20, 7.1)
        drawInCell(page1, p1Height, body.foam_maker, 495, 237, 33, 20, 7.1)
        drawInCell(page1, p1Height, body.foam_model, 495, 257, 33, 20, 7.1)

        const p1Rows5 = body.page1_rows ?? []
        drawResultRows(page1, p1Height, p1Rows5, P1_ROW_BOUNDS, {
            contentX: 222, contentW: 95,
            judgmentX: 317, judgmentW: 45,
            badX: 362, badW: 88,
            actionX: 450, actionW: 80,
        }, {
            // 電圧計・電流計: 「Ｖ」(x=248.8)・「Ａ」(x=301.3)印刷済み → V前に電圧値
            11: { x: 222, w: 25 },
        })

        // 電圧計・電流計 (row 11): 「Ｖ」と「Ａ」の間に電流値を描画
        const voltRow5 = p1Rows5[11]
        if (voltRow5?.current_value) {
            const voltTop = P1_ROW_BOUNDS[11]
            const voltH = P1_ROW_BOUNDS[12] - P1_ROW_BOUNDS[11]
            drawInCell(page1, p1Height, voltRow5.current_value, 261, voltTop, 38, voltH, 6.8)
        }

        drawResultRows(page2, p2Height, body.page2_rows ?? [], P2_ROW_BOUNDS, {
            contentX: 214, contentW: 99,
            judgmentX: 313, judgmentW: 46,
            badX: 359, badW: 86,
            actionX: 445, actionW: 84,
        })

        drawResultRows(page3, p3Height, body.page3_rows ?? [], P3_ROW_BOUNDS, {
            contentX: 214, contentW: 99,
            judgmentX: 313, judgmentW: 46,
            badX: 359, badW: 86,
            actionX: 445, actionW: 84,
        })

        drawResultRows(page4, p4Height, body.page4_rows ?? [], P4_ROW_BOUNDS, {
            contentX: 235, contentW: 79,
            judgmentX: 314, judgmentW: 45,
            badX: 359, badW: 86,
            actionX: 445, actionW: 85,
        })

        drawWrappedInCell(page4, p4Height, body.notes, 85, 566, 444, 63, 7.3)

        const device1 = body.device1 ?? {}
        const device2 = body.device2 ?? {}
        drawInCell(page4, p4Height, device1.name, 85, 650, 56, 21, 7.2)
        drawInCell(page4, p4Height, device1.model, 141, 650, 55, 21, 7.2)
        drawInCell(page4, p4Height, formatJapaneseDateText(device1.calibrated_at), 196, 650, 56, 21, 7.2)
        drawInCell(page4, p4Height, device1.maker, 252, 650, 55, 21, 7.2)

        drawInCell(page4, p4Height, device2.name, 313, 650, 50, 21, 7.2)
        drawInCell(page4, p4Height, device2.model, 363, 650, 55, 21, 7.2)
        drawInCell(page4, p4Height, formatJapaneseDateText(device2.calibrated_at), 418, 650, 56, 21, 7.2)
        drawInCell(page4, p4Height, device2.maker, 474, 650, 55, 21, 7.2)

        const pdfBytes = await pdfDoc.save()
        return new NextResponse(pdfBytes as unknown as BodyInit, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": 'attachment; filename="s50_kokuji14_bekki5_filled.pdf"',
            },
        })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 })
    }
}
