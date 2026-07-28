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
    drawPeriodDate,
    drawTextInCell,
    drawWrappedTextInCell,
    formatDateText,
    formatJapaneseDateText,
    parseDateParts,
    type CellDrawOptions,
    type DateAnchors,
    formatJudgment,
    pickFont,
    type ReportFonts,
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
export const NUMERIC_ROWS: Record<string, number[]> = {}

type BekkiRow = { content?: string; judgment?: string; bad_content?: string; action_content?: string }
type DeviceRow = { name?: string; model?: string; calibrated_at?: string; maker?: string }

type Bekki13Payload = {
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
    278.88, 299.28, 319.56, 339.96, 360.36, 380.64, 401.04, 421.32, 441.72, 462.0, 482.4, 502.8,
    523.08, 543.48, 563.76, 584.16, 604.56, 624.84, 645.24, 665.52, 685.92, 706.2, 726.6,
]

const P2_ROW_BOUNDS = [
    82.92, 102.84, 122.28, 141.72, 161.16, 180.6, 200.04, 219.6, 239.04, 258.48, 277.92,
    297.36, 316.8, 336.24, 355.68, 375.12, 394.56, 414.0, 433.44, 453.0, 472.44, 491.88,
]

// ★ヘッダ各セルはテンプレートPDFの罫線・印字グリフから実測した値（2026-07-24）。
//   旧実装は x=83.33 幅365.34 に headerShiftY=-10 の補正を足す形で、値が左のラベル欄
//   「名　称」「所　在」に重なり、罫線 x=117.2 を越えていた。補正込みの定数はやめて実測値にする。
//   セル境界: 64.4 | 117.2 …ラベル | 391.8 …名称/所在の値 | 434.3 | 529.4 …防火管理者/立会者
const HEADER = {
    nameRow: { top: 111.4, h: 22.5 },
    locationRow: { top: 134.4, h: 22.4 },
    valueX: 117.7,
    valueW: 274.1, // 117.7 → 391.8
    rightX: 434.8,
    rightW: 94.6, // 434.8 → 529.4
}

// 点検種別/点検年月日の行（実測 157.3-175.9）。旧値 top=162.0-10=152.0 は上にずれていた。
const PERIOD_ROW = { top: 157.3, h: 18.6 }
const PERIOD_CELL = { x: 269.9, w: 259.5 } // 269.9 → 529.4

// ★この様式は点検種別セルに「機　器」だけが印字されている（総合の選択肢が無い＝機器点検用）。
//   旧実装は "機器・総合点検" を印字の上に重ね書きしていた。該当語を丸で囲む方式に統一する。
const TYPE_CHOICES = [
    { label: "機器", cx: 161.8, cy: 166.0, rx: 19.0, ry: 8.0 }, // 機 145.9-156.5 / 器 167.0-177.6
]

// 点検者ブロック。セル内に「氏名」「社名」「TEL」「住所」が印字されているため、
// 値はその右の空きに置き、上下位置は印字ラベルの中心に合わせる。
const INSPECTOR = {
    name: { x: 147.0, top: 178.8, w: 56.9, h: 14.0 }, // 氏名 122.6-143.8 の右、セル右端 205.9
    company: { x: 299.0, top: 176.3, w: 89.0, h: 14.0 }, // 社名 274.9-296.0 の右、TEL 390.5 の手前
    tel: { x: 409.0, top: 176.3, w: 118.4, h: 14.0 }, // TEL 390.5-406.2 の右、セル右端 529.4
    address: { x: 299.0, top: 202.2, w: 228.4, h: 14.0 }, // 住所 274.9-296.0 の右
}

const PERIOD_START_ANCHORS: DateAnchors = { year: 306.48, month: 338.05, day: 369.5 }
const PERIOD_END_ANCHORS: DateAnchors = { year: 422.06, month: 453.63, day: 485.07 }

