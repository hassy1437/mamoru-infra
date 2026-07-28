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
    drawWrappedTextInCell,
    formatJapaneseDateText,
    formatJudgment,
    pickFont,
    type ReportFonts,
    measureRuns,
    drawTextRuns,
    FIT_EPSILON,
    reportIfBelowMinSize,
} from "@/lib/pdf-form-helpers"

type BekkiRow = {
    content?: string
    judgment?: string
    bad_content?: string
    action_content?: string
    /** 1行に空欄が2つある行の2つ目の値（p2行0「感度範囲 －○％〜＋○％」の ＋ 側） */
    current_value?: string
}
type DeviceRow = { name?: string; model?: string; calibrated_at?: string; maker?: string }

type Bekki12Payload = {
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
    324.0, 340.56, 357.0, 373.56, 390.0, 406.56, 423.0, 439.56, 456.0, 472.56, 489.0, 505.56,
    522.0, 538.56, 555.0, 571.56, 588.0, 604.56, 621.0, 637.56, 654.0, 670.56, 687.0, 703.56,
]

const P2_ROW_BOUNDS = [105.96, 129.0, 152.04, 174.96, 198.0]

// ★ヘッダ各セルはテンプレートPDFの罫線・印字グリフから実測した値（2026-07-24）。
//   旧定数（名称/所在を x=83.33 幅365.34 で描く）は別スケールの版に合わせたもので、
//   値が左のラベル欄「名　称」「所　在」に重なり、罫線 x=117.4 を越えていた。
//   セル境界: 64.6 | 117.4 …ラベル | 393.1 …名称/所在の値 | 435.6 | 529.6 …防火管理者/立会者
const HEADER = {
    nameRow: { top: 117.5, h: 25.8 },
    locationRow: { top: 143.8, h: 25.8 },
    valueX: 117.8,
    valueW: 275.3, // 117.8 → 393.1
    rightX: 436.1,
    rightW: 93.5, // 436.1 → 529.6
}

// 点検種別/点検年月日の行。旧値 top=162.0 は1行分上にずれており、
// 日付が上の「所在」行に食い込んで罫線 x=435.6 を越えていた。
const PERIOD_ROW = { top: 170.0, h: 16.5 }
const PERIOD_CELL = { x: 280.6, w: 249.0 } // 280.6 → 529.6

// 点検種別はテンプレートに「機　器　・　総　合」が印字済み。値を重ね書きすると
// 二重表記になるため、該当語を丸で囲む（bekki5/6/7 と同じ方式）。座標は印字グリフの実測値。
const TYPE_CHOICES = [
    { label: "機器", cx: 137.9, cy: 177.6, rx: 18.0, ry: 8.0 },
    { label: "総合", cx: 196.5, cy: 177.6, rx: 18.0, ry: 8.0 },
]

// 点検者ブロック。セル内に「氏名」「社名」「TEL」「住所」が印字されているため、
// 値はその右の空きに置き、上下位置は印字ラベルの中心に合わせる。
const INSPECTOR = {
    name: { x: 147.0, top: 189.6, w: 67.6, h: 14.0 },
    company: { x: 310.0, top: 187.0, w: 99.0, h: 14.0 },
    tel: { x: 430.0, top: 187.0, w: 97.6, h: 14.0 },
    address: { x: 310.0, top: 213.2, w: 217.6, h: 14.0 },
}

