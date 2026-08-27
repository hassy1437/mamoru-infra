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
    page1_rows: [3, 11, 13],
    page2_rows: [17],
}

type BekkiRow = { content?: string; judgment?: string; bad_content?: string; action_content?: string }
type DeviceRow = { name?: string; model?: string; calibrated_at?: string; maker?: string }

type Bekki11_2Payload = {
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
    304.5, 321.0, 337.5, 354.0, 370.5, 387.0, 403.5, 420.0, 436.5, 453.0,
    469.5, 486.0, 502.5, 519.0, 535.5, 552.0, 568.5, 585.0, 601.5, 618.0,
    634.5, 651.0, 667.5, 684.0, 700.5,
]

const P2_ROW_BOUNDS = [
    83.0, 104.5, 126.0, 147.5, 169.0, 190.5, 212.0, 233.5, 255.0, 276.5,
    298.0, 319.5, 341.0, 362.5, 384.0, 405.5, 427.0, 448.5, 470.0, 491.5,
]

// ★ヘッダ各セルはテンプレートPDFの罫線から実測した値（2026-07-24）。
//   旧定数（名称/所在を x=83.33 幅365.34 で描く）は別スケールの版に合わせたもので、
//   値が左のラベル欄「名　称」「所　在」の上に重なって描かれ、罫線 x=117.4 を越えていた。
//   セル境界: 64.6 | 117.4 …ラベル | 391.3 …名称/所在の値 | 433.8 | 529.6 …防火管理者/立会者
const HEADER = {
    nameRow: { top: 117.5, h: 25.8 },
    locationRow: { top: 143.8, h: 25.8 },
    valueX: 117.8,
    valueW: 273.5, // 117.8 → 391.3
    rightX: 434.3,
    rightW: 95.3, // 434.3 → 529.6
}

// 点検種別/点検年月日の行。旧値 top=162.0 は1行分上にずれており、
// 日付が上の「所在」行に食い込んで罫線 x=433.8 を越えていた。
const PERIOD_ROW = { top: 170.0, h: 16.0 }
const PERIOD_CELL = { x: 280.6, w: 249.0 } // 280.6 → 529.6

// 点検種別はテンプレートに「機　器　・　総　合」が印字済み。値の文字を重ねて描くと
// 二重表記になる（旧実装はこれをやっていた）ので、該当する語を丸で囲む方式に統一する
// （bekki5/6/7 が既に採っている方式）。座標は印字グリフの実測値。
const TYPE_CHOICES = [
    // ★2026-08-25: テンプレートの実測から解き直した（重なり 227px / 230px → 0px）。
    //   ★rx を広げ、ry を縮める。★縦だけでは解けない（角で字を切っていた）。
    { label: "機器", cx: 137.82, cy: 177.4, rx: 19.14, ry: 7.03 }, // 機 122.8-133.3 / 器 142.3-152.9
    { label: "総合", cx: 196.5, cy: 177.4, rx: 18.57, ry: 7.03 }, // 総 181.4-192.0 / 合 201.0-211.5
]

// 点検者ブロック。セル内に「氏名」「社名」「TEL」「住所」が印字されているため、
// 値はその右の空きに置き、上下位置は印字ラベルの中心に合わせる（実測値）。
const INSPECTOR = {
    name: { x: 147.0, top: 189.1, w: 67.6, h: 14.0 }, // 氏名 122.8-143.9 の右、セル右端 216.6
    company: { x: 310.0, top: 186.5, w: 99.0, h: 14.0 }, // 社名 285.6-306.7 の右、TEL 411.7 の手前
    tel: { x: 430.0, top: 186.5, w: 97.6, h: 14.0 }, // TEL 411.7-427.6 の右、セル右端 529.6
    address: { x: 310.0, top: 212.8, w: 217.6, h: 14.0 }, // 住所 285.6-306.7 の右
}
// baseline は刷り込み「年」のベースライン（テンプレート p1 の実測値）。
// ★これが無いとセル矩形の中央に置くことになり、刷り込みと高さが揃わない。
//   実測では23様式すべてでズレていた（-0.4〜-5.19pt / bekki7 が最大）。
//   罫線も越えず切り詰めも起きないので、どの検査にも出なかった。
const PERIOD_START_ANCHORS = { year: 316.5, month: 353.0, day: 388.5, baseline: 181.2 }
const PERIOD_END_ANCHORS = { year: 440.0, month: 476.5, day: 512.0, baseline: 181.2 }

