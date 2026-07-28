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
import { FIT_EPSILON, drawChoiceCircle, drawTextRuns, drawWrappedTextInCell, formatJapaneseDateText, formatJudgment, measureRuns, pickFont, reportIfBelowMinSize, type ReportFonts } from "@/lib/pdf-form-helpers"

type Bekki5Row = {
    content?: string
    judgment?: string
    bad_content?: string
    action_content?: string
    current_value?: string  // 電圧計・電流計行の電流値（A）
    flow_value?: string     // 性能行の吐出量（L/min）
    hose_count?: string     // ホース行の本数
    nozzle_dia?: string     // ホース行のノズル径（mm）
}

type DeviceRow = {
    name?: string
    model?: string
    calibrated_at?: string
    maker?: string
}

type Bekki5Payload = {
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
    equipment_name?: string
    pump_maker?: string
    pump_model?: string
    motor_maker?: string
    motor_model?: string
    foam_maker?: string
    foam_model?: string
    /** 消火薬剤の型式番号「（泡第 __ ～ __ 号）」の2つの空欄（正典で新設） */
    foam_type_no_from?: string
    foam_type_no_to?: string
    page1_rows?: Bekki5Row[]
    page2_rows?: Bekki5Row[]
    page3_rows?: Bekki5Row[]
    page4_rows?: Bekki5Row[]
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
    317, 337, 357, 377, 397, 417, 437, 457, 477, 497,
    517, 537, 557, 577, 597, 617, 637, 657, 677, 697,
]

const P2_ROW_BOUNDS = [
    83, 100, 117, 134, 151, 177, 203, 220, 237, 263,
    280, 297, 314, 331, 348, 365, 382, 399, 416, 433,
    450, 467, 484, 501, 518, 535, 552, 569, 586, 603,
    620, 637, 654, 671, 688,
]

// 消防庁の正典（s50_kokuji14_bekki5.pdf・令和6年9月10日最終改正）の罫線を実測した値。
// ★行1「消火薬剤」が2段（数量Ｌ／型式番号）になって 22pt→31.6pt に伸び、
//   行2以降の境界がすべて +9.6pt ずれた。行数は27で変わらない。
const P3_ROW_BOUNDS = [
    83, 105, 136.6, 158.6, 180.6, 202.6, 224.6, 246.6, 268.6, 290.6,
    312.6, 334.6, 356.6, 388.6, 410.6, 432.6, 454.6, 476.6, 504.6, 526.6,
    548.6, 570.6, 598.6, 620.6, 642.6, 664.6, 686.6, 708.6,
]

// 行1（消火薬剤）の内部レイアウト。正典の刷り込み実測:
//   上段 … 数量。単位「Ｌ」が x=303.5-314.0 / y=106.9-117.5
//   下段 … 「（泡第 __ ～ __ 号）」が y=122.7-133.2。空欄は全角スペース2つ。
// ★下段は刷り込み文字なので、上段の数量をセル全体に中央寄せすると重なる。
//   drawResultRows から行1を外し、上段だけに描く。
//
// ★空欄の幅は span の bbox（＝文字送り幅）ではなく、576dpi でラスタライズして
//   インクの無い列を数えて測った。送り幅だと 10.5pt、実インク間は 11.9pt。
//   さらに drawInCell の既定 paddingX=3 は左右で 6pt＝この空欄の 57% を食うので、
//   実測した空白そのものを矩形にして paddingX を 0.5 に落とす。
//   （既定値のままだと 3桁の型式番号が最小サイズでも入らず「…」に切り詰められる）
const P3_FOAM_QTY = { top: 105.0, h: 15.5 }
const P3_TYPE_NO_FROM = { x: 255.9, w: 11.9 }
const P3_TYPE_NO_TO = { x: 276.6, w: 12.0 }
// 下段の刷り込み行の中心（122.7+133.2)/2 = 127.95 に合わせる
const P3_TYPE_NO_ROW = { top: 119.4, h: 17.1 }

const P4_ROW_BOUNDS = [
    83, 104, 125, 146, 167, 188, 209, 230, 251, 272,
    293, 314, 335, 356, 377, 398, 419, 440, 461, 482,
    503, 524, 545, 566,
]

