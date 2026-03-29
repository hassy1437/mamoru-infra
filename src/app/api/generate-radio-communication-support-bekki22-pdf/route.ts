import { NextRequest, NextResponse } from "next/server"
import { PDFDocument, type PDFPage } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"
import fs from "fs"
import path from "path"
import {
    drawPeriodDate,
    drawTextInCell,
    drawWrappedTextInCell,
    formatDateText,
    formatJapaneseDateText,
    parseDateParts,
    type CellDrawOptions,
    type DateAnchors,
} from "@/lib/pdf-form-helpers"

type BekkiRow = { content?: string; judgment?: string; bad_content?: string; action_content?: string }
type DeviceRow = { name?: string; model?: string; calibrated_at?: string; maker?: string }

type Bekki22Payload = {
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
    notes?: string
    device1?: DeviceRow
    device2?: DeviceRow
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

const P1_ROW_BOUNDS = [335.76, 353.76, 371.76, 389.76, 407.76, 425.76, 443.76, 461.76, 479.76, 497.76, 515.76, 533.76, 551.76, 569.76, 587.76]

const PERIOD_ROW = { top: 167.04, h: 26.16 }
const PERIOD_START_ANCHORS: DateAnchors = { year: 299.52, month: 338.05, day: 376.56 }
const PERIOD_END_ANCHORS: DateAnchors = { year: 426.0, month: 464.64, day: 503.04 }

export async function POST(req: NextRequest) {
    try {
        const body = (await req.json()) as Bekki22Payload

        const candidatePdfPaths = [
            path.join(process.cwd(), "public", "PDF", "s50_kokuji14_bekki22.pdf"),
            path.join(process.cwd(), "public", "s50_kokuji14_bekki22.pdf"),
        ]
        const pdfPath = candidatePdfPaths.find((v) => fs.existsSync(v))
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf")
        if (!pdfPath) throw new Error("Template PDF not found: s50_kokuji14_bekki22.pdf")

        const pdfDoc = await PDFDocument.load(fs.readFileSync(pdfPath))
        pdfDoc.registerFontkit(fontkit)
        const customFont = await pdfDoc.embedFont(fs.readFileSync(fontPath))

        const [page1] = pdfDoc.getPages()
        const p1Height = page1.getSize().height

        const drawInCell = (
            page: PDFPage,
            pageHeight: number,
            text: unknown,
            cellX: number,
            cellTopFromTop: number,
            cellW: number,
            cellH: number,
            fontSize = 9,
            options?: CellDrawOptions,
        ) => drawTextInCell({
            page,
            pageHeight,
            font: customFont,
            text,
            cellX,
            cellTopFromTop,
            cellW,
            cellH,
            fontSize,
            options,
        })

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
        })

        const drawResultRows = (page: PDFPage, pageHeight: number, rows: BekkiRow[], rowBounds: number[], cols: ResultColumns) => {
            for (let i = 0; i < rowBounds.length - 1; i += 1) {
                const row = rows[i]
                if (!row) continue
                const top = rowBounds[i]
                const h = rowBounds[i + 1] - top
                drawWrappedInCell(page, pageHeight, row.content, cols.contentX, top, cols.contentW, h, 6.0)
                drawInCell(page, pageHeight, row.judgment, cols.judgmentX, top, cols.judgmentW, h, 7.0, { align: "center" })
                drawWrappedInCell(page, pageHeight, row.bad_content, cols.badX, top, cols.badW, h, 5.9)
                drawWrappedInCell(page, pageHeight, row.action_content, cols.actionX, top, cols.actionW, h, 5.9)
            }
        }

        const drawHeader = (page: PDFPage, pageHeight: number) => {
            drawInCell(page, pageHeight, body.form_name, 114.6, 114.48, 275.52, 26.28, 8.0)
            drawInCell(page, pageHeight, body.fire_manager, 432.6, 114.48, 96.96, 26.28, 7.3)
            drawInCell(page, pageHeight, body.location, 114.6, 140.76, 275.52, 26.28, 7.8)
            drawInCell(page, pageHeight, body.witness, 432.6, 140.76, 96.96, 26.28, 7.3)
            drawInCell(page, pageHeight, body.inspection_type || "", 114.6, 167.04, 98.52, 26.16, 6.4, { align: "center" })
            const periodText = (() => {
                const start = formatDateText(body.period_start)
                const end = formatDateText(body.period_end)
                return start && end ? `${start} - ${end}` : (start || end)
            })()
            const canDrawSplitPeriod =
                (!body.period_start || Boolean(parseDateParts(body.period_start))) &&
                (!body.period_end || Boolean(parseDateParts(body.period_end)))
            if (canDrawSplitPeriod) {
                if (body.period_start) {
                    drawPeriodDate({
                        page: page,
                        pageHeight: pageHeight,
                        font: customFont,
                        dateValue: body.period_start,
                        anchors: PERIOD_START_ANCHORS,
                        rowTop: PERIOD_ROW.top,
                        rowHeight: PERIOD_ROW.h,
                        fontSize: 6.2,
                    })
                }
                if (body.period_end) {
                    drawPeriodDate({
                        page: page,
                        pageHeight: pageHeight,
                        font: customFont,
                        dateValue: body.period_end,
                        anchors: PERIOD_END_ANCHORS,
                        rowTop: PERIOD_ROW.top,
                        rowHeight: PERIOD_ROW.h,
                        fontSize: 6.2,
                    })
                }
            } else {
                drawInCell(page, pageHeight, periodText, 266.4, PERIOD_ROW.top, 263.16, PERIOD_ROW.h, 6.2)
            }
            drawInCell(page, pageHeight, body.inspector_name, 114.6, 193.2, 98.52, 52.56, 6.4)
            drawInCell(page, pageHeight, body.inspector_company, 299.52, 193.2, 119.52, 26.28, 6.0)
            drawInCell(page, pageHeight, body.inspector_tel, 419.04, 193.2, 110.52, 26.28, 6.0)
            drawInCell(page, pageHeight, body.inspector_address, 299.52, 219.48, 230.04, 26.28, 5.9)

            // These cells already contain printed labels (製造者名 / 型式等), so draw user values in the right-side free area.
            drawInCell(page, pageHeight, body.extra_fields?.cable_maker, 213.12, 245.76, 40.68, 18.0, 5.0, { align: "center" })
            drawInCell(page, pageHeight, body.extra_fields?.cable_model, 213.12, 263.76, 40.68, 18.0, 5.0, { align: "center" })
            drawInCell(page, pageHeight, body.extra_fields?.antenna_maker, 353.88, 245.76, 36.48, 18.0, 4.8, { align: "center" })
            drawInCell(page, pageHeight, body.extra_fields?.antenna_model, 353.88, 263.76, 36.48, 18.0, 4.8, { align: "center" })
            drawInCell(page, pageHeight, body.extra_fields?.amplifier_maker, 490.44, 245.76, 39.12, 18.0, 4.8, { align: "center" })
            drawInCell(page, pageHeight, body.extra_fields?.amplifier_model, 490.44, 263.76, 39.12, 18.0, 4.8, { align: "center" })
        }

        drawHeader(page1, p1Height)
        drawResultRows(page1, p1Height, body.page1_rows ?? [], P1_ROW_BOUNDS, {
            contentX: 227.52,
            contentW: 110.28,
            judgmentX: 337.8,
            judgmentW: 36.72,
            badX: 374.52,
            badW: 68.28,
            actionX: 442.8,
            actionW: 86.76,
        })

        drawWrappedInCell(page1, p1Height, body.notes, 85.8, 587.76, 443.76, 63.0, 6.6)

        const device1 = body.device1 ?? {}
        const device2 = body.device2 ?? {}
        const deviceRowTop = 667.8
        const deviceRowH = 16.92
        drawInCell(page1, p1Height, device1.name, 85.8, deviceRowTop, 55.56, deviceRowH, 5.6)
        drawInCell(page1, p1Height, device1.model, 141.36, deviceRowTop, 55.44, deviceRowH, 5.6)
        drawInCell(page1, p1Height, formatJapaneseDateText(device1.calibrated_at), 196.8, deviceRowTop, 55.56, deviceRowH, 5.4)
        drawInCell(page1, p1Height, device1.maker, 252.36, deviceRowTop, 54.96, deviceRowH, 5.4)
        drawInCell(page1, p1Height, device2.name, 308.28, deviceRowTop, 55.08, deviceRowH, 5.6)
        drawInCell(page1, p1Height, device2.model, 363.36, deviceRowTop, 55.44, deviceRowH, 5.6)
        drawInCell(page1, p1Height, formatJapaneseDateText(device2.calibrated_at), 418.8, deviceRowTop, 55.56, deviceRowH, 5.4)
        drawInCell(page1, p1Height, device2.maker, 474.36, deviceRowTop, 54.96, deviceRowH, 5.4)

        const pdfBytes = await pdfDoc.save()
        return new NextResponse(pdfBytes as unknown as BodyInit, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": 'attachment; filename="s50_kokuji14_bekki22_filled.pdf"',
            },
        })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 })
    }
}
