import { NextRequest, NextResponse } from "next/server"
import { PDFDocument, rgb, type PDFPage, StandardFonts } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"
import fs from "fs"
import path from "path"
import {
    drawWrappedTextInCell,
    formatJapaneseDateText,
    formatJudgment,
    pickFont,
    type ReportFonts,
    measureRuns,
    drawTextRuns,
} from "@/lib/pdf-form-helpers"

type BekkiRow = { content?: string; judgment?: string; bad_content?: string; action_content?: string; hose_count?: string; nozzle_dia?: string }
type DeviceRow = { name?: string; model?: string; calibrated_at?: string; maker?: string }

type Bekki10Payload = {
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
    336.0, 350.67, 365.33, 380.0, 394.0, 408.67, 423.33, 438.0, 452.0, 466.67,
    481.33, 496.0, 510.0, 524.67, 539.33, 554.0, 568.0, 582.67, 597.33, 612.0,
    626.0, 640.67, 655.33, 670.0, 684.0, 698.67,
]

const P2_ROW_BOUNDS = [
    82.67, 104.0, 124.67, 146.0, 168.67, 190.0, 210.67, 232.0, 252.67, 274.0,
    294.67, 316.0, 336.67, 358.0,
]

const PERIOD_ROW = { top: 166.67, h: 28.0 }
const PERIOD_START_ANCHORS = { year: 293.3, month: 335.8, day: 377.3 }
const PERIOD_END_ANCHORS = { year: 430.3, month: 472.5, day: 514.0 }