const PERIOD_ROW = { top: 161, h: 20 }
const PERIOD_START_ANCHORS = { year: 320.0, month: 357.0, day: 394.0 }
const PERIOD_END_ANCHORS = { year: 441.0, month: 477.5, day: 515.0 }

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
        const body = (await req.json()) as Bekki5Payload

        const candidatePdfPaths = [
            path.join(process.cwd(), "public", "PDF", "s50_kokuji14_bekki5.pdf"),
            path.join(process.cwd(), "public", "s50_kokuji14_bekki5.pdf"),
        ]
        const pdfPath = candidatePdfPaths.find((p) => fs.existsSync(p))
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf")

        if (!pdfPath) {
            throw new Error("Template PDF not found: s50_kokuji14_bekki5.pdf")
        }

        const existingPdfBytes = fs.readFileSync(pdfPath)
        const fontBytes = fs.readFileSync(fontPath)

        const pdfDoc = await PDFDocument.load(existingPdfBytes)
        pdfDoc.registerFontkit(fontkit)
        const customFont = await pdfDoc.embedFont(fontBytes)
        // ASCII(型式・番号・日付等)は Helvetica で描く。NotoSansJP は「英字+ハイフン+数字」で
        // 数字がCJK拡張Aのグリフに化け、計測幅と実描画幅が最大+41.6%ズレて枠をはみ出すため。
        const latinFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
        const fonts: ReportFonts = { jp: customFont, latin: latinFont, fit: createFitCollector() }

        const [page1, page2, page3, page4] = pdfDoc.getPages()
        const p1Height = page1.getSize().height
        const p2Height = page2.getSize().height
        const p3Height = page3.getSize().height
        const p4Height = page4.getSize().height

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

            const paddingX = options?.paddingX ?? 3
            const paddingY = options?.paddingY ?? 2
            const minFontSize = options?.minFontSize ?? 3.5
            let currentSize = Math.min(fontSize, options?.maxFontSize ?? fontSize)
            const designSize = currentSize

            // 安全係数は撤廃済み（①bで計測が実描画と一致し、②③④でセル座標を実測値に直したため）
            const maxWidth = Math.max(1, cellW - paddingX * 2)
            const maxHeight = Math.max(1, cellH - paddingY * 2)

            const widthAtCurrent = measureRuns(fonts, String(normalized ?? ""), currentSize)
            if (widthAtCurrent > maxWidth) {
                currentSize = currentSize * (maxWidth / widthAtCurrent)
            }

            const heightAtCurrent = fonts.jp.heightAtSize(currentSize, { descender: true })
            if (heightAtCurrent > maxHeight) {
                currentSize = currentSize * (maxHeight / heightAtCurrent)
            }

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
            const textTopFromTop = cellTopFromTop + (cellH - textHeight) / 2
            const baselineOffset = textHeight * 0.78

            drawTextRuns(page, fonts, String(textToDraw ?? ""), textX, pageHeight - (textTopFromTop + baselineOffset), currentSize)
        }

        const drawWrappedInCell = (
            page: PDFPage,
            pageHeight: number,
            text: unknown,
            cellX: number,
            cellTopFromTop: number,
            cellW: number,
            cellH: number,
            fontSize = 7.1,
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
                paddingX: 2.5,
                paddingY: 1.5,
                minFontSize: 3.5,
                lineGap: 0.9,
            },
        })

        const drawResultRows = (
            page: PDFPage,
            pageHeight: number,
            rows: Bekki5Row[],
            rowBounds: number[],
            columns: ResultColumns,
            contentOverrides: Record<number, { x: number; w: number }> = {},
            skipContentRows: Set<number> = new Set(),
        ) => {
            for (let i = 0; i < rowBounds.length - 1; i += 1) {
                const row = rows[i]
                if (!row) continue
                const top = rowBounds[i]
                const h = rowBounds[i + 1] - rowBounds[i]
                const ov = contentOverrides[i]
                const cx = ov?.x ?? columns.contentX
                const cw = ov?.w ?? columns.contentW

                if (!skipContentRows.has(i)) {
                    drawWrappedInCell(page, pageHeight, row.content, cx, top, cw, h, 6.7)
                }
                drawInCell(page, pageHeight, formatJudgment(row.judgment), columns.judgmentX, top, columns.judgmentW, h, 8.4, { align: "center" })
                drawWrappedInCell(page, pageHeight, row.bad_content, columns.badX, top, columns.badW, h, 6.7)
                drawWrappedInCell(page, pageHeight, row.action_content, columns.actionX, top, columns.actionW, h, 6.7)
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
            size = 8.1,
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
            drawRightAt(page1, p1Height, parts.year, anchors.year, PERIOD_ROW.top, PERIOD_ROW.h, 8.1)
            drawRightAt(page1, p1Height, parts.month, anchors.month, PERIOD_ROW.top, PERIOD_ROW.h, 8.1)
            drawRightAt(page1, p1Height, parts.day, anchors.day, PERIOD_ROW.top, PERIOD_ROW.h, 8.1)
        }

        drawInCell(page1, p1Height, body.form_name, 113, 109, 262, 26, 9)
        drawInCell(page1, p1Height, body.fire_manager, 421, 109, 109, 26, 8.6)
        drawInCell(page1, p1Height, body.location, 113, 135, 262, 26, 8.8)
        drawInCell(page1, p1Height, body.witness, 421, 135, 109, 26, 8.6)

        // 点検種別: テンプレートに「機器・総合」が刷り込まれているので文字を重ねず○で囲む。
        // ○の座標はテンプレートPDFの文字を実測（様式ごとに位置が違う）。
        drawChoiceCircle(page1, p1Height, body.inspection_type || "機器・総合", [
            { label: "機器", cx: 134.58, cy: 171.25, rx: 18.76, ry: 7.28 },
            { label: "総合", cx: 200.22, cy: 171.25, rx: 18.76, ry: 7.28 },
        ])
        const periodStart = formatDateText(body.period_start)
        const periodEnd = formatDateText(body.period_end)
        if (parseDateParts(body.period_start) || parseDateParts(body.period_end)) {
            drawPeriodDate(body.period_start, PERIOD_START_ANCHORS)
            drawPeriodDate(body.period_end, PERIOD_END_ANCHORS)
        } else {
            const periodText = periodStart && periodEnd ? `${periodStart} - ${periodEnd}` : (periodStart || periodEnd)
            drawInCell(page1, p1Height, periodText, 222, PERIOD_ROW.top, 308, PERIOD_ROW.h, 8.3)
        }

        // 刷り込みに重ねない: 前置ラベル氏名(-139.4) の右から（テンプレート実測）
        drawInCell(page1, p1Height, body.inspector_name, 139.94, 181, 81.06, 56, 8.2)
        drawInCell(page1, p1Height, body.inspector_company, 312, 181, 105, 28, 8.2)
        drawInCell(page1, p1Height, body.inspector_tel, 433, 181, 95, 28, 8.2)
        drawInCell(page1, p1Height, body.inspector_address, 312, 209, 216, 28, 8.0)

        drawInCell(page1, p1Height, body.equipment_name, 112, 237, 45, 40, 7.2)
        // ★ポンプ側だけ幅87で定義されており、右隣「電動機」のラベル欄（罫線 249.8）まで
        //   食い込んで越えていた。実測の値セルは 207.4→249.8（印字ラベル「製造者名」163.3-205.4 の右）。
        //   電動機・泡消火薬剤側（343/495）は元から実測値に一致していたので触らない。
        drawInCell(page1, p1Height, body.pump_maker, 207.4, 237.5, 42.4, 19.5, 7.1)
        drawInCell(page1, p1Height, body.pump_model, 207.4, 257.5, 42.4, 19.5, 7.1)
        drawInCell(page1, p1Height, body.motor_maker, 343, 237, 34, 20, 7.1)
        drawInCell(page1, p1Height, body.motor_model, 343, 257, 34, 20, 7.1)
        drawInCell(page1, p1Height, body.foam_maker, 495, 237, 33, 20, 7.1)
        drawInCell(page1, p1Height, body.foam_model, 495, 257, 33, 20, 7.1)

        const p1Rows5 = body.page1_rows ?? []
        drawResultRows(page1, p1Height, p1Rows5, P1_ROW_BOUNDS, {
            contentX: 222, contentW: 95,
            judgmentX: 317, judgmentW: 45,
            badX: 362, badW: 88,
            actionX: 450, actionW: 80,
        }, {
            // 電圧計・電流計: 「Ｖ」(x=248.8)・「Ａ」(x=301.3)印刷済み → V前に電圧値
            11: { x: 222, w: 25 },
        })

        // 電圧計・電流計 (row 11): 「Ｖ」と「Ａ」の間に電流値を描画
        const voltRow5 = p1Rows5[11]
        if (voltRow5?.current_value) {
            const voltTop = P1_ROW_BOUNDS[11]
            const voltH = P1_ROW_BOUNDS[12] - P1_ROW_BOUNDS[11]
            drawInCell(page1, p1Height, voltRow5.current_value, 261, voltTop, 38, voltH, 6.8)
        }

        const p2Rows5 = body.page2_rows ?? []
        drawResultRows(page2, p2Height, p2Rows5, P2_ROW_BOUNDS, {
            contentX: 214, contentW: 99,
            judgmentX: 313, judgmentW: 46,
            badX: 359, badW: 86,
            actionX: 445, actionW: 84,
        }, {}, new Set([7, 19]))

        // PAGE2 row 7「火災感知装置 / 感知器（専用・兼用）」: 公式PDF刷り込みの選択を丸囲み
        drawChoiceCircle(page2, p2Height, p2Rows5[7]?.content ?? "", [
            { label: "専用", cx: 243.6, cy: 228.6, rx: 14, ry: 7 },
            { label: "兼用", cx: 285.7, cy: 228.6, rx: 14, ry: 7 },
        ])

        // PAGE2 row 19「ポンプ / 性能」: 公式PDF刷り込みの MPa(x≈243.5) / L/min(x≈280.3) の間に値を分割描画
        // 新キー優先（content=吐出圧力MPa, flow_value=吐出量L/min）→ "/" 分割 → 単一content
        const perfRow5 = p2Rows5[19]
        if (perfRow5) {
            const pTop = P2_ROW_BOUNDS[19]
            const pH = P2_ROW_BOUNDS[20] - P2_ROW_BOUNDS[19]
            const pContent = normalizeText(perfRow5.content)
            const pFlow = normalizeText(perfRow5.flow_value)
            const drawMpa  = (v: string) => { if (v) drawInCell(page2, p2Height, v, 215, pTop, 28, pH, 6.5, { paddingX: 1 }) }
            const drawLmin = (v: string) => { if (v) drawInCell(page2, p2Height, v, 260, pTop, 20, pH, 6.5, { paddingX: 1 }) }
            if (pFlow) {
                drawMpa(pContent); drawLmin(pFlow)
            } else if (pContent.includes("/")) {
                const parts = pContent.split("/")
                drawMpa(parts[0]?.trim() ?? ""); drawLmin(parts[1]?.trim() ?? "")
            } else if (pContent) {
                drawMpa(pContent)
            }
        }

        const p3Rows5 = body.page3_rows ?? []
        drawResultRows(page3, p3Height, p3Rows5, P3_ROW_BOUNDS, {
            contentX: 214, contentW: 99,
            judgmentX: 313, judgmentW: 46,
            badX: 359, badW: 86,
            actionX: 445, actionW: 84,
        }, {}, new Set([1, 21]))

        // PAGE3 row 1「消火薬剤」: 正典で2段になったので content は上段のみ。下段は型式番号の空欄。
        const foamRow = p3Rows5[1]
        if (foamRow) {
            drawWrappedInCell(page3, p3Height, foamRow.content, 214, P3_FOAM_QTY.top, 99, P3_FOAM_QTY.h, 6.7)
        }
        drawInCell(page3, p3Height, body.foam_type_no_from, P3_TYPE_NO_FROM.x, P3_TYPE_NO_ROW.top,
            P3_TYPE_NO_FROM.w, P3_TYPE_NO_ROW.h, 7.0, { align: "center", paddingX: 0.5 })
        drawInCell(page3, p3Height, body.foam_type_no_to, P3_TYPE_NO_TO.x, P3_TYPE_NO_ROW.top,
            P3_TYPE_NO_TO.w, P3_TYPE_NO_ROW.h, 7.0, { align: "center", paddingX: 0.5 })

        // PAGE3 row 21「ホース・ノズル / 外形」: 公式PDF刷り込みの ｍ×(x≈235.2) / 本(x≈277.3) / mm(x≈298.3) の間に分割描画
        // 新キー優先（content=長さm, hose_count=本数, nozzle_dia=口径mm）→ "/" 分割 → 単一content
        // 値は行の下半分（ｍ×/本/mmラベルと同じ高さ）に配置
        const hoseRow5 = p3Rows5[21]
        if (hoseRow5) {
            const hTop = P3_ROW_BOUNDS[21]
            const hH = P3_ROW_BOUNDS[22] - hTop
            const hValTop = hTop + hH / 2 - 2
            const hValH = hH / 2 + 2
            const hContent = normalizeText(hoseRow5.content)
            const hCount = normalizeText(hoseRow5.hose_count)
            const nDia = normalizeText(hoseRow5.nozzle_dia)
            const drawLen = (v: string) => { if (v) drawInCell(page3, p3Height, v, 217, hValTop, 18, hValH, 6.5, { paddingX: 0.5 }) }
            const drawCnt = (v: string) => { if (v) drawInCell(page3, p3Height, v, 257, hValTop, 20, hValH, 6.0, { paddingX: 0.5 }) }
            const drawDia = (v: string) => { if (v) drawInCell(page3, p3Height, v, 288, hValTop, 10, hValH, 6.0, { paddingX: 0 }) }
            if (hCount || nDia) {
                drawLen(hContent); drawCnt(hCount); drawDia(nDia)
            } else if (hContent.includes("/")) {
                const parts = hContent.split("/")
                drawLen(parts[0]?.trim() ?? ""); drawCnt(parts[1]?.trim() ?? ""); drawDia(parts[2]?.trim() ?? "")
            } else if (hContent) {
                drawLen(hContent)
            }
        }

        drawResultRows(page4, p4Height, body.page4_rows ?? [], P4_ROW_BOUNDS, {
            contentX: 235, contentW: 79,
            judgmentX: 314, judgmentW: 45,
            badX: 359, badW: 86,
            actionX: 445, actionW: 85,
        })

        drawWrappedInCell(page4, p4Height, body.notes, 85, 566, 444, 63, 7.3)

        const device1 = body.device1 ?? {}
        const device2 = body.device2 ?? {}
        drawInCell(page4, p4Height, device1.name, 85, 650, 56, 21, 7.2)
        drawInCell(page4, p4Height, device1.model, 141, 650, 55, 21, 7.2)
        drawInCell(page4, p4Height, formatJapaneseDateText(device1.calibrated_at), 196, 650, 56, 21, 7.2)
        drawInCell(page4, p4Height, device1.maker, 252, 650, 55, 21, 7.2)

        drawInCell(page4, p4Height, device2.name, 313, 650, 50, 21, 7.2)
        drawInCell(page4, p4Height, device2.model, 363, 650, 55, 21, 7.2)
        drawInCell(page4, p4Height, formatJapaneseDateText(device2.calibrated_at), 418, 650, 56, 21, 7.2)
        drawInCell(page4, p4Height, device2.maker, 474, 650, 55, 21, 7.2)

        // ⑧ 枠に収まらなかった項目があればPDFを返さずに一覧を返す。
        //   黙って "..." で切り詰めると、法定書類から情報が静かに欠落するため。
        fonts.fit?.resolve(body)
        const systemOverflow = systemFitFailures(fonts.fit!)
        if (systemOverflow.length) {
            // 業者には直せない（テンプレート固定文言・整形済みの値）＝実装側の不具合として記録
            console.error("[pdf] 収容不能(システム由来)", { form: "別記様式第5", items: systemOverflow })
        }
        const fitFormLabel = "別記様式第5"
        logFitDebug(fitFormLabel, fonts.fit!)
        if (fonts.fit?.smalls.length) {
            // 判読しづらい大きさで描かれた項目。単独では止められない（上記コメント参照）ので記録のみ
            console.warn("[pdf] 極小フォントで描画", { count: fonts.fit.smalls.length })
        }
        const fitError = buildFitError("別記様式第5", fonts.fit!)
        if (fitError) return NextResponse.json(fitError, { status: 422 })

        const pdfBytes = await pdfDoc.save()
        return new NextResponse(pdfBytes as unknown as BodyInit, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                // ⑨ 設計値から大きく縮んだ項目があれば警告として運ぶ（PDFは返す）
                ...fitWarningHeader(fitFormLabel, fonts.fit!),
                "Content-Disposition": 'attachment; filename="s50_kokuji14_bekki5_filled.pdf"',
            },
        })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 })
    }
}
