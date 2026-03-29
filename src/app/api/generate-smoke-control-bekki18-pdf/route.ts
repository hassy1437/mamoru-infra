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

type Bekki18Payload = {
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
    316.8, 333.72, 350.76, 367.8, 384.72, 401.76, 418.8, 435.72, 452.76, 469.8, 486.72, 503.76,
    520.8, 537.72, 554.76, 571.8, 588.72, 605.76, 622.8, 639.72, 656.76, 673.8, 690.72, 708.0,
]

const P2_ROW_BOUNDS = [
    83.52, 103.2, 123.24, 143.28, 163.2, 183.24, 203.28, 223.2, 243.24, 263.28,
    283.2, 303.24, 323.28, 343.2, 363.24, 383.28, 403.2, 423.24, 443.28, 463.2,
]

const PERIOD_ROW = { top: 164.76, h: 17.04 }
const PERIOD_START_ANCHORS: DateAnchors = { year: 302.28, month: 340.33, day: 378.38 }
const PERIOD_END_ANCHORS: DateAnchors = { year: 427.22, month: 465.27, day: 503.32 }

export async function POST(req: NextRequest) {
    try {
        const body = (await req.json()) as Bekki18Payload

        const candidatePdfPaths = [
            path.join(process.cwd(), "public", "PDF", "s50_kokuji14_bekki18.pdf"),
            path.join(process.cwd(), "public", "s50_kokuji14_bekki18.pdf"),
        ]
        const pdfPath = candidatePdfPaths.find((v) => fs.existsSync(v))
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf")
        if (!pdfPath) throw new Error("Template PDF not found: s50_kokuji14_bekki18.pdf")

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

        const drawResultRows = (
            page: PDFPage,
            pageHeight: number,
            rows: BekkiRow[],
            rowBounds: number[],
            cols: ResultColumns,
            sizes?: { content?: number; judgment?: number; bad?: number; action?: number },
        ) => {
            for (let i = 0; i < rowBounds.length - 1; i += 1) {
                const row = rows[i]
                if (!row) continue
                const top = rowBounds[i]
                const h = rowBounds[i + 1] - top
                drawWrappedInCell(page, pageHeight, row.content, cols.contentX, top, cols.contentW, h, sizes?.content ?? 6.2)
                drawInCell(page, pageHeight, row.judgment, cols.judgmentX, top, cols.judgmentW, h, sizes?.judgment ?? 7.2, {
                    align: "center",
                })
                drawWrappedInCell(page, pageHeight, row.bad_content, cols.badX, top, cols.badW, h, sizes?.bad ?? 6.0)
                drawWrappedInCell(page, pageHeight, row.action_content, cols.actionX, top, cols.actionW, h, sizes?.action ?? 6.0)
            }
        }

        const drawHeader = (page: PDFPage, pageHeight: number) => {
            drawInCell(page, pageHeight, body.form_name, 117.6, 114.72, 307.44, 25.08, 8.0)
            drawInCell(page, pageHeight, body.fire_manager, 425.04, 114.72, 105.0, 25.08, 7.3)
            drawInCell(page, pageHeight, body.location, 117.6, 139.8, 307.44, 24.96, 7.8)
            drawInCell(page, pageHeight, body.witness, 425.04, 139.8, 105.0, 24.96, 7.3)
            drawInCell(page, pageHeight, body.inspection_type || "", 117.6, 164.76, 88.68, 17.04, 6.4, { align: "center" })

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
                drawInCell(page, pageHeight, periodText, 269.76, PERIOD_ROW.top, 260.28, PERIOD_ROW.h, 6.2)
            }

            drawInCell(page, pageHeight, body.inspector_name, 117.6, 181.8, 88.68, 49.92, 6.4)
            drawInCell(page, pageHeight, body.inspector_company, 302.28, 181.8, 122.76, 24.96, 6.0)
            drawInCell(page, pageHeight, body.inspector_tel, 425.04, 181.8, 105.0, 24.96, 6.0)
            drawInCell(page, pageHeight, body.inspector_address, 302.28, 206.76, 227.76, 24.96, 5.9)

            drawInCell(page, pageHeight, body.extra_fields?.smoke_machine_maker, 222.6, 231.72, 307.44, 17.04, 6.2)
            drawInCell(page, pageHeight, body.extra_fields?.smoke_machine_model, 222.6, 248.76, 307.44, 17.04, 6.2)
        }

        drawHeader(page1, p1Height)

        drawResultRows(
            page1,
            p1Height,
            body.page1_rows ?? [],
            P1_ROW_BOUNDS,
            {
                contentX: 222.6,
                contentW: 115.44,
                judgmentX: 338.04,
                judgmentW: 36.72,
                badX: 374.76,
                badW: 77.28,
                actionX: 452.04,
                actionW: 78.0,
            },
            { content: 5.8, judgment: 6.8, bad: 5.8, action: 5.8 },
        )

        drawResultRows(
            page2,
            p2Height,
            body.page2_rows ?? [],
            P2_ROW_BOUNDS,
            {
                contentX: 227.76,
                contentW: 105.0,
                judgmentX: 332.76,
                judgmentW: 36.84,
                badX: 369.6,
                badW: 80.04,
                actionX: 449.64,
                actionW: 80.4,
            },
            { content: 6.0, judgment: 7.0, bad: 6.0, action: 6.0 },
        )

        drawWrappedInCell(page2, p2Height, body.notes, 86.04, 463.2, 444.0, 176.04, 6.8)

        const device1 = body.device1 ?? {}
        const device2 = body.device2 ?? {}
        const deviceRowTop = 658.2
        const deviceRowH = 19.08

        drawInCell(page2, p2Height, device1.name, 86.04, deviceRowTop, 73.56, deviceRowH, 5.6)
        drawInCell(page2, p2Height, device1.model, 159.6, deviceRowTop, 36.72, deviceRowH, 5.6)
        drawInCell(page2, p2Height, formatJapaneseDateText(device1.calibrated_at), 196.32, deviceRowTop, 55.8, deviceRowH, 5.4)
        drawInCell(page2, p2Height, device1.maker, 252.12, deviceRowTop, 55.44, deviceRowH, 5.4)

        drawInCell(page2, p2Height, device2.name, 308.52, deviceRowTop, 73.32, deviceRowH, 5.6)
        drawInCell(page2, p2Height, device2.model, 381.84, deviceRowTop, 37.2, deviceRowH, 5.6)
        drawInCell(page2, p2Height, formatJapaneseDateText(device2.calibrated_at), 419.04, deviceRowTop, 55.56, deviceRowH, 5.4)
        drawInCell(page2, p2Height, device2.maker, 474.6, deviceRowTop, 55.44, deviceRowH, 5.4)

        const pdfBytes = await pdfDoc.save()
        return new NextResponse(pdfBytes as unknown as BodyInit, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": 'attachment; filename="s50_kokuji14_bekki18_filled.pdf"',
            },
        })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 })
    }
}
