import { NextRequest, NextResponse } from "next/server"
import { PDFDocument, rgb, type PDFPage } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"
import fs from "fs"
import path from "path"
import { drawWrappedTextInCell, formatJapaneseDateText } from "@/lib/pdf-form-helpers"

type BekkiRow = {
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

type Bekki9Payload = {
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
    extra_fields?: Record<string, string>
    page1_rows?: BekkiRow[]
    page2_rows?: BekkiRow[]
    page3_rows?: BekkiRow[]
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
    333.33, 354.0, 374.67, 395.33, 415.33, 436.0, 456.67, 476.67, 497.33,
    518.0, 538.67, 558.67, 579.33, 600.0, 620.67, 641.33, 661.33, 682.0, 702.67,
]

const P2_ROW_BOUNDS = [
    82.67, 100.0, 116.67, 134.0, 150.67, 168.0, 184.67, 202.0, 218.67, 236.0,
    252.67, 270.0, 286.67, 304.0, 320.67, 338.0, 354.67, 372.0, 388.67, 406.0,
    422.67, 440.0, 456.67, 474.0, 490.67, 508.0, 524.67, 542.0, 558.67, 576.0,
    592.67, 610.0, 626.67, 644.0, 660.67, 678.0, 694.67,
]

const P3_ROW_BOUNDS = [
    82.67, 103.33, 124.0, 144.0, 171.33, 192.0, 212.67, 232.67, 253.33, 274.0,
    294.67, 314.67, 335.33, 356.0, 376.67, 396.67, 417.33, 438.0, 458.67, 478.67,
    499.33, 520.0, 540.67,
]

const PERIOD_ROW = { top: 161.33, h: 21.34 }
const PERIOD_START_ANCHORS = { year: 302.5, month: 340.5, day: 378.5 }
const PERIOD_END_ANCHORS = { year: 427.3, month: 465.7, day: 503.6 }

const normalizeText = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim()
const getExtra = (body: Bekki9Payload, key: string) => normalizeText(body.extra_fields?.[key])

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
        const body = (await req.json()) as Bekki9Payload

        const candidatePdfPaths = [
            path.join(process.cwd(), "public", "PDF", "s50_kokuji14_bekki9.pdf"),
            path.join(process.cwd(), "public", "s50_kokuji14_bekki9.pdf"),
        ]
        const pdfPath = candidatePdfPaths.find((p) => fs.existsSync(p))
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf")
        if (!pdfPath) throw new Error("Template PDF not found: s50_kokuji14_bekki9.pdf")

        const existingPdfBytes = fs.readFileSync(pdfPath)
        const fontBytes = fs.readFileSync(fontPath)
        const pdfDoc = await PDFDocument.load(existingPdfBytes)
        pdfDoc.registerFontkit(fontkit)
        const customFont = await pdfDoc.embedFont(fontBytes)

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

            const paddingX = options?.paddingX ?? 2.5
            const paddingY = options?.paddingY ?? 1.8
            const minFontSize = options?.minFontSize ?? 3.5
            let currentSize = Math.min(fontSize, options?.maxFontSize ?? fontSize)

            const maxWidth = Math.max(1, (cellW - paddingX * 2) * 0.85)
            const maxHeight = Math.max(1, cellH - paddingY * 2)

            const widthAtCurrent = customFont.widthOfTextAtSize(normalized, currentSize)
            if (widthAtCurrent > maxWidth) currentSize *= maxWidth / widthAtCurrent

            const heightAtCurrent = customFont.heightAtSize(currentSize, { descender: true })
            if (heightAtCurrent > maxHeight) currentSize *= maxHeight / heightAtCurrent

            currentSize = Math.max(currentSize, minFontSize)

            const textToDraw = truncateToFitWidth(normalized, currentSize, maxWidth)
            if (!textToDraw) return

            const textWidth = customFont.widthOfTextAtSize(textToDraw, currentSize)
            const textHeight = customFont.heightAtSize(currentSize, { descender: true })
            let textX = cellX + paddingX
            if (options?.align === "center") textX = cellX + (cellW - textWidth) / 2
            const textTop = cellTopFromTop + (cellH - textHeight) / 2
            const baselineOffset = textHeight * 0.78

            page.drawText(textToDraw, {
                x: textX,
                y: pageHeight - (textTop + baselineOffset),
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
            fontSize = 7.0,
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
                paddingX: 2.0,
                paddingY: 1.0,
                minFontSize: 4.5,
                lineGap: 0.7,
            },
        })

        const drawResultRows = (
            page: PDFPage,
            pageHeight: number,
            rows: BekkiRow[],
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
                drawWrappedInCell(page, pageHeight, row.content, cx, top, cw, h, 6.5)
                drawInCell(page, pageHeight, row.judgment, columns.judgmentX, top, columns.judgmentW, h, 8.0, { align: "center" })
                drawWrappedInCell(page, pageHeight, row.bad_content, columns.badX, top, columns.badW, h, 6.2)
                drawWrappedInCell(page, pageHeight, row.action_content, columns.actionX, top, columns.actionW, h, 6.2)
            }
        }

        const drawRightAt = (
            page: PDFPage,
            pageHeight: number,
            text: string,
            anchorX: number,
            rowTop: number,
            rowH: number,
            size = 7.7,
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
            drawRightAt(page1, p1Height, parts.year, anchors.year, PERIOD_ROW.top, PERIOD_ROW.h, 7.7)
            drawRightAt(page1, p1Height, parts.month, anchors.month, PERIOD_ROW.top, PERIOD_ROW.h, 7.7)
            drawRightAt(page1, p1Height, parts.day, anchors.day, PERIOD_ROW.top, PERIOD_ROW.h, 7.7)
        }

        drawInCell(page1, p1Height, body.form_name, 112.0, 108.67, 237.33, 26.66, 8.7)
        drawInCell(page1, p1Height, body.fire_manager, 439.33, 108.67, 90.0, 26.66, 8.0)
        drawInCell(page1, p1Height, body.location, 112.0, 135.33, 237.33, 26.0, 8.2)
        drawInCell(page1, p1Height, body.witness, 439.33, 135.33, 90.0, 26.0, 8.0)
        drawInCell(page1, p1Height, body.inspection_type || "機器・総合", 112.0, 161.33, 96.0, 21.34, 7.7, { align: "center" })

        const periodText = (() => {
            const start = formatDateText(body.period_start)
            const end = formatDateText(body.period_end)
            return start && end ? `${start} - ${end}` : (start || end)
        })()
        if (parseDateParts(body.period_start) || parseDateParts(body.period_end)) {
            drawPeriodDate(body.period_start, PERIOD_START_ANCHORS)
            drawPeriodDate(body.period_end, PERIOD_END_ANCHORS)
        } else {
            drawInCell(page1, p1Height, periodText, 208.0, PERIOD_ROW.top, 321.33, PERIOD_ROW.h, 7.7)
        }

        drawInCell(page1, p1Height, body.inspector_name, 112.0, 182.67, 96.0, 52.0, 7.7)
        drawInCell(page1, p1Height, body.inspector_company, 307.33, 182.67, 132.0, 26.0, 7.4)
        drawInCell(page1, p1Height, body.inspector_tel, 439.33, 182.67, 90.0, 26.0, 7.4)
        drawInCell(page1, p1Height, body.inspector_address, 307.33, 208.67, 222.0, 26.0, 7.3)

        // The left cells here are fixed labels (ポンチE/ 電動橁E, so avoid overwriting them.
        drawInCell(page1, p1Height, getExtra(body, "pump_maker"), 164, 207, 74, 21, 7.2)
        drawInCell(page1, p1Height, getExtra(body, "pump_model"), 164, 228, 74, 21, 7.2)
        drawInCell(page1, p1Height, getExtra(body, "motor_maker"), 359, 207, 96, 21, 7.2)
        drawInCell(page1, p1Height, getExtra(body, "motor_model"), 359, 228, 96, 21, 7.2)

        const p1Rows9 = body.page1_rows ?? []
        drawResultRows(page1, p1Height, p1Rows9, P1_ROW_BOUNDS, {
            contentX: 208.0,
            contentW: 99.33,
            judgmentX: 307.33,
            judgmentW: 42.0,
            badX: 349.33,
            badW: 90.0,
            actionX: 439.33,
            actionW: 90.0,
        }, {
            // 電圧計・電流計: 「Ｖ」(x=250.2-260.8)・「Ａ」(x=292.3-302.9)印刷済み → V前まで
            10: { x: 208.0, w: 40 },
        })

        // 電圧計・電流計 (row 10): 「Ｖ」と「Ａ」の間に電流値を描画
        const voltRow9 = p1Rows9[10]
        if (voltRow9?.current_value) {
            const voltTop = P1_ROW_BOUNDS[10]
            const voltH = P1_ROW_BOUNDS[11] - P1_ROW_BOUNDS[10]
            drawInCell(page1, p1Height, voltRow9.current_value, 262, voltTop, 28, voltH, 6.5)
        }

        drawResultRows(page2, p2Height, body.page2_rows ?? [], P2_ROW_BOUNDS, {
            contentX: 208.0,
            contentW: 99.33,
            judgmentX: 307.33,
            judgmentW: 42.0,
            badX: 349.33,
            badW: 90.0,
            actionX: 439.33,
            actionW: 90.0,
        })

        drawResultRows(page3, p3Height, body.page3_rows ?? [], P3_ROW_BOUNDS, {
            contentX: 216.67,
            contentW: 94.66,
            judgmentX: 311.33,
            judgmentW: 42.0,
            badX: 353.33,
            badW: 89.34,
            actionX: 442.67,
            actionW: 86.66,
        })

        drawWrappedInCell(page3, p3Height, body.notes, 82.67, 540.67, 446.66, 88.66, 7.2)

        const device1 = body.device1 ?? {}
        const device2 = body.device2 ?? {}
        drawInCell(page3, p3Height, device1.name, 83, 649, 55, 14, 7.0)
        drawInCell(page3, p3Height, device1.model, 138, 649, 56, 14, 7.0)
        drawInCell(page3, p3Height, formatJapaneseDateText(device1.calibrated_at), 194, 649, 56, 14, 7.0)
        drawInCell(page3, p3Height, device1.maker, 250, 649, 56, 14, 7.0)
        drawInCell(page3, p3Height, device2.name, 306, 649, 56, 14, 7.0)
        drawInCell(page3, p3Height, device2.model, 362, 649, 56, 14, 7.0)
        drawInCell(page3, p3Height, formatJapaneseDateText(device2.calibrated_at), 418, 649, 56, 14, 7.0)
        drawInCell(page3, p3Height, device2.maker, 474, 649, 55, 14, 7.0)

        const pdfBytes = await pdfDoc.save()
        return new NextResponse(pdfBytes as unknown as BodyInit, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": 'attachment; filename="s50_kokuji14_bekki9_filled.pdf"',
            },
        })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 })
    }
}
