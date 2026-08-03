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
import {
    periodDateError,
FIT_EPSILON,
    blankPrintedRows,
    drawChoiceCircle,
    drawPeriodDate,
    drawTextInCell,
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
    page1_rows: [4, 12, 24],
    page2_rows: [28, 30, 35],
    page3_rows: [24, 30],
    page4_rows: [2],
}

type Bekki6Row = {
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
    spec4?: string
    spec5?: string
    // 旧形式（後方互換）：date+temp+value を結合した1テキスト
    measure1?: string
    measure2?: string
    measure3?: string
    measure4?: string
    // 新形式：4セル × (date, temp, value) trio
    measure1_date?: string
    measure1_temp?: string
    measure1_value?: string
    measure2_date?: string
    measure2_temp?: string
    measure2_value?: string
    measure3_date?: string
    measure3_temp?: string
    measure3_value?: string
    measure4_date?: string
    measure4_temp?: string
    measure4_value?: string
}

type Bekki6Payload = {
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
    page1_rows?: Bekki6Row[]
    page2_rows?: Bekki6Row[]
    page3_rows?: Bekki6Row[]
    page4_rows?: Bekki6Row[]
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
    269.33, 284.67, 299.33, 313.33, 327.33, 340.67, 354.0, 366.67, 380.0,
    392.67, 406.0, 418.67, 432.0, 444.67, 458.0, 471.33, 484.0, 497.33,
    510.0, 523.33, 536.67, 549.33, 562.67, 575.33, 588.67, 602.0, 614.67,
    627.33, 640.67, 654.0, 666.67, 680.0, 693.33,
]

const P2_ROW_BOUNDS = [
    78.67, 94.0, 108.67, 123.33, 138.0, 152.67, 167.33, 182.0, 196.67,
    211.33, 226.0, 240.67, 255.33, 270.0, 285.33, 300.0, 314.67, 329.33,
    344.0, 358.67, 373.33, 388.0, 402.67, 417.33, 432.0, 446.67, 461.33,
    476.0, 490.67, 505.33, 520.0, 534.67, 549.33, 564.0, 579.33, 594.0,
    608.67, 623.33, 638.0, 652.67, 667.33,
]

const P3_ROW_BOUNDS = [
    79.33, 96.67, 114.0, 132.0, 149.33, 166.67, 184.0, 201.33, 219.33,
    236.67, 254.0, 272.0, 289.33, 306.67, 324.0, 342.0, 359.33, 376.67,
    394.0, 411.33, 429.33, 446.67, 464.0, 482.0, 499.33, 516.67, 534.0,
    552.0, 569.33, 586.67, 604.0, 621.33, 639.33, 656.67, 674.0, 692.0, 709.33,
]

const P4_ROW_BOUNDS = [
    79.33, 101.33, 123.33, 145.33, 167.33, 189.33, 211.33, 233.33, 255.33,
    277.33, 299.33, 321.33, 343.33,
]

const P5_ROW_BOUNDS = [
    176.0, 196.0, 216.0, 236.0, 256.0, 276.0, 296.0, 316.0, 336.0, 356.0,
    376.0, 396.0, 416.0, 436.0, 456.0, 476.0, 496.0, 516.0, 536.0, 556.0,
    576.0, 596.0, 616.0, 636.0, 656.0, 676.0, 696.0, 716.0, 736.0, 756.0,
]

const P5_COLS = [
    64.0, 86.67, 125.33, 160.67, 196.09, 234.67,
    274.09, 310.67, 365.33, 420.0, 474.67, 529.33,
]

