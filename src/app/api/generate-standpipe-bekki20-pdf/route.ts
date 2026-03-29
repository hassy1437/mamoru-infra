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

type Bekki20Payload = {
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
    326.4, 341.64, 356.88, 372.12, 387.36, 402.6, 417.84, 433.08, 457.68, 472.92, 488.16, 503.4,
    518.64, 533.88, 549.12, 564.36, 579.6, 594.84, 610.08, 625.44, 640.68, 655.92, 671.16, 686.4,
    701.64, 717.12,
]

const P2_ROW_BOUNDS = [
    83.52, 101.52, 119.76, 138.0, 156.24, 174.48, 192.72, 210.96, 229.2, 247.44, 265.8, 284.04,
    302.28, 320.52, 338.76, 357.0, 375.24, 393.48, 411.72, 429.96, 448.2, 466.44, 484.8, 503.04,
    521.28, 539.52, 557.76, 576.0, 594.24, 612.48, 630.72, 648.96, 667.2, 685.44, 703.8, 722.28,
]

// 83.52 は「総合点検」ヘッダー行 → データ行は 103.2 から
const P3_ROW_BOUNDS = [103.2, 123.24, 143.28, 163.2]

const PERIOD_ROW = { top: 160.56, h: 24.48 }
const PERIOD_START_ANCHORS: DateAnchors = { year: 347.16, month: 378.61, day: 410.17 }
const PERIOD_END_ANCHORS: DateAnchors = { year: 452.18, month: 483.74, day: 515.19 }

