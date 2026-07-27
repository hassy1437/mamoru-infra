import { NextRequest, NextResponse } from "next/server"
import { PDFDocument, rgb, PDFPage, StandardFonts } from "pdf-lib"
import {
    buildFitError,
    createFitCollector,
    fitWarningHeader,
    logFitDebug,
    systemFitFailures,
} from "@/lib/pdf-fit-report"
import fontkit from "@pdf-lib/fontkit"
import fs from "fs"
import path from "path"
import { FIT_EPSILON, drawChoiceCircle, drawTextInCell, drawTextRuns, drawWrappedTextInCell, formatJapaneseDateText, formatJudgment, measureRuns, pickFont, reportIfBelowMinSize, type ReportFonts } from "@/lib/pdf-form-helpers"

type Bekki8Row = {
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

type Bekki8Payload = {
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
    page1_rows?: Bekki8Row[]
    page2_rows?: Bekki8Row[]
    page3_rows?: Bekki8Row[]
    page4_rows?: Bekki8Row[]
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
    265.67, 277.0, 288.33, 299.67, 311.0, 322.33, 333.67, 345.0, 356.67,
    367.67, 379.33, 390.33, 402.0, 413.33, 424.67, 436.0, 447.33, 458.67,
    470.0, 481.67, 493.0, 504.33, 515.67, 527.0, 538.33, 549.67, 561.0,
    572.33, 583.67, 595.0, 606.33, 617.67, 629.0, 640.33, 651.67, 663.0,
    674.33, 685.67, 697.0, 708.67,
]

const P2_ROW_BOUNDS = [
    83.33, 96.33, 110.0, 123.67, 137.0, 150.33, 163.67, 177.0, 190.67, 204.33,
    217.67, 231.0, 244.33, 258.0, 271.67, 285.0, 298.33, 311.67, 325.0, 338.67,
    352.0, 365.67, 379.0, 392.33, 406.0, 419.33, 433.0, 446.33, 459.67, 473.0,
    486.33, 500.0, 513.67, 527.0, 540.33, 553.67, 567.33, 581.0, 594.33, 607.67,
    621.0, 634.33, 648.0, 661.67, 675.0, 688.67,
]

const P3_ROW_BOUNDS = [
    77.33, 100.0, 123.0, 146.33, 169.0, 192.33, 215.0, 238.0, 261.0, 284.33,
    307.0, 330.33, 353.0, 376.0, 399.0, 422.33, 445.0, 468.33, 491.0, 514.0,
    537.0, 560.33, 583.0, 606.33, 629.0, 652.67,
]

const P4_ROW_BOUNDS = [
    114.33, 135.0, 156.33, 177.0, 198.33, 219.0, 240.33, 261.0, 282.33, 303.0,
    324.33, 345.0,
]

const P5_ROW_BOUNDS = [
    167.67, 198.33, 228.33, 259.0, 289.67, 320.33, 350.67, 381.0, 411.67, 442.0,
    472.67, 503.0, 533.67, 564.33, 594.33, 625.0, 655.67, 686.33, 716.67, 747.33,
]

const P5_COLS = [64.67, 106.33, 164.33, 211.33, 258.67, 327.0, 359.0, 391.33, 423.67, 455.0, 497.0, 529.33]

const PERIOD_ROW = { top: 158.0, h: 18.0 }
const PERIOD_START_ANCHORS = { year: 318.67, month: 355.33, day: 392.0 }
const PERIOD_END_ANCHORS = { year: 439.33, month: 476.0, day: 512.67 }

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
        const body = (await req.json()) as Bekki8Payload

        const candidatePdfPaths = [
            path.join(process.cwd(), "public", "PDF", "s50_kokuji14_bekki8.pdf"),
            path.join(process.cwd(), "public", "s50_kokuji14_bekki8.pdf"),
        ]
        const pdfPath = candidatePdfPaths.find((p) => fs.existsSync(p))
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf")

        if (!pdfPath) throw new Error("Template PDF not found: s50_kokuji14_bekki8.pdf")

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
            const designSize = currentSize

            // 安全係数は撤廃済み（①bで計測が実描画と一致し、②③④でセル座標を実測値に直したため）
            const maxWidth = Math.max(1, cellW - paddingX * 2)
            const maxHeight = Math.max(1, cellH - paddingY * 2)

            const widthAtCurrent = measureRuns(fonts, String(normalized ?? ""), currentSize)
            if (widthAtCurrent > maxWidth) currentSize *= maxWidth / widthAtCurrent

            const heightAtCurrent = fonts.jp.heightAtSize(currentSize, { descender: true })
            if (heightAtCurrent > maxHeight) currentSize *= maxHeight / heightAtCurrent

            currentSize = Math.max(currentSize, minFontSize)

            fonts.fit?.reportShrink(normalized, designSize, currentSize)

            reportIfBelowMinSize(fonts, normalized, currentSize, maxWidth)

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
            rows: Bekki8Row[],
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
        // 各サブ領域は単一行で auto-shrink（drawTextInCell）を使う：日付 "2026/02/22" のような
        // 1行で読みたい値が、wrap で2行に分かれて読みづらくなるのを防ぐ。
        // helper の drawTextInCell は安全係数なし（cellW - paddingX*2 をフルに使える）。
        // PR4 (bekki6) で n=3 (date, temp, value) として流用予定。
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
                drawTextInCell({
                    page, pageHeight, fonts, text: values[k],
                    cellX, cellTopFromTop: cellTop + subH * k, cellW, cellH: subH,
                    fontSize,
                    options: { paddingX: 1.0, paddingY: 0.5, minFontSize: 3.5, align: "center" },
                })
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
        // 設備方式: テンプレートに「（設備方式：全域・局所・移動）」が刷り込まれている。
        // ★従来はこの値を様式タイトルの上（x=150）に文字で描いていた。タイトルは
        //   正典でも完全な刷り込みで記入欄が無く、bekki7/8 では実際に重なっていた。
        //   選択肢は右側にあるので、該当する語を○で囲む（座標はテンプレート実測）。
        drawChoiceCircle(page1, p1Height, body.equipment_system, [
            { label: "全域", cx: 374.58, cy: 101.65, rx: 13.0, ry: 7.28 },
            { label: "局所", cx: 406.08, cy: 101.65, rx: 13.06, ry: 7.28 },
            { label: "移動", cx: 437.64, cy: 101.65, rx: 13.06, ry: 7.28 },
        ])
        // ★セル境界の実測値（2026-07-24）: 63.1 | 110.5 …ラベル | 375.6 …名称/所在の値
        //   | 377.0 | 412.8 …ラベル | 528.1 …防火管理者/立会者
        //   旧値は幅266で 379.3 まで伸びており、安全係数を外した途端に住所が罫線 375.6 を越えた。
        //   ＝係数がこの幅定義ミスを隠していた。
        drawInCell(page1, p1Height, body.form_name, 111.0, 108.4, 264.6, 24.4, 8.8)
        drawInCell(page1, p1Height, body.fire_manager, 413.3, 108.4, 114.8, 24.4, 8.4)
        drawInCell(page1, p1Height, body.location, 111.0, 133.3, 264.6, 24.6, 8.5)
        drawInCell(page1, p1Height, body.witness, 413.3, 133.3, 114.8, 24.6, 8.3)

        // 点検種別: テンプレートに「機器・総合」が刷り込まれているので文字を重ねず○で囲む。
        // ○の座標はテンプレートPDFの文字を実測（様式ごとに位置が違う）。
        drawChoiceCircle(page1, p1Height, body.inspection_type || "機器・総合", [
            { label: "機器", cx: 131.10, cy: 167.05, rx: 17.56, ry: 7.28 },
            { label: "総合", cx: 189.77, cy: 167.05, rx: 17.56, ry: 7.28 },
        ])
        const start = formatDateText(body.period_start)
        const end = formatDateText(body.period_end)
        if (parseDateParts(body.period_start) || parseDateParts(body.period_end)) {
            drawPeriodDate(body.period_start, PERIOD_START_ANCHORS)
            drawPeriodDate(body.period_end, PERIOD_END_ANCHORS)
        } else {
            const periodText = start && end ? `${start} - ${end}` : (start || end)
            drawInCell(page1, p1Height, periodText, 263.33, PERIOD_ROW.top, 265.34, PERIOD_ROW.h, 7.8)
        }

        // ★点検者ブロック。セル内に「氏名」「社名」「TEL」「住所」が印字されているので
        //   値はその右の空きに置く（実測 2026-07-24）。
        //   行: 176.4-200.9 / 201.4-225.8　セル: 110.5|209.8 ‖ 211.2|268.1 …ラベル| 528.1
        //   印字: 氏名 116.0-137.2 / 社名 273.6-294.7 / TEL 441.7-457.6 / 住所 273.6-294.7
        //   旧値は社名・住所を 263.33 から描いており、印字「社名/住所」に重なった上に
        //   罫線 268.1 を越えていた。
        drawInCell(page1, p1Height, body.inspector_name, 140.0, 176.4, 69.8, 24.5, 8.0)
        drawInCell(page1, p1Height, body.inspector_company, 297.0, 176.4, 142.7, 24.5, 7.8)
        drawInCell(page1, p1Height, body.inspector_tel, 460.0, 176.4, 68.1, 24.5, 7.8)
        drawInCell(page1, p1Height, body.inspector_address, 297.0, 201.4, 231.1, 24.4, 7.6)

        drawResultRows(page1, p1Height, body.page1_rows ?? [], P1_ROW_BOUNDS, {
            contentX: 231.67, contentW: 99.66,
            judgmentX: 331.33, judgmentW: 36.67,
            badX: 368.0, badW: 94.67,
            actionX: 462.67, actionW: 66.0,
        })

        drawResultRows(page2, p2Height, body.page2_rows ?? [], P2_ROW_BOUNDS, {
            contentX: 232.67, contentW: 94.33,
            judgmentX: 327.0, judgmentW: 36.67,
            badX: 363.67, badW: 99.33,
            actionX: 463.0, actionW: 67.0,
        }, new Set([26]))

        // PAGE2 row 26「起動装置 / 自動式 / 火災感知装置（専用・兼用）」: 公式PDF刷り込みの選択を丸囲み
        drawChoiceCircle(page2, p2Height, body.page2_rows?.[26]?.content ?? "", [
            { label: "専用", cx: 258.0, cy: 438.9, rx: 14, ry: 7 },
            { label: "兼用", cx: 297.95, cy: 438.9, rx: 14, ry: 7 },
        ])

        drawResultRows(page3, p3Height, body.page3_rows ?? [], P3_ROW_BOUNDS, {
            contentX: 233.0, contentW: 81.33,
            judgmentX: 314.33, judgmentW: 42.0,
            badX: 356.33, badW: 102.67,
            actionX: 459.0, actionW: 71.0,
        })

        drawResultRows(page4, p4Height, body.page4_rows ?? [], P4_ROW_BOUNDS, {
            contentX: 222.33, contentW: 94.67,
            judgmentX: 317.0, judgmentW: 42.0,
            badX: 359.0, badW: 105.0,
            actionX: 464.0, actionW: 65.67,
        })

        drawWrappedInCell(page4, p4Height, body.notes, 96.33, 345.0, 433.34, 294.0, 7.2)

        const device1 = body.device1 ?? {}
        const device2 = body.device2 ?? {}
        drawInCell(page4, p4Height, device1.name, 96.33, 660.33, 42.0, 20.67, 7.0)
        drawInCell(page4, p4Height, device1.model, 138.33, 660.33, 52.67, 20.67, 7.0)
        drawInCell(page4, p4Height, formatJapaneseDateText(device1.calibrated_at), 191.0, 660.33, 55.33, 20.67, 7.0)
        drawInCell(page4, p4Height, device1.maker, 246.33, 660.33, 54.67, 20.67, 7.0)

        // ★device2 は列が丸ごと1つ右にずれており、製造者名は次の行に落ちていた。
        //   実測の列境界: 301.9 | 363.8 | 417.7 | 471.5 | 529.1（device1 側は元から一致）。
        drawInCell(page4, p4Height, device2.name, 301.9, 660.4, 61.9, 20.5, 7.0)
        drawInCell(page4, p4Height, device2.model, 363.8, 660.4, 53.9, 20.5, 7.0)
        drawInCell(page4, p4Height, formatJapaneseDateText(device2.calibrated_at), 417.7, 660.4, 53.8, 20.5, 7.0)
        drawInCell(page4, p4Height, device2.maker, 471.5, 660.4, 57.6, 20.5, 7.0)

        drawCylinderRows(page5, p5Height, body.page5_rows ?? [])

        // ⑧ 枠に収まらなかった項目があればPDFを返さずに一覧を返す。
        //   黙って "..." で切り詰めると、法定書類から情報が静かに欠落するため。
        fonts.fit?.resolve(body)
        const systemOverflow = systemFitFailures(fonts.fit!)
        if (systemOverflow.length) {
            // 業者には直せない（テンプレート固定文言・整形済みの値）＝実装側の不具合として記録
            console.error("[pdf] 収容不能(システム由来)", { form: "別記様式第8", items: systemOverflow })
        }
        const fitFormLabel = "別記様式第8"
        logFitDebug(fitFormLabel, fonts.fit!)
        if (fonts.fit?.smalls.length) {
            // 判読しづらい大きさで描かれた項目。単独では止められない（上記コメント参照）ので記録のみ
            console.warn("[pdf] 極小フォントで描画", { count: fonts.fit.smalls.length })
        }
        const fitError = buildFitError("別記様式第8", fonts.fit!)
        if (fitError) return NextResponse.json(fitError, { status: 422 })

        const pdfBytes = await pdfDoc.save()
        return new NextResponse(pdfBytes as unknown as BodyInit, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                // ⑨ 設計値から大きく縮んだ項目があれば警告として運ぶ（PDFは返す）
                ...fitWarningHeader(fitFormLabel, fonts.fit!),
                "Content-Disposition": 'attachment; filename="s50_kokuji14_bekki8_filled.pdf"',
            },
        })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 })
    }
}



