import { NextRequest, NextResponse } from "next/server"
import { PDFDocument, type PDFPage, StandardFonts } from "pdf-lib"
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
import { blankPrintedRows, drawChoiceCircle, drawPeriodDate, drawTextInCell, drawWrappedTextInCell, formatDateText, formatJapaneseDateText, formatJudgment, parseDateParts, pickFont, type CellDrawOptions, type DateAnchors, type ReportFonts, type CellRef, periodDateError } from "@/lib/pdf-form-helpers"

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
    page1_rows: [15, 17],
    page2_rows: [16],
}

type BekkiRow = { content?: string; judgment?: string; bad_content?: string; action_content?: string; current_value?: string }
type DeviceRow = { name?: string; model?: string; calibrated_at?: string; maker?: string }

type Bekki18Payload = {
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
    316.8, 333.72, 350.76, 367.8, 384.72, 401.76, 418.8, 435.72, 452.76, 469.8, 486.72, 503.76,
    520.8, 537.72, 554.76, 571.8, 588.72, 605.76, 622.8, 639.72, 656.76, 673.8, 690.72, 708.0,
]

const P2_ROW_BOUNDS = [
    83.52, 103.2, 123.24, 143.28, 163.2, 183.24, 203.28, 223.2, 243.24, 263.28,
    283.2, 303.24, 323.28, 343.2, 363.24, 383.28, 403.2, 423.24, 443.28, 463.2,
]

const PERIOD_ROW = { top: 164.76, h: 17.04 }
// baseline は刷り込み「年」のベースライン（テンプレート p1 の実測値）。
// ★これが無いとセル矩形の中央に置くことになり、刷り込みと高さが揃わない。
//   実測では23様式すべてでズレていた（-0.4〜-5.19pt / bekki7 が最大）。
//   罫線も越えず切り詰めも起きないので、どの検査にも出なかった。
const PERIOD_START_ANCHORS: DateAnchors = { year: 302.28, month: 340.33, day: 378.38, baseline: 176.4 }
const PERIOD_END_ANCHORS: DateAnchors = { year: 427.22, month: 465.27, day: 503.32, baseline: 176.4 }