export async function POST(req: NextRequest) {
    try {
        const body = (await req.json()) as Bekki20Payload

        const candidatePdfPaths = [
            path.join(process.cwd(), "public", "PDF", "s50_kokuji14_bekki20.pdf"),
            path.join(process.cwd(), "public", "s50_kokuji14_bekki20.pdf"),
        ]
        const pdfPath = candidatePdfPaths.find((v) => fs.existsSync(v))
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf")
        if (!pdfPath) throw new Error("Template PDF not found: s50_kokuji14_bekki20.pdf")

        const pdfDoc = await PDFDocument.load(fs.readFileSync(pdfPath))
        pdfDoc.registerFontkit(fontkit)
        const customFont = await pdfDoc.embedFont(fs.readFileSync(fontPath))
        const latinFont = await pdfDoc.embedFont(StandardFonts.Helvetica)

        const normalizeText = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim()

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

        const drawSelectionCircle = (page: PDFPage, pageHeight: number, value: string, options: { label: string; cx: number; cy: number; rx: number; ry: number }[]) => {
            const norm = normalizeText(value)
            if (!norm) return
            for (const opt of options) {
                if (norm.includes(opt.label)) {
                    const cy = pageHeight - opt.cy
                    page.drawEllipse({ x: opt.cx, y: cy, xScale: opt.rx, yScale: opt.ry, borderWidth: 0.8, borderColor: rgb(0, 0, 0), color: undefined, opacity: 0 })
                }
            }
        }

        const drawResultRows = (page: PDFPage, pageHeight: number, rows: BekkiRow[], rowBounds: number[], cols: ResultColumns, skipContentRows?: Set<number>) => {
            for (let i = 0; i < rowBounds.length - 1; i += 1) {
                const row = rows[i]
                if (!row) continue
                const top = rowBounds[i]
                const h = rowBounds[i + 1] - top
                if (!skipContentRows?.has(i)) {
                    drawWrappedInCell(page, pageHeight, row.content, cols.contentX, top, cols.contentW, h, 6.0)
                }
                drawInCell(page, pageHeight, row.judgment, cols.judgmentX, top, cols.judgmentW, h, 7.0, { align: "center" })
                drawWrappedInCell(page, pageHeight, row.bad_content, cols.badX, top, cols.badW, h, 5.9)
                drawWrappedInCell(page, pageHeight, row.action_content, cols.actionX, top, cols.actionW, h, 5.9)
            }
        }

        const drawHeader = () => {
            drawInCell(page1, p1Height, body.form_name, 117.24, 108.24, 294.0, 27.84, 8.1)
            drawInCell(page1, p1Height, body.fire_manager, 411.24, 108.24, 118.8, 27.84, 7.3)
            drawInCell(page1, p1Height, body.location, 117.24, 136.08, 294.0, 24.48, 7.9)
            drawInCell(page1, p1Height, body.witness, 411.24, 136.08, 118.8, 24.48, 7.3)
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
                        page: page1,
                        pageHeight: p1Height,
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
                        page: page1,
                        pageHeight: p1Height,
                        font: customFont,
                        dateValue: body.period_end,
                        anchors: PERIOD_END_ANCHORS,
                        rowTop: PERIOD_ROW.top,
                        rowHeight: PERIOD_ROW.h,
                        fontSize: 6.2,
                    })
                }
            } else {
                drawInCell(page1, p1Height, periodText, 316.8, PERIOD_ROW.top, 213.24, PERIOD_ROW.h, 6.2)
            }

            drawInCell(page1, p1Height, body.inspector_name, 117.24, 185.04, 136.08, 55.56, 6.4)
            // 社名: label x=321-342, TEL label x=426-442, right edge x=530
            // 社名 data: after label (x=343) to before TEL label (x=425) → w=82
            // TEL data: after TEL label (x=443) to right edge (x=530) → w=87
            drawWrappedInCell(page1, p1Height, body.inspector_company, 343.0, 185.04, 82.0, 27.84, 5.8)
            drawInCell(page1, p1Height, body.inspector_tel, 443.0, 185.04, 87.0, 27.84, 6.0)
            // 住所: label x=321-342, right edge x=530
            drawInCell(page1, p1Height, body.inspector_address, 343.0, 212.88, 187.0, 27.72, 5.9)

            drawInCell(page1, p1Height, body.extra_fields?.motor_maker, 222.24, 240.6, 105.6, 20.04, 6.0)
            drawInCellWithFont(page1, p1Height, latinFont, body.extra_fields?.motor_model, 222.24, 260.64, 105.6, 20.04, 6.0, { paddingX: 2 })
            drawInCell(page1, p1Height, body.extra_fields?.pump_maker, 421.2, 240.6, 108.84, 20.04, 6.0)
            drawInCellWithFont(page1, p1Height, latinFont, body.extra_fields?.pump_model, 421.2, 260.64, 108.84, 20.04, 6.0, { paddingX: 2 })
        }

        drawHeader()

        const commonCols: ResultColumns = {
            contentX: 222.24,
            contentW: 115.56,
            judgmentX: 337.8,
            judgmentW: 36.72,
            badX: 374.52,
            badW: 78.72,
            actionX: 453.24,
            actionW: 76.8,
        }

        drawResultRows(page1, p1Height, body.page1_rows ?? [], P1_ROW_BOUNDS, commonCols, new Set([
            7,  // ホース・ノズル: m×本 mm → 手動3分割描画
            17, // 電圧計・電流計: V A → 手動V/A分割描画
        ]))
        drawResultRows(page2, p2Height, body.page2_rows ?? [], P2_ROW_BOUNDS, commonCols, new Set([
            7,  // 機能: テンプレートに「専用 兼用」印刷済み → circle
            18, // 性能: MPa L/min → 手動2分割描画
        ]))
        drawResultRows(page3, p3Height, body.page3_rows ?? [], P3_ROW_BOUNDS, commonCols)

        // === P1 Row 7: ホース・ノズル (m × 本 mm) ===
        // Template: "ホース___m × ___本  ノズル径___mm"
        // m label at x≈258, × at x≈268, 本 at x≈289, mm at x≈321-332
        const p1Rows = body.page1_rows ?? []
        const hoseRow = p1Rows[7]
        if (hoseRow) {
            const hTop = P1_ROW_BOUNDS[7]
            const hH = P1_ROW_BOUNDS[8] - hTop
            const hContent = normalizeText(hoseRow.content)
            // content format: "20/2/25" or "20" (m value)
            // content = m value, content_tsuro (reuse) = 本 value, content_kyaku (reuse) = mm value
            // Or use "/" separator: "20/2/25"
            if (hContent.includes("/")) {
                const parts = hContent.split("/")
                // m value: between ホース label and ×
                drawInCellWithFont(page1, p1Height, latinFont, parts[0]?.trim(), 236, hTop + hH / 2, 22, hH / 2, 6.0, { paddingX: 0.5 })
                // 本 value: between × and 本
                drawInCellWithFont(page1, p1Height, latinFont, parts[1]?.trim(), 270, hTop + hH / 2, 18, hH / 2, 6.0, { paddingX: 0.5 })
                // mm value: before mm label
                drawInCellWithFont(page1, p1Height, latinFont, parts[2]?.trim(), 305, hTop + hH / 2, 16, hH / 2, 6.0, { paddingX: 0.5 })
            } else if (hContent) {
                drawInCellWithFont(page1, p1Height, latinFont, hContent, 236, hTop + hH / 2, 22, hH / 2, 6.0, { paddingX: 0.5 })
            }
        }

        // === P1 Row 17: 電圧計・電流計 (V / A) ===
        // Template: "V" at x≈270.5, "A" at x≈323 (in content cell x=222-338)
        const voltRow = p1Rows[17]
        if (voltRow) {
            const vTop = P1_ROW_BOUNDS[17]
            const vH = P1_ROW_BOUNDS[18] - vTop
            const vContent = normalizeText(voltRow.content)
            if (vContent.includes("/")) {
                const parts = vContent.split("/")
                // V value: x=222 to before V label (x=270)
                drawInCellWithFont(page1, p1Height, latinFont, parts[0]?.trim(), 222, vTop, 48, vH, 6.0, { paddingX: 1 })
                // A value: after V label to before A label (x=270-323)
                drawInCellWithFont(page1, p1Height, latinFont, parts[1]?.trim(), 280, vTop, 42, vH, 6.0, { paddingX: 1 })
            } else if (vContent) {
                drawInCellWithFont(page1, p1Height, latinFont, vContent, 222, vTop, 48, vH, 6.0, { paddingX: 1 })
            }
        }

        // === P2 Row 7: 機能 (専用/兼用) circle ===
        const p2Rows = body.page2_rows ?? []
        const funcRow = p2Rows[7]
        if (funcRow) {
            drawSelectionCircle(page2, p2Height, funcRow.content ?? "", [
                { label: "専用", cx: 259.0, cy: 222.0, rx: 16, ry: 7 },
                { label: "兼用", cx: 301.0, cy: 222.0, rx: 16, ry: 7 },
            ])
        }

        // === P2 Row 18: 性能 (MPa / L/min) ===
        // Template: "MPa" at x≈260-276, "L/min" at x≈307-334
        const perfRow = p2Rows[18]
        if (perfRow) {
            const pTop = P2_ROW_BOUNDS[18]
            const pH = P2_ROW_BOUNDS[19] - pTop
            const pContent = normalizeText(perfRow.content)
            if (pContent.includes("/")) {
                const parts = pContent.split("/")
                // MPa value: before MPa label
                drawInCellWithFont(page2, p2Height, latinFont, parts[0]?.trim(), 232, pTop, 27, pH, 6.0, { paddingX: 0.5 })
                // L/min value: between MPa and L/min labels
                drawInCellWithFont(page2, p2Height, latinFont, parts[1]?.trim(), 280, pTop, 26, pH, 6.0, { paddingX: 0.5 })
            } else if (pContent) {
                drawInCellWithFont(page2, p2Height, latinFont, pContent, 232, pTop, 27, pH, 6.0, { paddingX: 0.5 })
            }
        }

        drawWrappedInCell(page3, p3Height, body.notes, 86.04, 163.2, 444.0, 477.36, 6.8)

        const device1 = body.device1 ?? {}
        const device2 = body.device2 ?? {}
        const deviceRowTop = 660.6
        const deviceRowH = 19.92

        const devOpts: DrawOptions = { paddingX: 1 }
        drawInCell(page3, p3Height, device1.name, 86.04, deviceRowTop, 55.56, deviceRowH, 5.8)
        drawInCellWithFont(page3, p3Height, latinFont, device1.model, 141.6, deviceRowTop, 55.44, deviceRowH, 5.8, devOpts)
        drawInCell(page3, p3Height, formatJapaneseDateText(device1.calibrated_at), 197.04, deviceRowTop, 55.56, deviceRowH, 5.6)
        drawDeviceMaker(device1.maker, page3, p3Height, 252.6, 54.96, deviceRowTop, deviceRowH)

        drawInCell(page3, p3Height, device2.name, 308.52, deviceRowTop, 55.08, deviceRowH, 5.8)
        drawInCellWithFont(page3, p3Height, latinFont, device2.model, 363.6, deviceRowTop, 55.44, deviceRowH, 5.8, devOpts)
        drawInCell(page3, p3Height, formatJapaneseDateText(device2.calibrated_at), 419.04, deviceRowTop, 55.56, deviceRowH, 5.6)
        drawDeviceMaker(device2.maker, page3, p3Height, 474.6, 55.44, deviceRowTop, deviceRowH)

        const pdfBytes = await pdfDoc.save()
        return new NextResponse(pdfBytes as unknown as BodyInit, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": 'attachment; filename="s50_kokuji14_bekki20_filled.pdf"',
            },
        })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 })
    }
}
