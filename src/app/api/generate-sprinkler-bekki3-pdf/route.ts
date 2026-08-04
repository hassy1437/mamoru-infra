import { NextRequest, NextResponse } from "next/server"
import { PDFDocument, rgb, PDFPage, StandardFonts } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"
import fs from "fs"
import path from "path"
import {
    periodDateError,
FIT_EPSILON,
    drawChoiceCircle,
    drawPeriodDate,
    drawTextRuns,
    drawWrappedTextInCell,
    formatJapaneseDateText,
    formatJudgment,
    cellAt,
    measureRuns,
    truncateRunsToFitWidth,
    pickFont,
    reportIfBelowMinSize,
    type ReportFonts,
    type CellRef,
    type CellAt,
} from "@/lib/pdf-form-helpers"
import {
    buildFitError,
    createFitCollector,
    fitWarningHeader,
    logFitDebug,
    systemFitFailures,
} from "@/lib/pdf-fit-report"

/**
 * テストデータ生成が読む「数値しか入らない欄」の宣言。
 *
 * ★推論してはいけない。以前は contentOverrides / skipContentRows があれば数値欄と
 *   見なしていたが、override の幅は実測で 12〜97pt に連続しており、数値欄と
 *   「単に x をずらしただけの文字欄」を分離できない。その結果、現実値セットの
 *   100セル/14様式に "0.45" が入り、その範囲では切り詰めもはみ出しも測れていなかった。
 *   ＝ ここに書いてあるものだけが数値欄。書き忘れは検査データが甘くなるだけで
 *   済まないので、宣言が無いとテストデータ生成が失敗する。
 *
 * 添字は payload 配列の添字（drawResultRows の startIndex を適用した後の値）。
 * 分類は scripts/classify-numeric-rows.py が出す「内容セルの刷り込み」の実測による。
 */
export const NUMERIC_ROWS: Record<string, number[]> = {
    page1_rows: [1, 10, 11, 13],
    page2_rows: [4, 5, 6, 20, 21, 31, 32],
    page3_rows: [15, 17, 25],
    page4_rows: [2, 4, 7, 9, 13],
    page5_rows: [2, 4, 5, 8, 9],
}

type Bekki3Row = {
    content?: string
    judgment?: string
    bad_content?: string
    action_content?: string
    current_value?: string  // 電圧計・電流計行の電流値（A）
    flow_value?: string     // 性能行のL/min値（MPaラベルとL/minラベルの間）
    hose_count?: string     // ホース行の本数
    nozzle_dia?: string     // ホース行のノズル径（mm）
}

type DeviceRow = {
    name?: string
    model?: string
    calibrated_at?: string
    maker?: string
}

type Bekki3Payload = {
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
    page1_rows?: Bekki3Row[]
    page2_rows?: Bekki3Row[]
    page3_rows?: Bekki3Row[]
    page4_rows?: Bekki3Row[]
    page5_rows?: Bekki3Row[]
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
    /** どの欄の何行目のどの列か（行ループ・専用描画が渡す） */
    at?: CellRef
}

type ResultColumns = {
    /** どの payload 配列か。fit 報告の帰属に使う（値の文字列一致に頼らないため） */
    rowsKey?: string
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
    311, 332, 353, 374, 395, 416, 437, 458, 479, 500,
    521, 542, 563, 584, 605, 626, 647, 668, 689, 710,
]

// ★最終境界について（2026-08-04 実測。採用しなかった判断を残す）
//   テンプレートの表の一番下の罫線は y=704.04 にあり、下の宣言（703）より
//   1.04pt 下にある。＝ 実測していないのではなく、実測したうえで合わせていない。
//   合わせると最終帯が 1.04pt 伸び、値は帯の上下中央に置かれるので 0.52pt
//   下がるだけで、行のずれは生じない（scripts/check-header-rows.py が
//   全58ページで帯数とラベル数の一致を確認している）。
//   150dpi で約1画素の移動のためにベースラインを更新する価値が無いと判断した。
const P2_ROW_BOUNDS = [
    83, 100, 117, 134, 151, 177, 202, 227, 253, 278,
    296, 313, 329, 346, 364, 380, 397, 415, 431, 448,
    466, 482, 499, 517, 533, 550, 568, 584, 602, 619,
    635, 653, 670, 686, 703,
]

