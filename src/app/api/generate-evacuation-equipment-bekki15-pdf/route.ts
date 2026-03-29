import { NextRequest, NextResponse } from "next/server"
import { PDFDocument, type PDFPage, StandardFonts, rgb } from "pdf-lib"
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

type Bekki15Payload = {
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
    328.2, 342.24, 356.28, 370.2, 384.24, 398.28, 412.2, 426.24, 440.28, 454.2, 468.24, 482.28,
    496.2, 510.24, 524.28, 538.2, 552.24, 566.28, 580.2, 594.24, 608.28, 622.2, 636.24, 650.28,
    664.2, 678.24, 692.52,
]

const P2_ROW_BOUNDS = [
    83.52, 101.28, 119.28, 137.28, 155.28, 173.28, 191.28, 209.28, 227.28, 245.28, 263.28, 281.28,
    299.28, 317.28, 335.28, 353.28, 371.28, 389.28, 407.28, 425.28, 443.28, 461.28, 478.2,
]

const PERIOD_ROW = { top: 167.28, h: 13.92 }
const PERIOD_START_ANCHORS: DateAnchors = { year: 311.88, month: 343.45, day: 374.9 }
const PERIOD_END_ANCHORS: DateAnchors = { year: 427.46, month: 459.03, day: 490.47 }

const normalizeText = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim()

