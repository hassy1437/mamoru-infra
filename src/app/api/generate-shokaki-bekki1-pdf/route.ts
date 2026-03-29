import { NextRequest, NextResponse } from "next/server"
import { PDFDocument, rgb, PDFPage } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"
import fs from "fs"
import path from "path"
import { drawWrappedTextInCell, formatJapaneseDateText } from "@/lib/pdf-form-helpers"

type MarkKey = "A" | "B" | "C" | "D" | "E" | "F"

type BekkiRow = {
    marks?: Partial<Record<MarkKey, boolean>>
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

type SummaryRow = {
    kind?: string
    installed?: string
    inspected?: string
    passed?: string
    repair_needed?: string
    removed?: string
}

type BekkiPayload = {
    form_name?: string
    fire_manager?: string
    witness?: string
    location?: string
    period_start?: string
    period_end?: string
    inspector_name?: string
    inspector_company?: string
    inspector_address?: string
    inspector_tel?: string
    page1_rows?: BekkiRow[]
    page2_rows?: BekkiRow[]
    notes?: string
    device1?: DeviceRow
    device2?: DeviceRow
    summary_rows?: SummaryRow[]
}

type DrawOptions = {
    align?: "left" | "center"
    paddingX?: number
    paddingY?: number
    minFontSize?: number
    maxFontSize?: number
    xOffset?: number
    yOffset?: number
}

const MARK_KEYS: MarkKey[] = ["A", "B", "C", "D", "E", "F"]

const P1_TYPE_COLS: Array<{ x: number; w: number }> = [
    { x: 206.52, w: 18.36 },
    { x: 225.84, w: 17.52 },
    { x: 244.32, w: 17.28 },
    { x: 263.04, w: 17.04 },
    { x: 281.04, w: 17.4 },
    { x: 299.4, w: 17.4 },
]

const P2_TYPE_COLS: Array<{ x: number; w: number }> = [
    { x: 201.84, w: 18.0 },
    { x: 222.36, w: 19.2 },
    { x: 242.52, w: 19.08 },
    { x: 262.56, w: 19.2 },
    { x: 282.72, w: 19.2 },
    { x: 302.88, w: 19.2 },
]

const P1_ROW_BOUNDS = [
    319.8, 338.88, 357.84, 376.8, 395.88,
    414.84, 433.8, 452.88, 471.84, 490.8,
    509.88, 528.84, 547.8, 566.88, 585.84,
    604.8, 623.88, 642.84, 661.8, 681.36,
]

const P2_ROW_BOUNDS = [
    84.0, 101.52, 119.04, 136.44, 153.96,
    171.48, 189.0, 206.52, 224.04, 241.44,
    258.96, 276.48, 294.0, 337.44, 354.96,
    372.48, 390.0, 407.52, 425.04, 442.44, 459.96,
]

const PERIOD_ROW = { top: 167.52, h: 19.92 }
const PERIOD_START_ANCHORS = { year: 299.2, month: 330.6, day: 362.2 }
const PERIOD_END_ANCHORS = { year: 414.7, month: 446.4, day: 477.9 }

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
        const body = (await req.json()) as BekkiPayload

        const candidatePdfPaths = [
            path.join(process.cwd(), "public", "PDF", "s50_kokuji14_bekki1.pdf"),
            path.join(process.cwd(), "public", "s50_kokuji14_bekki1.pdf"),
        ]
        const pdfPath = candidatePdfPaths.find((p) => fs.existsSync(p))
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf")

        if (!pdfPath) {
            throw new Error("Template PDF not found: s50_kokuji14_bekki1.pdf")
        }

        const existingPdfBytes = fs.readFileSync(pdfPath)
        const fontBytes = fs.readFileSync(fontPath)

        const pdfDoc = await PDFDocument.load(existingPdfBytes)
        pdfDoc.registerFontkit(fontkit)
        const customFont = await pdfDoc.embedFont(fontBytes)

        const page1 = pdfDoc.getPages()[0]
        const page2 = pdfDoc.getPages()[1]
        const p1Height = page1.getSize().height
        const p2Height = page2.getSize().height

        const truncateToFitWidth = (value: string, size: number, maxWidth: number) => {
            if (!value) return ""
            if (customFont.widthOfTextAtSize(value, size) <= maxWidth) {
                return value
            }

            const suffix = "..."
            const suffixWidth = customFont.widthOfTextAtSize(suffix, size)
            if (suffixWidth > maxWidth) return ""

            let cut = value.length
            while (cut > 0) {
                const candidate = `${value.slice(0, cut).trimEnd()}${suffix}`
                if (customFont.widthOfTextAtSize(candidate, size) <= maxWidth) {
                    return candidate
                }
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

            const paddingX = options?.paddingX ?? 3
            const paddingY = options?.paddingY ?? 2
            const minFontSize = options?.minFontSize ?? 3.5
            let currentSize = Math.min(fontSize, options?.maxFontSize ?? fontSize)

            const maxWidth = Math.max(1, (cellW - paddingX * 2) * 0.85)
            const maxHeight = Math.max(1, cellH - paddingY * 2)

            const widthAtCurrent = customFont.widthOfTextAtSize(normalized, currentSize)
            if (widthAtCurrent > maxWidth) {
                currentSize = currentSize * (maxWidth / widthAtCurrent)
            }

            const heightAtCurrent = customFont.heightAtSize(currentSize, { descender: true })
            if (heightAtCurrent > maxHeight) {
                currentSize = currentSize * (maxHeight / heightAtCurrent)
            }

            currentSize = Math.max(currentSize, minFontSize)

            const textToDraw = truncateToFitWidth(normalized, currentSize, maxWidth)
            if (!textToDraw) return

            const textWidth = customFont.widthOfTextAtSize(textToDraw, currentSize)
            const textHeight = customFont.heightAtSize(currentSize, { descender: true })
            const xOffset = options?.xOffset ?? 0
            const yOffset = options?.yOffset ?? 0
            let textX = cellX + paddingX + xOffset

            if (options?.align === "center") {
                textX = cellX + (cellW - textWidth) / 2 + xOffset
            }

            const textTopFromTop = cellTopFromTop + (cellH - textHeight) / 2 + yOffset
            const baselineOffset = textHeight * 0.78

            page.drawText(textToDraw, {
                x: textX,
                y: pageHeight - (textTopFromTop + baselineOffset),
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
            fontSize = 8.4,
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
                paddingX: 3,
                paddingY: 2,
                minFontSize: 3.5,
                lineGap: 1,
            },
        })

        const drawMark = (
            page: PDFPage,
            pageHeight: number,
            mark: string,
            cellX: number,
            cellTop: number,
            cellW: number,
            cellH: number,
        ) => {
            drawInCell(page, pageHeight, mark, cellX, cellTop, cellW, cellH, 9.8, {
                align: "center",
                paddingX: 0,
                paddingY: 0,
                minFontSize: 8,
            })
        }

        const drawRightAt = (
            page: PDFPage,
            pageHeight: number,
            text: string,
            anchorX: number,
            rowTop: number,
            rowH: number,
            size = 8.1,
        ) => {
            if (!text) return
            const textHeight = customFont.heightAtSize(size, { descender: true })
            const textTop = rowTop + (rowH - textHeight) / 2
            const y = pageHeight - (textTop + textHeight * 0.78)
            const textWidth = customFont.widthOfTextAtSize(text, size)
            page.drawText(text, {
                x: anchorX - textWidth,
                y,
                size,
                font: customFont,
                color: rgb(0, 0, 0),
            })
        }

        const drawPeriodDate = (
            dateValue: unknown,
            anchors: { year: number; month: number; day: number },
        ) => {
            const parts = parseDateParts(dateValue)
            if (!parts) return

            drawRightAt(page1, p1Height, parts.year, anchors.year, PERIOD_ROW.top, PERIOD_ROW.h, 8.1)
            drawRightAt(page1, p1Height, parts.month, anchors.month, PERIOD_ROW.top, PERIOD_ROW.h, 8.1)
            drawRightAt(page1, p1Height, parts.day, anchors.day, PERIOD_ROW.top, PERIOD_ROW.h, 8.1)
        }

        drawInCell(page1, p1Height, body.form_name, 118.8, 111.48, 251.52, 27.96, 9.2)
        drawInCell(page1, p1Height, body.fire_manager, 411.84, 111.48, 117.72, 27.96, 8.6)
        drawInCell(page1, p1Height, body.location, 118.8, 139.44, 251.52, 28.08, 8.8)
        drawInCell(page1, p1Height, body.witness, 411.84, 139.44, 117.72, 28.08, 8.6)

        const periodStart = formatDateText(body.period_start)
        const periodEnd = formatDateText(body.period_end)
        if (parseDateParts(body.period_start) || parseDateParts(body.period_end)) {
            drawPeriodDate(body.period_start, PERIOD_START_ANCHORS)
            drawPeriodDate(body.period_end, PERIOD_END_ANCHORS)
        } else {
            const periodText = periodStart && periodEnd ? `${periodStart} - ${periodEnd}` : (periodStart || periodEnd)
            drawInCell(page1, p1Height, periodText, 208.92, PERIOD_ROW.top, 320.64, PERIOD_ROW.h, 8.8)
        }

        drawInCell(page1, p1Height, body.inspector_name, 117.84, 187.44, 88.2, 56.4, 8.8)
        drawInCell(page1, p1Height, body.inspector_company, 291.0, 187.44, 100.0, 28.44, 8.6)
        drawInCell(page1, p1Height, body.inspector_tel, 411.84, 187.44, 117.72, 28.44, 8.6)
        drawInCell(page1, p1Height, body.inspector_address, 291.0, 215.88, 237.0, 27.96, 8.4)

        const rows1 = body.page1_rows ?? []
        for (let i = 0; i < Math.min(rows1.length, P1_ROW_BOUNDS.length - 1); i += 1) {
            const row = rows1[i]
            const top = P1_ROW_BOUNDS[i]
            const bottom = P1_ROW_BOUNDS[i + 1]
            const h = bottom - top

            MARK_KEYS.forEach((k, colIndex) => {
                if (!row?.marks?.[k]) return
                const col = P1_TYPE_COLS[colIndex]
                drawMark(page1, p1Height, "\u30EC", col.x, top, col.w, h)
            })

            drawInCell(page1, p1Height, row.judgment, 317.76, top, 30.6, h, 9.2, { align: "center" })
            drawWrappedInCell(page1, p1Height, row.bad_content, 349.32, top, 93.48, h, 7.3)
            drawWrappedInCell(page1, p1Height, row.action_content, 444.24, top, 85.32, h, 7.3)
        }

        const rows2 = body.page2_rows ?? []
        for (let i = 0; i < Math.min(rows2.length, P2_ROW_BOUNDS.length - 1); i += 1) {
            const row = rows2[i]
            const top = P2_ROW_BOUNDS[i]
            const bottom = P2_ROW_BOUNDS[i + 1]
            const h = bottom - top

            MARK_KEYS.forEach((k, colIndex) => {
                if (!row?.marks?.[k]) return
                if (i >= 18) return // 簡易消化用具行（外形・水量等）はマーク列なし
                const col = P2_TYPE_COLS[colIndex]
                drawMark(page2, p2Height, "\u30EC", col.x, top, col.w, h)
            })

            drawInCell(page2, p2Height, row.judgment, 323.04, top, 36.24, h, 9.2, { align: "center" })
            drawWrappedInCell(page2, p2Height, row.bad_content, 359.5, top, 88.0, h, 7.2)
            drawWrappedInCell(page2, p2Height, row.action_content, 449.0, top, 80.0, h, 7.2)
        }

        drawWrappedInCell(page2, p2Height, body.notes, 80.52, 459.96, 449.04, 47.76, 7.9)

        // 測定機器: x V-lines: 81.0, 136.7, 192.8, 249.0, 304.7, 361.3, 417.5, 473.6, 529.6
        // H-lines: 507.7(header top), 524.6(data row1 top), 541.7, 558.7, 575.8
        const device1 = body.device1 ?? {}
        const device2 = body.device2 ?? {}
        const deviceTop = 524.6
        const deviceH = 17.1
        drawInCell(page2, p2Height, device1.name,         81.0,  deviceTop, 55.7, deviceH, 7.8)
        drawInCell(page2, p2Height, device1.model,       136.7,  deviceTop, 56.1, deviceH, 7.8)
        drawInCell(page2, p2Height, formatJapaneseDateText(device1.calibrated_at), 192.8, deviceTop, 56.2, deviceH, 7.2)
        drawInCell(page2, p2Height, device1.maker,       249.0,  deviceTop, 55.7, deviceH, 7.4)
        drawInCell(page2, p2Height, device2.name,        304.7,  deviceTop, 56.6, deviceH, 7.8)
        drawInCell(page2, p2Height, device2.model,       361.3,  deviceTop, 56.2, deviceH, 7.8)
        drawInCell(page2, p2Height, formatJapaneseDateText(device2.calibrated_at), 417.5, deviceTop, 56.1, deviceH, 7.2)
        drawInCell(page2, p2Height, device2.maker,       473.6,  deviceTop, 56.0, deviceH, 7.4)

        // 集計テーブル: H-lines: 582.6(ヘッダー上端), 598.7(ヘッダー下端=データrow0上端), 615.7, 632.6, 649.7, 666.7, 683.6, 700.7
        // V-lines (data rows): 65.5, 142.3, 219.8, 297.4, 374.8, 452.3, 529.6
        const summaryRows = body.summary_rows ?? []
        const summaryBounds = [599.2, 616.2, 633.1, 650.2, 667.2, 684.1, 700.7]
        for (let i = 0; i < Math.min(summaryRows.length, summaryBounds.length - 1); i += 1) {
            const row = summaryRows[i]
            const top = summaryBounds[i]
            const h = summaryBounds[i + 1] - summaryBounds[i]
            drawInCell(page2, p2Height, row.kind,          65.5, top, 76.8, h, 7.4, { align: "center" })
            drawInCell(page2, p2Height, row.installed,    142.3, top, 77.5, h, 7.4, { align: "center" })
            drawInCell(page2, p2Height, row.inspected,    219.8, top, 77.6, h, 7.4, { align: "center" })
            drawInCell(page2, p2Height, row.passed,       297.4, top, 77.4, h, 7.4, { align: "center" })
            drawInCell(page2, p2Height, row.repair_needed, 374.8, top, 77.5, h, 7.4, { align: "center" })
            drawInCell(page2, p2Height, row.removed,      452.3, top, 77.3, h, 7.4, { align: "center" })
        }

        const pdfBytes = await pdfDoc.save()
        return new NextResponse(pdfBytes as unknown as BodyInit, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": 'attachment; filename="s50_kokuji14_bekki1_filled.pdf"',
            },
        })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 })
    }
}