const normalizeText = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim()
const getExtra = (body: Bekki11_2Payload, key: string) => normalizeText(body.extra_fields?.[key])

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
        const body = (await req.json()) as Bekki11_2Payload

        // ★点検期間が年月日に分解できないときは描かずに止める。
        //   以前は期間文字列を刷り込み「年月日～年月日」の上に生で描いていた
        //   （22様式共通。セル定義監査が定義上の重なりとして検出）。
        //   実測: 現実値0件 / 長文0件。入力画面は type="date" なので UI からは到達しない。
        const periodErr = periodDateError("別記様式第11の2", body.period_start, body.period_end)
        if (periodErr) return NextResponse.json(periodErr, { status: 422 })

        const candidatePdfPaths = [
            path.join(process.cwd(), "public", "PDF", "s50_kokuji14_bekki11_2.pdf"),
            path.join(process.cwd(), "public", "s50_kokuji14_bekki11_2.pdf"),
        ]
        const pdfPath = candidatePdfPaths.find((v) => fs.existsSync(v))
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf")
        if (!pdfPath) throw new Error("Template PDF not found: s50_kokuji14_bekki11_2.pdf")

        const pdfDoc = await PDFDocument.load(fs.readFileSync(pdfPath))
        pdfDoc.registerFontkit(fontkit)
        const customFont = await pdfDoc.embedFont(fs.readFileSync(fontPath))
        // ASCII(型式・番号・日付等)は Helvetica で描く。NotoSansJP は「英字+ハイフン+数字」で
        // 数字がCJK拡張Aのグリフに化け、計測幅と実描画幅が最大+41.6%ズレて枠をはみ出すため。
        const latinFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
        const fonts: ReportFonts = { jp: customFont, latin: latinFont, fit: createFitCollector() }

        const [page1, page2] = pdfDoc.getPages()
        const p1Height = page1.getSize().height
        const p2Height = page2.getSize().height

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
            const paddingY = options?.paddingY ?? 1.6
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
            cols: ResultColumns,
            contentOverrides: Record<number, { x: number; w: number }> = {},
        ) => {
            for (let i = 0; i < rowBounds.length - 1; i += 1) {
                const row = rows[i]
                if (!row) continue
                const top = rowBounds[i]
                const h = rowBounds[i + 1] - top
                const cx = contentOverrides[i]?.x ?? cols.contentX
                const cw = contentOverrides[i]?.w ?? cols.contentW
                // ★どの欄の何行目のどの列かを渡す。渡さないと fit 報告のラベルが
                //   「同じ値を持つ最初の入力欄」を指す（本番の bekki12 で実際に誤帰属していた）。
                const ref = (column: string): CellRef => ({ rowsKey: cols.rowsKey, row: i, column })
                drawWrappedInCell(page, pageHeight, row.content, cx, top, cw, h, 6.2, ref("content"))
                drawInCell(page, pageHeight, formatJudgment(row.judgment), cols.judgmentX, top, cols.judgmentW, h, 7.6, { align: "center", at: ref("judgment") })
                drawWrappedInCell(page, pageHeight, row.bad_content, cols.badX, top, cols.badW, h, 6.0, ref("bad_content"))
                drawWrappedInCell(page, pageHeight, row.action_content, cols.actionX, top, cols.actionW, h, 6.0, ref("action_content"))
            }
        }

        const drawRightAt = (
            page: PDFPage,
            pageHeight: number,
            text: string,
            anchorX: number,
            rowTop: number,
            rowH: number,
            size = 6.8,
        ) => {
            if (!text) return
            const textHeight = fonts.jp.heightAtSize(size, { descender: true })
            const textTop = rowTop + (rowH - textHeight) / 2
            const y = pageHeight - (textTop + textHeight * 0.78)
            const textWidth = measureRuns(fonts, String(text ?? ""), size)
            drawTextRuns(page, fonts, String(text ?? ""), anchorX - textWidth, y, size)
        }

        

        // page1 header (layout aligns closely with 別記様弁E1の1)
        drawInCell(page1, p1Height, body.form_name, HEADER.valueX, HEADER.nameRow.top, HEADER.valueW, HEADER.nameRow.h, 8.6)
        drawInCell(page1, p1Height, body.fire_manager, HEADER.rightX, HEADER.nameRow.top, HEADER.rightW, HEADER.nameRow.h, 7.8)
        drawInCell(page1, p1Height, body.location, HEADER.valueX, HEADER.locationRow.top, HEADER.valueW, HEADER.locationRow.h, 8.1)
        drawInCell(page1, p1Height, body.witness, HEADER.rightX, HEADER.locationRow.top, HEADER.rightW, HEADER.locationRow.h, 7.8)
        const inspectionType = normalizeText(body.inspection_type) || "機器・総合"
        for (const choice of TYPE_CHOICES) {
            if (!inspectionType.includes(choice.label)) continue
            page1.drawEllipse({
                x: choice.cx,
                y: p1Height - choice.cy,
                xScale: choice.rx,
                yScale: choice.ry,
                borderColor: rgb(0, 0, 0),
                borderWidth: 0.7,
            })
        }

        const periodText = (() => {
            const start = formatDateText(body.period_start)
            const end = formatDateText(body.period_end)
            return start && end ? `${start} - ${end}` : (start || end)
        })()
        if (parseDateParts(body.period_start) || parseDateParts(body.period_end)) {
            drawPeriodDate({ page: page1, pageHeight: p1Height, fonts, dateValue: body.period_start, anchors: PERIOD_START_ANCHORS, rowTop: PERIOD_ROW.top, rowHeight: PERIOD_ROW.h, fontSize: 6.8 })
            drawPeriodDate({ page: page1, pageHeight: p1Height, fonts, dateValue: body.period_end, anchors: PERIOD_END_ANCHORS, rowTop: PERIOD_ROW.top, rowHeight: PERIOD_ROW.h, fontSize: 6.8 })
        }

        drawInCell(page1, p1Height, body.inspector_name, INSPECTOR.name.x, INSPECTOR.name.top, INSPECTOR.name.w, INSPECTOR.name.h, 7.2)
        drawInCell(page1, p1Height, body.inspector_company, INSPECTOR.company.x, INSPECTOR.company.top, INSPECTOR.company.w, INSPECTOR.company.h, 7.0)
        drawInCell(page1, p1Height, body.inspector_tel, INSPECTOR.tel.x, INSPECTOR.tel.top, INSPECTOR.tel.w, INSPECTOR.tel.h, 7.0)
        drawInCell(page1, p1Height, body.inspector_address, INSPECTOR.address.x, INSPECTOR.address.top, INSPECTOR.address.w, INSPECTOR.address.h, 6.8)

        // 点検設備名 row has fixed labels for 受信橁E/ 中継器 in the left cells.
        // 設備情報の帯は 製造者名 y=238.6-255.0 / 型式等 y=255.0-271.6（テンプレート実測）。
        // 従来は約33pt下にずれ、列見出し「点検結果」「種別・容量等の内容」の行に描いていた。
        drawInCell(page1, p1Height, getExtra(body, "receiver_maker"), 222.5, 238.6, 99.5, 16.4, 6.8)
        drawInCell(page1, p1Height, getExtra(body, "receiver_model"), 222.5, 255.0, 99.5, 16.6, 6.8)
        drawInCell(page1, p1Height, getExtra(body, "repeater_maker"), 444.5, 238.6, 85.0, 16.4, 6.8)
        drawInCell(page1, p1Height, getExtra(body, "repeater_model"), 444.5, 255.0, 85.0, 16.6, 6.8)

        // 刷り込みの見出し行には描かない: p1 行0 = 刷り込み「機器点検」（テンプレート実測）
        drawResultRows(page1, p1Height, blankPrintedRows(body.page1_rows ?? [], new Set([0])), P1_ROW_BOUNDS, {
            rowsKey: "page1_rows",
            contentX: 222.5,
            contentW: 99.5,
            judgmentX: 322.0,
            judgmentW: 36.5,
            badX: 358.5,
            badW: 86.0,
            actionX: 444.5,
            actionW: 85.0,
        }, {
            3: { x: 222.5, w: 83.86 },   // 刷り込み「Ｖ」(306.36) の手前で止める
            11: { x: 222.5, w: 83.86 },   // 刷り込み「Ｖ」(306.36) の手前で止める
            13: { x: 222.5, w: 83.86 },   // 刷り込み「Ａ」(306.36) の手前で止める
        })

        // 刷り込みの見出し行には描かない: p2 行15 = 刷り込み「総合点検」（テンプレート実測）
        drawResultRows(page2, p2Height, blankPrintedRows(body.page2_rows ?? [], new Set([15])), P2_ROW_BOUNDS, {
            rowsKey: "page2_rows",
            contentX: 217.0,
            contentW: 105.0,
            judgmentX: 322.0,
            judgmentW: 36.5,
            badX: 358.5,
            badW: 86.0,
            actionX: 444.5,
            actionW: 85.0,
        }, {
            17: { x: 217.0, w: 89.48 },   // 刷り込み「db」(306.48) の手前で止める
        })

        drawWrappedInCell(page2, p2Height, body.notes, 80.5, 491.5, 449.0, 94.5, 7.0)

        // 測定機器表: 左側の機器名セルには「加ガス試験器」�E固定文字があるため device1.name は描画しなぁE��E
        const device1 = body.device1 ?? {}
        const device2 = body.device2 ?? {}
        const deviceRowTop = 607.0
        const deviceRowH = 20.8

        drawInCell(page2, p2Height, device1.model, 154.0, deviceRowTop, 36.5, deviceRowH, 6.6)
        drawInCell(page2, p2Height, formatJapaneseDateText(device1.calibrated_at), 190.5, deviceRowTop, 57.0, deviceRowH, 6.2)
        drawInCell(page2, p2Height, device1.maker, 247.5, deviceRowTop, 57.0, deviceRowH, 6.2)

        drawInCell(page2, p2Height, device2.name, 304.5, deviceRowTop, 74.0, deviceRowH, 6.4)
        drawInCell(page2, p2Height, device2.model, 378.5, deviceRowTop, 36.5, deviceRowH, 6.4)
        drawInCell(page2, p2Height, formatJapaneseDateText(device2.calibrated_at), 415.0, deviceRowTop, 57.5, deviceRowH, 6.0)
        drawInCell(page2, p2Height, device2.maker, 472.5, deviceRowTop, 57.0, deviceRowH, 6.0)

        // ⑧ 枠に収まらなかった項目があればPDFを返さずに一覧を返す。
        //   黙って "..." で切り詰めると、法定書類から情報が静かに欠落するため。
        fonts.fit?.resolve(body)
        const systemOverflow = systemFitFailures(fonts.fit!)
        if (systemOverflow.length) {
            // 業者には直せない（テンプレート固定文言・整形済みの値）＝実装側の不具合として記録
            console.error("[pdf] 収容不能(システム由来)", { form: "別記様式第11の2", items: systemOverflow })
        }
        const fitFormLabel = "別記様式第11の2"
        logFitDebug(fitFormLabel, fonts.fit!)
        if (fonts.fit?.smalls.length) {
            // 判読しづらい大きさで描かれた項目。単独では止められない（上記コメント参照）ので記録のみ
            console.warn("[pdf] 極小フォントで描画", { count: fonts.fit.smalls.length })
        }
        const fitError = buildFitError("別記様式第11の2", fonts.fit!)
        if (fitError) return NextResponse.json(fitError, { status: 422 })

        const pdfBytes = await pdfDoc.save()
        return new NextResponse(pdfBytes as unknown as BodyInit, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                // ⑨ 設計値から大きく縮んだ項目があれば警告として運ぶ（PDFは返す）
                ...fitWarningHeader(fitFormLabel, fonts.fit!),
                "Content-Disposition": 'attachment; filename="s50_kokuji14_bekki11_2_filled.pdf"',
            },
        })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 })
    }
}
