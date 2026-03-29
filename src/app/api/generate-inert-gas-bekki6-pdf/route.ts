import { NextRequest, NextResponse } from "next/server"
import { PDFDocument, rgb, PDFPage } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"
import fs from "fs"
import path from "path"
import { drawWrappedTextInCell, formatJapaneseDateText } from "@/lib/pdf-form-helpers"

type Bekki6Row = {
    content?: string
    judgment?: string
    bad_content?: string
    action_content?: string
}

type DeviceRow = {
    name?: string
    model?: string
    calibrated_at?: string
    maker?: string
}

type CylinderRow = {
    no?: string
    cylinder_no?: string
    spec1?: string
    spec2?: string
    spec3?: string
    measure1?: string
    measure2?: string
    measure3?: string
    measure4?: string
}

type Bekki6Payload = {
    zone_name?: string
    equipment_system?: string
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
    page1_rows?: Bekki6Row[]
    page2_rows?: Bekki6Row[]
    page3_rows?: Bekki6Row[]
    page4_rows?: Bekki6Row[]
    notes?: string
    device1?: DeviceRow
    device2?: DeviceRow
    page5_rows?: CylinderRow[]
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
    269.33, 284.67, 299.33, 313.33, 327.33, 340.67, 354.0, 366.67, 380.0,
    392.67, 406.0, 418.67, 432.0, 444.67, 458.0, 471.33, 484.0, 497.33,
    510.0, 523.33, 536.67, 549.33, 562.67, 575.33, 588.67, 602.0, 614.67,
    627.33, 640.67, 654.0, 666.67, 680.0, 693.33,
]

const P2_ROW_BOUNDS = [
    78.67, 94.0, 108.67, 123.33, 138.0, 152.67, 167.33, 182.0, 196.67,
    211.33, 226.0, 240.67, 255.33, 270.0, 285.33, 300.0, 314.67, 329.33,
    344.0, 358.67, 373.33, 388.0, 402.67, 417.33, 432.0, 446.67, 461.33,
    476.0, 490.67, 505.33, 520.0, 534.67, 549.33, 564.0, 579.33, 594.0,
    608.67, 623.33, 638.0, 652.67, 667.33,
]

const P3_ROW_BOUNDS = [
    79.33, 96.67, 114.0, 132.0, 149.33, 166.67, 184.0, 201.33, 219.33,
    236.67, 254.0, 272.0, 289.33, 306.67, 324.0, 342.0, 359.33, 376.67,
    394.0, 411.33, 429.33, 446.67, 464.0, 482.0, 499.33, 516.67, 534.0,
    552.0, 569.33, 586.67, 604.0, 621.33, 639.33, 656.67, 674.0, 692.0, 709.33,
]

const P4_ROW_BOUNDS = [
    79.33, 101.33, 123.33, 145.33, 167.33, 189.33, 211.33, 233.33, 255.33,
    277.33, 299.33, 321.33, 343.33,
]

const P5_ROW_BOUNDS = [
    176.0, 196.0, 216.0, 236.0, 256.0, 276.0, 296.0, 316.0, 336.0, 356.0,
    376.0, 396.0, 416.0, 436.0, 456.0, 476.0, 496.0, 516.0, 536.0, 556.0,
    576.0, 596.0, 616.0, 636.0, 656.0, 676.0, 696.0, 716.0, 736.0, 756.0,
]

const P5_COLS = [64.0, 86.67, 125.33, 160.67, 234.67, 310.67, 365.33, 420.0, 474.67, 529.33]

