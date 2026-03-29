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
import { normalizeInspectorNameValue, normalizeWitnessValue } from "@/lib/bekki-header-normalization"

type BekkiRow = { content?: string; judgment?: string; bad_content?: string; action_content?: string }
type DeviceRow = { name?: string; model?: string; calibrated_at?: string; maker?: string }

type Bekki14Payload = {
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
    312.0, 327.48, 342.96, 358.56, 374.04, 389.52, 405.0, 420.48, 435.96, 451.56, 467.04, 482.52,
    498.0, 513.48, 528.96, 544.56, 560.04, 575.52, 591.0, 606.48, 621.96, 637.56, 653.04, 668.52,
    684.0, 699.6,
]

const P2_ROW_BOUNDS = [
    83.04, 99.96, 117.0, 134.04, 150.96, 168.0, 185.04, 201.96, 219.0, 236.04, 252.96, 270.0,
    287.04, 303.96, 321.0, 338.04, 354.96, 372.0, 389.04, 405.96, 423.0, 440.04, 456.96, 474.0,
    491.04, 507.96, 525.0, 542.04, 558.96, 576.0, 593.04, 609.96, 627.0, 644.04, 660.96, 678.0,
    695.04,
]

const P3_ROW_BOUNDS = [105.0, 126.96, 149.04]

const PERIOD_ROW = { top: 162.0, h: 14.0 }
const PERIOD_START_ANCHORS: DateAnchors = { year: 311.88, month: 343.45, day: 374.9 }
const PERIOD_END_ANCHORS: DateAnchors = { year: 427.46, month: 459.03, day: 490.47 }