export async function POST(req: NextRequest) {
    try {
        const body = (await req.json()) as Bekki13Payload

        const candidatePdfPaths = [
            path.join(process.cwd(), "public", "PDF", "s50_kokuji14_bekki13.pdf"),
            path.join(process.cwd(), "public", "s50_kokuji14_bekki13.pdf"),
        ]
        const pdfPath = candidatePdfPaths.find((v) => fs.existsSync(v))
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf")
        if (!pdfPath) throw new Error("Template PDF not found: s50_kokuji14_bekki13.pdf")

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

        const drawResultRows = (page: PDFPage, pageHeight: number, rows: BekkiRow[], rowBounds: number[], cols: ResultColumns, contentOverrides: Record<number, { x: number; w: number }> = {}) => {
            for (let i = 0; i < rowBounds.length - 1; i += 1) {
                const row = rows[i]
                if (!row) continue
                const top = rowBounds[i]
                const h = rowBounds[i + 1] - top
                const cx = contentOverrides[i]?.x ?? cols.contentX
                const cw = contentOverrides[i]?.w ?? cols.contentW
                drawWrappedInCell(page, pageHeight, row.content, cx, top, cw, h, 6.3)
                drawInCell(page, pageHeight, formatJudgment(row.judgment), cols.judgmentX, top, cols.judgmentW, h, 7.4, { align: "center" })
                drawWrappedInCell(page, pageHeight, row.bad_content, cols.badX, top, cols.badW, h, 6.1)
                drawWrappedInCell(page, pageHeight, row.action_content, cols.actionX, top, cols.actionW, h, 6.1)
            }
        }

        const headerShiftY = -10
        const y = (v: number) => v + headerShiftY

        const drawHeader = (page: PDFPage, pageHeight: number) => {
            drawInCell(page, pageHeight, body.form_name, HEADER.valueX, HEADER.nameRow.top, HEADER.valueW, HEADER.nameRow.h, 8.4)
            drawInCell(page, pageHeight, body.fire_manager, HEADER.rightX, HEADER.nameRow.top, HEADER.rightW, HEADER.nameRow.h, 7.6)
            drawInCell(page, pageHeight, body.location, HEADER.valueX, HEADER.locationRow.top, HEADER.valueW, HEADER.locationRow.h, 8.0)
            drawInCell(page, pageHeight, body.witness, HEADER.rightX, HEADER.locationRow.top, HEADER.rightW, HEADER.locationRow.h, 7.6)
            const inspectionType = String(body.inspection_type ?? "").trim() || "機器"
            for (const choice of TYPE_CHOICES) {
                if (!inspectionType.includes(choice.label)) continue
                page.drawEllipse({
                    x: choice.cx,
                    y: pageHeight - choice.cy,
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
                        fontSize: 6.6,
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
                        fontSize: 6.6,
                    })
                }
            } else {
                drawInCell(page, pageHeight, periodText, PERIOD_CELL.x, PERIOD_ROW.top, PERIOD_CELL.w, PERIOD_ROW.h, 6.6)
            }

            drawInCell(page, pageHeight, body.inspector_name, INSPECTOR.name.x, INSPECTOR.name.top, INSPECTOR.name.w, INSPECTOR.name.h, 7.0)
            drawInCell(page, pageHeight, body.inspector_company, INSPECTOR.company.x, INSPECTOR.company.top, INSPECTOR.company.w, INSPECTOR.company.h, 6.8)
            drawInCell(page, pageHeight, body.inspector_tel, INSPECTOR.tel.x, INSPECTOR.tel.top, INSPECTOR.tel.w, INSPECTOR.tel.h, 6.8)
            drawInCell(page, pageHeight, body.inspector_address, INSPECTOR.address.x, INSPECTOR.address.top, INSPECTOR.address.w, INSPECTOR.address.h, 6.6)
        }

        drawHeader(page1, p1Height)

        drawResultRows(page1, p1Height, body.page1_rows ?? [], P1_ROW_BOUNDS, {
            contentX: 227.88,
            contentW: 104.52,
            judgmentX: 332.88,
            judgmentW: 41.52,
            badX: 374.88,
            badW: 78.24,
            actionX: 453.6,
            actionW: 75.84,
        })

        drawResultRows(page2, p2Height, body.page2_rows ?? [], P2_ROW_BOUNDS, {
            contentX: 228.0,
            contentW: 103.8,
            judgmentX: 332.28,
            judgmentW: 42.24,
            badX: 375.0,
            badW: 77.88,
            actionX: 453.36,
            actionW: 76.44,
        })

        drawWrappedInCell(page2, p2Height, body.notes, 80.52, 492.36, 449.28, 172.44, 7.0)

        const device1 = body.device1 ?? {}
        const device2 = body.device2 ?? {}
        // Pre-5: 元の 665.28 は公式PDFのヘッダー行（機器名/型式/校正年月日/製造者名）と
        // 重なっていたため +16.44pt シフト。データ行1 (top_y=681.72, h=16.44pt) に描画。
        const deviceRowTop = 681.72
        const deviceRowH = 16.44

        drawInCell(page2, p2Height, device1.name, 80.52, deviceRowTop, 55.68, deviceRowH, 5.8)
        drawInCell(page2, p2Height, device1.model, 136.8, deviceRowTop, 55.68, deviceRowH, 5.8)
        drawInCell(page2, p2Height, formatJapaneseDateText(device1.calibrated_at), 192.96, deviceRowTop, 55.8, deviceRowH, 5.6)
        drawInCell(page2, p2Height, device1.maker, 249.24, deviceRowTop, 55.32, deviceRowH, 5.6)

        drawInCell(page2, p2Height, device2.name, 305.28, deviceRowTop, 56.04, deviceRowH, 5.8)
        drawInCell(page2, p2Height, device2.model, 361.8, deviceRowTop, 55.68, deviceRowH, 5.8)
        drawInCell(page2, p2Height, formatJapaneseDateText(device2.calibrated_at), 417.96, deviceRowTop, 55.8, deviceRowH, 5.6)
        drawInCell(page2, p2Height, device2.maker, 474.24, deviceRowTop, 55.56, deviceRowH, 5.6)

        // ⑧ 枠に収まらなかった項目があればPDFを返さずに一覧を返す。
        //   黙って "..." で切り詰めると、法定書類から情報が静かに欠落するため。
        fonts.fit?.resolve(body)
        const systemOverflow = systemFitFailures(fonts.fit!)
        if (systemOverflow.length) {
            // 業者には直せない（テンプレート固定文言・整形済みの値）＝実装側の不具合として記録
            console.error("[pdf] 収容不能(システム由来)", { form: "別記様式第13", items: systemOverflow })
        }
        const fitFormLabel = "別記様式第13"
        logFitDebug(fitFormLabel, fonts.fit!)
        if (fonts.fit?.smalls.length) {
            // 判読しづらい大きさで描かれた項目。単独では止められない（上記コメント参照）ので記録のみ
            console.warn("[pdf] 極小フォントで描画", { count: fonts.fit.smalls.length })
        }
        const fitError = buildFitError("別記様式第13", fonts.fit!)
        if (fitError) return NextResponse.json(fitError, { status: 422 })

        const pdfBytes = await pdfDoc.save()
        return new NextResponse(pdfBytes as unknown as BodyInit, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                // ⑨ 設計値から大きく縮んだ項目があれば警告として運ぶ（PDFは返す）
                ...fitWarningHeader(fitFormLabel, fonts.fit!),
                "Content-Disposition": 'attachment; filename="s50_kokuji14_bekki13_filled.pdf"',
            },
        })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 })
    }
}
