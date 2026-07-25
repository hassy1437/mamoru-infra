import { NextRequest, NextResponse } from "next/server"
import { PDFDocument, rgb, PDFPage, StandardFonts } from "pdf-lib"
import {
    buildFitError,
    createFitCollector,
    fitWarningHeader,
    logFitDebug,
    systemFitFailures,
} from "@/lib/pdf-fit-report"
import {
    pickFont,
    type ReportFonts,
    measureRuns,
    drawTextRuns,
    drawWrappedTextInCell,
    FIT_EPSILON,
    reportIfBelowMinSize,
} from "@/lib/pdf-form-helpers"
import fontkit from "@pdf-lib/fontkit"
import fs from "fs"
import path from "path"
import type { InspectorData, ShoubouLicense, KensaLicense } from "@/types/database"

// ============================================================
// 座標定義 (fromTop = ページ上端からの距離, pdf-lib y = 下端から)
// PDF解析（垂直線・水平線レンジ分析）に基づくキャリブレーション済み座標
// ============================================================
const PAGE_HEIGHT = 841.92

// Inspector 1 基本情報行
// 垂直線分析: x=109 が fromTop 96-110, 110-124 に出現 → 行範囲確定
// 垂直線分析: x=291 が fromTop 96-124 に出現 → 住所value右端=291
// 垂直線分析: x=339 が fromTop 96-124 に出現 → 氏名label右端=339
const INSP1 = {
    address_row_top:  95.5,    // 住所/氏名行 (fromTop 95.5-110, 水平線分析で確認)
    company_row_top:  110,     // 社名/電話行 (fromTop 110-124.5)
    row_h:            14.5,
    address_x:        110.8, address_w: 180.4,  // 住所 value (x=109-291)
    name_x:           340.1, name_w:    95.2,   // 氏名 value (x=339-435)
    company_x:        110.8, company_w: 180.4,  // 社名 value
    phone_x:          340.1, phone_w:   95.2,   // 電話番号 value
    // ★資格保有設備欄はテンプレート実測で x 436.7-532.2 / y 95.6-363.0（95.5 × 267.4）。
    //   旧値 (top:80, h:135) は上端がセルの外から始まり高さも半分で、1行に収める前提だった。
    //   設備名の列挙は1行に入らないため 3.5pt まで縮んだ上に切り詰められ、
    //   現実データでも「連結送水管,スプリンクラー設備」が消えていた（点検可能な設備の記載欠落）。
    //   縦に余白があるので、規定の優先順位どおり折り返しを第一手として使う。
    equipment_x:      436.9, equipment_w: 95.3, equipment_top: 95.8, equipment_h: 267.0,
}

// Inspector 2 は Inspector 1 の fromTop + OFFSET2
// 確認: x=291 が fromTop 394-408 に出現 → Inspector2 row1 top ≈ 394 = 96+297.8 ✓
const OFFSET2 = 297.8

// 消防設備士 データ行の上端 fromTop (8行, Inspector 1)
// 水平線分析: 141, 156, 170.5, 185, 200, 214.5, 229, 243.5, 258.5 に水平線
// → データ行はfromTop 156から開始（141-156がヘッダ行）
// 垂直線分析: x=109 が fromTop 156-170, 171-185, 186-200 に出現 → 行範囲確認
const SHB_ROW_H = 14.5
const SHB_ROWS_1 = [156, 170.5, 185, 200, 214.5, 229, 243.5, 258.5]
// key順: toku, class1, class2, class3, class4, class5, class6, class7