export async function POST(req: NextRequest) {
    try {
        const body = (await req.json()) as Bekki14Payload
        const normalizedWitness = normalizeWitnessValue(body.witness)
        const normalizedInspectorName = normalizeInspectorNameValue(body.inspector_name)

        const candidatePdfPaths = [
            path.join(process.cwd(), "public", "PDF", "s50_kokuji14_bekki14.pdf"),
            path.join(process.cwd(), "public", "s50_kokuji14_bekki14.pdf"),
        ]
        const pdfPath = candidatePdfPaths.find((v) => fs.existsSync(v))
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf")
        if (!pdfPath) throw new Error("Template PDF not found: s50_kokuji14_bekki14.pdf")

        const pdfDoc = await PDFDocument.load(fs.readFileSync(pdfPath))
        pdfDoc.registerFontkit(fontkit)
        const customFont = await pdfDoc.embedFont(fs.readFileSync(fontPath))

        const [page1, page2, page3] = pdfDoc.getPages()
        const p1Height = page1.getSize().height
        const p2Height = page2.getSize().height
        const p3Height = page3.getSize().height

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
                drawWrappedInCell(page, pageHeight, row.content, cols.contentX, top, cols.contentW, h, 6.2)
                drawInCell(page, pageHeight, row.judgment, cols.judgmentX, top, cols.judgmentW, h, 7.2, { align: "center" })
                drawWrappedInCell(page, pageHeight, row.bad_content, cols.badX, top, cols.badW, h, 6.0)
                drawWrappedInCell(page, pageHeight, row.action_content, cols.actionX, top, cols.actionW, h, 6.0)
            }
        }

        const headerShiftY = 4
        const y = (v: number) => v + headerShiftY

        const drawHeader = () => {
            drawInCell(page1, p1Height, body.form_name, 122.76, y(114.0), 270.56, 24.0, 8.2)
            drawInCell(page1, p1Height, body.fire_manager, 448.67, y(114.0), 80.66, 24.0, 7.8)
            drawInCell(page1, p1Height, body.location, 122.76, y(138.0), 270.56, 24.0, 7.5)
            drawInCell(page1, p1Height, normalizedWitness, 448.67, y(138.0), 80.66, 24.0, 7.8)
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
                        page: page1,
                        pageHeight: p1Height,
                        font: customFont,
                        dateValue: body.period_start,
                        anchors: PERIOD_START_ANCHORS,
                        rowTop: y(PERIOD_ROW.top),
                        rowHeight: PERIOD_ROW.h,
                        fontSize: 6.8,
                    })
                }
                if (body.period_end) {
                    drawPeriodDate({
                        page: page1,
                        pageHeight: p1Height,
                        font: customFont,
                        dateValue: body.period_end,
                        anchors: PERIOD_END_ANCHORS,
                        rowTop: y(PERIOD_ROW.top),
                        rowHeight: PERIOD_ROW.h,
                        fontSize: 6.8,
                    })
                }
            } else {
                drawInCell(page1, p1Height, periodText, 230.0, y(PERIOD_ROW.top), 299.33, PERIOD_ROW.h, 6.8)
            }
            drawInCell(page1, p1Height, normalizedInspectorName, 148.0, y(176.0), 68.5, 48.0, 7.0)
            drawInCell(page1, p1Height, body.inspector_company, 305.44, y(176.0), 97.0, 24.0, 6.2)
            drawInCell(page1, p1Height, body.inspector_tel, 426.28, y(176.0), 103.05, 24.0, 6.4)
            drawInCell(page1, p1Height, body.inspector_address, 305.44, y(200.0), 223.89, 24.0, 6.3)
        }

        drawHeader()

        drawResultRows(page1, p1Height, body.page1_rows ?? [], P1_ROW_BOUNDS, {
            contentX: 221.16,
            contentW: 112.92,
            judgmentX: 334.56,
            judgmentW: 35.04,
            badX: 370.08,
            badW: 84.48,
            actionX: 455.16,
            actionW: 74.64,
        })

        drawResultRows(page2, p2Height, body.page2_rows ?? [], P2_ROW_BOUNDS, {
            contentX: 221.16,
            contentW: 105.84,
            judgmentX: 327.36,
            judgmentW: 31.44,
            badX: 359.28,
            badW: 85.32,
            actionX: 445.08,
            actionW: 84.48,
        })

        drawResultRows(page3, p3Height, body.page3_rows ?? [], P3_ROW_BOUNDS, {
            contentX: 222.72,
            contentW: 104.64,
            judgmentX: 327.72,
            judgmentW: 31.08,
            badX: 359.28,
            badW: 85.32,
            actionX: 445.08,
            actionW: 84.48,
        })

        drawWrappedInCell(page3, p3Height, body.notes, 80.52, 149.52, 449.04, 471.96, 7.0)

        const device1 = body.device1 ?? {}
        const device2 = body.device2 ?? {}
        const deviceRowTop = 643.92
        const deviceRowH = 21.6

        drawInCell(page3, p3Height, device1.name, 85.2, deviceRowTop, 51.48, deviceRowH, 6.0)
        drawInCell(page3, p3Height, device1.model, 141.36, deviceRowTop, 51.48, deviceRowH, 6.0)
        drawInCell(page3, p3Height, formatJapaneseDateText(device1.calibrated_at), 197.52, deviceRowTop, 51.48, deviceRowH, 5.6)
        drawInCell(page3, p3Height, device1.maker, 253.68, deviceRowTop, 50.88, deviceRowH, 5.6)

        drawInCell(page3, p3Height, device2.name, 309.6, deviceRowTop, 50.88, deviceRowH, 6.0)
        drawInCell(page3, p3Height, device2.model, 366.0, deviceRowTop, 51.36, deviceRowH, 6.0)
        drawInCell(page3, p3Height, formatJapaneseDateText(device2.calibrated_at), 422.04, deviceRowTop, 51.48, deviceRowH, 5.6)
        drawInCell(page3, p3Height, device2.maker, 478.2, deviceRowTop, 51.36, deviceRowH, 5.6)

        const pdfBytes = await pdfDoc.save()
        return new NextResponse(pdfBytes as unknown as BodyInit, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": 'attachment; filename="s50_kokuji14_bekki14_filled.pdf"',
            },
        })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 })
    }
}