const P3_ROW_BOUNDS = [
    76, 94, 113, 131, 149, 168, 186, 205, 223, 242,
    260, 279, 297, 316, 334, 352, 371, 389, 417, 436,
    454, 473, 491, 505, 520, 534, 559, 573, 588, 602,
    616, 631, 645, 660, 674, 689, 708,
]

const P4_ROW_BOUNDS = [
    105, 132, 160, 186, 214, 241, 268, 295, 322,
    349, 377, 405, 434, 462, 490, 519, 547, 575, 604,
    632, 659, 686, 712,
]

const P5_ROW_BOUNDS = [79, 104, 130, 155, 181, 206, 232, 257, 283, 308, 334, 359]

const PERIOD_ROW = { top: 161, h: 18 }
// baseline は刷り込み「年」のベースライン（テンプレート p1 の実測値）。
// ★これが無いとセル矩形の中央に置くことになり、刷り込みと高さが揃わない。
//   実測では23様式すべてでズレていた（-0.4〜-5.19pt / bekki7 が最大）。
//   罫線も越えず切り詰めも起きないので、どの検査にも出なかった。
const PERIOD_START_ANCHORS = { year: 303.2, month: 340.0, day: 377.0, baseline: 173.28 }
const PERIOD_END_ANCHORS = { year: 424.3, month: 460.5, day: 497.8, baseline: 173.28 }

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
        const body = (await req.json()) as Bekki3Payload

        // ★点検期間が年月日に分解できないときは描かずに止める。
        //   以前は期間文字列を刷り込み「年月日～年月日」の上に生で描いていた
        //   （22様式共通。セル定義監査が定義上の重なりとして検出）。
        //   実測: 現実値0件 / 長文0件。入力画面は type="date" なので UI からは到達しない。
        const periodErr = periodDateError("別記様式第3", body.period_start, body.period_end)
        if (periodErr) return NextResponse.json(periodErr, { status: 422 })

        const candidatePdfPaths = [
            path.join(process.cwd(), "public", "PDF", "s50_kokuji14_bekki3.pdf"),
            path.join(process.cwd(), "public", "s50_kokuji14_bekki3.pdf"),
        ]
        const pdfPath = candidatePdfPaths.find((p) => fs.existsSync(p))
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf")

        if (!pdfPath) {
            throw new Error("Template PDF not found: s50_kokuji14_bekki3.pdf")
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

        const [page1, page2, page3, page4, page5] = pdfDoc.getPages()
        const p1Height = page1.getSize().height
        const p2Height = page2.getSize().height
        const p3Height = page3.getSize().height
        const p4Height = page4.getSize().height
        const p5Height = page5.getSize().height

        // ★共有の truncateRunsToFitWidth に寄せた。ローカル複製14本のうち13本が
        //   「1文字も入らない（cut が 0 まで落ちる）」ケースの fonts.fit?.report(value, 0) を
        //   落としており、情報が消えたまま 200 が返っていた。fonts を束ねるだけの包み。
        const truncateToFitWidth = (value: string, size: number, maxWidth: number, at?: CellAt) =>
            truncateRunsToFitWidth(fonts, value, size, maxWidth, at)

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

            const textToDraw = truncateToFitWidth(normalized, currentSize, maxWidth,
                cellAt(page, cellX, cellTopFromTop, cellW, cellH, options?.at))
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

        const drawInCellWithFont = (
            page: PDFPage,
            pageHeight: number,
            font: ReportFonts,
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
            const w = measureRuns(font, String(normalized ?? ""), currentSize)
            if (w > maxWidth) currentSize = currentSize * (maxWidth / w)
            const h = font.jp.heightAtSize(currentSize, { descender: true })
            if (h > maxHeight) currentSize = currentSize * (maxHeight / h)
            currentSize = Math.max(currentSize, minFontSize)
            fonts.fit?.reportShrink(normalized, designSize, currentSize)
            reportIfBelowMinSize(fonts, normalized, currentSize, maxWidth)
            // ★共有の truncateRunsToFitWidth に寄せた（8本目の複製だった）。
            //   自前版は cut が 0 まで落ちた場合の report(value, 0) を持たず、
            //   1文字も入らないときに情報が消えたまま 200 が返っていた。
            const textToDraw = truncateRunsToFitWidth(font, normalized, currentSize, maxWidth,
                cellAt(page, cellX, cellTopFromTop, cellW, cellH, options?.at))
            const textWidth = measureRuns(font, String(textToDraw ?? ""), currentSize)
            const textHeight = font.jp.heightAtSize(currentSize, { descender: true })
            let textX = cellX + paddingX
            if (options?.align === "center") textX = cellX + (cellW - textWidth) / 2
            const textTopFromTop = cellTopFromTop + (cellH - textHeight) / 2
            const baselineOffset = textHeight * 0.78
            drawTextRuns(page, font, String(textToDraw ?? ""), textX, pageHeight - (textTopFromTop + baselineOffset), currentSize)
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
            /** どの欄の何行目のどの列か。fit 報告の帰属に使う */
            at?: CellRef,
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
                at,
            },        })

        const drawResultRows = (
            page: PDFPage,
            pageHeight: number,
            rows: Bekki3Row[],
            rowBounds: number[],
            columns: ResultColumns,
            contentOverrides: Record<number, {x: number; w: number}> = {},
            skipContentRows: Set<number> = new Set(),
        ) => {
            for (let i = 0; i < rowBounds.length - 1; i += 1) {
                const row = rows[i]
                if (!row) continue
                const top = rowBounds[i]
                const h = rowBounds[i + 1] - rowBounds[i]

                // ★どの欄の何行目のどの列かを渡す。渡さないと fit 報告のラベルが
                //   「同じ値を持つ最初の入力欄」を指す（本番の bekki12 で実際に誤帰属していた）。
                const ref = (column: string): CellRef => ({ rowsKey: columns.rowsKey, row: i, column })
                if (!skipContentRows.has(i)) {
                    const cx = contentOverrides[i]?.x ?? columns.contentX
                    const cw = contentOverrides[i]?.w ?? columns.contentW
                    drawWrappedInCell(page, pageHeight, row.content, cx, top, cw, h, 6.7, ref("content"))
                }
                drawInCell(page, pageHeight, formatJudgment(row.judgment), columns.judgmentX, top, columns.judgmentW, h, 8.4, { align: "center", at: ref("judgment") })
                drawWrappedInCell(page, pageHeight, row.bad_content, columns.badX, top, columns.badW, h, 6.7, ref("bad_content"))
                drawWrappedInCell(page, pageHeight, row.action_content, columns.actionX, top, columns.actionW, h, 6.7, ref("action_content"))
            }
        }

        const drawRightAt = (
            page: PDFPage,
            pageHeight: number,
            text: string,
            anchorX: number,
            rowTop: number,
            rowH: number,
            size = 7.9,
        ) => {
            if (!text) return
            const textHeight = fonts.jp.heightAtSize(size, { descender: true })
            const textTop = rowTop + (rowH - textHeight) / 2
            const y = pageHeight - (textTop + textHeight * 0.78)
            const textWidth = measureRuns(fonts, String(text ?? ""), size)
            drawTextRuns(page, fonts, String(text ?? ""), anchorX - textWidth, y, size)
        }

        

        drawInCell(page1, p1Height, body.form_name, 119, 108, 224, 26, 9)
        drawInCell(page1, p1Height, body.fire_manager, 413, 108, 117, 26, 8.6)
        drawInCell(page1, p1Height, body.location, 119, 134, 224, 27, 8.8)
        drawInCell(page1, p1Height, body.witness, 413, 134, 117, 27, 8.6)

        // 点検種別はテンプレートに「機器・総合」が印刷済みのため描画しない
        const periodStart = formatDateText(body.period_start)
        const periodEnd = formatDateText(body.period_end)
        if (parseDateParts(body.period_start) || parseDateParts(body.period_end)) {
            drawPeriodDate({ page: page1, pageHeight: p1Height, fonts, dateValue: body.period_start, anchors: PERIOD_START_ANCHORS, rowTop: PERIOD_ROW.top, rowHeight: PERIOD_ROW.h, fontSize: 7.9 })
            drawPeriodDate({ page: page1, pageHeight: p1Height, fonts, dateValue: body.period_end, anchors: PERIOD_END_ANCHORS, rowTop: PERIOD_ROW.top, rowHeight: PERIOD_ROW.h, fontSize: 7.9 })
        }

        // 刷り込みに重ねない: 前置ラベル氏名(-139.0) の右から（テンプレート実測）
        drawInCell(page1, p1Height, body.inspector_name, 139.5, 179, 66.5, 42, 8.2)
        // 「社名」ラベル x=276.6-297.7 の右から開始 → x=299, w=424-299-2=123
        drawInCell(page1, p1Height, body.inspector_company, 299, 179, 123, 21, 8.2)
        // 「TEL」ラベル x=423.7-455.3 の右から開始 → x=457, w=530-457-3=70
        drawInCell(page1, p1Height, body.inspector_tel, 457, 179, 70, 21, 8.2)
        // 「住所」ラベル x=276.6-297.7 の右から開始 → x=299, w=530-299-3=228
        drawInCell(page1, p1Height, body.inspector_address, 299, 200, 228, 21, 8.0)

        // equipment_name はテンプレートに印刷済みのため描画しない
        // ポンプ「製造者名」ラベル x=162-205 の右から: x=206, 列右端x=317, w=317-206-3=108
        drawInCell(page1, p1Height, body.pump_maker, 206, 221, 108, 18, 7.1)
        drawInCell(page1, p1Height, body.pump_model, 206, 239, 108, 18, 7.1)
        // 電動機「製造者名」ラベル x=369-412 の右から: x=413, 列右端x=530, w=530-413-3=114
        drawInCell(page1, p1Height, body.motor_maker, 413, 221, 114, 18, 7.1)
        drawInCell(page1, p1Height, body.motor_model, 413, 239, 114, 18, 7.1)

        drawResultRows(page1, p1Height, body.page1_rows ?? [], P1_ROW_BOUNDS, {
            rowsKey: "page1_rows",
            contentX: 238, contentW: 105,
            judgmentX: 343, judgmentW: 37,
            badX: 380, badW: 75,
            actionX: 455, actionW: 75,
        }, {
            // 貯水槽: 「種別」印刷済み (x=244-265) → x=267から
            0: { x: 267, w: 74 },
            // 水量: 右側に「ｍ³」印刷済み (x=324.1) → x=238, w=84
            1: { x: 238, w: 84 },
            // 電圧計・電流計: 「Ｖ」(x=275.4)・「Ａ」(x=328)印刷済み → Vの前まで
            10: { x: 238, w: 35 },
            // 回転数: 「ｒ／ｍｉｎ」印刷済み (x=285.8) → x=238, w=46
            11: { x: 238, w: 46 },
            // ヒューズ類: 「Ａ」印刷済み (x=327.8) → x=238, w=88
            13: { x: 238, w: 88 },
            // 接地: 「種接地」印刷済み (x=306.8) → x=238, w=67
            17: { x: 238, w: 67 },
        }, new Set([10])) // row 10: V/A split — handled manually below

        // 電圧計・電流計 (row 10): 「Ｖ」(x=275.4) / 「Ａ」(x=328) 自動分割
        const p1Rows3 = body.page1_rows ?? []
        const voltRow3 = p1Rows3[10]
        if (voltRow3) {
            const voltTop = P1_ROW_BOUNDS[10]
            const voltH = P1_ROW_BOUNDS[11] - P1_ROW_BOUNDS[10]
            const voltContent = normalizeText(voltRow3.content)

            if (voltRow3.current_value) {
                drawWrappedInCell(page1, p1Height, voltContent, 238, voltTop, 35, voltH, 6.7)
                drawWrappedInCell(page1, p1Height, voltRow3.current_value, 286, voltTop, 40, voltH, 6.7)
            } else if (voltContent.includes("/")) {
                const slashIdx = voltContent.indexOf("/")
                const voltage = voltContent.slice(0, slashIdx).trim()
                const current = voltContent.slice(slashIdx + 1).trim()
                drawWrappedInCell(page1, p1Height, voltage, 238, voltTop, 35, voltH, 6.7)
                drawWrappedInCell(page1, p1Height, current, 286, voltTop, 40, voltH, 6.7)
            } else if (voltContent) {
                drawWrappedInCell(page1, p1Height, voltContent, 238, voltTop, 35, voltH, 6.7)
            }
        }

        const p2Rows3 = body.page2_rows ?? []
        drawResultRows(page2, p2Height, p2Rows3, P2_ROW_BOUNDS, {
            rowsKey: "page2_rows",
            contentX: 237, contentW: 101,
            judgmentX: 338, judgmentW: 38,
            badX: 376, badW: 77,
            actionX: 453, actionW: 77,
        }, {
            // 設定圧力: 「設定圧力」+「MPa」両方印刷済み → MPaの前(x=300)の間のみ
            4: { x: 286, w: 12 },
            // 設定圧力下段: 右側に「MPa」印刷済み (x=300.2) → x=237, w=61
            5: { x: 237, w: 61 },
            // 作動圧力: 「設定圧力」+「MPa」両方印刷済み → MPaの前の間のみ
            6: { x: 286, w: 12 },
            // 流量+L/min・MPa: 右側に「MPa＋L/min」印刷済み (x=277.8) → x=237, w=38
            20: { x: 237, w: 38 },
            // 放水量: 右側に「Ｌ」印刷済み (x=328.3) → x=237, w=89
            21: { x: 237, w: 89 },
            // 放水圧力1: 右側に「MPa」印刷済み (x=317.6) → x=237, w=79
            31: { x: 237, w: 79 },
            // 放水圧力2: 右側に「MPa」印刷済み (x=307.3) → x=237, w: 68
            32: { x: 237, w: 68 },
        }, new Set([
            4,  // 設定圧力(上段): 超狭セル(14px) → 手動描画
            6,  // 作動圧力: 同上
            7,  // 専用/兼用: テンプレートに選択肢が印刷済み → skip+circle
            20, // 性能（MPa/L/min）: 自動分割のため手動描画
        ]))

        // P2 rows 4, 6: 「設定圧力」/「作動圧力」(x=242-285) と「MPa」(x=300) の間に手動描画
        for (const ri of [4, 6] as const) {
            const pressRow = p2Rows3[ri]
            if (!pressRow) continue
            const pTop = P2_ROW_BOUNDS[ri]
            const pH = P2_ROW_BOUNDS[ri + 1] - P2_ROW_BOUNDS[ri]
            drawInCellWithFont(page2, p2Height, fonts, pressRow.content, 285, pTop, 14, pH, 6.5, { paddingX: 0.5,
                // ★どの欄の何行目かを渡す。渡さないと fit 報告のラベルが
                //   「同じ値を持つ最初の入力欄」を指してしまう（15Fで「貯水槽 水量」と誤帰属した）。
                at: { rowsKey: "page2_rows", row: ri, column: "content" } })
        }

        // 性能 (p2 row 20): 「MPa」/ 「L/min」自動分割
        const perfRow3 = p2Rows3[20]
        if (perfRow3) {
            const perfTop = P2_ROW_BOUNDS[20]
            const perfH = P2_ROW_BOUNDS[21] - P2_ROW_BOUNDS[20]
            const perfContent = normalizeText(perfRow3.content)

            const drawMpaVal = (v: string) => drawWrappedInCell(page2, p2Height, v, 237, perfTop, 38, perfH, 6.7)
            // ★空欄はテンプレート実測で 293.64–304.20（10.56pt）。294/9 は実測より 1.56pt 狭かった。
            //   ただし実測に直しても4桁（例「1800」）は 5.0pt 以上では物理的に入らない
            //   （4桁 × 0.556em × 5.0pt = 11.12pt > 10.56pt）。刷り込みが両端を規定しており
            //   広げようが無いので、桁数の多い吐出量は下限を割る。★様式側の制約として要相談。
            const drawFlowVal = (v: string) => drawInCellWithFont(page2, p2Height, fonts, v, 293.64, perfTop, 10.56, perfH, 6.0, { paddingX: 0.5 })

            if (perfRow3.flow_value) {
                if (perfContent) drawMpaVal(perfContent)
                drawFlowVal(perfRow3.flow_value)
            } else if (perfContent.includes("/")) {
                const slashIdx = perfContent.indexOf("/")
                const mpa = perfContent.slice(0, slashIdx).trim()
                const flow = perfContent.slice(slashIdx + 1).trim()
                if (mpa) drawMpaVal(mpa)
                if (flow) drawFlowVal(flow)
            } else if (perfContent) {
                drawMpaVal(perfContent)
            }
        }

        drawChoiceCircle(page2, p2Height, fonts, p2Rows3[7]?.content ?? "", [
            { label: "専用", cx: 267.2, cy: 239.4, rx: 14, ry: 7 },
            { label: "兼用", cx: 309.2, cy: 239.4, rx: 14, ry: 7 },
        ])

        drawResultRows(page3, p3Height, body.page3_rows ?? [], P3_ROW_BOUNDS, {
            rowsKey: "page3_rows",
            contentX: 238, contentW: 105,
            judgmentX: 343, judgmentW: 37,
            badX: 380, badW: 75,
            actionX: 455, actionW: 75,
        }, {
            // 放水圧力: 右側に「MPa」印刷済み (x=322.6) → x=238, w=83
            15: { x: 238, w: 83 },
        }, new Set([
            17, // 設定圧力/作動圧力: 複合セル → 手動描画
            25, // ホース/ノズル径: 複合セル → 手動描画
        ]))

        // P3 row 17: 圧力スイッチ「設定圧力 ___ MPa | 作動圧力 ___ MPa」
        // content="0.85/0.82" → 設定圧力=0.85, 作動圧力=0.82
        const p3Rows3 = body.page3_rows ?? []
        const switchRow = p3Rows3[17]
        if (switchRow) {
            const swTop = P3_ROW_BOUNDS[17]
            const swH = P3_ROW_BOUNDS[18] - P3_ROW_BOUNDS[17]
            const swContent = normalizeText(switchRow.content)
            // 値は行の下半分（MPaラベルと同じ高さ y≈403-414）に配置
            const valTop = swTop + swH / 2 - 2
            const valH = swH / 2 + 2
            // ★入力欄を2つ（content=設定圧力 / current_value=作動圧力）にしたので
            //   通常は分岐せずそのまま描く。「/」区切りは、入力欄が1つだった頃に
            //   点検者が「0.85/0.82」と書いた旧データのための後方互換に限る
            //   （下の row 25 ホース行と同じ「新キー優先 →「/」分割」の順序）。
            const swCurrent = normalizeText(switchRow.current_value)
            const legacy = !swCurrent && swContent.includes("/")
            const setPressure = legacy ? swContent.split("/")[0]?.trim() : swContent
            const actPressure = legacy ? swContent.split("/")[1]?.trim() : swCurrent
            // 設定圧力値: 「設定圧力」(x=244-286)の下、「MPa」(x=273)の左
            drawInCellWithFont(page3, p3Height, fonts, setPressure, 244, valTop, 28, valH, 6.5, { paddingX: 0.5 })
            // 作動圧力値: 「作動圧力」(x=296-338)の下、「MPa」(x=326)の左
            drawInCellWithFont(page3, p3Height, fonts, actPressure, 296, valTop, 28, valH, 6.5, { paddingX: 0.5 })
        }

        // P3 row 25: ホース/ノズル径「ホース ___m× ___本 | ノズル径 ___mm」
        // 新キー優先（content=長さ, hose_count=本数, nozzle_dia=口径）→ "/" 分割 → 単一content
        const hoseRow = p3Rows3[25]
        if (hoseRow) {
            const hTop = P3_ROW_BOUNDS[25]
            const hH = P3_ROW_BOUNDS[26] - P3_ROW_BOUNDS[25]
            const hContent = normalizeText(hoseRow.content)
            const hCount = normalizeText(hoseRow.hose_count)
            const nDia = normalizeText(hoseRow.nozzle_dia)
            // 値は行の下半分（m×, 本, mmラベルと同じ高さ）に配置
            const hValTop = hTop + hH / 2 - 2
            const hValH = hH / 2 + 2
            const drawLen = (v: string) => { if (v) drawInCellWithFont(page3, p3Height, fonts, v, 244, hValTop, 20, hValH, 6.5, { paddingX: 0.5 }) }
            const drawCnt = (v: string) => { if (v) drawInCellWithFont(page3, p3Height, fonts, v, 287, hValTop, 9, hValH, 6.0, { paddingX: 0 }) }
            const drawDia = (v: string) => { if (v) drawInCellWithFont(page3, p3Height, fonts, v, 310, hValTop, 15, hValH, 6.0, { paddingX: 0 }) }
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
            rowsKey: "page4_rows",
            contentX: 242, contentW: 106,
            judgmentX: 348, judgmentW: 36,
            badX: 384, badW: 71,
            actionX: 455, actionW: 75,
        }, {
            // 閉鎖型 電動機の運転電流: 右側に「Ａ」印刷済み (x=332.9) → x=242, w=89
            2: { x: 242, w: 89 },
            // 閉鎖型 放水圧力: 右側に「MPa」印刷済み (x=327.7) → x=242, w=84
            4: { x: 242, w: 84 },
            7: { x: 242, w: 84 },
            9: { x: 242, w: 84 },
            // 開放型 電動機の運転電流: 右側に「Ａ」印刷済み (x=332.9) → x=242, w=89
            13: { x: 242, w: 89 },
        })

        drawResultRows(page5, p5Height, body.page5_rows ?? [], P5_ROW_BOUNDS, {
            rowsKey: "page5_rows",
            contentX: 242, contentW: 106,
            judgmentX: 348, judgmentW: 36,
            badX: 384, badW: 71,
            actionX: 455, actionW: 75,
        }, {
            // 電動機の運転電流: 右側に「Ａ」印刷済み (x=332.9) → x=242, w=89
            2: { x: 242, w: 89 },
            // 放水圧力: 右側に「MPa」印刷済み (x=327.7) → x=242, w=84
            4: { x: 242, w: 84 },
            // 放水量: 右側に「L/min」印刷済み (x=317.2) → x=242, w=73
            5: { x: 242, w: 73 },
            // 高架水槽 放水圧力
            8: { x: 242, w: 84 },
            // 高架水槽 放水量
            9: { x: 242, w: 73 },
        })

        drawWrappedInCell(page5, p5Height, body.notes, 83, 359, 447, 280, 7.4)

        const device1 = body.device1 ?? {}
        const device2 = body.device2 ?? {}
        const devOpts: DrawOptions = { paddingX: 1 }
        // ★セルの左端が縦罫線の上に乗っていた欄は x を罫線の右へ寄せ、右端は据え置く
        //   （w を同じだけ減らす）。paddingX は他の欄と共通なので触らない。
        //   実測の罫線: device1.name 83.76〜84.24 / date 194.76〜195.24 / device2.name 307.08〜307.56
        drawInCell(page5, p5Height, device1.name, 83.35, 658, 55.65, 19, 7.2, devOpts)
        drawInCellWithFont(page5, p5Height, fonts, device1.model, 139, 658, 55, 19, 7.2, devOpts)
        drawInCell(page5, p5Height, formatJapaneseDateText(device1.calibrated_at), 194.34, 658, 55.66, 19, 7.2, devOpts)

        const drawDeviceMaker = (text: unknown, page: PDFPage, pageH: number, cellX: number, cellW: number, cellTop: number, cellH: number) => {
            const norm = normalizeText(text)
            if (!norm) return
            const padX = 1
            const availW = cellW - padX * 2
            let sz = 7.2
            const w = measureRuns(fonts, String(norm ?? ""), sz)
            // 0.98 の余白は撤廃（2026-07-24 実測: はみ出し・切り詰め・フォントサイズ分布のどれも変化なし。
            // 丸め防御を名乗るには2%は大きすぎ、0.85/0.90 と同じ「症状を隠す係数」の系統だった）
            if (w > availW) sz = sz * (availW / w)
            sz = Math.max(sz, 3.5)
            const drawn = truncateToFitWidth(norm, sz, availW)
            if (!drawn) return
            const th = fonts.jp.heightAtSize(sz, { descender: true })
            const textTop = cellTop + (cellH - th) / 2
            drawTextRuns(page, fonts, String(drawn ?? ""), cellX + padX, pageH - (textTop + th * 0.78), sz)
        }
        drawDeviceMaker(device1.maker, page5, p5Height, 250, 56, 658, 19)

        drawInCell(page5, p5Height, device2.name, 306.66, 658, 55.34, 19, 7.2, devOpts)
        drawInCellWithFont(page5, p5Height, fonts, device2.model, 362, 658, 56, 19, 7.2, devOpts)
        drawInCell(page5, p5Height, formatJapaneseDateText(device2.calibrated_at), 418, 658, 56, 19, 7.2, devOpts)
        drawDeviceMaker(device2.maker, page5, p5Height, 474, 56, 658, 19)

        // ⑧ 枠に収まらなかった項目があればPDFを返さず一覧を返す。
        //   黙って "..." で切り詰めると法定書類から情報が静かに欠落するため。
        fonts.fit?.resolve(body)
        const systemOverflow = systemFitFailures(fonts.fit!)
        if (systemOverflow.length) {
            // 業者には直せない値（テンプレート文言・整形済みの日付など）＝実装側の不具合として記録
            console.error("[pdf] 収容不能(システム由来)", { form: "別記様式第3", items: systemOverflow })
        }
        const fitFormLabel = "別記様式第3"
        logFitDebug(fitFormLabel, fonts.fit!)
        if (fonts.fit?.smalls.length) {
            // 判読しづらい大きさで描かれた項目。単独では止められない（上記コメント参照）ので記録のみ
            console.warn("[pdf] 極小フォントで描画", { count: fonts.fit.smalls.length })
        }
        const fitError = buildFitError("別記様式第3", fonts.fit!)
        if (fitError) return NextResponse.json(fitError, { status: 422 })

        const pdfBytes = await pdfDoc.save()
        return new NextResponse(pdfBytes as unknown as BodyInit, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                // ⑨ 設計値から大きく縮んだ項目があれば警告として運ぶ（PDFは返す）
                ...fitWarningHeader(fitFormLabel, fonts.fit!),
                "Content-Disposition": 'attachment; filename="s50_kokuji14_bekki3_filled.pdf"',
            },
        })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 })
    }
}
