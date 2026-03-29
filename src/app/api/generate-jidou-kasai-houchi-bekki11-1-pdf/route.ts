import { NextRequest, NextResponse } from "next/server"
import { PDFDocument, rgb, type PDFPage, StandardFonts } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"
import fs from "fs"
import path from "path"
import { drawWrappedTextInCell, formatJapaneseDateText } from "@/lib/pdf-form-helpers"
import { normalizeInspectorNameValue, normalizeWitnessValue } from "@/lib/bekki-header-normalization"

type BekkiRow = { content?: string; judgment?: string; bad_content?: string; action_content?: string }
type DeviceRow = { name?: string; model?: string; calibrated_at?: string; maker?: string }

type Bekki11Payload = {
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
    294.0, 308.0, 322.0, 336.0, 350.0, 364.0, 378.0, 392.0, 406.0, 420.0, 434.0,
    448.0, 462.0, 476.0, 490.0, 504.0, 518.0, 532.0, 546.0, 560.0, 574.0, 588.0,
    602.0, 616.0, 630.0, 644.0, 658.0, 672.0, 686.0,
]

const P2_ROW_BOUNDS = [
    82.67, 106.0, 128.67, 152.0, 174.67, 198.0, 220.67, 244.0, 266.67, 290.0,
    312.67, 336.0, 358.67, 382.0, 404.67, 428.0, 450.67, 474.0, 496.67, 520.0,
    542.67, 566.0, 588.67, 612.0, 634.67, 658.0,
]

const P3_ROW_BOUNDS = [
    82.67, 106.0, 128.67, 152.0, 174.67, 198.0, 220.67, 244.0, 266.67, 290.0,
    313.33, 336.67, 359.33,
]

const PERIOD_ROW = { top: 162.0, h: 14.0 }
const PERIOD_START_ANCHORS = { year: 312.0, month: 352.7, day: 388.7 }
const PERIOD_END_ANCHORS = { year: 436.0, month: 472.0, day: 510.0 }

