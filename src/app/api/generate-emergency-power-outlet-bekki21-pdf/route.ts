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
import { drawChoiceCircle, drawPeriodDate, drawTextInCell, drawWrappedTextInCell, formatDateText, formatJapaneseDateText, formatJudgment, parseDateParts, pickFont, type CellDrawOptions, type DateAnchors, type ReportFonts } from "@/lib/pdf-form-helpers"

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
    page1_rows: [6],
}

type BekkiRow = { content?: string; judgment?: string; bad_content?: string; action_content?: string; current_value?: string }
type DeviceRow = { name?: string; model?: string; calibrated_at?: string; maker?: string }

type Bekki21Payload = {
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
    notes?: string
    device1?: DeviceRow
    device2?: DeviceRow
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

const P1_ROW_BOUNDS = [288.36, 304.44, 320.4, 336.36, 352.44, 368.4, 384.36, 400.44, 416.4]

const PERIOD_ROW = { top: 160.32, h: 24.48 }
// baseline は刷り込み「年」のベースライン（テンプレート p1 の実測値）。
// ★これが無いとセル矩形の中央に置くことになり、刷り込みと高さが揃わない。
//   実測では23様式すべてでズレていた（-0.4〜-5.19pt / bekki7 が最大）。
//   罫線も越えず切り詰めも起きないので、どの検査にも出なかった。
const PERIOD_START_ANCHORS: DateAnchors = { year: 347.4, month: 378.85, day: 410.41, baseline: 176.52 }
const PERIOD_END_ANCHORS: DateAnchors = { year: 452.42, month: 483.98, day: 515.43, baseline: 176.52 }

export async function POST(req: NextRequest) {
    try {
        const body = (await req.json()) as Bekki21Payload

        const candidatePdfPaths = [
            path.join(process.cwd(), "public", "PDF", "s50_kokuji14_bekki21.pdf"),
            path.join(process.cwd(), "public", "s50_kokuji14_bekki21.pdf"),
        ]
        const pdfPath = candidatePdfPaths.find((v) => fs.existsSync(v))
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf")
        if (!pdfPath) throw new Error("Template PDF not found: s50_kokuji14_bekki21.pdf")

        const pdfDoc = await PDFDocument.load(fs.readFileSync(pdfPath))
        pdfDoc.registerFontkit(fontkit)
        const customFont = await pdfDoc.embedFont(fs.readFileSync(fontPath))
        // ASCII(型式・番号・日付等)は Helvetica で描く。NotoSansJP は「英字+ハイフン+数字」で
        // 数字がCJK拡張Aのグリフに化け、計測幅と実描画幅が最大+41.6%ズレて枠をはみ出すため。
        const latinFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
        const fonts: ReportFonts = { jp: customFont, latin: latinFont, fit: createFitCollector() }

        const [page1] = pdfDoc.getPages()
        const p1Height = page1.getSize().height

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
        })

        const drawResultRows = (page: PDFPage, pageHeight: number, rows: BekkiRow[], rowBounds: number[], cols: ResultColumns, contentOverrides?: Record<number, { x: number; w: number }>) => {
            for (let i = 0; i < rowBounds.length - 1; i += 1) {
                const row = rows[i]
                if (!row) continue
                const top = rowBounds[i]
                const h = rowBounds[i + 1] - top
                const cx = contentOverrides?.[i]?.x ?? cols.contentX
                const cw = contentOverrides?.[i]?.w ?? cols.contentW
                drawWrappedInCell(page, pageHeight, row.content, cx, top, cw, h, 6.1)
                drawInCell(page, pageHeight, formatJudgment(row.judgment), cols.judgmentX, top, cols.judgmentW, h, 7.0, { align: "center" })
                drawWrappedInCell(page, pageHeight, row.bad_content, cols.badX, top, cols.badW, h, 6.0)
                drawWrappedInCell(page, pageHeight, row.action_content, cols.actionX, top, cols.actionW, h, 6.0)
            }
        }

        const drawHeader = (page: PDFPage, pageHeight: number) => {
            drawInCell(page, pageHeight, body.form_name, 117.0, 108.0, 251.52, 27.84, 8.0)
            drawInCell(page, pageHeight, body.fire_manager, 411.0, 108.0, 118.8, 27.84, 7.3)
            drawInCell(page, pageHeight, body.location, 117.0, 135.84, 251.52, 24.48, 7.8)
            drawInCell(page, pageHeight, body.witness, 411.0, 135.84, 118.8, 24.48, 7.3)
            // 点検種別: この様式は総合点検が無く、テンプレートに「機器」だけが刷り込まれている
            // （正典の Word でもセルの中身は「機器」のみ）。選ぶものが無いので描かない。
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
            } else {
                drawInCell(page, pageHeight, periodText, 316.56, PERIOD_ROW.top, 213.24, PERIOD_ROW.h, 6.2)
            }
            // 刷り込みに重ねない: 前置ラベル氏名(-142.6) の右から（テンプレート実測）
            drawInCell(page, pageHeight, body.inspector_name, 143.06, 184.8, 110.02, 55.56, 6.4)
            // 刷り込みに重ねない: 後続のTEL(426.1-) の手前まで（テンプレート実測）
            drawInCell(page, pageHeight, body.inspector_company, 347.16, 184.8, 78.44, 27.84, 6.0)
            drawInCell(page, pageHeight, body.inspector_tel, 441.96, 184.8, 87.84, 27.84, 6.0)
            drawInCell(page, pageHeight, body.inspector_address, 347.16, 212.64, 182.64, 27.72, 5.9)
        }

        drawHeader(page1, p1Height)
        drawResultRows(page1, p1Height, body.page1_rows ?? [], P1_ROW_BOUNDS, {
            contentX: 222.36,
            contentW: 115.44,
            judgmentX: 337.8,
            judgmentW: 36.72,
            badX: 374.52,
            badW: 78.84,
            actionX: 453.36,
            actionW: 76.44,
        }, {
            // B-2: 端子電圧 row 6 —「常用 ___ V 非常 ___ V」の1つ目の空欄。
            //   ★従来は「常用」の印字を x=275 と誤認して x=222.36 から描いており、
            //     刷り込みの「常用」(232.92–254.04) に重なっていた。テンプレート実測では
            //     常用 232.92–254.04 / V 275.04 なので、空欄はちょうど 254.04–275.04。
            6: { x: 254.04, w: 21.00 },
        })

        // B-2: 端子電圧 row 6 — 2つ目の空欄「非常 ___ V」。
        //   非常 280.21–301.33 / V 322.33 なので空欄は 301.33–322.33（実測）。
        //   従来の x=287 は「非常」の上に重なっていた（現実値セットに current_value が
        //   無かったため描かれず、検出器にも出ていなかった＝潜在していた）。
        const termVoltRow = body.page1_rows?.[6]
        if (termVoltRow?.current_value) {
            const tvTop = P1_ROW_BOUNDS[6]
            const tvH = P1_ROW_BOUNDS[7] - P1_ROW_BOUNDS[6]
            drawInCell(page1, p1Height, termVoltRow.current_value, 301.33, tvTop, 21.00, tvH, 5.8)
        }

        drawWrappedInCell(page1, p1Height, body.notes, 85.8, 416.4, 444.0, 233.76, 6.8)

        const device1 = body.device1 ?? {}
        const device2 = body.device2 ?? {}
        const deviceRowTop = 668.16
        const deviceRowH = 18.0
        drawInCell(page1, p1Height, device1.name, 85.8, deviceRowTop, 55.56, deviceRowH, 5.8)
        drawInCell(page1, p1Height, device1.model, 141.36, deviceRowTop, 55.44, deviceRowH, 5.8)
        drawInCell(page1, p1Height, formatJapaneseDateText(device1.calibrated_at), 196.8, deviceRowTop, 55.56, deviceRowH, 5.6)
        drawInCell(page1, p1Height, device1.maker, 252.36, deviceRowTop, 54.96, deviceRowH, 5.6)
        drawInCell(page1, p1Height, device2.name, 308.28, deviceRowTop, 55.08, deviceRowH, 5.8)
        drawInCell(page1, p1Height, device2.model, 363.36, deviceRowTop, 55.44, deviceRowH, 5.8)
        drawInCell(page1, p1Height, formatJapaneseDateText(device2.calibrated_at), 418.8, deviceRowTop, 55.56, deviceRowH, 5.6)
        drawInCell(page1, p1Height, device2.maker, 474.36, deviceRowTop, 55.44, deviceRowH, 5.6)

        // ⑧ 枠に収まらなかった項目があればPDFを返さずに一覧を返す。
        //   黙って "..." で切り詰めると、法定書類から情報が静かに欠落するため。
        fonts.fit?.resolve(body)
        const systemOverflow = systemFitFailures(fonts.fit!)
        if (systemOverflow.length) {
            // 業者には直せない（テンプレート固定文言・整形済みの値）＝実装側の不具合として記録
            console.error("[pdf] 収容不能(システム由来)", { form: "別記様式第21", items: systemOverflow })
        }
        const fitFormLabel = "別記様式第21"
        logFitDebug(fitFormLabel, fonts.fit!)
        if (fonts.fit?.smalls.length) {
            // 判読しづらい大きさで描かれた項目。単独では止められない（上記コメント参照）ので記録のみ
            console.warn("[pdf] 極小フォントで描画", { count: fonts.fit.smalls.length })
        }
        const fitError = buildFitError("別記様式第21", fonts.fit!)
        if (fitError) return NextResponse.json(fitError, { status: 422 })

        const pdfBytes = await pdfDoc.save()
        return new NextResponse(pdfBytes as unknown as BodyInit, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                // ⑨ 設計値から大きく縮んだ項目があれば警告として運ぶ（PDFは返す）
                ...fitWarningHeader(fitFormLabel, fonts.fit!),
                "Content-Disposition": 'attachment; filename="s50_kokuji14_bekki21_filled.pdf"',
            },
        })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 })
    }
}