export async function POST(req: NextRequest) {
    try {
        const body = (await req.json()) as Bekki18Payload

        // ★点検期間が年月日に分解できないときは描かずに止める。
        //   以前は期間文字列を刷り込み「年月日～年月日」の上に生で描いていた
        //   （22様式共通。セル定義監査が定義上の重なりとして検出）。
        //   実測: 現実値0件 / 長文0件。入力画面は type="date" なので UI からは到達しない。
        const periodErr = periodDateError("別記様式第18", body.period_start, body.period_end)
        if (periodErr) return NextResponse.json(periodErr, { status: 422 })

        const candidatePdfPaths = [
            path.join(process.cwd(), "public", "PDF", "s50_kokuji14_bekki18.pdf"),
            path.join(process.cwd(), "public", "s50_kokuji14_bekki18.pdf"),
        ]
        const pdfPath = candidatePdfPaths.find((v) => fs.existsSync(v))
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf")
        if (!pdfPath) throw new Error("Template PDF not found: s50_kokuji14_bekki18.pdf")

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

        const drawInCell = (
            page: PDFPage,
            pageHeight: number,
            text: unknown,
            cellX: number,
            cellTopFromTop: number,
            cellW: number,
            cellH: number,
            fontSize = 9,
            options?: CellDrawOptions,
        ) => drawTextInCell({
            page,
            pageHeight,
            fonts,
            text,
            cellX,
            cellTopFromTop,
            cellW,
            cellH,
            fontSize,
            options,
        })

        const drawWrappedInCell = (
            page: PDFPage,
            pageHeight: number,
            text: unknown,
            cellX: number,
            cellTopFromTop: number,
            cellW: number,
            cellH: number,
            fontSize = 7.0,
            /** どの欄の何行目のどの列か。fit 報告の帰属に使う（値の文字列一致に頼らないため） */
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
            options: { at },
        })

        const drawResultRows = (
            page: PDFPage,
            pageHeight: number,
            rows: BekkiRow[],
            rowBounds: number[],
            cols: ResultColumns,
            sizes?: { content?: number; judgment?: number; bad?: number; action?: number },
            contentOverrides?: Record<number, { x: number; w: number }>,
        ) => {
            for (let i = 0; i < rowBounds.length - 1; i += 1) {
                const row = rows[i]
                if (!row) continue
                const top = rowBounds[i]
                const h = rowBounds[i + 1] - top
                // ★どの欄の何行目のどの列かを渡す。渡さないと fit 報告のラベルが
                //   「同じ値を持つ最初の入力欄」を指す（本番の bekki12 で実際に誤帰属していた）。
                const ref = (column: string): CellRef => ({ rowsKey: cols.rowsKey, row: i, column })
                const cx = contentOverrides?.[i]?.x ?? cols.contentX
                const cw = contentOverrides?.[i]?.w ?? cols.contentW
                drawWrappedInCell(page, pageHeight, row.content, cx, top, cw, h, sizes?.content ?? 6.2, ref("content"))
                drawInCell(page, pageHeight, formatJudgment(row.judgment), cols.judgmentX, top, cols.judgmentW, h, sizes?.judgment ?? 7.2, {
                    align: "center",
                })
                drawWrappedInCell(page, pageHeight, row.bad_content, cols.badX, top, cols.badW, h, sizes?.bad ?? 6.0, ref("bad_content"))
                drawWrappedInCell(page, pageHeight, row.action_content, cols.actionX, top, cols.actionW, h, sizes?.action ?? 6.0, ref("action_content"))
            }
        }

        // ★名称/所在の値セル幅はテンプレート罫線の実測値。旧値は右隣の「防火管理者/立会者」
        // ラベル欄まで食い込む幅で定義されており、長い住所が罫線を越えていた（2026-07-24 実測）。
        const drawHeader = (page: PDFPage, pageHeight: number) => {
            drawInCell(page, pageHeight, body.form_name, 117.8, 114.72, 264.5, 25.08, 8.0)
            drawInCell(page, pageHeight, body.fire_manager, 425.3, 114.72, 104.3, 25.08, 7.3)
            drawInCell(page, pageHeight, body.location, 117.8, 139.8, 264.5, 24.96, 7.8)
            drawInCell(page, pageHeight, body.witness, 425.3, 139.8, 104.3, 24.96, 7.3)
            // 点検種別: テンプレートに「機器・総合」が刷り込まれているので文字を重ねず○で囲む。
            // ○の座標はテンプレートPDFの文字を実測（様式ごとに位置が違う）。
            // ★2026-08-25: 下の2つはテンプレートの実測から解き直した（8px / 6px → 0px）。
            //   ★この2つは、静的検査が★読み落としていた定数だった
            //   （page に番号が付かない呼び方を正規表現が飛ばしていた＝5つ目の穴）。
            //   ★コメントは配列の中に入れないこと ―― 定数を読む正規表現が
            //     「[ の直後に { label:」を見るので、★間にコメントがあると読めなくなる
            //     （★一度それを作り、call_sites_ok() が捕まえた）。
            drawChoiceCircle(page, pageHeight, fonts, body.inspection_type || "機器・総合", [
                { label: "機器", cx: 136.50, cy: 172.57, rx: 17.24, ry: 7.03 },
                { label: "総合", cx: 187.37, cy: 172.57, rx: 16.74, ry: 7.03 },
            ])

            const periodText = (() => {
                const start = formatDateText(body.period_start)
                const end = formatDateText(body.period_end)
                return start && end ? `${start} - ${end}` : (start || end)
            })()
            const canDrawSplitPeriod =
                (!body.period_start || Boolean(parseDateParts(body.period_start))) &&
                (!body.period_end || Boolean(parseDateParts(body.period_end)))
            if (canDrawSplitPeriod) {
                if (body.period_start) {
                    drawPeriodDate({
                        page: page,
                        pageHeight: pageHeight,
                        fonts,
                        dateValue: body.period_start,
                        anchors: PERIOD_START_ANCHORS,
                        rowTop: PERIOD_ROW.top,
                        rowHeight: PERIOD_ROW.h,
                        fontSize: 6.2,
                    })
                }
                if (body.period_end) {
                    drawPeriodDate({
                        page: page,
                        pageHeight: pageHeight,
                        fonts,
                        dateValue: body.period_end,
                        anchors: PERIOD_END_ANCHORS,
                        rowTop: PERIOD_ROW.top,
                        rowHeight: PERIOD_ROW.h,
                        fontSize: 6.2,
                    })
                }
        }

            // 刷り込みに重ねない: 前置ラベル氏名(-143.9) の右から（テンプレート実測）
            drawInCell(page, pageHeight, body.inspector_name, 144.38, 181.8, 61.9, 49.92, 6.4)
            // 刷り込みに重ねない: 後続のTEL(411.7-) の手前まで（テンプレート実測）
            drawInCell(page, pageHeight, body.inspector_company, 302.28, 181.8, 108.92, 24.96, 6.0)
            drawInCell(page, pageHeight, body.inspector_tel, 425.04, 181.8, 105.0, 24.96, 6.0)
            drawInCell(page, pageHeight, body.inspector_address, 302.28, 206.76, 227.76, 24.96, 5.9)

            drawInCell(page, pageHeight, body.extra_fields?.smoke_machine_maker, 222.6, 231.72, 307.44, 17.04, 6.2)
            drawInCell(page, pageHeight, body.extra_fields?.smoke_machine_model, 222.6, 248.76, 307.44, 17.04, 6.2)
        }

        drawHeader(page1, p1Height)

        drawResultRows(
            page1,
            p1Height,
            body.page1_rows ?? [],
            P1_ROW_BOUNDS,
            {
                rowsKey: "page1_rows",
                contentX: 222.6,
                contentW: 115.44,
                judgmentX: 338.04,
                judgmentW: 36.72,
                badX: 374.76,
                badW: 77.28,
                actionX: 452.04,
                actionW: 78.0,
            },
            { content: 5.8, judgment: 6.8, bad: 5.8, action: 5.8 },
            {
                // Pre-4: 公式PDFの単位印字（Ｖ/Ａ）と重ならないよう content cell を狭める
                15: { x: 222.6, w: 50 },  // 電圧計・電流計: Ｖ(x=274.9)前まで
                17: { x: 222.6, w: 97 },  // ヒューズ類: Ａ(x=322.3)前まで
            },
        )

        // Pre-4: 電圧計・電流計 (row 15) — 電流値(A)を Ｖ印字後、Ａ印字前に描画
        const voltRow18 = body.page1_rows?.[15]
        if (voltRow18?.current_value) {
            const vTop = P1_ROW_BOUNDS[15]
            const vH = P1_ROW_BOUNDS[16] - P1_ROW_BOUNDS[15]
            drawInCell(page1, p1Height, voltRow18.current_value, 287, vTop, 33, vH, 5.8)
        }

        // 刷り込みの見出し行には描かない: p2 行13 = 刷り込み「総合点検」（テンプレート実測）
        drawResultRows(
            page2,
            p2Height,
            blankPrintedRows(body.page2_rows, new Set([13])),
            P2_ROW_BOUNDS,
            {
                rowsKey: "page2_rows",
                contentX: 227.76,
                contentW: 105.0,
                judgmentX: 332.76,
                judgmentW: 36.84,
                badX: 369.6,
                badW: 80.04,
                actionX: 449.64,
                actionW: 80.4,
            },
            { content: 6.0, judgment: 7.0, bad: 6.0, action: 6.0 }, {
            16: { x: 227.76, w: 89.16 },   // 刷り込み「Ａ」(316.92) の手前で止める
        })

        drawWrappedInCell(page2, p2Height, body.notes, 86.04, 463.2, 444.0, 176.04, 6.8)

        const device1 = body.device1 ?? {}
        const device2 = body.device2 ?? {}
        const deviceRowTop = 658.2
        const deviceRowH = 19.08

        drawInCell(page2, p2Height, device1.name, 86.04, deviceRowTop, 73.56, deviceRowH, 5.6)
        drawInCell(page2, p2Height, device1.model, 159.6, deviceRowTop, 36.72, deviceRowH, 5.6)
        drawInCell(page2, p2Height, formatJapaneseDateText(device1.calibrated_at), 196.32, deviceRowTop, 55.8, deviceRowH, 5.4)
        drawInCell(page2, p2Height, device1.maker, 252.12, deviceRowTop, 55.44, deviceRowH, 5.4)

        drawInCell(page2, p2Height, device2.name, 308.52, deviceRowTop, 73.32, deviceRowH, 5.6)
        drawInCell(page2, p2Height, device2.model, 381.84, deviceRowTop, 37.2, deviceRowH, 5.6)
        drawInCell(page2, p2Height, formatJapaneseDateText(device2.calibrated_at), 419.04, deviceRowTop, 55.56, deviceRowH, 5.4)
        drawInCell(page2, p2Height, device2.maker, 474.6, deviceRowTop, 55.44, deviceRowH, 5.4)

        // ⑧ 枠に収まらなかった項目があればPDFを返さずに一覧を返す。
        //   黙って "..." で切り詰めると、法定書類から情報が静かに欠落するため。
        fonts.fit?.resolve(body)
        const systemOverflow = systemFitFailures(fonts.fit!)
        if (systemOverflow.length) {
            // 業者には直せない（テンプレート固定文言・整形済みの値）＝実装側の不具合として記録
            console.error("[pdf] 収容不能(システム由来)", { form: "別記様式第18", items: systemOverflow })
        }
        const fitFormLabel = "別記様式第18"
        logFitDebug(fitFormLabel, fonts.fit!)
        if (fonts.fit?.smalls.length) {
            // 判読しづらい大きさで描かれた項目。単独では止められない（上記コメント参照）ので記録のみ
            console.warn("[pdf] 極小フォントで描画", { count: fonts.fit.smalls.length })
        }
        const fitError = buildFitError("別記様式第18", fonts.fit!)
        if (fitError) return NextResponse.json(fitError, { status: 422 })

        const pdfBytes = await pdfDoc.save()
        return new NextResponse(pdfBytes as unknown as BodyInit, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                // ⑨ 設計値から大きく縮んだ項目があれば警告として運ぶ（PDFは返す）
                ...fitWarningHeader(fitFormLabel, fonts.fit!),
                "Content-Disposition": 'attachment; filename="s50_kokuji14_bekki18_filled.pdf"',
            },
        })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 })
    }
}