// 消防設備士 列 (右揃えアンカー x = 年月日ラベルの直左)
// 交付年月日: PyMuPDF文字位置分析による実測値
//   年ラベル: x=181.6-189.6 → 値は181.6左端の右揃え → アンカー 181
//   月ラベル: x=205.6-213.6 → 値は205.6左端の右揃え → アンカー 205
//   日ラベル: x=229.6-237.6 → 値は229.6左端の右揃え → アンカー 229
// 交付番号: x=244-308 (w=64) (垂直線分析: x=308 が shoubou行に出現)
// 交付知事: x=308-357 (w=49) (垂直線分析: x=357 が shoubou行に出現)
// 講習受講年月: 年ラベル x=394.4, 月ラベル x=418.4 → アンカー 394, 418
const SHB = {
    issue_year:   181,   // 年右揃えアンカー (年ラベル左端 181.6)
    issue_month:  205,   // 月右揃えアンカー (月ラベル左端 205.6)
    issue_day:    229,   // 日右揃えアンカー (日ラベル左端 229.6)
    license:      { x: 244,  w: 64 },   // 交付番号 (x=244-308)
    governor:     { x: 308,  w: 49 },   // 交付知事 (x=308-357)
    tr_year:      394,   // 講習年アンカー (年ラベル左端 394.4)
    tr_month:     418,   // 講習月アンカー (月ラベル左端 418.4)
}

// 備考行。★実測（2026-07-24）: 行 273.5-287.6、セル境界 65.6 | 144.4 | 435.2。
//   左のセルにはテンプレートの印字「備　考」(91.4-118.4) があるので、値は右のセルに置く。
//   旧値 x=65.6 は印字ラベルの上から描き始めており、罫線 144.4 を越えていた。
const BIKO1 = { top: 273.5, h: 14.1, x: 144.9, w: 290.3 }

// 消防設備点検資格者 データ行の上端 (3行, Inspector 1)
// 水平線分析: 287.5-288.5(区切り), 303-304(ヘッダ行下端), 304-319(列ヘッダ行), 319(row0), 333.5(row1), 348(row2)
// ※304.5は「種類等/交付年月日」の列ヘッダー行 → データは319から開始
// 垂直線分析: x=241 が fromTop 305-319, 319-334, 334-348 に出現 → 行範囲確認
const KSA_ROW_H = 14.5
const KSA_ROWS_1 = [319, 333.5, 348]
// key順: toku, class1, class2

// 消防設備点検資格者 列
// 種類等:    x=65-144 (w=79) → drawInCell (垂直線: x=144 が kensa行に出現)
// 交付年月日: PyMuPDF文字位置分析(第1種・第2種行)
//   年ラベル: x=182.2 → アンカー 182
//   月ラベル: x=206.2 → アンカー 206
//   日ラベル: x=230.2 → アンカー 230
// 交付番号:  x=241-339 (w=98) → drawInCell (垂直線: x=241,339 が kensa行に出現)
// 有効期限:  年ラベル x=376.4, 月ラベル x=400.4, 日ラベル x=424.4
const KSA = {
    issue_year:   182,
    issue_month:  206,
    issue_day:    230,
    license:      { x: 241, w: 98 },   // 交付番号 (x=241-339)
    exp_year:     376,
    exp_month:    400,
    exp_day:      424,
}