const normalizeText = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim()
const getExtra = (body: Bekki11Payload, key: string) => normalizeText(body.extra_fields?.[key])

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
        const body = (await req.json()) as Bekki11Payload
        const normalizedWitness = normalizeWitnessValue(body.witness)
        const normalizedInspectorName = normalizeInspectorNameValue(body.inspector_name)
        const candidatePdfPaths = [
            path.join(process.cwd(), "public", "PDF", "s50_kokuji14_bekki11_1.pdf"),
            path.join(process.cwd(), "public", "s50_kokuji14_bekki11_1.pdf"),
        ]
        const pdfPath = candidatePdfPaths.find((v) => fs.existsSync(v))
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf")
        if (!pdfPath) throw new Error("Template PDF not found: s50_kokuji14_bekki11_1.pdf")

        const pdfDoc = await PDFDocument.load(fs.readFileSync(pdfPath))
        pdfDoc.registerFontkit(fontkit)
        const customFont = await pdfDoc.embedFont(fs.readFileSync(fontPath))
        const latinFont = await pdfDoc.embedFont(StandardFonts.Helvetica)

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
            const paddingY = options?.paddingY ?? 1.6
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
            page.drawText(textToDraw, { x: textX, y: pageHeight - (textTop + baselineOffset), size: currentSize, font: customFont, color: rgb(0, 0, 0) })
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

        const drawDeviceMaker = (text: unknown, page: PDFPage, pageH: number, cellX: number, cellW: number, cellTop: number, cellH: number, baseFontSize = 6.0) => {
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
            page.drawText(norm, {
                x: cellX + padX,
                y: pageH - (textTop + th * 0.78),
                size: sz,
                font: customFont,
                color: rgb(0, 0, 0),
            })
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

        const drawResultRows = (page: PDFPage, pageHeight: number, rows: BekkiRow[], rowBounds: number[], cols: ResultColumns, skipContentRows?: Set<number>, skipAllRows?: Set<number>) => {
            for (let i = 0; i < rowBounds.length - 1; i += 1) {
                const row = rows[i]
                if (!row) continue
                if (skipAllRows?.has(i)) continue
                const top = rowBounds[i]
                const h = rowBounds[i + 1] - top
                if (!skipContentRows?.has(i)) {
                    drawWrappedInCell(page, pageHeight, row.content, cols.contentX, top, cols.contentW, h, 6.3)
                }
                drawInCell(page, pageHeight, row.judgment, cols.judgmentX, top, cols.judgmentW, h, 7.8, { align: "center" })
                drawWrappedInCell(page, pageHeight, row.bad_content, cols.badX, top, cols.badW, h, 6.1)
                drawWrappedInCell(page, pageHeight, row.action_content, cols.actionX, top, cols.actionW, h, 6.1)
            }
        }

        const drawRightAt = (
            page: PDFPage,
            pageHeight: number,
            text: string,
            anchorX: number,
            rowTop: number,
            rowH: number,
            size = 7.0,
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
            drawRightAt(page1, p1Height, parts.year, anchors.year, PERIOD_ROW.top, PERIOD_ROW.h, 7.0)
            drawRightAt(page1, p1Height, parts.month, anchors.month, PERIOD_ROW.top, PERIOD_ROW.h, 7.0)
            drawRightAt(page1, p1Height, parts.day, anchors.day, PERIOD_ROW.top, PERIOD_ROW.h, 7.0)
        }

        // page1 header
        drawInCell(page1, p1Height, body.form_name, 122.76, 114.0, 267.0, 24.0, 8.3)
        drawInCell(page1, p1Height, body.fire_manager, 448.67, 114.0, 80.66, 24.0, 7.8)
        drawInCell(page1, p1Height, body.location, 122.76, 138.0, 267.0, 24.0, 7.6)
        drawInCell(page1, p1Height, normalizedWitness, 448.67, 138.0, 80.66, 24.0, 7.8)
        const periodText = (() => {
            const start = formatDateText(body.period_start)
            const end = formatDateText(body.period_end)
            return start && end ? `${start} - ${end}` : (start || end)
        })()
        if (parseDateParts(body.period_start) || parseDateParts(body.period_end)) {
            drawPeriodDate(body.period_start, PERIOD_START_ANCHORS)
            drawPeriodDate(body.period_end, PERIOD_END_ANCHORS)
        } else {
            drawInCell(page1, p1Height, periodText, 230.0, PERIOD_ROW.top, 299.33, PERIOD_ROW.h, 7.0)
        }
        drawInCell(page1, p1Height, normalizedInspectorName, 148.0, 176.0, 74.0, 48.0, 7.0)
        drawWrappedInCell(page1, p1Height, body.inspector_company, 310.72, 176.0, 86.0, 24.0, 6.2)
        drawInCell(page1, p1Height, body.inspector_tel, 420.0, 176.0, 109.33, 24.0, 6.4)
        drawInCell(page1, p1Height, body.inspector_address, 310.72, 200.0, 218.61, 24.0, 6.3)

        // 受信機: 製造者名 row (y=224.5-238.6), 型式等 row (y=238.6-252.5)
        // Data cell: x=265 (after label text) to x=529.6
        drawInCell(page1, p1Height, getExtra(body, "receiver_maker"), 265, 224.5, 264.6, 14.1, 6.8)
        drawInCellWithFont(page1, p1Height, latinFont, getExtra(body, "receiver_model"), 265, 238.6, 264.6, 13.9, 6.8, { paddingX: 2 })

        drawResultRows(page1, p1Height, body.page1_rows ?? [], P1_ROW_BOUNDS, {
            contentX: 230.0, contentW: 105.33,
            judgmentX: 335.33, judgmentW: 32.0,
            badX: 367.33, badW: 81.34,
            actionX: 448.67, actionW: 80.66,
        })

        drawResultRows(page2, p2Height, body.page2_rows ?? [], P2_ROW_BOUNDS, {
            contentX: 230.0, contentW: 110.67,
            judgmentX: 340.67, judgmentW: 32.0,
            badX: 372.67, badW: 78.0,
            actionX: 450.67, actionW: 78.66,
        }, new Set([
            5,  // スポット型(熱): テンプレートに「差動 定温 (再) 熱アナログ」印刷済み → circle
            9,  // スポット型(煙): テンプレートに「イオン 光電 アナログ」印刷済み → circle
            11, // 炎感知器: テンプレートに「赤外線 紫外線」印刷済み → circle
            22, // 鳴動方式: テンプレートに「一斉 区分 相互 再鳴動」印刷済み → circle
        ]))

        // P2 Row 5: スポット型(熱) — 差動 定温 (再) 熱アナログ
        const p2Rows = body.page2_rows ?? []
        if (p2Rows[5]) {
            drawSelectionCircle(page2, p2Height, p2Rows[5].content ?? "", [
                { label: "差動", cx: 242.5, cy: 211.5, rx: 13, ry: 7 },
                { label: "定温", cx: 262.2, cy: 211.5, rx: 13, ry: 7 },
                { label: "再", cx: 281.5, cy: 211.5, rx: 10, ry: 7 },
                { label: "熱アナログ", cx: 317.0, cy: 211.5, rx: 18, ry: 7 },
            ])
        }
        // P2 Row 9: スポット型(煙) — イオン 光電 アナログ
        if (p2Rows[9]) {
            drawSelectionCircle(page2, p2Height, p2Rows[9].content ?? "", [
                { label: "イオン", cx: 247.0, cy: 302.3, rx: 16, ry: 7 },
                { label: "光電", cx: 278.0, cy: 302.3, rx: 14, ry: 7 },
                { label: "アナログ", cx: 316.0, cy: 302.3, rx: 18, ry: 7 },
            ])
        }
        // P2 Row 11: 炎感知器 — 赤外線 紫外線
        if (p2Rows[11]) {
            drawSelectionCircle(page2, p2Height, p2Rows[11].content ?? "", [
                { label: "赤外線", cx: 262.0, cy: 348.3, rx: 18, ry: 7 },
                { label: "紫外線", cx: 304.0, cy: 348.3, rx: 18, ry: 7 },
            ])
        }
        // P2 Row 22: 鳴動方式 — 一斉 区分 相互 再鳴動
        if (p2Rows[22]) {
            drawSelectionCircle(page2, p2Height, p2Rows[22].content ?? "", [
                { label: "一斉", cx: 243.0, cy: 601.8, rx: 13, ry: 7 },
                { label: "区分", cx: 267.0, cy: 601.8, rx: 13, ry: 7 },
                { label: "相互", cx: 290.0, cy: 601.8, rx: 13, ry: 7 },
                { label: "再鳴動", cx: 320.0, cy: 601.8, rx: 16, ry: 7 },
            ])
        }

        drawResultRows(page3, p3Height, body.page3_rows ?? [], P3_ROW_BOUNDS, {
            contentX: 222.0, contentW: 105.0,
            judgmentX: 327.0, judgmentW: 34.5,
            badX: 361.5, badW: 84.0,
            actionX: 445.5, actionW: 84.0,
        }, undefined, new Set([
            7, // 「総合点検」ヘッダー行 → content/judgment含め全スキップ
        ]))

        drawWrappedInCell(page3, p3Height, body.notes, 80.0, 359.33, 449.33, 180.0, 7.0)

        const device1 = body.device1 ?? {}
        const device2 = body.device2 ?? {}
        // page3 bottom measurement table (approx.)
        const deviceTableTop = 560.8
        const deviceTableRowH = 20.8
        const devOpts: DrawOptions = { paddingX: 1 }
        // 機器名はテンプレートに印刷済み（加熱試験器/メーターリレー試験器/加煙試験器/炎感知器用作動試験器）
        drawInCellWithFont(page3, p3Height, latinFont, device1.model, 158.0, deviceTableTop, 32.8, deviceTableRowH, 6.4, devOpts)
        drawInCell(page3, p3Height, formatJapaneseDateText(device1.calibrated_at), 194.8, deviceTableTop, 53.2, deviceTableRowH, 5.2)
        drawDeviceMaker(device1.maker, page3, p3Height, 252.0, 52.4, deviceTableTop, deviceTableRowH)
        drawInCellWithFont(page3, p3Height, latinFont, device2.model, 382.4, deviceTableTop, 32.8, deviceTableRowH, 6.2, devOpts)
        drawInCell(page3, p3Height, formatJapaneseDateText(device2.calibrated_at), 419.2, deviceTableTop, 53.2, deviceTableRowH, 5.2)
        drawDeviceMaker(device2.maker, page3, p3Height, 476.4, 53.2, deviceTableTop, deviceTableRowH)

        const pdfBytes = await pdfDoc.save()
        return new NextResponse(pdfBytes as unknown as BodyInit, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": 'attachment; filename="s50_kokuji14_bekki11_1_filled.pdf"',
            },
        })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 })
    }
}
