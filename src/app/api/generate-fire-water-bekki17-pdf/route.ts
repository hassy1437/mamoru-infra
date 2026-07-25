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

type BekkiRow = { content?: string; judgment?: string; bad_content?: string; action_content?: string }
type DeviceRow = { name?: string; model?: string; calibrated_at?: string; maker?: string }

type Bekki17Payload = {
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

const P1_ROW_BOUNDS = [270.72, 290.76, 310.8, 330.72, 350.76, 370.8, 390.72, 410.76, 430.8, 450.72, 470.76]

const PERIOD_ROW = { top: 162.72, h: 20.04 }
const PERIOD_START_ANCHORS: DateAnchors = { year: 308.27, month: 347.14, day: 386.13 }
const PERIOD_END_ANCHORS: DateAnchors = { year: 436.16, month: 475.04, day: 514.03 }

export async function POST(req: NextRequest) {
    try {
        const body = (await req.json()) as Bekki17Payload

        const candidatePdfPaths = [
            path.join(process.cwd(), "public", "PDF", "s50_kokuji14_bekki17.pdf"),
            path.join(process.cwd(), "public", "s50_kokuji14_bekki17.pdf"),
        ]
        const pdfPath = candidatePdfPaths.find((v) => fs.existsSync(v))
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf")
        if (!pdfPath) throw new Error("Template PDF not found: s50_kokuji14_bekki17.pdf")

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

        const drawHeader = (page: PDFPage, pageHeight: number) => {
            drawInCell(page, pageHeight, body.form_name, 117.6, 114.72, 272.52, 24.0, 8.2)
            drawInCell(page, pageHeight, body.fire_manager, 432.6, 114.72, 97.44, 24.0, 7.4)
            drawInCell(page, pageHeight, body.location, 117.6, 138.72, 272.52, 24.0, 8.0)
            drawInCell(page, pageHeight, body.witness, 432.6, 138.72, 97.44, 24.0, 7.4)
            drawInCell(page, pageHeight, body.inspection_type || "", 117.6, 162.72, 99.24, 20.04, 6.6, { align: "center" })
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
                        fontSize: 6.4,
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
                        fontSize: 6.4,
                    })
                }
            } else {
                drawInCell(page, pageHeight, periodText, 275.04, PERIOD_ROW.top, 255.0, PERIOD_ROW.h, 6.4)
            }
            drawInCell(page, pageHeight, body.inspector_name, 117.6, 182.76, 99.24, 48.0, 6.7)
            drawInCell(page, pageHeight, body.inspector_company, 302.4, 182.76, 141.6, 24.0, 6.3)
            drawInCell(page, pageHeight, body.inspector_tel, 444.0, 182.76, 86.04, 24.0, 6.3)
            drawInCell(page, pageHeight, body.inspector_address, 302.4, 206.76, 227.64, 24.0, 6.2)
        }

        drawHeader(page1, p1Height)

        drawResultRows(page1, p1Height, body.page1_rows ?? [], P1_ROW_BOUNDS, {
            contentX: 227.76,
            contentW: 115.56,
            judgmentX: 343.32,
            judgmentW: 36.72,
            badX: 380.04,
            badW: 68.28,
            actionX: 448.32,
            actionW: 81.72,
        })

        drawWrappedInCell(page1, p1Height, body.notes, 86.04, 470.76, 444.0, 157.44, 6.8)

        const device1 = body.device1 ?? {}
        const device2 = body.device2 ?? {}
        const deviceRowTop = 648.24
        const deviceRowH = 20.04

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
            console.error("[pdf] 収容不能(システム由来)", { form: "別記様式第17", items: systemOverflow })
        }
        const fitFormLabel = "別記様式第17"
        logFitDebug(fitFormLabel, fonts.fit!)
        if (fonts.fit?.smalls.length) {
            // 判読しづらい大きさで描かれた項目。単独では止められない（上記コメント参照）ので記録のみ
            console.warn("[pdf] 極小フォントで描画", { count: fonts.fit.smalls.length })
        }
        const fitError = buildFitError("別記様式第17", fonts.fit!)
        if (fitError) return NextResponse.json(fitError, { status: 422 })

        const pdfBytes = await pdfDoc.save()
        return new NextResponse(pdfBytes as unknown as BodyInit, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                // ⑨ 設計値から大きく縮んだ項目があれば警告として運ぶ（PDFは返す）
                ...fitWarningHeader(fitFormLabel, fonts.fit!),
                "Content-Disposition": 'attachment; filename="s50_kokuji14_bekki17_filled.pdf"',
            },
        })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 })
    }
}