const PERIOD_ROW = { top: 171.33, h: 16.0 }
const PERIOD_START_ANCHORS = { year: 293.33, month: 335.33, day: 377.33 }
const PERIOD_END_ANCHORS = { year: 430.0, month: 471.33, day: 513.33 }

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
        const body = (await req.json()) as Bekki6Payload

        const candidatePdfPaths = [
            path.join(process.cwd(), "public", "PDF", "s50_kokuji14_bekki6.pdf"),
            path.join(process.cwd(), "public", "s50_kokuji14_bekki6.pdf"),
        ]
        const pdfPath = candidatePdfPaths.find((p) => fs.existsSync(p))
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf")

        if (!pdfPath) throw new Error("Template PDF not found: s50_kokuji14_bekki6.pdf")

        const existingPdfBytes = fs.readFileSync(pdfPath)
        const fontBytes = fs.readFileSync(fontPath)

        const pdfDoc = await PDFDocument.load(existingPdfBytes)
        pdfDoc.registerFontkit(fontkit)
        const customFont = await pdfDoc.embedFont(fontBytes)

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
            if (options?.align === "center") {
                textX = cellX + (cellW - textWidth) / 2
            }
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
                paddingX: 2.2,
                paddingY: 1.2,
                minFontSize: 3.5,
                lineGap: 0.7,
            },
        })

        const drawResultRows = (
            page: PDFPage,
            pageHeight: number,
            rows: Bekki6Row[],
            rowBounds: number[],
            columns: ResultColumns,
        ) => {
            for (let i = 0; i < rowBounds.length - 1; i += 1) {
                const row = rows[i]
                if (!row) continue
                const top = rowBounds[i]
                const h = rowBounds[i + 1] - rowBounds[i]

                drawWrappedInCell(page, pageHeight, row.content, columns.contentX, top, columns.contentW, h, 6.6)
                drawInCell(page, pageHeight, row.judgment, columns.judgmentX, top, columns.judgmentW, h, 8.0, { align: "center" })
                drawWrappedInCell(page, pageHeight, row.bad_content, columns.badX, top, columns.badW, h, 6.4)
                drawWrappedInCell(page, pageHeight, row.action_content, columns.actionX, top, columns.actionW, h, 6.4)
            }
        }

        const drawRightAt = (
            page: PDFPage,
            pageHeight: number,
            text: string,
            anchorX: number,
            rowTop: number,
            rowH: number,
            size = 7.8,
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
            drawRightAt(page1, p1Height, parts.year, anchors.year, PERIOD_ROW.top, PERIOD_ROW.h, 7.8)
            drawRightAt(page1, p1Height, parts.month, anchors.month, PERIOD_ROW.top, PERIOD_ROW.h, 7.8)
            drawRightAt(page1, p1Height, parts.day, anchors.day, PERIOD_ROW.top, PERIOD_ROW.h, 7.8)
        }

        const drawCylinderRows = (
            page: PDFPage,
            pageHeight: number,
            rows: CylinderRow[],
        ) => {
            for (let i = 0; i < P5_ROW_BOUNDS.length - 1; i += 1) {
                const row = rows[i]
                if (!row) continue
                const top = P5_ROW_BOUNDS[i]
                const h = P5_ROW_BOUNDS[i + 1] - top
                const values = [
                    row.no,
                    row.cylinder_no,
                    row.spec1,
                    row.spec2,
                    row.spec3,
                    row.measure1,
                    row.measure2,
                    row.measure3,
                    row.measure4,
                ]

                for (let c = 0; c < values.length; c += 1) {
                    const x = P5_COLS[c]
                    const w = P5_COLS[c + 1] - P5_COLS[c]
                    const isShort = c <= 4
                    drawWrappedInCell(page, pageHeight, values[c], x, top, w, h, isShort ? 6.3 : 5.9)
                }
            }
        }

        // Page1 header
        drawInCell(page1, p1Height, body.zone_name, 470, 82, 54, 12, 7.6)
        drawInCell(page1, p1Height, body.equipment_system, 150, 100, 145, 12, 7.6)
        drawInCell(page1, p1Height, body.form_name, 113.33, 116.0, 266.0, 27.33, 8.8)
        drawInCell(page1, p1Height, body.fire_manager, 422.67, 116.0, 106.0, 27.33, 8.4)
        drawInCell(page1, p1Height, body.location, 113.33, 143.33, 266.0, 28.0, 8.5)
        drawInCell(page1, p1Height, body.witness, 422.67, 143.33, 106.0, 28.0, 8.3)

        drawInCell(page1, p1Height, body.inspection_type || "機器・総合", 113.33, 171.33, 92.0, 16.0, 8.0, { align: "center" })
        const start = formatDateText(body.period_start)
        const end = formatDateText(body.period_end)
        if (parseDateParts(body.period_start) || parseDateParts(body.period_end)) {
            drawPeriodDate(body.period_start, PERIOD_START_ANCHORS)
            drawPeriodDate(body.period_end, PERIOD_END_ANCHORS)
        } else {
            const periodText = start && end ? `${start} - ${end}` : (start || end)
            drawInCell(page1, p1Height, periodText, 263.33, PERIOD_ROW.top, 265.34, PERIOD_ROW.h, 7.8)
        }

        drawInCell(page1, p1Height, body.inspector_name, 113.33, 187.33, 92.0, 48.0, 8.0)
        drawInCell(page1, p1Height, body.inspector_company, 263.33, 187.33, 143.0, 23.0, 7.8)
        drawInCell(page1, p1Height, body.inspector_tel, 406.33, 187.33, 122.34, 23.0, 7.8)
        drawInCell(page1, p1Height, body.inspector_address, 263.33, 210.0, 265.34, 25.33, 7.6)

        drawResultRows(page1, p1Height, body.page1_rows ?? [], P1_ROW_BOUNDS, {
            contentX: 225.33, contentW: 96.0,
            judgmentX: 321.33, judgmentW: 38.0,
            badX: 359.33, badW: 84.67,
            actionX: 444.0, actionW: 84.67,
        })

        drawResultRows(page2, p2Height, body.page2_rows ?? [], P2_ROW_BOUNDS, {
            contentX: 225.33, contentW: 96.0,
            judgmentX: 321.33, judgmentW: 38.0,
            badX: 359.33, badW: 85.34,
            actionX: 444.67, actionW: 84.66,
        })

        drawResultRows(page3, p3Height, body.page3_rows ?? [], P3_ROW_BOUNDS, {
            contentX: 225.33, contentW: 96.0,
            judgmentX: 321.33, judgmentW: 38.0,
            badX: 359.33, badW: 85.34,
            actionX: 444.67, actionW: 84.66,
        })

        drawResultRows(page4, p4Height, body.page4_rows ?? [], P4_ROW_BOUNDS, {
            contentX: 235.33, contentW: 86.0,
            judgmentX: 321.33, judgmentW: 38.0,
            badX: 359.33, badW: 85.34,
            actionX: 444.67, actionW: 84.66,
        })

        drawWrappedInCell(page4, p4Height, body.notes, 92.67, 343.33, 436.66, 274.67, 7.2)

        const device1 = body.device1 ?? {}
        const device2 = body.device2 ?? {}
        drawInCell(page4, p4Height, device1.name, 92.67, 639.33, 36.0, 20.67, 7.0)
        drawInCell(page4, p4Height, device1.model, 128.67, 639.33, 38.66, 20.67, 7.0)
        drawInCell(page4, p4Height, formatJapaneseDateText(device1.calibrated_at), 167.33, 639.33, 51.34, 20.67, 7.0)
        drawInCell(page4, p4Height, device1.maker, 218.67, 639.33, 52.0, 20.67, 7.0)

        drawInCell(page4, p4Height, device2.name, 321.33, 639.33, 52.67, 20.67, 7.0)
        drawInCell(page4, p4Height, device2.model, 374.0, 639.33, 52.0, 20.67, 7.0)
        drawInCell(page4, p4Height, formatJapaneseDateText(device2.calibrated_at), 426.0, 639.33, 52.0, 20.67, 7.0)
        drawInCell(page4, p4Height, device2.maker, 478.0, 639.33, 51.33, 20.67, 7.0)

        drawCylinderRows(page5, p5Height, body.page5_rows ?? [])

        const pdfBytes = await pdfDoc.save()
        return new NextResponse(pdfBytes as unknown as BodyInit, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": 'attachment; filename="s50_kokuji14_bekki6_filled.pdf"',
            },
        })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 })
    }
}
