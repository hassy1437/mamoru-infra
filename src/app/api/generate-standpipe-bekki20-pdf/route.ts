import { NextRequest, NextResponse } from "next/server"
import { PDFDocument, type PDFPage, rgb, StandardFonts } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"
import fs from "fs"
import path from "path"
import { FIT_EPSILON, drawChoiceCircle, drawPeriodDate, drawTextInCell, drawTextRuns, drawWrappedTextInCell, formatDateText, formatJapaneseDateText, formatJudgment, measureRuns, parseDateParts, pickFont, reportIfBelowMinSize, type CellDrawOptions, type DateAnchors, type ReportFonts } from "@/lib/pdf-form-helpers"
import {
    buildFitError,
    createFitCollector,
    fitWarningHeader,
    logFitDebug,
    systemFitFailures,
} from "@/lib/pdf-fit-report"

type BekkiRow = { content?: string; judgment?: string; bad_content?: string; action_content?: string; current_value?: string; flow_value?: string; hose_count?: string; nozzle_dia?: string }
type DeviceRow = { name?: string; model?: string; calibrated_at?: string; maker?: string }

type Bekki20Payload = {
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
    326.4, 341.64, 356.88, 372.12, 387.36, 402.6, 417.84, 433.08, 457.68, 472.92, 488.16, 503.4,
    518.64, 533.88, 549.12, 564.36, 579.6, 594.84, 610.08, 625.44, 640.68, 655.92, 671.16, 686.4,
    701.64, 717.12,
]

const P2_ROW_BOUNDS = [
    83.52, 101.52, 119.76, 138.0, 156.24, 174.48, 192.72, 210.96, 229.2, 247.44, 265.8, 284.04,
    302.28, 320.52, 338.76, 357.0, 375.24, 393.48, 411.72, 429.96, 448.2, 466.44, 484.8, 503.04,
    521.28, 539.52, 557.76, 576.0, 594.24, 612.48, 630.72, 648.96, 667.2, 685.44, 703.8, 722.28,
]

// 83.52 は「総合点検」ヘッダー行 → データ行は 103.2 から
const P3_ROW_BOUNDS = [103.2, 123.24, 143.28, 163.2]

const PERIOD_ROW = { top: 160.56, h: 24.48 }
const PERIOD_START_ANCHORS: DateAnchors = { year: 347.16, month: 378.61, day: 410.17 }
const PERIOD_END_ANCHORS: DateAnchors = { year: 452.18, month: 483.74, day: 515.19 }