const normalizeText = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim()
const getExtra = (body: Bekki10Payload, key: string) => normalizeText(body.extra_fields?.[key])

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
        const body = (await req.json()) as Bekki10Payload
        const candidatePdfPaths = [
            path.join(process.cwd(), "public", "PDF", "s50_kokuji14_bekki10.pdf"),
            path.join(process.cwd(), "public", "s50_kokuji14_bekki10.pdf"),
        ]
        const pdfPath = candidatePdfPaths.find((v) => fs.existsSync(v))
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf")
        if (!pdfPath) throw new Error("Template PDF not found: s50_kokuji14_bekki10.pdf")

        const pdfDoc = await PDFDocument.load(fs.readFileSync(pdfPath))
        pdfDoc.registerFontkit(fontkit)
        const customFont = await pdfDoc.embedFont(fs.readFileSync(fontPath))
        // ASCII(型式・番号・日付等)は Helvetica で描く。NotoSansJP は「英字+ハイフン+数字」で
        // 数字がCJK拡張Aのグリフに化け、計測幅と実描画幅が最大+41.6%ズレて枠をはみ出すため。
        const latinFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
        const fonts: ReportFonts = { jp: customFont, latin: latinFont }

        const [page1, page2] = pdfDoc.getPages()
        const p1Height = page1.getSize().height
        const p2Height = page2.getSize().height

        const truncateToFitWidth = (value: string, size: number, maxWidth: number) => {
            if (!value) return ""
            if (measureRuns(fonts, String(value ?? ""), size) <= maxWidth) return value

            const suffix = "..."
            if (measureRuns(fonts, String(suffix ?? ""), size) > maxWidth) return ""

            let cut = value.length
            while (cut > 0) {
                const candidate = `${value.slice(0, cut).trimEnd()}${suffix}`
                if (measureRuns(fonts, String(candidate ?? ""), size) <= maxWidth) return candidate
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

            // 安全係数は撤廃済み（①bで計測が実描画と一致し、②③④でセル座標を実測値に直したため）
            const maxWidth = Math.max(1, cellW - paddingX * 2)
            const maxHeight = Math.max(1, cellH - paddingY * 2)
            const widthAtCurrent = measureRuns(fonts, String(normalized ?? ""), currentSize)
            if (widthAtCurrent > maxWidth) currentSize *= maxWidth / widthAtCurrent
            const heightAtCurrent = fonts.jp.heightAtSize(currentSize, { descender: true })
            if (heightAtCurrent > maxHeight) currentSize *= maxHeight / heightAtCurrent
            currentSize = Math.max(currentSize, minFontSize)

            const textToDraw = truncateToFitWidth(normalized, currentSize, maxWidth)
            if (!textToDraw) return

            const textWidth = measureRuns(fonts, String(textToDraw ?? ""), currentSize)
            const textHeight = fonts.jp.heightAtSize(currentSize, { descender: true })
            let textX = cellX + paddingX
            if (options?.align === "center") textX = cellX + (cellW - textWidth) / 2
            const textTop = cellTopFromTop + (cellH - textHeight) / 2
            const baselineOffset = textHeight * 0.78
            drawTextRuns(page, fonts, String(textToDraw ?? ""), textX, pageHeight - (textTop + baselineOffset), currentSize)
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
            fonts,
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

        const drawResultRows = (page: PDFPage, pageHeight: number, rows: BekkiRow[], rowBounds: number[], columns: ResultColumns, skipContentRows: Set<number> = new Set()) => {
            for (let i = 0; i < rowBounds.length - 1; i += 1) {
                const row = rows[i]
                if (!row) continue
                const top = rowBounds[i]
                const h = rowBounds[i + 1] - top
                if (!skipContentRows.has(i)) {
                    drawWrappedInCell(page, pageHeight, row.content, columns.contentX, top, columns.contentW, h, 6.4)
                }
                drawInCell(page, pageHeight, formatJudgment(row.judgment), columns.judgmentX, top, columns.judgmentW, h, 7.8, { align: "center" })
                drawWrappedInCell(page, pageHeight, row.bad_content, columns.badX, top, columns.badW, h, 6.2)
                drawWrappedInCell(page, pageHeight, row.action_content, columns.actionX, top, columns.actionW, h, 6.2)
            }
        }

        const drawRightAt = (
            page: PDFPage,
            pageHeight: number,
            text: string,
            anchorX: number,
            rowTop: number,
            rowH: number,
            size = 7.6,
        ) => {
            if (!text) return
            const textHeight = fonts.jp.heightAtSize(size, { descender: true })
            const textTop = rowTop + (rowH - textHeight) / 2
            const y = pageHeight - (textTop + textHeight * 0.78)
            const textWidth = measureRuns(fonts, String(text ?? ""), size)
            drawTextRuns(page, fonts, String(text ?? ""), anchorX - textWidth, y, size)
        }

        const drawPeriodDate = (
            dateValue: unknown,
            anchors: { year: number; month: number; day: number },
        ) => {
            const parts = parseDateParts(dateValue)
            if (!parts) return
            drawRightAt(page1, p1Height, parts.year, anchors.year, PERIOD_ROW.top, PERIOD_ROW.h, 7.6)
            drawRightAt(page1, p1Height, parts.month, anchors.month, PERIOD_ROW.top, PERIOD_ROW.h, 7.6)
            drawRightAt(page1, p1Height, parts.day, anchors.day, PERIOD_ROW.top, PERIOD_ROW.h, 7.6)
        }

        // ★名称/所在の値セル幅はテンプレート罫線の実測値。旧値は右隣の「防火管理者/立会者」
        // ラベル欄まで食い込む幅で定義されており、長い住所が罫線を越えていた（2026-07-24 実測）。
        // header page1
        drawInCell(page1, p1Height, body.form_name, 107.3, 110.67, 266.7, 28.0, 8.8)
        drawInCell(page1, p1Height, body.fire_manager, 415.1, 110.67, 114.5, 28.0, 8.0)
        drawInCell(page1, p1Height, body.location, 107.3, 138.67, 266.7, 28.0, 8.2)
        drawInCell(page1, p1Height, body.witness, 415.1, 138.67, 114.5, 28.0, 8.0)
        drawInCell(page1, p1Height, body.inspection_type || "機器・総合", 106.67, 166.67, 104.66, 28.0, 7.6, { align: "center" })

        const periodText = (() => {
            const start = formatDateText(body.period_start)
            const end = formatDateText(body.period_end)
            return start && end ? `${start} - ${end}` : (start || end)
        })()
        if (parseDateParts(body.period_start) || parseDateParts(body.period_end)) {
            drawPeriodDate(body.period_start, PERIOD_START_ANCHORS)
            drawPeriodDate(body.period_end, PERIOD_END_ANCHORS)
        } else {
            drawInCell(page1, p1Height, periodText, 211.33, PERIOD_ROW.top, 318.0, PERIOD_ROW.h, 7.6)
        }

        drawInCell(page1, p1Height, body.inspector_name, 106.67, 194.67, 104.66, 52.66, 7.6)
        drawInCell(page1, p1Height, body.inspector_company, 306.0, 194.67, 131.33, 26.33, 7.4)
        drawInCell(page1, p1Height, body.inspector_tel, 437.33, 194.67, 92.0, 26.33, 7.4)
        drawInCell(page1, p1Height, body.inspector_address, 306.0, 221.0, 223.33, 26.33, 7.2)

        // The "本佁E cell is a fixed label in this template, so we do not draw equipment_name here.
        drawInCell(page1, p1Height, getExtra(body, "body_maker"), 264.4, 221.33, 264.93, 23.34, 7.2)
        drawInCell(page1, p1Height, getExtra(body, "body_model"), 264.4, 244.67, 264.93, 23.33, 7.2)

        drawResultRows(page1, p1Height, body.page1_rows ?? [], P1_ROW_BOUNDS, {
            contentX: 211.33, contentW: 94.67,
            judgmentX: 306.0, judgmentW: 36.67,
            badX: 342.67, badW: 94.66,
            actionX: 437.33, actionW: 92.0,
        })

        drawResultRows(page2, p2Height, body.page2_rows ?? [], P2_ROW_BOUNDS, {
            contentX: 217.0, contentW: 94.5,
            judgmentX: 311.5, judgmentW: 42.0,
            badX: 353.5, badW: 88.0,
            actionX: 441.5, actionW: 88.0,
        }, new Set([3]))

        // PAGE2 row 3「積載器具 / ホース・ノズル等 / 外形」: 長さ(m)/本数/口径(mm) を分割描画
        // 公式PDF実測: ｍ@238.4 / ×@248.9(x1=259.4) / 本@275.2(x1=285.7) / mm@296.2。content列左=217。
        // 新キー優先（content=長さ, hose_count=本数, nozzle_dia=口径）→ "/" 分割 → 単一content の3段fallback。値は各空白に中央寄せ
        const hoseRow10 = body.page2_rows?.[3]
        if (hoseRow10) {
            const hTop = P2_ROW_BOUNDS[3]
            const hH = P2_ROW_BOUNDS[4] - P2_ROW_BOUNDS[3]
            const hValTop = hTop + hH / 2 - 2
            const hValH = hH / 2 + 2
            const hContent = normalizeText(hoseRow10.content)
            const hCount = normalizeText(hoseRow10.hose_count)
            const nDia = normalizeText(hoseRow10.nozzle_dia)
            const drawLen = (v: string) => { if (v) drawInCell(page2, p2Height, v, 217, hValTop, 21.4, hValH, 6.0, { align: "center" }) }
            const drawCnt = (v: string) => { if (v) drawInCell(page2, p2Height, v, 259.4, hValTop, 15.8, hValH, 6.0, { align: "center" }) }
            const drawDia = (v: string) => { if (v) drawInCell(page2, p2Height, v, 285.7, hValTop, 10.5, hValH, 6.0, { align: "center" }) }
            if (hCount || nDia) {
                drawLen(hContent); drawCnt(hCount); drawDia(nDia)
            } else if (hContent.includes("/")) {
                const parts = hContent.split("/")
                drawLen(parts[0]?.trim() ?? ""); drawCnt(parts[1]?.trim() ?? ""); drawDia(parts[2]?.trim() ?? "")
            } else if (hContent) {
                drawLen(hContent)
            }
        }

        drawWrappedInCell(page2, p2Height, body.notes, 82.67, 358.0, 446.66, 266.0, 7.0)

        const device1 = body.device1 ?? {}
        const device2 = body.device2 ?? {}
        // page2 bottom measurement table (approx.)
        const deviceTableTop = 644.8
        const deviceTableRowH = 20.8
        drawInCell(page2, p2Height, device1.name, 82.8, deviceTableTop, 55.6, deviceTableRowH, 7.0)
        drawInCell(page2, p2Height, device1.model, 138.4, deviceTableTop, 56.0, deviceTableRowH, 7.0)
        drawInCell(page2, p2Height, formatJapaneseDateText(device1.calibrated_at), 194.4, deviceTableTop, 56.0, deviceTableRowH, 7.0)
        drawInCell(page2, p2Height, device1.maker, 250.4, deviceTableTop, 55.6, deviceTableRowH, 7.0)
        drawInCell(page2, p2Height, device2.name, 306.0, deviceTableTop, 56.0, deviceTableRowH, 7.0)
        drawInCell(page2, p2Height, device2.model, 362.0, deviceTableTop, 56.0, deviceTableRowH, 7.0)
        drawInCell(page2, p2Height, formatJapaneseDateText(device2.calibrated_at), 418.0, deviceTableTop, 55.6, deviceTableRowH, 7.0)
        drawInCell(page2, p2Height, device2.maker, 473.6, deviceTableTop, 56.0, deviceTableRowH, 7.0)

        const pdfBytes = await pdfDoc.save()
        return new NextResponse(pdfBytes as unknown as BodyInit, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": 'attachment; filename="s50_kokuji14_bekki10_filled.pdf"',
            },
        })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 })
    }
}