// 年/月/日は印字文字の左端に右寄せで置く（実測: 年317.2 月348.7 日380.2 / 年432.7 月464.3 日495.8）。
// 旧値は bekki11-2 の座標を流用したもので、月・日が印字に重なっていた。
const PERIOD_START_ANCHORS = { year: 317.2, month: 348.7, day: 380.2 }
const PERIOD_END_ANCHORS = { year: 432.7, month: 464.3, day: 495.8 }

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
        const body = (await req.json()) as Bekki12Payload

        const candidatePdfPaths = [
            path.join(process.cwd(), "public", "PDF", "s50_kokuji14_bekki12.pdf"),
            path.join(process.cwd(), "public", "s50_kokuji14_bekki12.pdf"),
        ]
        const pdfPath = candidatePdfPaths.find((v) => fs.existsSync(v))
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf")
        if (!pdfPath) throw new Error("Template PDF not found: s50_kokuji14_bekki12.pdf")

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

        const truncateToFitWidth = (value: string, size: number, maxWidth: number) => {
            if (!value) return ""
            if (measureRuns(fonts, String(value ?? ""), size) <= maxWidth + FIT_EPSILON) return value

            const suffix = "..."
            if (measureRuns(fonts, String(suffix ?? ""), size) > maxWidth) return ""

            let cut = value.length
            while (cut > 0) {
                const candidate = `${value.slice(0, cut).trimEnd()}${suffix}`
                if (measureRuns(fonts, String(candidate ?? ""), size) <= maxWidth + FIT_EPSILON) {
                    fonts.fit?.report(value, cut)
                    return candidate
                }
                cut -= 1
            }

            return suffix
        }

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

            const textToDraw = truncateToFitWidth(normalized, currentSize, maxWidth)
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
            },
        })

        const drawResultRows = (
            page: PDFPage,
            pageHeight: number,
            rows: BekkiRow[],
            rowBounds: number[],
            cols: ResultColumns,
            // 内容列に刷り込み（「設定値 ___ mA」等）がある行は、空欄の位置に値だけ描く
            contentOverrides: Record<number, { x: number; w: number }> = {},
            // 内容列に刷り込みがあり、専用コードが描く行（一括描画から外す）
            skipContentRows: Set<number> = new Set(),
        ) => {
            for (let i = 0; i < rowBounds.length - 1; i += 1) {
                const row = rows[i]
                if (!row) continue
                const top = rowBounds[i]
                const h = rowBounds[i + 1] - top
                const cx = contentOverrides[i]?.x ?? cols.contentX
                const cw = contentOverrides[i]?.w ?? cols.contentW
                if (!skipContentRows.has(i)) drawWrappedInCell(page, pageHeight, row.content, cx, top, cw, h, 6.2)
                drawInCell(page, pageHeight, formatJudgment(row.judgment), cols.judgmentX, top, cols.judgmentW, h, 7.4, { align: "center" })
                drawWrappedInCell(page, pageHeight, row.bad_content, cols.badX, top, cols.badW, h, 6.0)
                drawWrappedInCell(page, pageHeight, row.action_content, cols.actionX, top, cols.actionW, h, 6.0)
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

        const drawPeriodDate = (
            page: PDFPage,
            pageHeight: number,
            dateValue: unknown,
            anchors: { year: number; month: number; day: number },
        ) => {
            const parts = parseDateParts(dateValue)
            if (!parts) return
            drawRightAt(page, pageHeight, parts.year, anchors.year, PERIOD_ROW.top, PERIOD_ROW.h, 6.8)
            drawRightAt(page, pageHeight, parts.month, anchors.month, PERIOD_ROW.top, PERIOD_ROW.h, 6.8)
            drawRightAt(page, pageHeight, parts.day, anchors.day, PERIOD_ROW.top, PERIOD_ROW.h, 6.8)
        }

        const drawHeader = (page: PDFPage, pageHeight: number) => {
            drawInCell(page, pageHeight, body.form_name, HEADER.valueX, HEADER.nameRow.top, HEADER.valueW, HEADER.nameRow.h, 8.6)
            drawInCell(page, pageHeight, body.fire_manager, HEADER.rightX, HEADER.nameRow.top, HEADER.rightW, HEADER.nameRow.h, 7.8)
            drawInCell(page, pageHeight, body.location, HEADER.valueX, HEADER.locationRow.top, HEADER.valueW, HEADER.locationRow.h, 8.1)
            drawInCell(page, pageHeight, body.witness, HEADER.rightX, HEADER.locationRow.top, HEADER.rightW, HEADER.locationRow.h, 7.8)
            const inspectionType = normalizeText(body.inspection_type) || "機器・総合"
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
            if (parseDateParts(body.period_start) || parseDateParts(body.period_end)) {
                drawPeriodDate(page, pageHeight, body.period_start, PERIOD_START_ANCHORS)
                drawPeriodDate(page, pageHeight, body.period_end, PERIOD_END_ANCHORS)
            } else {
                drawInCell(page, pageHeight, periodText, PERIOD_CELL.x, PERIOD_ROW.top, PERIOD_CELL.w, PERIOD_ROW.h, 6.8)
            }

            drawInCell(page, pageHeight, body.inspector_name, INSPECTOR.name.x, INSPECTOR.name.top, INSPECTOR.name.w, INSPECTOR.name.h, 7.2)
            drawInCell(page, pageHeight, body.inspector_company, INSPECTOR.company.x, INSPECTOR.company.top, INSPECTOR.company.w, INSPECTOR.company.h, 7.0)
            drawInCell(page, pageHeight, body.inspector_tel, INSPECTOR.tel.x, INSPECTOR.tel.top, INSPECTOR.tel.w, INSPECTOR.tel.h, 7.0)
            drawInCell(page, pageHeight, body.inspector_address, INSPECTOR.address.x, INSPECTOR.address.top, INSPECTOR.address.w, INSPECTOR.address.h, 6.8)
        }

        drawHeader(page1, p1Height)

        drawResultRows(page1, p1Height, body.page1_rows ?? [], P1_ROW_BOUNDS, {
            contentX: 222.72,
            contentW: 99.24,
            judgmentX: 322.56,
            judgmentW: 36.24,
            badX: 359.28,
            badW: 85.32,
            actionX: 445.08,
            actionW: 84.48,
        }, {
            // B-2: 行10 — 刷り込み「設定値 ___ mA」の空欄に値だけ描く
            //   （ラベル右端 260.64 〜 mA 左端 305.88。テンプレート実測）
            10: { x: 260.64, w: 45.24 },
        })

        // B-2: PAGE2 行0「感度範囲」— 刷り込み「－ ___ ％ ～ ＋ ___ ％」（テンプレート実測）:
        //   －  233.04–243.60 ／ ％ 254.16–264.72 ／ ～ 264.60–275.16
        //   ＋  275.16–285.72 ／ ％ 296.16–306.72
        //   ＝ 空欄は 243.60–254.16 と 285.72–296.16 の2つ。内容列の一括描画では
        //     左端(217.56)から描くので「－」と「％～＋」に重なる。個別に描く。
        //   ★空欄は 10.5pt しか無い。既定の padding 2.5×2 だと 2桁が入らないので
        //     padding を 1.0 にする（刷り込みが両端を規定していて広げようが無いため）。
        const sensRow12 = body.page2_rows?.[0]
        if (sensRow12) {
            const sTop = P2_ROW_BOUNDS[0]
            const sH = P2_ROW_BOUNDS[1] - P2_ROW_BOUNDS[0]
            drawInCell(page2, p2Height, sensRow12.content, 243.60, sTop, 10.56, sH, 5.5, { paddingX: 1.0, align: "center" })
            drawInCell(page2, p2Height, sensRow12.current_value, 285.72, sTop, 10.44, sH, 5.5, { paddingX: 1.0, align: "center" })
        }

        drawResultRows(page2, p2Height, body.page2_rows ?? [], P2_ROW_BOUNDS, {
            contentX: 217.56,
            contentW: 104.52,
            judgmentX: 322.56,
            judgmentW: 36.24,
            badX: 359.28,
            badW: 85.32,
            actionX: 445.08,
            actionW: 84.48,
        }, {}, new Set([0]))   // 0 = 感度範囲（上の専用描画で2値に分ける）

        drawWrappedInCell(page2, p2Height, body.notes, 80.52, 198.48, 449.04, 419.52, 7.0)

        const device1 = body.device1 ?? {}
        const device2 = body.device2 ?? {}
        // Pre-5: 元の 618.48 は公式PDFのヘッダー行（機器名/型式/校正年月日/製造者名）と
        // 重なっていたため +22.52pt シフト。データ行1 (top_y=641.0, h=22.56pt) に描画。
        const deviceRowTop = 641.0
        const deviceRowH = 22.56

        drawInCell(page2, p2Height, device1.name, 81.0, deviceRowTop, 72.96, deviceRowH, 6.4)
        drawInCell(page2, p2Height, device1.model, 154.56, deviceRowTop, 36.24, deviceRowH, 6.2)
        drawInCell(page2, p2Height, formatJapaneseDateText(device1.calibrated_at), 191.28, deviceRowTop, 56.52, deviceRowH, 6.0)
        drawInCell(page2, p2Height, device1.maker, 248.28, deviceRowTop, 56.28, deviceRowH, 6.0)

        drawInCell(page2, p2Height, device2.name, 305.4, deviceRowTop, 72.36, deviceRowH, 6.4)
        drawInCell(page2, p2Height, device2.model, 379.08, deviceRowTop, 36.12, deviceRowH, 6.2)
        drawInCell(page2, p2Height, formatJapaneseDateText(device2.calibrated_at), 415.68, deviceRowTop, 57.12, deviceRowH, 6.0)
        drawInCell(page2, p2Height, device2.maker, 473.28, deviceRowTop, 56.28, deviceRowH, 6.0)

        // ⑧ 枠に収まらなかった項目があればPDFを返さずに一覧を返す。
        //   黙って "..." で切り詰めると、法定書類から情報が静かに欠落するため。
        fonts.fit?.resolve(body)
        const systemOverflow = systemFitFailures(fonts.fit!)
        if (systemOverflow.length) {
            // 業者には直せない（テンプレート固定文言・整形済みの値）＝実装側の不具合として記録
            console.error("[pdf] 収容不能(システム由来)", { form: "別記様式第12", items: systemOverflow })
        }
        const fitFormLabel = "別記様式第12"
        logFitDebug(fitFormLabel, fonts.fit!)
        if (fonts.fit?.smalls.length) {
            // 判読しづらい大きさで描かれた項目。単独では止められない（上記コメント参照）ので記録のみ
            console.warn("[pdf] 極小フォントで描画", { count: fonts.fit.smalls.length })
        }
        const fitError = buildFitError("別記様式第12", fonts.fit!)
        if (fitError) return NextResponse.json(fitError, { status: 422 })

        const pdfBytes = await pdfDoc.save()
        return new NextResponse(pdfBytes as unknown as BodyInit, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                // ⑨ 設計値から大きく縮んだ項目があれば警告として運ぶ（PDFは返す）
                ...fitWarningHeader(fitFormLabel, fonts.fit!),
                "Content-Disposition": 'attachment; filename="s50_kokuji14_bekki12_filled.pdf"',
            },
        })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 })
    }
}
