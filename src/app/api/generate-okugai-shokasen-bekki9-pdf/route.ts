import { NextRequest, NextResponse } from "next/server"
import { PDFDocument, rgb, type PDFPage, StandardFonts } from "pdf-lib"
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
    page1_rows: [1, 10, 12],
    page2_rows: [8, 9, 10, 21, 22, 28, 29],
    page3_rows: [3, 14, 16, 17, 19, 20],
}

type BekkiRow = {
    content?: string
    judgment?: string
    bad_content?: string
    action_content?: string
    current_value?: string  // 電圧計・電流計行の電流値（A）
    flow_value?: string     // ポンプ性能の吐出量(L/min)
    hose_count?: string     // ホース本数
    nozzle_dia?: string     // ノズル径(mm)
}

type DeviceRow = {
    name?: string
    model?: string
    calibrated_at?: string
    maker?: string
}

type Bekki9Payload = {
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
    333.33, 354.0, 374.67, 395.33, 415.33, 436.0, 456.67, 476.67, 497.33,
    518.0, 538.67, 558.67, 579.33, 600.0, 620.67, 641.33, 661.33, 682.0, 702.67,
]

const P2_ROW_BOUNDS = [
    82.67, 100.0, 116.67, 134.0, 150.67, 168.0, 184.67, 202.0, 218.67, 236.0,
    252.67, 270.0, 286.67, 304.0, 320.67, 338.0, 354.67, 372.0, 388.67, 406.0,
    422.67, 440.0, 456.67, 474.0, 490.67, 508.0, 524.67, 542.0, 558.67, 576.0,
    592.67, 610.0, 626.67, 644.0, 660.67, 678.0, 694.67,
]

const P3_ROW_BOUNDS = [
    82.67, 103.33, 124.0, 144.0, 171.33, 192.0, 212.67, 232.67, 253.33, 274.0,
    294.67, 314.67, 335.33, 356.0, 376.67, 396.67, 417.33, 438.0, 458.67, 478.67,
    499.33, 520.0, 540.67,
]

const PERIOD_ROW = { top: 161.33, h: 21.34 }
// baseline は刷り込み「年」のベースライン（テンプレート p1 の実測値）。
// ★これが無いとセル矩形の中央に置くことになり、刷り込みと高さが揃わない。
//   実測では23様式すべてでズレていた（-0.4〜-5.19pt / bekki7 が最大）。
//   罫線も越えず切り詰めも起きないので、どの検査にも出なかった。
const PERIOD_START_ANCHORS = { year: 302.5, month: 340.5, day: 378.5, baseline: 175.68 }
const PERIOD_END_ANCHORS = { year: 427.3, month: 465.7, day: 503.6, baseline: 175.68 }