const PERIOD_ROW = { top: 171.33, h: 16.0 }
// baseline は刷り込み「年」のベースライン（テンプレート p1 の実測値）。
// ★これが無いとセル矩形の中央に置くことになり、刷り込みと高さが揃わない。
//   実測では23様式すべてでズレていた（-0.4〜-5.19pt / bekki7 が最大）。
//   罫線も越えず切り詰めも起きないので、どの検査にも出なかった。
const PERIOD_START_ANCHORS = { year: 293.33, month: 335.33, day: 377.33, baseline: 183.36 }
const PERIOD_END_ANCHORS = { year: 430.0, month: 471.33, day: 513.33, baseline: 183.36 }

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
        const body = (await req.json()) as Bekki6Payload

        // ★点検期間が年月日に分解できないときは描かずに止める。
        //   以前は期間文字列を刷り込み「年月日～年月日」の上に生で描いていた
        //   （22様式共通。セル定義監査が定義上の重なりとして検出）。
        //   実測: 現実値0件 / 長文0件。入力画面は type="date" なので UI からは到達しない。
        const periodErr = periodDateError("別記様式第6", body.period_start, body.period_end)
        if (periodErr) return NextResponse.json(periodErr, { status: 422 })

        const candidatePdfPaths = [
            path.join(process.cwd(), "public", "PDF", "s50_kokuji14_bekki6.pdf"),
            path.join(process.cwd(), "public", "s50_kokuji14_bekki6.pdf"),
        ]
        const pdfPath = candidatePdfPaths.find((p) => fs.existsSync(p))
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf")

        if (!pdfPath) throw new Error("Template PDF not found: s50_kokuji14_bekki6.pdf")

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

            const textToDraw = truncateToFitWidth(normalized, currentSize, maxWidth,
                cellAt(page, cellX, cellTopFromTop, cellW, cellH, options?.at))
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
                paddingX: 2.2,
                paddingY: 1.2,
                minFontSize: 3.5,
                lineGap: 0.7,
                at,
            },        })

        const drawResultRows = (
            page: PDFPage,
            pageHeight: number,
            rows: Bekki6Row[],
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

                // ★どの欄の何行目のどの列かを渡す。渡さないと fit 報告のラベルが

                //   「同じ値を持つ最初の入力欄」を指す（本番の bekki12 で実際に誤帰属していた）。

                const ref = (column: string): CellRef => ({ rowsKey: columns.rowsKey, row: i, column })

                if (!skipContentRows.has(i)) {
                    const cx = contentOverrides[i]?.x ?? columns.contentX
                    const cw = contentOverrides[i]?.w ?? columns.contentW
                    drawWrappedInCell(page, pageHeight, row.content, cx, top, cw, h, 6.6, ref("content"))

                }

                drawInCell(page, pageHeight, formatJudgment(row.judgment), columns.judgmentX, top, columns.judgmentW, h, 8.0, { align: "center", at: ref("judgment") })

                drawWrappedInCell(page, pageHeight, row.bad_content, columns.badX, top, columns.badW, h, 6.4, ref("bad_content"))

                drawWrappedInCell(page, pageHeight, row.action_content, columns.actionX, top, columns.actionW, h, 6.4, ref("action_content"))
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

                // 仕様域 (cols 0-6): 1セル=1値（PR1 と同じ）
                const specValues = [row.no, row.cylinder_no, row.spec1, row.spec2, row.spec3, row.spec4, row.spec5]
                for (let c = 0; c < specValues.length; c += 1) {
                    const x = P5_COLS[c]
                    const w = P5_COLS[c + 1] - P5_COLS[c]
                    drawWrappedInCell(page, pageHeight, specValues[c], x, top, w, h, 6.3)
                }

                // 測定域 (cols 7-10): Plan B 配置
                //   上半分: date（全幅）
                //   下半分: temp（左半分） / value（右半分）
                // セル寸法: ~54.7pt × 20pt → 上下 10pt 高 → drawTextInCell auto-shrink で ~6.2pt 想定
                // PR2/3 の drawCellSubRegions（vertical 等分割）ではなく、Plan B 用にインライン 3 呼び出し
                const legacy = [row.measure1, row.measure2, row.measure3, row.measure4]
                const dates = [row.measure1_date, row.measure2_date, row.measure3_date, row.measure4_date]
                const temps = [row.measure1_temp, row.measure2_temp, row.measure3_temp, row.measure4_temp]
                const values = [row.measure1_value, row.measure2_value, row.measure3_value, row.measure4_value]
                const subOpts = { paddingX: 1.0, paddingY: 0.5, minFontSize: 3.5, align: "center" as const }
                for (let m = 0; m < 4; m += 1) {
                    const c = 7 + m
                    const x = P5_COLS[c]
                    const w = P5_COLS[c + 1] - P5_COLS[c]
                    const subH = h / 2
                    const halfW = w / 2

                    const date = dates[m] ?? ""
                    const temp = temps[m] ?? ""
                    const value = (values[m] && values[m] !== "") ? values[m] : (legacy[m] ?? "")

                    // 上半分: date（全幅）
                    drawTextInCell({
                        page, pageHeight, fonts, text: date,
                        cellX: x, cellTopFromTop: top, cellW: w, cellH: subH,
                        fontSize: 7, options: subOpts,
                    })
                    // 下左半分: temp
                    drawTextInCell({
                        page, pageHeight, fonts, text: temp,
                        cellX: x, cellTopFromTop: top + subH, cellW: halfW, cellH: subH,
                        fontSize: 7, options: subOpts,
                    })
                    // 下右半分: value
                    drawTextInCell({
                        page, pageHeight, fonts, text: value,
                        cellX: x + halfW, cellTopFromTop: top + subH, cellW: halfW, cellH: subH,
                        fontSize: 7, options: subOpts,
                    })
                }
            }
        }

        // Page1 header
        // 刷り込みに重ねない: 末尾の刷り込み「）」(522.7-) の手前まで（テンプレート実測）
        drawInCell(page1, p1Height, body.zone_name, 470.0, 82, 52.7, 12, 7.6)
        // 設備方式: テンプレートに「（設備方式：全域・局所・移動）」が刷り込まれている。
        // ★従来はこの値を様式タイトルの上（x=150）に文字で描いていた。タイトルは
        //   正典でも完全な刷り込みで記入欄が無く、bekki7/8 では実際に重なっていた。
        //   選択肢は右側にあるので、該当する語を○で囲む（座標はテンプレート実測）。
        drawChoiceCircle(page1, p1Height, fonts, body.equipment_system, [
            { label: "全域", cx: 452.29, cy: 105.9, rx: 14.14, ry: 7.88 },
            { label: "局所", cx: 481.81, cy: 105.9, rx: 14.14, ry: 7.88 },
            { label: "移動", cx: 511.1, cy: 105.9, rx: 14.14, ry: 7.88 },
        ])
        drawInCell(page1, p1Height, body.form_name, 113.33, 116.0, 266.0, 27.33, 8.8)
        drawInCell(page1, p1Height, body.fire_manager, 422.67, 116.0, 106.0, 27.33, 8.4)
        drawInCell(page1, p1Height, body.location, 113.33, 143.33, 266.0, 28.0, 8.5)
        drawInCell(page1, p1Height, body.witness, 422.67, 143.33, 106.0, 28.0, 8.3)

        // 点検種別: テンプレートに「機器・総合」が刷り込まれているので文字を重ねず○で囲む。
        // ○の座標はテンプレートPDFの文字を実測（様式ごとに位置が違う）。
        drawChoiceCircle(page1, p1Height, fonts, body.inspection_type || "機器・総合", [
            { label: "機器", cx: 133.08, cy: 179.53, rx: 16.78, ry: 7.28 },
            { label: "総合", cx: 186.84, cy: 179.53, rx: 16.78, ry: 7.28 },
        ])
        const start = formatDateText(body.period_start)
        const end = formatDateText(body.period_end)
        if (parseDateParts(body.period_start) || parseDateParts(body.period_end)) {
            drawPeriodDate({ page: page1, pageHeight: p1Height, fonts, dateValue: body.period_start, anchors: PERIOD_START_ANCHORS, rowTop: PERIOD_ROW.top, rowHeight: PERIOD_ROW.h, fontSize: 7.8 })
            drawPeriodDate({ page: page1, pageHeight: p1Height, fonts, dateValue: body.period_end, anchors: PERIOD_END_ANCHORS, rowTop: PERIOD_ROW.top, rowHeight: PERIOD_ROW.h, fontSize: 7.8 })
        }

        // 刷り込みに重ねない: 前置ラベル「氏名」(-139.9) の右から（テンプレート実測）
        drawInCell(page1, p1Height, body.inspector_name, 140.4, 187.33, 64.9, 48.0, 8.0)
        // 刷り込みに重ねない: 「社名」(-290.4) の右から「TEL」(395.5-) の手前まで（テンプレート実測）
        drawInCell(page1, p1Height, body.inspector_company, 290.4, 187.33, 105.1, 23.0, 7.8)
        // 刷り込みに重ねない: 前置ラベル「TEL」(-411.4) の右から（テンプレート実測）
        drawInCell(page1, p1Height, body.inspector_tel, 411.4, 187.33, 117.3, 23.0, 7.8)
        // 刷り込みに重ねない: 前置ラベル「住所」(-290.4) の右から（テンプレート実測）
        drawInCell(page1, p1Height, body.inspector_address, 290.4, 210.0, 238.3, 25.33, 7.6)

        // 刷り込みの見出し行には描かない: p1 行0 = 刷り込み「機器点検」（テンプレート実測）
        drawResultRows(page1, p1Height, blankPrintedRows(body.page1_rows ?? [], new Set([0])), P1_ROW_BOUNDS, {
            rowsKey: "page1_rows",
            contentX: 225.33, contentW: 96.0,
            judgmentX: 321.33, judgmentW: 38.0,
            badX: 359.33, badW: 84.67,
            actionX: 444.0, actionW: 84.67,
        }, {
            4: { x: 225.33, w: 80.43 },   // 刷り込み「本」(305.76) の手前で止める
            12: { x: 225.33, w: 80.43 },   // 刷り込み「kg」(305.76) の手前で止める
            24: { x: 225.33, w: 80.43 },   // 刷り込み「本」(305.76) の手前で止める
        })

        // 帯21 は見出し行（刷り込み「緊 急 停 止 装 置」が項目名列いっぱいに字間を広げて入っており、
        // 直下の帯22「外形」以降がその下位項目）。入力があっても刷り込みに重ねない。
        drawResultRows(page2, p2Height, blankPrintedRows(body.page2_rows ?? [], new Set([21])), P2_ROW_BOUNDS, {
            rowsKey: "page2_rows",
            contentX: 225.33, contentW: 96.0,
            judgmentX: 321.33, judgmentW: 38.0,
            badX: 359.33, badW: 85.34,
            actionX: 444.67, actionW: 84.66,
        }, {
            28: { x: 225.33, w: 80.91 },   // 刷り込み「Ｖ」(306.24) の手前で止める
            30: { x: 225.33, w: 80.91 },   // 刷り込み「Ａ」(306.24) の手前で止める
            35: { x: 225.33, w: 80.91 },   // 刷り込み「秒」(306.24) の手前で止める
        }, new Set([17]))

        // PAGE2 row 17「起動装置 / 自動式 / 火災感知装置（専用・兼用）」: 公式PDF刷り込みの選択を丸囲み
        drawChoiceCircle(page2, p2Height, fonts, body.page2_rows?.[17]?.content ?? "", [
            { label: "専用", cx: 252.45, cy: 337.0, rx: 14, ry: 7 },
            { label: "兼用", cx: 294.45, cy: 337.0, rx: 14, ry: 7 },
        ])

        drawResultRows(page3, p3Height, body.page3_rows ?? [], P3_ROW_BOUNDS, {
            rowsKey: "page3_rows",
            contentX: 225.33, contentW: 96.0,
            judgmentX: 321.33, judgmentW: 38.0,
            badX: 359.33, badW: 85.34,
            actionX: 444.67, actionW: 84.66,
        }, {
            24: { x: 225.33, w: 80.91 },   // 刷り込み「Ｖ」(306.24) の手前で止める
            30: { x: 225.33, w: 80.91 },   // 刷り込み「ｍ」(306.24) の手前で止める
        })

        // 刷り込みの見出し行には描かない: p4 行0 = 刷り込み「総合点検」（テンプレート実測）
        drawResultRows(page4, p4Height, blankPrintedRows(body.page4_rows ?? [], new Set([0])), P4_ROW_BOUNDS, {
            rowsKey: "page4_rows",
            contentX: 235.33, contentW: 86.0,
            judgmentX: 321.33, judgmentW: 38.0,
            badX: 359.33, badW: 85.34,
            actionX: 444.67, actionW: 84.66,
        }, {
            2: { x: 235.33, w: 70.67 },   // 刷り込み「秒」(306.00) の手前で止める
        })

        drawWrappedInCell(page4, p4Height, body.notes, 92.67, 343.33, 436.66, 274.67, 7.2)

        const device1 = body.device1 ?? {}
        const device2 = body.device2 ?? {}
        // ★1台目は列が丸ごと1つ左にずれていた（実測で確認）。
        //   旧: name 92.67/36.0（機器名セルの左半分）・model 128.67/38.66（同じセルの右半分）
        //       calibrated_at 167.33（＝型式の列）・maker 218.67（＝校正年月日の列）
        //   → 型式が機器名欄に、校正年月日が型式欄に、製造者名が校正年月日欄に印字され、
        //     **製造者名の列は空のまま**出ていた。2台目は正しかったので気づけなかった。
        //   テンプレート p4 の縦罫線（実測）: 93.12 / 167.76 / 219.36 / 271.20 / 323.04 /
        //                                    374.64 / 426.48 / 478.32 / 530.16
        drawInCell(page4, p4Height, device1.name, 93.12, 639.33, 74.64, 20.67, 7.0)
        drawInCell(page4, p4Height, device1.model, 167.76, 639.33, 51.60, 20.67, 7.0)
        drawInCell(page4, p4Height, formatJapaneseDateText(device1.calibrated_at), 219.36, 639.33, 51.84, 20.67, 7.0)
        drawInCell(page4, p4Height, device1.maker, 271.20, 639.33, 51.84, 20.67, 7.0)

        drawInCell(page4, p4Height, device2.name, 323.04, 639.33, 51.60, 20.67, 7.0)
        drawInCell(page4, p4Height, device2.model, 374.64, 639.33, 51.84, 20.67, 7.0)
        drawInCell(page4, p4Height, formatJapaneseDateText(device2.calibrated_at), 426.48, 639.33, 51.84, 20.67, 7.0)
        drawInCell(page4, p4Height, device2.maker, 478.32, 639.33, 51.84, 20.67, 7.0)

        drawCylinderRows(page5, p5Height, body.page5_rows ?? [])

        // ⑧ 枠に収まらなかった項目があればPDFを返さずに一覧を返す。
        //   黙って "..." で切り詰めると、法定書類から情報が静かに欠落するため。
        fonts.fit?.resolve(body)
        const systemOverflow = systemFitFailures(fonts.fit!)
        if (systemOverflow.length) {
            // 業者には直せない（テンプレート固定文言・整形済みの値）＝実装側の不具合として記録
            console.error("[pdf] 収容不能(システム由来)", { form: "別記様式第6", items: systemOverflow })
        }
        const fitFormLabel = "別記様式第6"
        logFitDebug(fitFormLabel, fonts.fit!)
        if (fonts.fit?.smalls.length) {
            // 判読しづらい大きさで描かれた項目。単独では止められない（上記コメント参照）ので記録のみ
            console.warn("[pdf] 極小フォントで描画", { count: fonts.fit.smalls.length })
        }
        const fitError = buildFitError("別記様式第6", fonts.fit!)
        if (fitError) return NextResponse.json(fitError, { status: 422 })

        const pdfBytes = await pdfDoc.save()
        return new NextResponse(pdfBytes as unknown as BodyInit, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                // ⑨ 設計値から大きく縮んだ項目があれば警告として運ぶ（PDFは返す）
                ...fitWarningHeader(fitFormLabel, fonts.fit!),
                "Content-Disposition": 'attachment; filename="s50_kokuji14_bekki6_filled.pdf"',
            },
        })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 })
    }
}
