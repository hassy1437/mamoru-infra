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
    page1_rows: [2, 10, 14],
    page2_rows: [3],
}

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

// 消防庁の正典（s50_kokuji14_bekki10.pdf・令和6年9月10日最終改正）の罫線を実測した値。
// ★旧テンプレートは25行だったが、正典は行20に「電動機駆動用蓄電池」が挿入されて26行ある。
//   旧行20〜24（本体〜作動）は1つ後ろへずれる。行0〜19の境界も0.5pt以内で測り直した実測値に置換。
const P1_ROW_BOUNDS = [
    336.5, 351.0, 365.5, 380.0, 394.6, 409.0, 423.5, 438.0, 452.5, 467.0,
    481.6, 496.0, 510.5, 525.0, 539.5, 554.0, 568.6, 583.0, 597.5, 612.0,
    626.5, 641.0, 655.6, 670.0, 684.5, 699.0, 713.5,
]

const P2_ROW_BOUNDS = [
    82.67, 104.0, 124.67, 146.0, 168.67, 190.0, 210.67, 232.0, 252.67, 274.0,
    294.67, 316.0, 336.67, 358.0,
]

const PERIOD_ROW = { top: 166.67, h: 28.0 }
// baseline は刷り込み「年」のベースライン（テンプレート p1 の実測値）。
// ★これが無いとセル矩形の中央に置くことになり、刷り込みと高さが揃わない。
//   実測では23様式すべてでズレていた（-0.4〜-5.19pt / bekki7 が最大）。
//   罫線も越えず切り詰めも起きないので、どの検査にも出なかった。
const PERIOD_START_ANCHORS = { year: 293.3, month: 335.8, day: 377.3, baseline: 184.44 }
const PERIOD_END_ANCHORS = { year: 430.3, month: 472.5, day: 514.0, baseline: 184.44 }

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

        // ★点検期間が年月日に分解できないときは描かずに止める。
        //   以前は期間文字列を刷り込み「年月日～年月日」の上に生で描いていた
        //   （22様式共通。セル定義監査が定義上の重なりとして検出）。
        //   実測: 現実値0件 / 長文0件。入力画面は type="date" なので UI からは到達しない。
        const periodErr = periodDateError("別記様式第10", body.period_start, body.period_end)
        if (periodErr) return NextResponse.json(periodErr, { status: 422 })
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

        const drawResultRows = (page: PDFPage, pageHeight: number, rows: BekkiRow[], rowBounds: number[], columns: ResultColumns, contentOverrides: Record<number, { x: number; w: number }> = {}, skipContentRows: Set<number> = new Set()) => {
            for (let i = 0; i < rowBounds.length - 1; i += 1) {
                const row = rows[i]
                if (!row) continue
                const top = rowBounds[i]
                const h = rowBounds[i + 1] - top
                // ★どの欄の何行目のどの列かを渡す。渡さないと fit 報告のラベルが
                //   「同じ値を持つ最初の入力欄」を指す（本番の bekki12 で実際に誤帰属していた）。
                const ref = (column: string): CellRef => ({ rowsKey: columns.rowsKey, row: i, column })
                if (!skipContentRows.has(i)) {
                    const cx = contentOverrides[i]?.x ?? columns.contentX
                    const cw = contentOverrides[i]?.w ?? columns.contentW
                    drawWrappedInCell(page, pageHeight, row.content, cx, top, cw, h, 6.4, ref("content"))
                }
                drawInCell(page, pageHeight, formatJudgment(row.judgment), columns.judgmentX, top, columns.judgmentW, h, 7.8, { align: "center", at: ref("judgment") })
                drawWrappedInCell(page, pageHeight, row.bad_content, columns.badX, top, columns.badW, h, 6.2, ref("bad_content"))
                drawWrappedInCell(page, pageHeight, row.action_content, columns.actionX, top, columns.actionW, h, 6.2, ref("action_content"))
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

        

        // ★名称/所在の値セル幅はテンプレート罫線の実測値。旧値は右隣の「防火管理者/立会者」
        // ラベル欄まで食い込む幅で定義されており、長い住所が罫線を越えていた（2026-07-24 実測）。
        // header page1
        drawInCell(page1, p1Height, body.form_name, 107.3, 110.67, 266.7, 28.0, 8.8)
        drawInCell(page1, p1Height, body.fire_manager, 415.1, 110.67, 114.5, 28.0, 8.0)
        drawInCell(page1, p1Height, body.location, 107.3, 138.67, 266.7, 28.0, 8.2)
        drawInCell(page1, p1Height, body.witness, 415.1, 138.67, 114.5, 28.0, 8.0)
        // 点検種別: テンプレートに「機器・総合」が刷り込まれているので文字を重ねず○で囲む。
        // ○の座標はテンプレートPDFの文字を実測（様式ごとに位置が違う）。
        drawChoiceCircle(page1, p1Height, fonts, body.inspection_type || "機器・総合", [
            { label: "機器", cx: 127.38, cy: 180.61, rx: 17.56, ry: 8.03 },
            { label: "総合", cx: 186.11, cy: 180.61, rx: 17.62, ry: 8.03 },
        ])

        const periodText = (() => {
            const start = formatDateText(body.period_start)
            const end = formatDateText(body.period_end)
            return start && end ? `${start} - ${end}` : (start || end)
        })()
        if (parseDateParts(body.period_start) || parseDateParts(body.period_end)) {
            drawPeriodDate({ page: page1, pageHeight: p1Height, fonts, dateValue: body.period_start, anchors: PERIOD_START_ANCHORS, rowTop: PERIOD_ROW.top, rowHeight: PERIOD_ROW.h, fontSize: 7.6 })
            drawPeriodDate({ page: page1, pageHeight: p1Height, fonts, dateValue: body.period_end, anchors: PERIOD_END_ANCHORS, rowTop: PERIOD_ROW.top, rowHeight: PERIOD_ROW.h, fontSize: 7.6 })
        }

        // 刷り込みに重ねない: 前置ラベル「氏名」(-133.4) の右から（テンプレート実測）
        drawInCell(page1, p1Height, body.inspector_name, 133.9, 194.67, 77.4, 52.66, 7.6)
        // 刷り込みに重ねない: 「TEL」(416.9-) の手前まで（テンプレート実測）
        drawInCell(page1, p1Height, body.inspector_company, 306.0, 194.67, 110.4, 26.33, 7.4)
        drawInCell(page1, p1Height, body.inspector_tel, 437.33, 194.67, 92.0, 26.33, 7.4)
        drawInCell(page1, p1Height, body.inspector_address, 306.0, 221.0, 223.33, 26.33, 7.2)

        // The "本佁E cell is a fixed label in this template, so we do not draw equipment_name here.
        // 本体の製造者名/型式等は「製造者名」y=247.6-268.6 /「型式等」y=268.6- の行（テンプレート実測）。
        // 従来は1行上の点検者住所の行にあり、刷り込み「住所」に重なっていた。
        drawInCell(page1, p1Height, getExtra(body, "body_maker"), 202.2, 247.6, 327.4, 21.0, 7.2)
        drawInCell(page1, p1Height, getExtra(body, "body_model"), 202.2, 268.6, 327.4, 21.0, 7.2)

        drawResultRows(page1, p1Height, body.page1_rows ?? [], P1_ROW_BOUNDS, {
            rowsKey: "page1_rows",
            contentX: 211.33, contentW: 94.67,
            judgmentX: 306.0, judgmentW: 36.67,
            badX: 342.67, badW: 94.66,
            actionX: 437.33, actionW: 92.0,
        }, {
            2: { x: 211.33, w: 76.19 },   // 刷り込み「ｍ3」(287.52) の手前で止める
            10: { x: 211.33, w: 84.71 },   // 刷り込み「L」(296.04) の手前で止める
            14: { x: 211.33, w: 79.43 },   // 刷り込み「Ｖ」(290.76) の手前で止める
        })

        // 刷り込みの見出し行には描かない: p2 行7 = 刷り込み「総合点検」（テンプレート実測）
        drawResultRows(page2, p2Height, blankPrintedRows(body.page2_rows ?? [], new Set([7])), P2_ROW_BOUNDS, {
            rowsKey: "page2_rows",
            contentX: 217.0, contentW: 94.5,
            judgmentX: 311.5, judgmentW: 42.0,
            badX: 353.5, badW: 88.0,
            actionX: 441.5, actionW: 88.0,
        }, {}, new Set([3]))

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
            // ★paddingX を 1.0 にする。空欄は刷り込みが両端を規定していて広げようが無く、
            //   口径は 10.5pt しか無い。既定の 2.5×2 だと使える幅が 5.5pt ＝ 2桁（「25」）が
            //   入らず 4.95pt まで縮んで絶対下限 5.0pt を割る。1.0 なら 8.5pt 使えて 6.0pt のまま入る。
            //   ★同じ対処を bekki12 の感度範囲では既に入れてあり、ここに届いていなかった。
            const NARROW = { align: "center", paddingX: 1.0 } as const
            const drawLen = (v: string) => { if (v) drawInCell(page2, p2Height, v, 217, hValTop, 21.4, hValH, 6.0, NARROW) }
            const drawCnt = (v: string) => { if (v) drawInCell(page2, p2Height, v, 259.4, hValTop, 15.8, hValH, 6.0, NARROW) }
            const drawDia = (v: string) => { if (v) drawInCell(page2, p2Height, v, 285.7, hValTop, 10.5, hValH, 6.0, NARROW) }
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

        // ⑧ 枠に収まらなかった項目があればPDFを返さずに一覧を返す。
        //   黙って "..." で切り詰めると、法定書類から情報が静かに欠落するため。
        fonts.fit?.resolve(body)
        const systemOverflow = systemFitFailures(fonts.fit!)
        if (systemOverflow.length) {
            // 業者には直せない（テンプレート固定文言・整形済みの値）＝実装側の不具合として記録
            console.error("[pdf] 収容不能(システム由来)", { form: "別記様式第10", items: systemOverflow })
        }
        const fitFormLabel = "別記様式第10"
        logFitDebug(fitFormLabel, fonts.fit!)
        if (fonts.fit?.smalls.length) {
            // 判読しづらい大きさで描かれた項目。単独では止められない（上記コメント参照）ので記録のみ
            console.warn("[pdf] 極小フォントで描画", { count: fonts.fit.smalls.length })
        }
        const fitError = buildFitError("別記様式第10", fonts.fit!)
        if (fitError) return NextResponse.json(fitError, { status: 422 })

        const pdfBytes = await pdfDoc.save()
        return new NextResponse(pdfBytes as unknown as BodyInit, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                // ⑨ 設計値から大きく縮んだ項目があれば警告として運ぶ（PDFは返す）
                ...fitWarningHeader(fitFormLabel, fonts.fit!),
                "Content-Disposition": 'attachment; filename="s50_kokuji14_bekki10_filled.pdf"',
            },
        })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 })
    }
}