// ============================================================
// メイン処理
// ============================================================
export async function POST(req: NextRequest) {
    try {
        const body = await req.json()

        const pdfPath = path.join(process.cwd(), "public", "PDF", "bekki_itiran.pdf")
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf")

        const existingPdfBytes = fs.readFileSync(pdfPath)
        const fontBytes = fs.readFileSync(fontPath)

        const pdfDoc = await PDFDocument.load(existingPdfBytes)
        pdfDoc.registerFontkit(fontkit)
        const customFont = await pdfDoc.embedFont(fontBytes)
        // ASCII(型式・番号・日付等)は Helvetica で描く。NotoSansJP は「英字+ハイフン+数字」で
        // 数字がCJK拡張Aのグリフに化け、計測幅と実描画幅が最大+41.6%ズレて枠をはみ出すため。
        const latinFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
        const fonts: ReportFonts = { jp: customFont, latin: latinFont, fit: createFitCollector() }

        const pages = pdfDoc.getPages()
        const page = pages[0]

        const truncateToFitWidth = (value: string, size: number, maxWidth: number) => {
            if (measureRuns(fonts, String(value ?? ""), size) <= maxWidth + FIT_EPSILON) return value

            const suffix = "..."
            const suffixWidth = measureRuns(fonts, String(suffix ?? ""), size)
            if (suffixWidth > maxWidth) return ""

            let cut = value.length
            while (cut > 0) {
                const candidate = `${value.slice(0, cut).trimEnd()}${suffix}`
                if (measureRuns(fonts, String(candidate ?? ""), size) <= maxWidth + FIT_EPSILON) {
                    return candidate
                }
                cut -= 1
            }
            return suffix
        }

        // ------- helper: セル内にテキストを描画（縮小あり・省略なし）-------
        const drawInCell = (
            pg: PDFPage,
            text: unknown,
            cellX: number,
            cellTopFromTop: number,
            cellW: number,
            cellH: number,
            fontSize = 7,
            align: "left" | "center" = "left",
        ) => {
            const normalized = String(text ?? "").replace(/\s+/g, " ").trim()
            if (!normalized) return

            const paddingX = 2
            const paddingY = 2
            // 安全係数は撤廃済み（①bで計測が実描画と一致し、②③④でセル座標を実測値に直したため）
            const maxWidth = Math.max(1, cellW - paddingX * 2)
            const maxHeight = Math.max(1, cellH - paddingY * 2)

            let currentSize = fontSize

            const designSize = currentSize
            const w = measureRuns(fonts, String(normalized ?? ""), currentSize)
            if (w > maxWidth) {
                currentSize = currentSize * (maxWidth / w)
            }
            const h = fonts.jp.heightAtSize(currentSize, { descender: true })
            if (h > maxHeight) {
                currentSize = currentSize * (maxHeight / h)
            }
            currentSize = Math.max(currentSize, 3.5)
            fonts.fit?.reportShrink(normalized, designSize, currentSize)
            reportIfBelowMinSize(fonts, normalized, currentSize, maxWidth)

            const textToDraw = truncateToFitWidth(normalized, currentSize, maxWidth)
            if (!textToDraw) return

            const textWidth = measureRuns(fonts, String(textToDraw ?? ""), currentSize)
            const textHeight = fonts.jp.heightAtSize(currentSize, { descender: true })
            const textTopFromTop = cellTopFromTop + (cellH - textHeight) / 2
            const baselineOffset = textHeight * 0.78
            const y = PAGE_HEIGHT - (textTopFromTop + baselineOffset)
            const x = align === "center"
                ? cellX + (cellW - textWidth) / 2
                : cellX + paddingX

            drawTextRuns(pg, fonts, String(textToDraw ?? ""), x, y, currentSize)
        }

        // ------- helper: 数値を右揃えでアンカーの左に描画 -------
        const drawRightAt = (
            pg: PDFPage,
            text: string,
            anchorX: number,
            rowTop: number,
            rowH: number,
            size = 6,
        ) => {
            if (!text) return
            const textHeight = fonts.jp.heightAtSize(size, { descender: true })
            const textTop = rowTop + (rowH - textHeight) / 2
            const y = PAGE_HEIGHT - (textTop + textHeight * 0.78)
            const w = measureRuns(fonts, String(text ?? ""), size)
            drawTextRuns(pg, fonts, String(text ?? ""), anchorX - w, y, size)
        }

        // ------- 1人分の inspector データを描画 -------
        const drawInspector = (inspector: InspectorData | null, topOffset: number) => {
            if (!inspector) return

            // 基本情報
            drawInCell(page, inspector.address,
                INSP1.address_x, INSP1.address_row_top + topOffset,
                INSP1.address_w, INSP1.row_h, 7)
            drawInCell(page, inspector.name,
                INSP1.name_x, INSP1.address_row_top + topOffset,
                INSP1.name_w, INSP1.row_h, 7)
            drawInCell(page, inspector.company,
                INSP1.company_x, INSP1.company_row_top + topOffset,
                INSP1.company_w, INSP1.row_h, 7)
            drawInCell(page, inspector.phone,
                INSP1.phone_x, INSP1.company_row_top + topOffset,
                INSP1.phone_w, INSP1.row_h, 7)

            // 設備名 (右カラム)
            drawWrappedTextInCell({
                page,
                pageHeight: PAGE_HEIGHT,
                fonts,
                text: inspector.equipment_names,
                cellX: INSP1.equipment_x,
                cellTopFromTop: INSP1.equipment_top + topOffset,
                cellW: INSP1.equipment_w,
                cellH: INSP1.equipment_h,
                fontSize: 6,
                options: { verticalAlign: "top" },
            })

            // 消防設備士 ライセンス行
            const shoubouKeys = ["toku", "class1", "class2", "class3", "class4", "class5", "class6", "class7"] as const
            shoubouKeys.forEach((key, i) => {
                const lic: ShoubouLicense | undefined = inspector.shoubou_licenses?.[key]
                if (!lic) return
                const rowTop = SHB_ROWS_1[i] + topOffset

                drawRightAt(page, lic.issue_year,  SHB.issue_year,  rowTop, SHB_ROW_H)
                drawRightAt(page, lic.issue_month, SHB.issue_month, rowTop, SHB_ROW_H)
                drawRightAt(page, lic.issue_day,   SHB.issue_day,   rowTop, SHB_ROW_H)

                drawInCell(page, lic.license_number,
                    SHB.license.x, rowTop, SHB.license.w, SHB_ROW_H, 6, "center")
                drawInCell(page, lic.issuing_governor,
                    SHB.governor.x, rowTop, SHB.governor.w, SHB_ROW_H, 6, "center")

                drawRightAt(page, lic.training_year,  SHB.tr_year,  rowTop, SHB_ROW_H)
                drawRightAt(page, lic.training_month, SHB.tr_month, rowTop, SHB_ROW_H)
            })

            // 備考
            drawInCell(page, inspector.shoubou_notes,
                BIKO1.x, BIKO1.top + topOffset, BIKO1.w, BIKO1.h, 6)

            // 消防設備点検資格者 ライセンス行
            const kensaKeys = ["toku", "class1", "class2"] as const
            kensaKeys.forEach((key, i) => {
                const lic: KensaLicense | undefined = inspector.kensa_licenses?.[key]
                if (!lic) return
                const rowTop = KSA_ROWS_1[i] + topOffset

                drawRightAt(page, lic.issue_year,  KSA.issue_year,  rowTop, KSA_ROW_H)
                drawRightAt(page, lic.issue_month, KSA.issue_month, rowTop, KSA_ROW_H)
                drawRightAt(page, lic.issue_day,   KSA.issue_day,   rowTop, KSA_ROW_H)

                drawInCell(page, lic.license_number,
                    KSA.license.x, rowTop, KSA.license.w, KSA_ROW_H, 6, "center")

                drawRightAt(page, lic.expiry_year,  KSA.exp_year,  rowTop, KSA_ROW_H)
                drawRightAt(page, lic.expiry_month, KSA.exp_month, rowTop, KSA_ROW_H)
                drawRightAt(page, lic.expiry_day,   KSA.exp_day,   rowTop, KSA_ROW_H)
            })
        }

        // Inspector 1 & 2 を描画
        drawInspector(body.inspector1 as InspectorData | null, 0)
        drawInspector(body.inspector2 as InspectorData | null, OFFSET2)

        // ⑧ 枠に収まらなかった項目があればPDFを返さずに一覧を返す。
        //   黙って "..." で切り詰めると、法定書類から情報が静かに欠落するため。
        fonts.fit?.resolve(body)
        const systemOverflow = systemFitFailures(fonts.fit!)
        if (systemOverflow.length) {
            // 業者には直せない（テンプレート固定文言・整形済みの値）＝実装側の不具合として記録
            console.error("[pdf] 収容不能(システム由来)", { form: "点検者一覧", items: systemOverflow })
        }
        const fitFormLabel = "点検者一覧"
        logFitDebug(fitFormLabel, fonts.fit!)
        if (fonts.fit?.smalls.length) {
            // 判読しづらい大きさで描かれた項目。単独では止められない（上記コメント参照）ので記録のみ
            console.warn("[pdf] 極小フォントで描画", { count: fonts.fit.smalls.length })
        }
        const fitError = buildFitError("点検者一覧", fonts.fit!)
        if (fitError) return NextResponse.json(fitError, { status: 422 })

        const pdfBytes = await pdfDoc.save()

        return new NextResponse(pdfBytes as unknown as BodyInit, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                // ⑨ 設計値から大きく縮んだ項目があれば警告として運ぶ（PDFは返す）
                ...fitWarningHeader(fitFormLabel, fonts.fit!),
                "Content-Disposition": 'attachment; filename="itiran_report.pdf"',
            },
        })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 })
    }
}