export async function POST(req: NextRequest) {
    try {
        const body = (await req.json()) as Bekki15Payload

        const candidatePdfPaths = [
            path.join(process.cwd(), "public", "PDF", "s50_kokuji14_bekki15.pdf"),
            path.join(process.cwd(), "public", "s50_kokuji14_bekki15.pdf"),
        ]
        const pdfPath = candidatePdfPaths.find((v) => fs.existsSync(v))
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf")
        if (!pdfPath) throw new Error("Template PDF not found: s50_kokuji14_bekki15.pdf")

        const pdfDoc = await PDFDocument.load(fs.readFileSync(pdfPath))
        pdfDoc.registerFontkit(fontkit)
        const customFont = await pdfDoc.embedFont(fs.readFileSync(fontPath))
        const latinFont = await pdfDoc.embedFont(StandardFonts.Helvetica)

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

        type DrawOptions = CellDrawOptions & { minFontSize?: number; maxFontSize?: number }
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
            page.drawText(textToDraw, {
                x: textX,
                y: pageHeight - (textTopFromTop + textHeight * 0.78),
                size: currentSize,
                font,
                color: rgb(0, 0, 0),
            })
        }

        const drawDeviceMaker = (text: unknown, page: PDFPage, pageH: number, cellX: number, cellW: number, cellTop: number, cellH: number) => {
            const norm = normalizeText(text)
            if (!norm) return
            const padX = 1
            const availW = cellW - padX * 2
            let sz = 5.4
            const w = customFont.widthOfTextAtSize(norm, sz)
            if (w > availW) sz = sz * (availW / w) * 0.98
            sz = Math.max(sz, 3.5)
            const th = customFont.heightAtSize(sz, { descender: true })
            const textTop = cellTop + (cellH - th) / 2
            page.drawText(norm, {
                x: cellX + padX,
                y: pageH - (textTop + th * 0.78),
                size: sz,
                font: customFont,
                color: rgb(0, 0, 0),
            })
        }

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
                drawInCell(page, pageHeight, row.judgment, cols.judgmentX, top, cols.judgmentW, h, sizes?.judgment ?? 7.4, { align: "center" })
                drawWrappedInCell(page, pageHeight, row.bad_content, cols.badX, top, cols.badW, h, sizes?.bad ?? 6.0)
                drawWrappedInCell(page, pageHeight, row.action_content, cols.actionX, top, cols.actionW, h, sizes?.action ?? 6.0)
            }
        }

        const drawHeader = (page: PDFPage, pageHeight: number) => {
            drawInCell(page, pageHeight, body.form_name, 117.6, 114.72, 271.56, 26.28, 8.2)
            drawInCell(page, pageHeight, body.fire_manager, 432.6, 114.72, 97.44, 26.28, 7.4)
            drawInCell(page, pageHeight, body.location, 117.6, 141.0, 271.56, 26.28, 8.0)
            drawInCell(page, pageHeight, body.witness, 432.6, 141.0, 97.44, 26.28, 7.4)
            // 点検種別はテンプレートに「機器・総合」が印刷済みのため描画不要

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
                        fontSize: 6.4,
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
                        fontSize: 6.4,
                    })
                }
            } else {
                drawInCell(page, pageHeight, periodText, 275.04, PERIOD_ROW.top, 255.0, PERIOD_ROW.h, 6.4)
            }

            drawInCell(page, pageHeight, body.inspector_name, 117.6, 181.2, 88.68, 52.56, 6.7)
            drawInCell(page, pageHeight, body.inspector_company, 302.4, 181.2, 120.0, 26.28, 6.4)
            drawInCell(page, pageHeight, body.inspector_tel, 422.4, 181.2, 107.64, 26.28, 6.3)
            drawInCell(page, pageHeight, body.inspector_address, 302.4, 207.48, 227.64, 26.28, 6.2)
        }

        drawHeader(page1, p1Height)

        drawResultRows(page1, p1Height, body.page1_rows ?? [], P1_ROW_BOUNDS, {
            contentX: 212.04,
            contentW: 105.0,
            judgmentX: 317.04,
            judgmentW: 36.72,
            badX: 353.76,
            badW: 73.56,
            actionX: 427.32,
            actionW: 102.72,
        }, { content: 5.8, judgment: 6.8, bad: 5.7, action: 5.7 })

        drawResultRows(page2, p2Height, body.page2_rows ?? [], P2_ROW_BOUNDS, {
            contentX: 212.04,
            contentW: 105.0,
            judgmentX: 317.04,
            judgmentW: 36.72,
            badX: 353.76,
            badW: 73.56,
            actionX: 427.32,
            actionW: 102.72,
        }, { content: 6.1, judgment: 7.0, bad: 6.0, action: 6.0 })

        drawWrappedInCell(page2, p2Height, body.notes, 80.76, 563, 449.28, 84, 6.8)

        const device1 = body.device1 ?? {}
        const device2 = body.device2 ?? {}
        const deviceRowTop = 664.32
        const deviceRowH = 17.16

        const devOpts: DrawOptions = { paddingX: 1 }
        drawInCell(page2, p2Height, device1.name, 80.76, deviceRowTop, 56.16, deviceRowH, 5.6)
        drawInCellWithFont(page2, p2Height, latinFont, device1.model, 136.92, deviceRowTop, 56.16, deviceRowH, 5.6, devOpts)
        drawInCell(page2, p2Height, formatJapaneseDateText(device1.calibrated_at), 193.08, deviceRowTop, 56.16, deviceRowH, 5.4)
        drawDeviceMaker(device1.maker, page2, p2Height, 249.24, 55.68, deviceRowTop, deviceRowH)

        drawInCell(page2, p2Height, device2.name, 305.88, deviceRowTop, 55.68, deviceRowH, 5.6)
        drawInCellWithFont(page2, p2Height, latinFont, device2.model, 361.56, deviceRowTop, 56.16, deviceRowH, 5.6, devOpts)
        drawInCell(page2, p2Height, formatJapaneseDateText(device2.calibrated_at), 417.72, deviceRowTop, 56.16, deviceRowH, 5.4)
        drawDeviceMaker(device2.maker, page2, p2Height, 473.88, 56.16, deviceRowTop, deviceRowH)

        const pdfBytes = await pdfDoc.save()
        return new NextResponse(pdfBytes as unknown as BodyInit, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": 'attachment; filename="s50_kokuji14_bekki15_filled.pdf"',
            },
        })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 })
    }
}
