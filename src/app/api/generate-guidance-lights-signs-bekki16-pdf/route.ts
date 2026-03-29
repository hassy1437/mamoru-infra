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

type BekkiRow = {
    content?: string          // 避難口列（or 単一content）
    content_tsuro?: string    // 通路列
    content_kyaku?: string    // 客席列
    judgment?: string
    bad_content?: string
    action_content?: string
}
type DeviceRow = { name?: string; model?: string; calibrated_at?: string; maker?: string }

type Bekki16Payload = {
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
    293.04, 321.36, 349.8, 378.12, 406.44, 434.76, 463.2, 491.52, 515.88, 544.08, 572.76, 601.08,
    629.4, 663.84, 699.0,
]

const P2_ROW_BOUNDS = [
    77.88, 103.08, 128.64, 154.08, 179.64, 205.08, 230.64, 256.08, 281.64, 307.08, 332.64,
]

const PERIOD_ROW = { top: 151.8, h: 21.48 }
const PERIOD_START_ANCHORS: DateAnchors = { year: 347.52, month: 378.01, day: 408.61 }
const PERIOD_END_ANCHORS: DateAnchors = { year: 449.54, month: 480.15, day: 510.63 }

export async function POST(req: NextRequest) {
    try {
        const body = (await req.json()) as Bekki16Payload

        const candidatePdfPaths = [
            path.join(process.cwd(), "public", "PDF", "s50_kokuji14_bekki16.pdf"),
            path.join(process.cwd(), "public", "s50_kokuji14_bekki16.pdf"),
        ]
        const pdfPath = candidatePdfPaths.find((v) => fs.existsSync(v))
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf")
        if (!pdfPath) throw new Error("Template PDF not found: s50_kokuji14_bekki16.pdf")

        const pdfDoc = await PDFDocument.load(fs.readFileSync(pdfPath))
        pdfDoc.registerFontkit(fontkit)
        const customFont = await pdfDoc.embedFont(fs.readFileSync(fontPath))
        const latinFont = await pdfDoc.embedFont(StandardFonts.Helvetica)

        const normalizeText = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim()

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
            page: PDFPage, pageHeight: number, font: typeof customFont, text: unknown,
            cellX: number, cellTopFromTop: number, cellW: number, cellH: number, fontSize = 9, options?: DrawOptions,
        ) => {
            const normalized = normalizeText(text)
            if (!normalized) return
            const paddingX = options?.paddingX ?? 3
            const paddingY = options?.paddingY ?? 2
            let currentSize = Math.min(fontSize, options?.maxFontSize ?? fontSize)
            const maxWidth = Math.max(1, (cellW - paddingX * 2) * 0.85)
            const maxHeight = Math.max(1, cellH - paddingY * 2)
            const w = font.widthOfTextAtSize(normalized, currentSize)
            if (w > maxWidth) currentSize = currentSize * (maxWidth / w)
            const h = font.heightAtSize(currentSize, { descender: true })
            if (h > maxHeight) currentSize = currentSize * (maxHeight / h)
            currentSize = Math.max(currentSize, options?.minFontSize ?? 3.5)
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
            page.drawText(textToDraw, { x: textX, y: pageHeight - (textTopFromTop + textHeight * 0.78), size: currentSize, font, color: rgb(0, 0, 0) })
        }

        const drawDeviceMaker = (text: unknown, page: PDFPage, pageH: number, cellX: number, cellW: number, cellTop: number, cellH: number, baseFontSize = 5.6) => {
            const norm = normalizeText(text)
            if (!norm) return
            const padX = 1
            const availW = cellW - padX * 2
            let sz = baseFontSize
            const w = customFont.widthOfTextAtSize(norm, sz)
            if (w > availW) sz = sz * (availW / w) * 0.98
            sz = Math.max(sz, 3.5)
            const th = customFont.heightAtSize(sz, { descender: true })
            const textTop = cellTop + (cellH - th) / 2
            page.drawText(norm, { x: cellX + padX, y: pageH - (textTop + th * 0.78), size: sz, font: customFont, color: rgb(0, 0, 0) })
        }

        // 3サブ列: 避難口 (x=222.7, w=47.2), 通路 (x=269.9, w=36.8), 客席 (x=306.7, w=36.7)
        const COL_HINAN = { x: 222.7, w: 47.2 }
        const COL_TSURO = { x: 269.9, w: 36.8 }
        const COL_KYAKU = { x: 306.7, w: 36.7 }

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
                const cSize = sizes?.content ?? 6.3
                // 避難口列 (content)
                drawWrappedInCell(page, pageHeight, row.content, COL_HINAN.x, top, COL_HINAN.w, h, cSize)
                // 通路列
                drawWrappedInCell(page, pageHeight, row.content_tsuro, COL_TSURO.x, top, COL_TSURO.w, h, cSize)
                // 客席列
                drawWrappedInCell(page, pageHeight, row.content_kyaku, COL_KYAKU.x, top, COL_KYAKU.w, h, cSize)
                drawInCell(page, pageHeight, row.judgment, cols.judgmentX, top, cols.judgmentW, h, sizes?.judgment ?? 7.4, { align: "center" })
                drawWrappedInCell(page, pageHeight, row.bad_content, cols.badX, top, cols.badW, h, sizes?.bad ?? 6.1)
                drawWrappedInCell(page, pageHeight, row.action_content, cols.actionX, top, cols.actionW, h, sizes?.action ?? 6.1)
            }
        }

        const drawHeader = (page: PDFPage, pageHeight: number) => {
            drawInCell(page, pageHeight, body.form_name, 122.64, 95.64, 241.08, 27.84, 8.2)
            drawInCell(page, pageHeight, body.fire_manager, 411.48, 95.64, 118.92, 27.84, 7.4)
            drawInCell(page, pageHeight, body.location, 122.64, 123.48, 241.08, 28.32, 8.0)
            drawInCell(page, pageHeight, body.witness, 411.48, 123.48, 118.92, 28.32, 7.4)
            // 点検種別はテンプレートに「機　器」が印刷済みのため描画不要

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
                drawInCell(page, pageHeight, periodText, 322.2, PERIOD_ROW.top, 208.2, PERIOD_ROW.h, 6.4)
            }

            drawInCell(page, pageHeight, body.inspector_name, 122.64, 173.28, 130.8, 56.76, 6.7)
            // 社名: label ends x≈349, TEL label starts x≈411 → data x=349, w=62
            // TEL: label ends x≈428, right edge x=530 → data x=428, w=102
            drawWrappedInCell(page, pageHeight, body.inspector_company, 349.2, 173.0, 62.0, 26.3, 6.0)
            drawInCell(page, pageHeight, body.inspector_tel, 428.4, 173.0, 101.5, 26.3, 6.2)
            drawInCell(page, pageHeight, body.inspector_address, 349.2, 199.56, 181.2, 30.48, 6.1)
        }

        drawHeader(page1, p1Height)

        drawResultRows(page1, p1Height, body.page1_rows ?? [], P1_ROW_BOUNDS, {
            contentX: 222.96,
            contentW: 120.72,
            judgmentX: 343.68,
            judgmentW: 47.28,
            badX: 390.96,
            badW: 69.84,
            actionX: 460.8,
            actionW: 69.6,
        }, { content: 6.4, judgment: 7.0, bad: 6.0, action: 6.0 })

        drawResultRows(page2, p2Height, body.page2_rows ?? [], P2_ROW_BOUNDS, {
            contentX: 222.96,
            contentW: 120.72,
            judgmentX: 343.68,
            judgmentW: 47.28,
            badX: 390.96,
            badW: 69.84,
            actionX: 460.8,
            actionW: 69.6,
        }, { content: 6.3, judgment: 7.0, bad: 6.0, action: 6.0 })

        drawWrappedInCell(page2, p2Height, body.notes, 85.92, 332.64, 444.48, 213.36, 6.8)

        const device1 = body.device1 ?? {}
        const device2 = body.device2 ?? {}
        const deviceRowTop = 560.04
        const deviceRowH = 21.36

        const devOpts: DrawOptions = { paddingX: 1 }
        drawInCell(page2, p2Height, device1.name, 85.92, deviceRowTop, 47.28, deviceRowH, 5.8)
        drawInCellWithFont(page2, p2Height, latinFont, device1.model, 133.2, deviceRowTop, 52.44, deviceRowH, 5.8, devOpts)
        drawInCell(page2, p2Height, formatJapaneseDateText(device1.calibrated_at), 185.64, deviceRowTop, 61.08, deviceRowH, 5.6)
        drawDeviceMaker(device1.maker, page2, p2Height, 246.72, 60.72, deviceRowTop, deviceRowH)

        drawInCell(page2, p2Height, device2.name, 308.4, deviceRowTop, 46.92, deviceRowH, 5.8)
        drawInCellWithFont(page2, p2Height, latinFont, device2.model, 355.32, deviceRowTop, 52.2, deviceRowH, 5.8, devOpts)
        drawInCell(page2, p2Height, formatJapaneseDateText(device2.calibrated_at), 407.52, deviceRowTop, 61.2, deviceRowH, 5.6)
        drawDeviceMaker(device2.maker, page2, p2Height, 468.72, 61.68, deviceRowTop, deviceRowH)

        const pdfBytes = await pdfDoc.save()
        return new NextResponse(pdfBytes as unknown as BodyInit, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": 'attachment; filename="s50_kokuji14_bekki16_filled.pdf"',
            },
        })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 })
    }
}