export async function POST(req: NextRequest) {
    try {
        const body = (await req.json()) as Bekki20Payload

        const candidatePdfPaths = [
            path.join(process.cwd(), "public", "PDF", "s50_kokuji14_bekki20.pdf"),
            path.join(process.cwd(), "public", "s50_kokuji14_bekki20.pdf"),
        ]
        const pdfPath = candidatePdfPaths.find((v) => fs.existsSync(v))
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf")
        if (!pdfPath) throw new Error("Template PDF not found: s50_kokuji14_bekki20.pdf")

        const pdfDoc = await PDFDocument.load(fs.readFileSync(pdfPath))
        pdfDoc.registerFontkit(fontkit)
        const customFont = await pdfDoc.embedFont(fs.readFileSync(fontPath))
        // ASCII(型式・番号・日付等)は Helvetica で描く。NotoSansJP は「英字+ハイフン+数字」で
        // 数字がCJK拡張Aのグリフに化け、計測幅と実描画幅が最大+41.6%ズレて枠をはみ出すため。
        const latinFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
        const fonts: ReportFonts = { jp: customFont, latin: latinFont, fit: createFitCollector() }

        const normalizeText = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim()

        const [page1, page2, page3] = pdfDoc.getPages()
        const p1Height = page1.getSize().height
        const p2Height = page2.getSize().height
        const p3Height = page3.getSize().height

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

        type DrawOptions = CellDrawOptions & { minFontSize?: number; maxFontSize?: number }
        const drawInCellWithFont = (
            page: PDFPage, pageHeight: number, font: ReportFonts, text: unknown,
            cellX: number, cellTopFromTop: number, cellW: number, cellH: number, fontSize = 9, options?: DrawOptions,
        ) => {
            const normalized = normalizeText(text)
            if (!normalized) return
            const paddingX = options?.paddingX ?? 3
            const paddingY = options?.paddingY ?? 2
            let currentSize = Math.min(fontSize, options?.maxFontSize ?? fontSize)
            const designSize = currentSize
            // 安全係数は撤廃済み（①bで計測が実描画と一致し、②③④でセル座標を実測値に直したため）
            const maxWidth = Math.max(1, cellW - paddingX * 2)
            const maxHeight = Math.max(1, cellH - paddingY * 2)
            const w = measureRuns(font, String(normalized ?? ""), currentSize)
            if (w > maxWidth) currentSize = currentSize * (maxWidth / w)
            const h = font.jp.heightAtSize(currentSize, { descender: true })
            if (h > maxHeight) currentSize = currentSize * (maxHeight / h)
            currentSize = Math.max(currentSize, options?.minFontSize ?? 3.5)
            fonts.fit?.reportShrink(normalized, designSize, currentSize)
            reportIfBelowMinSize(fonts, normalized, currentSize, maxWidth)
            let textToDraw = normalized
            if (measureRuns(font, String(normalized ?? ""), currentSize) > maxWidth + 0.1) {
                const suffix = "..."
                let cut = normalized.length
                while (cut > 0) {
                    const candidate = `${normalized.slice(0, cut).trimEnd()}${suffix}`
                    if (measureRuns(font, String(candidate ?? ""), currentSize) <= maxWidth + FIT_EPSILON) {
                        font.fit?.report(normalized, cut)
                        textToDraw = candidate
                        break
                    }
                    cut -= 1
                }
            }
            const textWidth = measureRuns(font, String(textToDraw ?? ""), currentSize)
            const textHeight = font.jp.heightAtSize(currentSize, { descender: true })
            let textX = cellX + paddingX
            if (options?.align === "center") textX = cellX + (cellW - textWidth) / 2
            const textTopFromTop = cellTopFromTop + (cellH - textHeight) / 2
            drawTextRuns(page, font, String(textToDraw ?? ""), textX, pageHeight - (textTopFromTop + textHeight * 0.78), currentSize)
        }

        const drawDeviceMaker = (text: unknown, page: PDFPage, pageH: number, cellX: number, cellW: number, cellTop: number, cellH: number, baseFontSize = 5.6) => {
            const norm = normalizeText(text)
            if (!norm) return
            const padX = 1
            const availW = cellW - padX * 2
            let sz = baseFontSize
            const w = measureRuns(fonts, String(norm ?? ""), sz)
            // 0.98 の余白は撤廃（2026-07-24 実測: はみ出し・切り詰め・フォントサイズ分布のどれも変化なし。
            // 丸め防御を名乗るには2%は大きすぎ、0.85/0.90 と同じ「症状を隠す係数」の系統だった）
            if (w > availW) sz = sz * (availW / w)
            sz = Math.max(sz, 3.5)
            const th = fonts.jp.heightAtSize(sz, { descender: true })
            const textTop = cellTop + (cellH - th) / 2
            drawTextRuns(page, fonts, String(norm ?? ""), cellX + padX, pageH - (textTop + th * 0.78), sz)
        }


        const drawResultRows = (page: PDFPage, pageHeight: number, rows: BekkiRow[], rowBounds: number[], cols: ResultColumns, skipContentRows?: Set<number>) => {
            for (let i = 0; i < rowBounds.length - 1; i += 1) {
                const row = rows[i]
                if (!row) continue
                const top = rowBounds[i]
                const h = rowBounds[i + 1] - top
                if (!skipContentRows?.has(i)) {
                    drawWrappedInCell(page, pageHeight, row.content, cols.contentX, top, cols.contentW, h, 6.0)
                }
                drawInCell(page, pageHeight, formatJudgment(row.judgment), cols.judgmentX, top, cols.judgmentW, h, 7.0, { align: "center" })
                drawWrappedInCell(page, pageHeight, row.bad_content, cols.badX, top, cols.badW, h, 5.9)
                drawWrappedInCell(page, pageHeight, row.action_content, cols.actionX, top, cols.actionW, h, 5.9)
            }
        }

        // ★名称/所在の値セル幅はテンプレート罫線の実測値。旧値は右隣の「防火管理者/立会者」
        // ラベル欄まで食い込む幅で定義されており、長い住所が罫線を越えていた（2026-07-24 実測）。
        const drawHeader = () => {
            drawInCell(page1, p1Height, body.form_name, 117.5, 108.24, 251.0, 27.84, 8.1)
            drawInCell(page1, p1Height, body.fire_manager, 411.5, 108.24, 118.1, 27.84, 7.3)
            drawInCell(page1, p1Height, body.location, 117.5, 136.08, 251.0, 24.48, 7.9)
            drawInCell(page1, p1Height, body.witness, 411.5, 136.08, 118.1, 24.48, 7.3)
            // 点検種別はテンプレートに「機器・総合」が印刷済みのため描画不要

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
                        page: page1,
                        pageHeight: p1Height,
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
                        page: page1,
                        pageHeight: p1Height,
                        fonts,
                        dateValue: body.period_end,
                        anchors: PERIOD_END_ANCHORS,
                        rowTop: PERIOD_ROW.top,
                        rowHeight: PERIOD_ROW.h,
                        fontSize: 6.2,
                    })
                }
            } else {
                drawInCell(page1, p1Height, periodText, 316.8, PERIOD_ROW.top, 213.24, PERIOD_ROW.h, 6.2)
            }

            drawInCell(page1, p1Height, body.inspector_name, 117.24, 185.04, 136.08, 55.56, 6.4)
            // 社名: label x=321-342, TEL label x=426-442, right edge x=530
            // 社名 data: after label (x=343) to before TEL label (x=425) → w=82
            // TEL data: after TEL label (x=443) to right edge (x=530) → w=87
            drawWrappedInCell(page1, p1Height, body.inspector_company, 343.0, 185.04, 82.0, 27.84, 5.8)
            drawInCell(page1, p1Height, body.inspector_tel, 443.0, 185.04, 87.0, 27.84, 6.0)
            // 住所: label x=321-342, right edge x=530
            drawInCell(page1, p1Height, body.inspector_address, 343.0, 212.88, 187.0, 27.72, 5.9)

            drawInCell(page1, p1Height, body.extra_fields?.motor_maker, 222.24, 240.6, 105.6, 20.04, 6.0)
            drawInCellWithFont(page1, p1Height, fonts, body.extra_fields?.motor_model, 222.24, 260.64, 105.6, 20.04, 6.0, { paddingX: 2 })
            drawInCell(page1, p1Height, body.extra_fields?.pump_maker, 421.2, 240.6, 108.84, 20.04, 6.0)
            drawInCellWithFont(page1, p1Height, fonts, body.extra_fields?.pump_model, 421.2, 260.64, 108.84, 20.04, 6.0, { paddingX: 2 })
        }

        drawHeader()

        const commonCols: ResultColumns = {
            contentX: 222.24,
            contentW: 115.56,
            judgmentX: 337.8,
            judgmentW: 36.72,
            badX: 374.52,
            badW: 78.72,
            actionX: 453.24,
            actionW: 76.8,
        }

        drawResultRows(page1, p1Height, body.page1_rows ?? [], P1_ROW_BOUNDS, commonCols, new Set([
            7,  // ホース・ノズル: m×本 mm → 手動3分割描画
            17, // 電圧計・電流計: V A → 手動V/A分割描画
        ]))
        drawResultRows(page2, p2Height, body.page2_rows ?? [], P2_ROW_BOUNDS, commonCols, new Set([
            7,  // 機能: テンプレートに「専用 兼用」印刷済み → circle
            18, // 性能: MPa L/min → 手動2分割描画
        ]))
        drawResultRows(page3, p3Height, body.page3_rows ?? [], P3_ROW_BOUNDS, commonCols)

        // === P1 Row 7: ホース・ノズル (長さｍ × 本数本 ／ ノズル径mm) ===
        // 公式PDF実測: ｍ@247.6 / ×(x1=268.6) / 本@289.6(x1=300.1) / mm@321。content列左=222.24。
        // 新キー優先（content=長さ, hose_count=本数, nozzle_dia=口径）→ "/" 分割 → 単一content。値は各空白に中央寄せ
        const p1Rows = body.page1_rows ?? []
        const hoseRow = p1Rows[7]
        if (hoseRow) {
            const hTop = P1_ROW_BOUNDS[7]
            const hH = P1_ROW_BOUNDS[8] - hTop
            const hValTop = hTop + hH / 2
            const hValH = hH / 2
            const hContent = normalizeText(hoseRow.content)
            const hCount = normalizeText(hoseRow.hose_count)
            const nDia = normalizeText(hoseRow.nozzle_dia)
            const drawLen = (v: string) => { if (v) drawInCellWithFont(page1, p1Height, fonts, v, 222.24, hValTop, 25.4, hValH, 6.0, { align: "center" }) }
            const drawCnt = (v: string) => { if (v) drawInCellWithFont(page1, p1Height, fonts, v, 268.6, hValTop, 21, hValH, 6.0, { align: "center" }) }
            const drawDia = (v: string) => { if (v) drawInCellWithFont(page1, p1Height, fonts, v, 300.1, hValTop, 20.9, hValH, 6.0, { align: "center" }) }
            if (hCount || nDia) {
                drawLen(hContent); drawCnt(hCount); drawDia(nDia)
            } else if (hContent.includes("/")) {
                const parts = hContent.split("/")
                drawLen(parts[0]?.trim() ?? ""); drawCnt(parts[1]?.trim() ?? ""); drawDia(parts[2]?.trim() ?? "")
            } else if (hContent) {
                drawLen(hContent)
            }
        }

        // === P1 Row 17: 電圧計・電流計 (V / A) ===
        // Template: "V" at x≈270.5, "A" at x≈323 (in content cell x=222-338)
        const voltRow = p1Rows[17]
        if (voltRow) {
            const vTop = P1_ROW_BOUNDS[17]
            const vH = P1_ROW_BOUNDS[18] - vTop
            const vContent = normalizeText(voltRow.content)
            const aValue = normalizeText(voltRow.current_value)
            if (aValue) {
                // 新方式: content=電圧(V), current_value=電流(A)（bekki18/21 と同じ2欄入力）
                drawInCellWithFont(page1, p1Height, fonts, vContent, 222, vTop, 48, vH, 6.0, { paddingX: 1 })
                drawInCellWithFont(page1, p1Height, fonts, aValue, 280, vTop, 42, vH, 6.0, { paddingX: 1 })
            } else if (vContent.includes("/")) {
                // 後方互換: 旧スラッシュ手入力データ "100/5" を分割
                const parts = vContent.split("/")
                // V value: x=222 to before V label (x=270)
                drawInCellWithFont(page1, p1Height, fonts, parts[0]?.trim(), 222, vTop, 48, vH, 6.0, { paddingX: 1 })
                // A value: after V label to before A label (x=270-323)
                drawInCellWithFont(page1, p1Height, fonts, parts[1]?.trim(), 280, vTop, 42, vH, 6.0, { paddingX: 1 })
            } else if (vContent) {
                drawInCellWithFont(page1, p1Height, fonts, vContent, 222, vTop, 48, vH, 6.0, { paddingX: 1 })
            }
        }

        // === P2 Row 7: 機能 (専用/兼用) circle ===
        const p2Rows = body.page2_rows ?? []
        const funcRow = p2Rows[7]
        if (funcRow) {
            drawChoiceCircle(page2, p2Height, funcRow.content ?? "", [
                { label: "専用", cx: 259.0, cy: 222.0, rx: 16, ry: 7 },
                { label: "兼用", cx: 301.0, cy: 222.0, rx: 16, ry: 7 },
            ], 0.8)
        }

        // === P2 Row 18: 性能 (吐出圧力MPa / 吐出量L/min) ===
        // 公式PDF実測: MPa@259.9(x1=275.8) / L/min@307.3。content列左=222.24。
        // 新キー優先（content=MPa, flow_value=L/min）→ "/" 分割 → 単一content。値は各空白に中央寄せ
        const perfRow = p2Rows[18]
        if (perfRow) {
            const pTop = P2_ROW_BOUNDS[18]
            const pH = P2_ROW_BOUNDS[19] - pTop
            const pContent = normalizeText(perfRow.content)
            const pFlow = normalizeText(perfRow.flow_value)
            const drawMpa = (v: string) => { if (v) drawInCellWithFont(page2, p2Height, fonts, v, 222.24, pTop, 37.7, pH, 6.0, { align: "center" }) }
            const drawLmin = (v: string) => { if (v) drawInCellWithFont(page2, p2Height, fonts, v, 275.8, pTop, 31.5, pH, 6.0, { align: "center" }) }
            if (pFlow) {
                drawMpa(pContent); drawLmin(pFlow)
            } else if (pContent.includes("/")) {
                const parts = pContent.split("/")
                drawMpa(parts[0]?.trim() ?? ""); drawLmin(parts[1]?.trim() ?? "")
            } else if (pContent) {
                drawMpa(pContent)
            }
        }

        drawWrappedInCell(page3, p3Height, body.notes, 86.04, 163.2, 444.0, 477.36, 6.8)

        const device1 = body.device1 ?? {}
        const device2 = body.device2 ?? {}
        const deviceRowTop = 660.6
        const deviceRowH = 19.92

        const devOpts: DrawOptions = { paddingX: 1 }
        drawInCell(page3, p3Height, device1.name, 86.04, deviceRowTop, 55.56, deviceRowH, 5.8)
        drawInCellWithFont(page3, p3Height, fonts, device1.model, 141.6, deviceRowTop, 55.44, deviceRowH, 5.8, devOpts)
        drawInCell(page3, p3Height, formatJapaneseDateText(device1.calibrated_at), 197.04, deviceRowTop, 55.56, deviceRowH, 5.6)
        drawDeviceMaker(device1.maker, page3, p3Height, 252.6, 54.96, deviceRowTop, deviceRowH)

        drawInCell(page3, p3Height, device2.name, 308.52, deviceRowTop, 55.08, deviceRowH, 5.8)
        drawInCellWithFont(page3, p3Height, fonts, device2.model, 363.6, deviceRowTop, 55.44, deviceRowH, 5.8, devOpts)
        drawInCell(page3, p3Height, formatJapaneseDateText(device2.calibrated_at), 419.04, deviceRowTop, 55.56, deviceRowH, 5.6)
        drawDeviceMaker(device2.maker, page3, p3Height, 474.6, 55.44, deviceRowTop, deviceRowH)

        // ⑧ 枠に収まらなかった項目があればPDFを返さず一覧を返す。
        //   黙って "..." で切り詰めると法定書類から情報が静かに欠落するため。
        fonts.fit?.resolve(body)
        const systemOverflow = systemFitFailures(fonts.fit!)
        if (systemOverflow.length) {
            // 業者には直せない値（テンプレート文言・整形済みの日付など）＝実装側の不具合として記録
            console.error("[pdf] 収容不能(システム由来)", { form: "別記様式第20", items: systemOverflow })
        }
        const fitFormLabel = "別記様式第20"
        logFitDebug(fitFormLabel, fonts.fit!)
        if (fonts.fit?.smalls.length) {
            // 判読しづらい大きさで描かれた項目。単独では止められない（上記コメント参照）ので記録のみ
            console.warn("[pdf] 極小フォントで描画", { count: fonts.fit.smalls.length })
        }
        const fitError = buildFitError("別記様式第20", fonts.fit!)
        if (fitError) return NextResponse.json(fitError, { status: 422 })

        const pdfBytes = await pdfDoc.save()
        return new NextResponse(pdfBytes as unknown as BodyInit, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                // ⑨ 設計値から大きく縮んだ項目があれば警告として運ぶ（PDFは返す）
                ...fitWarningHeader(fitFormLabel, fonts.fit!),
                "Content-Disposition": 'attachment; filename="s50_kokuji14_bekki20_filled.pdf"',
            },
        })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 })
    }
}
