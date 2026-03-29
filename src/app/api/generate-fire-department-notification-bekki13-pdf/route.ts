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

type Bekki13Payload = {
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

const P1_ROW_BOUNDS = [
    278.88, 299.28, 319.56, 339.96, 360.36, 380.64, 401.04, 421.32, 441.72, 462.0, 482.4, 502.8,
    523.08, 543.48, 563.76, 584.16, 604.56, 624.84, 645.24, 665.52, 685.92, 706.2, 726.6,
]

const P2_ROW_BOUNDS = [
    82.92, 102.84, 122.28, 141.72, 161.16, 180.6, 200.04, 219.6, 239.04, 258.48, 277.92,
    297.36, 316.8, 336.24, 355.68, 375.12, 394.56, 414.0, 433.44, 453.0, 472.44, 491.88,
]

const PERIOD_ROW = { top: 162.0, h: 14.0 }
const PERIOD_START_ANCHORS: DateAnchors = { year: 306.48, month: 338.05, day: 369.5 }
const PERIOD_END_ANCHORS: DateAnchors = { year: 422.06, month: 453.63, day: 485.07 }

export async function POST(req: NextRequest) {
    try {
        const body = (await req.json()) as Bekki13Payload

        const candidatePdfPaths = [
            path.join(process.cwd(), "public", "PDF", "s50_kokuji14_bekki13.pdf"),
            path.join(process.cwd(), "public", "s50_kokuji14_bekki13.pdf"),
        ]
        const pdfPath = candidatePdfPaths.find((v) => fs.existsSync(v))
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf")
        if (!pdfPath) throw new Error("Template PDF not found: s50_kokuji14_bekki13.pdf")

        const pdfDoc = await PDFDocument.load(fs.readFileSync(pdfPath))
        pdfDoc.registerFontkit(fontkit)
        const customFont = await pdfDoc.embedFont(fs.readFileSync(fontPath))

        const [page1, page2] = pdfDoc.getPages()
        const p1Height = page1.getSize().height
        const p2Height = page2.getSize().height

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
                drawWrappedInCell(page, pageHeight, row.content, cols.contentX, top, cols.contentW, h, 6.3)
                drawInCell(page, pageHeight, row.judgment, cols.judgmentX, top, cols.judgmentW, h, 7.4, { align: "center" })
                drawWrappedInCell(page, pageHeight, row.bad_content, cols.badX, top, cols.badW, h, 6.1)
                drawWrappedInCell(page, pageHeight, row.action_content, cols.actionX, top, cols.actionW, h, 6.1)
            }
        }

        const headerShiftY = -10
        const y = (v: number) => v + headerShiftY

        const drawHeader = (page: PDFPage, pageHeight: number) => {
            drawInCell(page, pageHeight, body.form_name, 83.33, y(114.0), 365.34, 24.0, 8.4)
            drawInCell(page, pageHeight, body.fire_manager, 448.67, y(114.0), 80.66, 24.0, 7.6)
            drawInCell(page, pageHeight, body.location, 83.33, y(138.0), 365.34, 24.0, 8.0)
            drawInCell(page, pageHeight, body.witness, 448.67, y(138.0), 80.66, 24.0, 7.6)
            drawInCell(page, pageHeight, body.inspection_type || "", 83.33, y(162.0), 146.67, 14.0, 6.8, { align: "center" })

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
                        rowTop: y(PERIOD_ROW.top),
                        rowHeight: PERIOD_ROW.h,
                        fontSize: 6.6,
                    })
                }
                if (body.period_end) {
                    drawPeriodDate({
                        page: page,
                        pageHeight: pageHeight,
                        font: customFont,
                        dateValue: body.period_end,
                        anchors: PERIOD_END_ANCHORS,
                        rowTop: y(PERIOD_ROW.top),
                        rowHeight: PERIOD_ROW.h,
                        fontSize: 6.6,
                    })
                }
            } else {
                drawInCell(page, pageHeight, periodText, 230.0, y(PERIOD_ROW.top), 299.33, PERIOD_ROW.h, 6.6)
            }

            drawInCell(page, pageHeight, body.inspector_name, 83.33, y(176.0), 146.67, 48.0, 7.0)
            drawInCell(page, pageHeight, body.inspector_company, 335.33, y(176.0), 113.34, 24.0, 6.8)
            drawInCell(page, pageHeight, body.inspector_tel, 448.67, y(176.0), 80.66, 24.0, 6.8)
            drawInCell(page, pageHeight, body.inspector_address, 335.33, y(200.0), 194.0, 24.0, 6.6)
        }

        drawHeader(page1, p1Height)

        drawResultRows(page1, p1Height, body.page1_rows ?? [], P1_ROW_BOUNDS, {
            contentX: 227.88,
            contentW: 104.52,
            judgmentX: 332.88,
            judgmentW: 41.52,
            badX: 374.88,
            badW: 78.24,
            actionX: 453.6,
            actionW: 75.84,
        })

        drawResultRows(page2, p2Height, body.page2_rows ?? [], P2_ROW_BOUNDS, {
            contentX: 228.0,
            contentW: 103.8,
            judgmentX: 332.28,
            judgmentW: 42.24,
            badX: 375.0,
            badW: 77.88,
            actionX: 453.36,
            actionW: 76.44,
        })

        drawWrappedInCell(page2, p2Height, body.notes, 80.52, 492.36, 449.28, 172.44, 7.0)

        const device1 = body.device1 ?? {}
        const device2 = body.device2 ?? {}
        const deviceRowTop = 665.28
        const deviceRowH = 16.44

        drawInCell(page2, p2Height, device1.name, 80.52, deviceRowTop, 55.68, deviceRowH, 5.8)
        drawInCell(page2, p2Height, device1.model, 136.8, deviceRowTop, 55.68, deviceRowH, 5.8)
        drawInCell(page2, p2Height, formatJapaneseDateText(device1.calibrated_at), 192.96, deviceRowTop, 55.8, deviceRowH, 5.6)
        drawInCell(page2, p2Height, device1.maker, 249.24, deviceRowTop, 55.32, deviceRowH, 5.6)

        drawInCell(page2, p2Height, device2.name, 305.28, deviceRowTop, 56.04, deviceRowH, 5.8)
        drawInCell(page2, p2Height, device2.model, 361.8, deviceRowTop, 55.68, deviceRowH, 5.8)
        drawInCell(page2, p2Height, formatJapaneseDateText(device2.calibrated_at), 417.96, deviceRowTop, 55.8, deviceRowH, 5.6)
        drawInCell(page2, p2Height, device2.maker, 474.24, deviceRowTop, 55.56, deviceRowH, 5.6)

        const pdfBytes = await pdfDoc.save()
        return new NextResponse(pdfBytes as unknown as BodyInit, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": 'attachment; filename="s50_kokuji14_bekki13_filled.pdf"',
            },
        })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 })
    }
}