const normalizeText = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim()
const getExtra = (body: Bekki9Payload, key: string) => normalizeText(body.extra_fields?.[key])

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
        const body = (await req.json()) as Bekki9Payload

        // ★点検期間が年月日に分解できないときは描かずに止める。
        //   以前は期間文字列を刷り込み「年月日～年月日」の上に生で描いていた
        //   （22様式共通。セル定義監査が定義上の重なりとして検出）。
        //   実測: 現実値0件 / 長文0件。入力画面は type="date" なので UI からは到達しない。
        const periodErr = periodDateError("別記様式第9", body.period_start, body.period_end)
        if (periodErr) return NextResponse.json(periodErr, { status: 422 })

        const candidatePdfPaths = [
            path.join(process.cwd(), "public", "PDF", "s50_kokuji14_bekki9.pdf"),
            path.join(process.cwd(), "public", "s50_kokuji14_bekki9.pdf"),
        ]
        const pdfPath = candidatePdfPaths.find((p) => fs.existsSync(p))
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf")
        if (!pdfPath) throw new Error("Template PDF not found: s50_kokuji14_bekki9.pdf")

        const existingPdfBytes = fs.readFileSync(pdfPath)
        const fontBytes = fs.readFileSync(fontPath)
        const pdfDoc = await PDFDocument.load(existingPdfBytes)
        pdfDoc.registerFontkit(fontkit)
        const customFont = await pdfDoc.embedFont(fontBytes)
        // ASCII(型式・番号・日付等)は Helvetica で描く。NotoSansJP は「英字+ハイフン+数字」で
        // 数字がCJK拡張Aのグリフに化け、計測幅と実描画幅が最大+41.6%ズレて枠をはみ出すため。
        const latinFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
        const fonts: ReportFonts = { jp: customFont, latin: latinFont, fit: createFitCollector() }

        const [page1, page2, page3] = pdfDoc.getPages()
        const p1Height = page1.getSize().height
        const p2Height = page2.getSize().height
        const p3Height = page3.getSize().height

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
                paddingX: 2.0,
                paddingY: 1.0,
                minFontSize: 4.5,
                lineGap: 0.7,
                at,
            },        })

        const drawResultRows = (
            page: PDFPage,
            pageHeight: number,
            rows: BekkiRow[],
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
                // ★どの欄の何行目のどの列かを渡す。渡さないと fit 報告のラベルが
                //   「同じ値を持つ最初の入力欄」を指す（本番の bekki12 で実際に誤帰属していた）。
                const ref = (column: string): CellRef => ({ rowsKey: columns.rowsKey, row: i, column })
                if (!skipContentRows.has(i)) {
                    drawWrappedInCell(page, pageHeight, row.content, cx, top, cw, h, 6.5, ref("content"))
                }
                drawInCell(page, pageHeight, formatJudgment(row.judgment), columns.judgmentX, top, columns.judgmentW, h, 8.0, { align: "center", at: ref("judgment") })
                drawWrappedInCell(page, pageHeight, row.bad_content, columns.badX, top, columns.badW, h, 6.2, ref("bad_content"))
                drawWrappedInCell(page, pageHeight, row.action_content, columns.actionX, top, columns.actionW, h, 6.2, ref("action_content"))
            }
        }

        // 専用/兼用 など選択式セルに〇を描画（bekki2/3/4/20 と同一パターン）

        const drawRightAt = (
            page: PDFPage,
            pageHeight: number,
            text: string,
            anchorX: number,
            rowTop: number,
            rowH: number,
            size = 7.7,
        ) => {
            if (!text) return
            const textHeight = fonts.jp.heightAtSize(size, { descender: true })
            const textTop = rowTop + (rowH - textHeight) / 2
            const y = pageHeight - (textTop + textHeight * 0.78)
            const textWidth = measureRuns(fonts, String(text ?? ""), size)
            drawTextRuns(page, fonts, String(text ?? ""), anchorX - textWidth, y, size)
        }

        

        drawInCell(page1, p1Height, body.form_name, 112.0, 108.67, 237.33, 26.66, 8.7)
        drawInCell(page1, p1Height, body.fire_manager, 439.33, 108.67, 90.0, 26.66, 8.0)
        drawInCell(page1, p1Height, body.location, 112.0, 135.33, 237.33, 26.0, 8.2)
        drawInCell(page1, p1Height, body.witness, 439.33, 135.33, 90.0, 26.0, 8.0)
        // 点検種別: テンプレートに「機器・総合」が刷り込まれているので文字を重ねず○で囲む。
        // ○の座標はテンプレートPDFの文字を実測（様式ごとに位置が違う）。
        drawChoiceCircle(page1, p1Height, fonts, body.inspection_type || "機器・総合", [
            { label: "機器", cx: 132, cy: 171.85, rx: 16.9, ry: 7.78 },
            { label: "総合", cx: 186.77, cy: 171.85, rx: 16.96, ry: 7.53 },
        ])

        const periodText = (() => {
            const start = formatDateText(body.period_start)
            const end = formatDateText(body.period_end)
            return start && end ? `${start} - ${end}` : (start || end)
        })()
        if (parseDateParts(body.period_start) || parseDateParts(body.period_end)) {
            drawPeriodDate({ page: page1, pageHeight: p1Height, fonts, dateValue: body.period_start, anchors: PERIOD_START_ANCHORS, rowTop: PERIOD_ROW.top, rowHeight: PERIOD_ROW.h, fontSize: 7.7 })
            drawPeriodDate({ page: page1, pageHeight: p1Height, fonts, dateValue: body.period_end, anchors: PERIOD_END_ANCHORS, rowTop: PERIOD_ROW.top, rowHeight: PERIOD_ROW.h, fontSize: 7.7 })
        }

        // 刷り込みに重ねない: 前置ラベル氏名(-138.7) の右から（テンプレート実測）
        drawInCell(page1, p1Height, body.inspector_name, 139.22, 182.67, 68.78, 52.0, 7.7)
        // 刷り込みに重ねない: 後続のTEL(406.4-) の手前まで（テンプレート実測）
        drawInCell(page1, p1Height, body.inspector_company, 307.33, 182.67, 98.57, 26.0, 7.4)
        drawInCell(page1, p1Height, body.inspector_tel, 439.33, 182.67, 90.0, 26.0, 7.4)
        drawInCell(page1, p1Height, body.inspector_address, 307.33, 208.67, 222.0, 26.0, 7.3)

        // The left cells here are fixed labels (ポンチE/ 電動橁E, so avoid overwriting them.
        // ★製造者名/型式等の値セル（テンプレート罫線・印字グリフから実測 2026-07-24）。
        //   旧値 (164, 207) は印字ラベル「製造者名」と同じ x で、かつ y が1ブロック上。
        //   値が上の「点検者/所属会社」欄の上に重なって描かれ、罫線 x=207.0 を越えていた。
        //   行帯: 製造者名 y235.7-256.2 / 型式等 y256.7-277.2（h=20.5）
        //   セル: [159.4, 322.1] 内に印字ラベル 164.8-206.9 → 値は 209 から
        //         [369.4, 529.6] 内に印字ラベル 374.8-416.9 → 値は 419 から
        const MAKER_ROW = { top: 235.7, h: 20.5 }
        const MODEL_ROW = { top: 256.7, h: 20.5 }
        const LEFT_VALUE = { x: 209.0, w: 113.1 }
        const RIGHT_VALUE = { x: 419.0, w: 110.6 }
        drawInCell(page1, p1Height, getExtra(body, "pump_maker"), LEFT_VALUE.x, MAKER_ROW.top, LEFT_VALUE.w, MAKER_ROW.h, 7.2)
        drawInCell(page1, p1Height, getExtra(body, "pump_model"), LEFT_VALUE.x, MODEL_ROW.top, LEFT_VALUE.w, MODEL_ROW.h, 7.2)
        drawInCell(page1, p1Height, getExtra(body, "motor_maker"), RIGHT_VALUE.x, MAKER_ROW.top, RIGHT_VALUE.w, MAKER_ROW.h, 7.2)
        drawInCell(page1, p1Height, getExtra(body, "motor_model"), RIGHT_VALUE.x, MODEL_ROW.top, RIGHT_VALUE.w, MODEL_ROW.h, 7.2)

        const p1Rows9 = body.page1_rows ?? []
        drawResultRows(page1, p1Height, p1Rows9, P1_ROW_BOUNDS, {
            rowsKey: "page1_rows",
            contentX: 208.0,
            contentW: 99.33,
            judgmentX: 307.33,
            judgmentW: 42.0,
            badX: 349.33,
            badW: 90.0,
            actionX: 439.33,
            actionW: 90.0,
        }, {
            // 電圧計・電流計: 「Ｖ」(x=250.2-260.8)・「Ａ」(x=292.3-302.9)印刷済み → V前まで
            10: { x: 208.0, w: 40 },
            // B-2: 行0 — 刷り込み「種別」(213.72–234.84) の後ろの空欄に描く
            0: { x: 234.84, w: 72.49 },
                    1: { x: 208.0, w: 80.48 },   // 刷り込み「ｍP3」(288.48) の手前で止める
            12: { x: 208.0, w: 84.2 },   // 刷り込み「Ａ」(292.20) の手前で止める
            16: { x: 208.0, w: 63.2 },   // 刷り込み「種接地」(271.20) の手前で止める
        })

        // 電圧計・電流計 (row 10): 「Ｖ」と「Ａ」の間に電流値を描画
        const voltRow9 = p1Rows9[10]
        if (voltRow9?.current_value) {
            const voltTop = P1_ROW_BOUNDS[10]
            const voltH = P1_ROW_BOUNDS[11] - P1_ROW_BOUNDS[10]
            drawInCell(page1, p1Height, voltRow9.current_value, 262, voltTop, 28, voltH, 6.5)
        }

        drawResultRows(page2, p2Height, body.page2_rows ?? [], P2_ROW_BOUNDS, {
            rowsKey: "page2_rows",
            contentX: 208.0,
            contentW: 99.33,
            judgmentX: 307.33,
            judgmentW: 42.0,
            badX: 349.33,
            badW: 90.0,
            actionX: 439.33,
            actionW: 90.0,
        }, {
            // B-2: 刷り込み「設定圧力 ___ MPa」「作動圧力 ___ MPa」の空欄に値だけ描く
            //   （ラベル右端 255.72 〜 MPa 左端 287.16。テンプレート実測）
            8: { x: 255.72, w: 31.44 },
            10: { x: 255.72, w: 31.44 },
                    9: { x: 208.0, w: 79.04 },   // 刷り込み「MPa」(287.04) の手前で止める
            22: { x: 208.0, w: 89.48 },   // 刷り込み「L」(297.48) の手前で止める
            28: { x: 208.0, w: 79.04 },   // 刷り込み「MPa」(287.04) の手前で止める
            29: { x: 208.0, w: 79.04 },   // 刷り込み「MPa」(287.04) の手前で止める
        }, new Set([7, 21]))

        // PAGE2 row 7「遠隔操作部 / 機能（専用・兼用）」: 公式PDF刷り込みの選択を丸囲み
        drawChoiceCircle(page2, p2Height, fonts, body.page2_rows?.[7]?.content ?? "", [
            { label: "専用", cx: 237.24, cy: 210, rx: 14, ry: 7 },
            { label: "兼用", cx: 279.3, cy: 210.13, rx: 14.01, ry: 7.28 },
        ])

        // PAGE2 row 21「ポンプ / 性能（MPa・L/min）」: 吐出圧力(MPa)/吐出量(L/min) を分割描画
        // 新キー優先（content=MPa, flow_value=L/min）→ content の "/" 分割 → 単一content の3段fallback
        const perfRow9 = body.page2_rows?.[21]
        if (perfRow9) {
            const pTop = P2_ROW_BOUNDS[21]
            const pH = P2_ROW_BOUNDS[22] - P2_ROW_BOUNDS[21]
            const pContent = normalizeText(perfRow9.content)
            const pFlow = normalizeText(perfRow9.flow_value)
            // 公式PDF実測: MPa@239.8(x1=255.6) / L/min@276.6。値は各ラベル前の空白に中央寄せ
            const drawMpa = (v: string) => { if (v) drawInCell(page2, p2Height, v, 208, pTop, 31.8, pH, 6.0, { align: "center" }) }
            const drawLmin = (v: string) => { if (v) drawInCell(page2, p2Height, v, 255.6, pTop, 21, pH, 6.0, { align: "center" }) }
            if (pFlow) {
                drawMpa(pContent); drawLmin(pFlow)
            } else if (pContent.includes("/")) {
                const parts = pContent.split("/")
                drawMpa(parts[0]?.trim() ?? ""); drawLmin(parts[1]?.trim() ?? "")
            } else if (pContent) {
                drawMpa(pContent)
            }
        }

        // 刷り込みの見出し行には描かない: p3 行11 = 刷り込み「総合点検」（テンプレート実測）
        drawResultRows(page3, p3Height, blankPrintedRows(body.page3_rows ?? [], new Set([11])), P3_ROW_BOUNDS, {
            rowsKey: "page3_rows",
            contentX: 216.67,
            contentW: 94.66,
            judgmentX: 311.33,
            judgmentW: 42.0,
            badX: 353.33,
            badW: 89.34,
            actionX: 442.67,
            actionW: 86.66,
        }, {
            14: { x: 216.67, w: 79.37 },   // 刷り込み「Ａ」(296.04) の手前で止める
            16: { x: 216.67, w: 74.21 },   // 刷り込み「MPa」(290.88) の手前で止める
            17: { x: 216.67, w: 63.65 },   // 刷り込み「L/min」(280.32) の手前で止める
            19: { x: 216.67, w: 74.21 },   // 刷り込み「MPa」(290.88) の手前で止める
            20: { x: 216.67, w: 63.65 },   // 刷り込み「L/min」(280.32) の手前で止める
        }, new Set([3]))

        // PAGE3 row 3「屋外消火栓箱 / ホース・ノズル / 外形」: 長さ(m)/本数/口径(mm) を分割描画
        // 新キー優先（content=長さ, hose_count=本数, nozzle_dia=口径）→ "/" 分割 → 単一content
        const hoseRow9 = body.page3_rows?.[3]
        if (hoseRow9) {
            const hTop = P3_ROW_BOUNDS[3]
            const hH = P3_ROW_BOUNDS[4] - P3_ROW_BOUNDS[3]
            const hValTop = hTop + hH / 2 - 2
            const hValH = hH / 2 + 2
            const hContent = normalizeText(hoseRow9.content)
            const hCount = normalizeText(hoseRow9.hose_count)
            const nDia = normalizeText(hoseRow9.nozzle_dia)
            // 公式PDF実測: ｍ@233.3 / ×@243.8(x1=254.4) / 本@264.8(x1=275.4) / mm@291.1。content列左=216.67
            // ★2026-08-01 の拡張は前提が誤っていた。「この行には内部の縦罫線が無い
            //   （縦罫線は左 130.44 / 右 311.76 のみ）」としてセルを 213.16 まで広げたが、
            //   実測すると x 217.08〜217.56（太さ0.48pt）の縦罫線が y124.44〜171.60 に実在し、
            //   帯3（y144.00〜171.33）を貫いている。213.16 だと描画域が罫線を内包し、
            //   値が長いほど罫線を跨ぐ（実測: 値「0.45」のインクは罫線から 0.167pt ＝ 1画素）。
            // ★左端は「セルの左端」ではなく「描画域の左端」で決める。drawInCell の
            //   描画域は x+paddingX 〜 x+w-paddingX（paddingX 既定 2.5）なので、
            //     左 215.16 + 2.5 = 217.66  … 罫線の右端 217.56 から 0.10pt 外
            //     右 233.27 - 2.5 = 230.77  … 刷り込み「ｍ」233.28 から 2.51pt 手前
            //   使える幅 13.11pt。和文2字は 12.00pt なので 6.0pt のまま縮まない
            //   （2026-08-01 以前の 11.60pt では 5.80pt に縮んでいた）。
            //   ★paddingX を変えるとこの安全余裕が消える。変えるなら x も見直すこと。
            const drawLen = (v: string) => { if (v) drawInCell(page3, p3Height, v, 215.16, hValTop, 18.11, hValH, 6.0, { align: "center" }) }
            const drawCnt = (v: string) => { if (v) drawInCell(page3, p3Height, v, 254.4, hValTop, 10.4, hValH, 6.0, { align: "center" }) }
            const drawDia = (v: string) => { if (v) drawInCell(page3, p3Height, v, 275.4, hValTop, 15.7, hValH, 6.0, { align: "center" }) }
            if (hCount || nDia) {
                drawLen(hContent); drawCnt(hCount); drawDia(nDia)
            } else if (hContent.includes("/")) {
                const parts = hContent.split("/")
                drawLen(parts[0]?.trim() ?? ""); drawCnt(parts[1]?.trim() ?? ""); drawDia(parts[2]?.trim() ?? "")
            } else if (hContent) {
                drawLen(hContent)
            }
        }

        drawWrappedInCell(page3, p3Height, body.notes, 82.67, 540.67, 446.66, 88.66, 7.2)

        const device1 = body.device1 ?? {}
        const device2 = body.device2 ?? {}
        drawInCell(page3, p3Height, device1.name, 83, 649, 55, 14, 7.0)
        drawInCell(page3, p3Height, device1.model, 138, 649, 56, 14, 7.0)
        drawInCell(page3, p3Height, formatJapaneseDateText(device1.calibrated_at), 194, 649, 56, 14, 7.0)
        drawInCell(page3, p3Height, device1.maker, 250, 649, 56, 14, 7.0)
        drawInCell(page3, p3Height, device2.name, 306, 649, 56, 14, 7.0)
        drawInCell(page3, p3Height, device2.model, 362, 649, 56, 14, 7.0)
        drawInCell(page3, p3Height, formatJapaneseDateText(device2.calibrated_at), 418, 649, 56, 14, 7.0)
        drawInCell(page3, p3Height, device2.maker, 474, 649, 55, 14, 7.0)

        // ⑧ 枠に収まらなかった項目があればPDFを返さずに一覧を返す。
        //   黙って "..." で切り詰めると、法定書類から情報が静かに欠落するため。
        fonts.fit?.resolve(body)
        const systemOverflow = systemFitFailures(fonts.fit!)
        if (systemOverflow.length) {
            // 業者には直せない（テンプレート固定文言・整形済みの値）＝実装側の不具合として記録
            console.error("[pdf] 収容不能(システム由来)", { form: "別記様式第9", items: systemOverflow })
        }
        const fitFormLabel = "別記様式第9"
        logFitDebug(fitFormLabel, fonts.fit!)
        if (fonts.fit?.smalls.length) {
            // 判読しづらい大きさで描かれた項目。単独では止められない（上記コメント参照）ので記録のみ
            console.warn("[pdf] 極小フォントで描画", { count: fonts.fit.smalls.length })
        }
        const fitError = buildFitError("別記様式第9", fonts.fit!)
        if (fitError) return NextResponse.json(fitError, { status: 422 })

        const pdfBytes = await pdfDoc.save()
        return new NextResponse(pdfBytes as unknown as BodyInit, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                // ⑨ 設計値から大きく縮んだ項目があれば警告として運ぶ（PDFは返す）
                ...fitWarningHeader(fitFormLabel, fonts.fit!),
                "Content-Disposition": 'attachment; filename="s50_kokuji14_bekki9_filled.pdf"',
            },
        })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 })
    }
}
