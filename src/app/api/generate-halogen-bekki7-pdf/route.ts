import { NextRequest, NextResponse } from "next/server"
import { PDFDocument, rgb, PDFPage, StandardFonts } from "pdf-lib"
import { buildFitError, createFitCollector, systemFitFailures } from "@/lib/pdf-fit-report"
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
    FIT_EPSILON,
} from "@/lib/pdf-form-helpers"
import { normalizeInspectorNameValue, normalizeWitnessValue } from "@/lib/bekki-header-normalization"

type Bekki7Row = {
    content?: string
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

type CylinderRow = {
    no?: string
    cylinder_no?: string
    spec1?: string
    spec2?: string
    spec3?: string
    // 旧形式（後方互換）
    measure1?: string
    measure2?: string
    measure3?: string
    measure4?: string
    measure5?: string
    measure6?: string
    // 新形式：6セル × (date, value)
    measure1_date?: string
    measure1_value?: string
    measure2_date?: string
    measure2_value?: string
    measure3_date?: string
    measure3_value?: string
    measure4_date?: string
    measure4_value?: string
    measure5_date?: string
    measure5_value?: string
    measure6_date?: string
    measure6_value?: string
}

type Bekki7Payload = {
    zone_name?: string
    equipment_system?: string
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
    page1_rows?: Bekki7Row[]
    page2_rows?: Bekki7Row[]
    page3_rows?: Bekki7Row[]
    page4_rows?: Bekki7Row[]
    notes?: string
    device1?: DeviceRow
    device2?: DeviceRow
    page5_rows?: CylinderRow[]
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
    292.67, 304.0, 315.33, 326.67, 338.0, 349.33, 360.67, 372.0, 383.33,
    394.67, 406.0, 417.33, 428.67, 440.0, 451.33, 462.67, 474.0, 485.33,
    496.67, 508.0, 519.33, 530.67, 542.0, 553.33, 564.67, 576.0, 587.33,
    598.67, 610.0, 622.0, 632.67, 644.67, 656.0, 667.33, 678.67, 690.0,
    701.33, 712.67,
]

const P2_ROW_BOUNDS = [
    82.67, 96.0, 110.0, 123.33, 136.67, 150.0, 163.33, 176.67, 190.0, 204.0,
    217.33, 230.67, 244.0, 257.33, 271.33, 284.67, 298.0, 311.33, 324.67,
    338.0, 352.0, 365.33, 378.67, 392.0, 405.33, 419.33, 432.67, 446.0,
    459.33, 472.67, 486.0, 500.0, 513.33, 526.67, 540.0, 553.33, 566.67,
    580.67, 594.0, 607.33, 620.67, 634.0, 647.33, 661.33, 674.67, 688.0,
    701.33, 714.67,
]

const P3_ROW_BOUNDS = [
    82.67, 106.0, 128.67, 152.0, 174.67, 198.0, 220.67, 244.0, 266.67, 290.0,
    312.67, 336.0, 358.67, 382.0, 404.67, 428.0, 450.67, 474.0, 496.67, 520.0,
    542.67, 566.0, 588.67, 612.0, 634.67, 658.0, 680.67, 704.0,
]

const P4_ROW_BOUNDS = [
    104.0, 124.67, 146.0, 166.67, 188.0, 208.67, 230.0, 250.67, 272.0, 292.67,
    314.0, 334.67,
]

const P5_ROW_BOUNDS = [
    173.33, 204.0, 234.0, 264.67, 295.33, 326.0, 356.0, 386.67, 417.33, 448.0,
    478.0, 508.67, 539.33, 570.0, 600.0, 630.67, 661.33, 692.0, 722.0, 752.67,
]

const P5_COLS = [64.0, 106.0, 164.0, 211.33, 258.67, 326.67, 360.67, 394.0, 428.0, 461.33, 495.33, 528.67]

const PERIOD_ROW = { top: 171.33, h: 16.0 }
const PERIOD_START_ANCHORS = { year: 293.33, month: 334.67, day: 376.67 }
const PERIOD_END_ANCHORS = { year: 430.0, month: 471.33, day: 513.33 }

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
        const body = (await req.json()) as Bekki7Payload
        const normalizedWitness = normalizeWitnessValue(body.witness)
        const normalizedInspectorName = normalizeInspectorNameValue(body.inspector_name)

        const candidatePdfPaths = [
            path.join(process.cwd(), "public", "PDF", "s50_kokuji14_bekki7.pdf"),
            path.join(process.cwd(), "public", "s50_kokuji14_bekki7.pdf"),
        ]
        const pdfPath = candidatePdfPaths.find((p) => fs.existsSync(p))
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf")

        if (!pdfPath) throw new Error("Template PDF not found: s50_kokuji14_bekki7.pdf")

        const existingPdfBytes = fs.readFileSync(pdfPath)
        const fontBytes = fs.readFileSync(fontPath)

        const pdfDoc = await PDFDocument.load(existingPdfBytes)
        pdfDoc.registerFontkit(fontkit)
        const customFont = await pdfDoc.embedFont(fontBytes)
        // ASCII(型式・番号・日付等)は Helvetica で描く。NotoSansJP は「英字+ハイフン+数字」で
        // 数字がCJK拡張Aのグリフに化け、計測幅と実描画幅が最大+41.6%ズレて枠をはみ出すため。
        const latinFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
        const fonts: ReportFonts = { jp: customFont, latin: latinFont, fit: createFitCollector() }

        const [page1, page2, page3, page4, page5] = pdfDoc.getPages()
        const p1Height = page1.getSize().height
        const p2Height = page2.getSize().height
        const p3Height = page3.getSize().height
        const p4Height = page4.getSize().height
        const p5Height = page5.getSize().height

        const truncateToFitWidth = (value: string, size: number, maxWidth: number) => {
            if (!value) return ""
            if (measureRuns(fonts, String(value ?? ""), size) <= maxWidth + FIT_EPSILON) return value

            const suffix = "..."
            if (measureRuns(fonts, String(suffix ?? ""), size) > maxWidth) return ""

            let cut = value.length
            while (cut > 0) {
                const candidate = `${value.slice(0, cut).trimEnd()}${suffix}`
                if (measureRuns(fonts, String(candidate ?? ""), size) <= maxWidth + FIT_EPSILON) {
                    fonts.fit?.report(value, cut)
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
            if (options?.align === "center") {
                textX = cellX + (cellW - textWidth) / 2
            }
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
                paddingX: 2.2,
                paddingY: 1.2,
                minFontSize: 3.5,
                lineGap: 0.7,
            },
        })

        const drawResultRows = (
            page: PDFPage,
            pageHeight: number,
            rows: Bekki7Row[],
            rowBounds: number[],
            columns: ResultColumns,
            skipContentRows: Set<number> = new Set(),
        ) => {
            for (let i = 0; i < rowBounds.length - 1; i += 1) {
                const row = rows[i]
                if (!row) continue
                const top = rowBounds[i]
                const h = rowBounds[i + 1] - rowBounds[i]

                if (!skipContentRows.has(i)) {
                    drawWrappedInCell(page, pageHeight, row.content, columns.contentX, top, columns.contentW, h, 6.6)
                }
                drawInCell(page, pageHeight, formatJudgment(row.judgment), columns.judgmentX, top, columns.judgmentW, h, 8.0, { align: "center" })
                drawWrappedInCell(page, pageHeight, row.bad_content, columns.badX, top, columns.badW, h, 6.4)
                drawWrappedInCell(page, pageHeight, row.action_content, columns.actionX, top, columns.actionW, h, 6.4)
            }
        }

        // 専用/兼用 など選択式セルに〇を描画（bekki9/20 と同一の loop版パターン）
        const drawSelectionCircle = (
            page: PDFPage,
            pageHeight: number,
            content: string,
            choices: Array<{ label: string; cx: number; cy: number; rx: number; ry: number }>,
        ) => {
            for (const c of choices) {
                if (!content.includes(c.label)) continue
                page.drawEllipse({
                    x: c.cx,
                    y: pageHeight - c.cy,
                    xScale: c.rx,
                    yScale: c.ry,
                    borderColor: rgb(0, 0, 0),
                    borderWidth: 0.7,
                })
            }
        }

        const drawRightAt = (
            page: PDFPage,
            pageHeight: number,
            text: string,
            anchorX: number,
            rowTop: number,
            rowH: number,
            size = 7.8,
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
            drawRightAt(page1, p1Height, parts.year, anchors.year, PERIOD_ROW.top, PERIOD_ROW.h, 7.8)
            drawRightAt(page1, p1Height, parts.month, anchors.month, PERIOD_ROW.top, PERIOD_ROW.h, 7.8)
            drawRightAt(page1, p1Height, parts.day, anchors.day, PERIOD_ROW.top, PERIOD_ROW.h, 7.8)
        }

        // 1セルを values.length 個の上下サブ領域に等分割し、各サブ領域に1値を描画する。
        // PR2: 測定セルで n=2 (date, value)
        // PR4: 様式6 測定セルで n=3 (date, temp, value) を想定（同関数を流用予定）
        const drawCellSubRegions = (
            page: PDFPage,
            pageHeight: number,
            values: Array<unknown>,
            cellX: number,
            cellTop: number,
            cellW: number,
            cellH: number,
            fontSize: number,
        ) => {
            const n = values.length
            if (n <= 0) return
            const subH = cellH / n
            for (let k = 0; k < n; k += 1) {
                drawWrappedInCell(page, pageHeight, values[k], cellX, cellTop + subH * k, cellW, subH, fontSize)
            }
        }

        const drawCylinderRows = (
            page: PDFPage,
            pageHeight: number,
            rows: CylinderRow[],
        ) => {
            for (let i = 0; i < P5_ROW_BOUNDS.length - 1; i += 1) {
                const row = rows[i]
                if (!row) continue
                const top = P5_ROW_BOUNDS[i]
                const h = P5_ROW_BOUNDS[i + 1] - top

                // 仕様域 (cols 0-4): 1セル=1値
                const specValues = [row.no, row.cylinder_no, row.spec1, row.spec2, row.spec3]
                for (let c = 0; c < specValues.length; c += 1) {
                    const x = P5_COLS[c]
                    const w = P5_COLS[c + 1] - P5_COLS[c]
                    drawWrappedInCell(page, pageHeight, specValues[c], x, top, w, h, 6.2)
                }

                // 測定域 (cols 5-10): 1セル=(date, value) 上下2段
                // 新キー _date/_value を優先、無ければ旧 measure{N} を value にフォールバック
                const legacy = [row.measure1, row.measure2, row.measure3, row.measure4, row.measure5, row.measure6]
                const dates = [row.measure1_date, row.measure2_date, row.measure3_date, row.measure4_date, row.measure5_date, row.measure6_date]
                const values = [row.measure1_value, row.measure2_value, row.measure3_value, row.measure4_value, row.measure5_value, row.measure6_value]
                for (let m = 0; m < 6; m += 1) {
                    const c = 5 + m
                    const x = P5_COLS[c]
                    const w = P5_COLS[c + 1] - P5_COLS[c]
                    const date = dates[m] ?? ""
                    const value = (values[m] && values[m] !== "") ? values[m] : (legacy[m] ?? "")
                    drawCellSubRegions(page, pageHeight, [date, value], x, top, w, h, 6.0)
                }
            }
        }

        // Page1 header
        drawInCell(page1, p1Height, body.zone_name, 470, 82, 54, 12, 7.6)
        drawInCell(page1, p1Height, body.equipment_system, 150, 100, 145, 12, 7.6)
        // ★セル境界の実測値（2026-07-24）: 63.6 | 106.0 …ラベル | 376.2 …名称/所在の値
        //   | 377.6 | 413.4 …ラベル | 528.7 …防火管理者/立会者
        //   旧値は幅266で 379.3 まで伸び、長い住所が罫線 376.2 を越えていた。
        drawInCell(page1, p1Height, body.form_name, 106.5, 114.7, 269.2, 27.9, 8.8)
        drawInCell(page1, p1Height, body.fire_manager, 413.9, 114.7, 114.3, 27.9, 8.4)
        drawInCell(page1, p1Height, body.location, 106.5, 143.0, 269.2, 27.9, 8.5)
        drawInCell(page1, p1Height, normalizedWitness, 413.9, 143.0, 114.3, 27.9, 8.3)
        const start = formatDateText(body.period_start)
        const end = formatDateText(body.period_end)
        if (parseDateParts(body.period_start) || parseDateParts(body.period_end)) {
            drawPeriodDate(body.period_start, PERIOD_START_ANCHORS)
            drawPeriodDate(body.period_end, PERIOD_END_ANCHORS)
        } else {
            const periodText = start && end ? `${start} - ${end}` : (start || end)
            drawInCell(page1, p1Height, periodText, 263.33, PERIOD_ROW.top, 265.34, PERIOD_ROW.h, 7.8)
        }

        drawInCell(page1, p1Height, normalizedInspectorName, 136.0, 187.33, 69.33, 48.0, 7.8)
        drawInCell(page1, p1Height, body.inspector_company, 299.0, 187.33, 139.0, 23.0, 7.0)
        drawInCell(page1, p1Height, body.inspector_tel, 461.0, 187.33, 67.67, 23.0, 7.0)
        drawInCell(page1, p1Height, body.inspector_address, 299.0, 210.0, 229.67, 25.33, 7.0)

        drawResultRows(page1, p1Height, body.page1_rows ?? [], P1_ROW_BOUNDS, {
            contentX: 232.0, contentW: 99.33,
            judgmentX: 331.33, judgmentW: 36.67,
            badX: 368.0, badW: 94.67,
            actionX: 462.67, actionW: 66.0,
        })

        drawResultRows(page2, p2Height, body.page2_rows ?? [], P2_ROW_BOUNDS, {
            contentX: 232.67, contentW: 94.0,
            judgmentX: 326.67, judgmentW: 36.66,
            badX: 363.33, badW: 99.34,
            actionX: 462.67, actionW: 66.66,
        }, new Set([26]))

        // PAGE2 row 26「起動装置 / 自動式 / 火災感知装置（専用・兼用）」: 公式PDF刷り込みの選択を丸囲み
        drawSelectionCircle(page2, p2Height, body.page2_rows?.[26]?.content ?? "", [
            { label: "専用", cx: 258.25, cy: 438.9, rx: 14, ry: 7 },
            { label: "兼用", cx: 298.2, cy: 438.9, rx: 14, ry: 7 },
        ])

        drawResultRows(page3, p3Height, body.page3_rows ?? [], P3_ROW_BOUNDS, {
            contentX: 232.67, contentW: 81.33,
            judgmentX: 314.0, judgmentW: 42.0,
            badX: 356.0, badW: 102.67,
            actionX: 458.67, actionW: 70.66,
        })

        drawResultRows(page4, p4Height, body.page4_rows ?? [], P4_ROW_BOUNDS, {
            contentX: 222.0, contentW: 94.67,
            judgmentX: 316.67, judgmentW: 42.0,
            badX: 358.67, badW: 104.66,
            actionX: 463.33, actionW: 65.34,
        })

        drawWrappedInCell(page4, p4Height, body.notes, 96.0, 334.67, 432.67, 294.0, 7.2)

        const device1 = body.device1 ?? {}
        const device2 = body.device2 ?? {}
        // ★点検に使用した機器の列。実測の列境界（2026-07-24）:
        //   80.5 | 148.8 | 202.6 | 256.4 | 309.7 ‖ 311.2 | 364.0 | 417.8 | 471.6 | 529.2
        //   旧値は device1 側が列より左にずれ、かつ列幅より狭く定義されていたため
        //   型式・校正年月日・製造者名が順に右の罫線を越えていた（device2 側は元から概ね一致）。
        const DEV_ROW = { top: 650.5, h: 20.5 }
        const DEV1_COLS = { name: [80.5, 68.3], model: [148.8, 53.8], date: [202.6, 53.8], maker: [256.4, 53.3] }
        const DEV2_COLS = { name: [311.2, 52.8], model: [364.0, 53.8], date: [417.8, 53.8], maker: [471.6, 57.6] }
        drawInCell(page4, p4Height, device1.name, DEV1_COLS.name[0], DEV_ROW.top, DEV1_COLS.name[1], DEV_ROW.h, 7.0)
        drawInCell(page4, p4Height, device1.model, DEV1_COLS.model[0], DEV_ROW.top, DEV1_COLS.model[1], DEV_ROW.h, 7.0)
        drawInCell(page4, p4Height, formatJapaneseDateText(device1.calibrated_at), DEV1_COLS.date[0], DEV_ROW.top, DEV1_COLS.date[1], DEV_ROW.h, 6.6)
        drawInCell(page4, p4Height, device1.maker, DEV1_COLS.maker[0], DEV_ROW.top, DEV1_COLS.maker[1], DEV_ROW.h, 6.8)

        drawInCell(page4, p4Height, device2.name, DEV2_COLS.name[0], DEV_ROW.top, DEV2_COLS.name[1], DEV_ROW.h, 7.0)
        drawInCell(page4, p4Height, device2.model, DEV2_COLS.model[0], DEV_ROW.top, DEV2_COLS.model[1], DEV_ROW.h, 7.0)
        drawInCell(page4, p4Height, formatJapaneseDateText(device2.calibrated_at), DEV2_COLS.date[0], DEV_ROW.top, DEV2_COLS.date[1], DEV_ROW.h, 6.6)
        drawInCell(page4, p4Height, device2.maker, DEV2_COLS.maker[0], DEV_ROW.top, DEV2_COLS.maker[1], DEV_ROW.h, 6.8)

        drawCylinderRows(page5, p5Height, body.page5_rows ?? [])

        // ⑧ 枠に収まらなかった項目があればPDFを返さずに一覧を返す。
        //   黙って "..." で切り詰めると、法定書類から情報が静かに欠落するため。
        fonts.fit?.resolve(body)
        const systemOverflow = systemFitFailures(fonts.fit!)
        if (systemOverflow.length) {
            // 業者には直せない（テンプレート固定文言・整形済みの値）＝実装側の不具合として記録
            console.error("[pdf] 収容不能(システム由来)", { form: "別記様式第7", items: systemOverflow })
        }
        const fitError = buildFitError("別記様式第7", fonts.fit!)
        if (fitError) return NextResponse.json(fitError, { status: 422 })

        const pdfBytes = await pdfDoc.save()
        return new NextResponse(pdfBytes as unknown as BodyInit, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": 'attachment; filename="s50_kokuji14_bekki7_filled.pdf"',
            },
        })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 })
    }
}


