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

type BekkiRow = { content?: string; judgment?: string; bad_content?: string; action_content?: string }
type DeviceRow = { name?: string; model?: string; calibrated_at?: string; maker?: string }

type Bekki19Payload = {
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

const P1_ROW_BOUNDS = [
    282.72, 296.76, 310.8, 324.72, 338.76, 352.8, 366.72, 380.76, 394.8, 408.72, 422.76,
    436.8, 450.72, 464.76, 478.8, 492.72, 506.76, 520.8, 534.72, 548.76, 562.8,
]

const PERIOD_ROW = { top: 167.28, h: 21.0 }
const PERIOD_START_ANCHORS: DateAnchors = { year: 299.4, month: 339.0, day: 378.6 }
const PERIOD_END_ANCHORS: DateAnchors = { year: 428.16, month: 467.76, day: 507.36 }

export async function POST(req: NextRequest) {
    try {
        const body = (await req.json()) as Bekki19Payload

        const candidatePdfPaths = [
            path.join(process.cwd(), "public", "PDF", "s50_kokuji14_bekki19.pdf"),
            path.join(process.cwd(), "public", "s50_kokuji14_bekki19.pdf"),
        ]
        const pdfPath = candidatePdfPaths.find((v) => fs.existsSync(v))
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf")
        if (!pdfPath) throw new Error("Template PDF not found: s50_kokuji14_bekki19.pdf")

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

        const drawResultRows = (
            page: PDFPage,
            pageHeight: number,
            rows: BekkiRow[],
            rowBounds: number[],
            cols: ResultColumns,
        ) => {
            for (let i = 0; i < rowBounds.length - 1; i += 1) {
                const row = rows[i]
                if (!row) continue
                const top = rowBounds[i]
                const h = rowBounds[i + 1] - top
                drawWrappedInCell(page, pageHeight, row.content, cols.contentX, top, cols.contentW, h, 6.1)
                drawInCell(page, pageHeight, formatJudgment(row.judgment), cols.judgmentX, top, cols.judgmentW, h, 7.0, { align: "center" })
                drawWrappedInCell(page, pageHeight, row.bad_content, cols.badX, top, cols.badW, h, 6.0)
                drawWrappedInCell(page, pageHeight, row.action_content, cols.actionX, top, cols.actionW, h, 6.0)
            }
        }

        // ★名称/所在の値セル幅はテンプレート罫線の実測値。旧値は右隣の「防火管理者/立会者」
        // ラベル欄まで食い込む幅で定義されており、長い住所が罫線を越えていた（2026-07-24 実測）。
        const drawHeader = (page: PDFPage, pageHeight: number) => {
            drawInCell(page, pageHeight, body.form_name, 112.6, 111.24, 259.5, 27.96, 8.0)
            drawInCell(page, pageHeight, body.fire_manager, 415.1, 111.24, 114.5, 27.96, 7.3)
            drawInCell(page, pageHeight, body.location, 112.6, 139.2, 259.5, 28.08, 7.8)
            drawInCell(page, pageHeight, body.witness, 415.1, 139.2, 114.5, 28.08, 7.3)
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
                drawInCell(page, pageHeight, periodText, 264.6, PERIOD_ROW.top, 265.44, PERIOD_ROW.h, 6.2)
            }
            drawInCell(page, pageHeight, body.inspector_name, 117.6, 188.28, 89.52, 52.44, 6.5)
            drawInCell(page, pageHeight, body.inspector_company, 299.4, 188.28, 133.32, 26.22, 6.1)
            drawInCell(page, pageHeight, body.inspector_tel, 432.72, 188.28, 97.32, 26.22, 6.1)
            drawInCell(page, pageHeight, body.inspector_address, 299.4, 214.5, 230.64, 26.22, 6.0)
        }

        drawHeader(page1, p1Height)

        drawResultRows(page1, p1Height, body.page1_rows ?? [], P1_ROW_BOUNDS, {
            contentX: 212.04,
            contentW: 105.0,
            judgmentX: 317.04,
            judgmentW: 42.0,
            badX: 359.04,
            badW: 85.8,
            actionX: 444.84,
            actionW: 85.2,
        })

        drawWrappedInCell(page1, p1Height, body.notes, 86.04, 562.8, 444.0, 63.0, 6.6)

        const device1 = body.device1 ?? {}
        const device2 = body.device2 ?? {}
        const deviceRowTop = 646.8
        const deviceRowH = 21.0

        drawInCell(page1, p1Height, device1.name, 86.04, deviceRowTop, 55.56, deviceRowH, 5.8)
        drawInCell(page1, p1Height, device1.model, 141.6, deviceRowTop, 55.44, deviceRowH, 5.8)
        drawInCell(page1, p1Height, formatJapaneseDateText(device1.calibrated_at), 197.04, deviceRowTop, 55.56, deviceRowH, 5.6)
        drawInCell(page1, p1Height, device1.maker, 252.6, deviceRowTop, 54.96, deviceRowH, 5.6)

        drawInCell(page1, p1Height, device2.name, 308.52, deviceRowTop, 55.08, deviceRowH, 5.8)
        drawInCell(page1, p1Height, device2.model, 363.6, deviceRowTop, 55.44, deviceRowH, 5.8)
        drawInCell(page1, p1Height, formatJapaneseDateText(device2.calibrated_at), 419.04, deviceRowTop, 55.56, deviceRowH, 5.6)
        drawInCell(page1, p1Height, device2.maker, 474.6, deviceRowTop, 55.44, deviceRowH, 5.6)

        // ⑧ 枠に収まらなかった項目があればPDFを返さずに一覧を返す。
        //   黙って "..." で切り詰めると、法定書類から情報が静かに欠落するため。
        fonts.fit?.resolve(body)
        const systemOverflow = systemFitFailures(fonts.fit!)
        if (systemOverflow.length) {
            // 業者には直せない（テンプレート固定文言・整形済みの値）＝実装側の不具合として記録
            console.error("[pdf] 収容不能(システム由来)", { form: "別記様式第19", items: systemOverflow })
        }
        const fitFormLabel = "別記様式第19"
        logFitDebug(fitFormLabel, fonts.fit!)
        if (fonts.fit?.smalls.length) {
            // 判読しづらい大きさで描かれた項目。単独では止められない（上記コメント参照）ので記録のみ
            console.warn("[pdf] 極小フォントで描画", { count: fonts.fit.smalls.length })
        }
        const fitError = buildFitError("別記様式第19", fonts.fit!)
        if (fitError) return NextResponse.json(fitError, { status: 422 })

        const pdfBytes = await pdfDoc.save()
        return new NextResponse(pdfBytes as unknown as BodyInit, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                // ⑨ 設計値から大きく縮んだ項目があれば警告として運ぶ（PDFは返す）
                ...fitWarningHeader(fitFormLabel, fonts.fit!),
                "Content-Disposition": 'attachment; filename="s50_kokuji14_bekki19_filled.pdf"',
            },
        })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 })
    }
}
