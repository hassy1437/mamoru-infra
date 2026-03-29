import { NextRequest, NextResponse } from "next/server"
import { PDFDocument, rgb, PDFPage } from "pdf-lib"
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
    equipment_x:      437.0, equipment_w: 95.0, equipment_top: 80.0, equipment_h: 135.0,
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

// 備考行 (SHB row8終端 258.5+14.5=273 の直後)
const BIKO1 = { top: 273, h: 14.5, x: 65.6, w: 370.0 }

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

        const pages = pdfDoc.getPages()
        const page = pages[0]

        const truncateToFitWidth = (value: string, size: number, maxWidth: number) => {
            if (customFont.widthOfTextAtSize(value, size) <= maxWidth) return value

            const suffix = "..."
            const suffixWidth = customFont.widthOfTextAtSize(suffix, size)
            if (suffixWidth > maxWidth) return ""

            let cut = value.length
            while (cut > 0) {
                const candidate = `${value.slice(0, cut).trimEnd()}${suffix}`
                if (customFont.widthOfTextAtSize(candidate, size) <= maxWidth) {
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
            const maxWidth = Math.max(1, (cellW - paddingX * 2) * 0.85)
            const maxHeight = Math.max(1, cellH - paddingY * 2)

            let currentSize = fontSize
            const w = customFont.widthOfTextAtSize(normalized, currentSize)
            if (w > maxWidth) {
                currentSize = currentSize * (maxWidth / w)
            }
            const h = customFont.heightAtSize(currentSize, { descender: true })
            if (h > maxHeight) {
                currentSize = currentSize * (maxHeight / h)
            }
            currentSize = Math.max(currentSize, 3.5)

            const textToDraw = truncateToFitWidth(normalized, currentSize, maxWidth)
            if (!textToDraw) return

            const textWidth = customFont.widthOfTextAtSize(textToDraw, currentSize)
            const textHeight = customFont.heightAtSize(currentSize, { descender: true })
            const textTopFromTop = cellTopFromTop + (cellH - textHeight) / 2
            const baselineOffset = textHeight * 0.78
            const y = PAGE_HEIGHT - (textTopFromTop + baselineOffset)
            const x = align === "center"
                ? cellX + (cellW - textWidth) / 2
                : cellX + paddingX

            pg.drawText(textToDraw, { x, y, size: currentSize, font: customFont, color: rgb(0, 0, 0) })
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
            const textHeight = customFont.heightAtSize(size, { descender: true })
            const textTop = rowTop + (rowH - textHeight) / 2
            const y = PAGE_HEIGHT - (textTop + textHeight * 0.78)
            const w = customFont.widthOfTextAtSize(text, size)
            pg.drawText(text, { x: anchorX - w, y, size, font: customFont, color: rgb(0, 0, 0) })
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
            drawInCell(page, inspector.equipment_names,
                INSP1.equipment_x, INSP1.equipment_top + topOffset,
                INSP1.equipment_w, INSP1.equipment_h, 6)

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

        const pdfBytes = await pdfDoc.save()

        return new NextResponse(pdfBytes as unknown as BodyInit, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": 'attachment; filename="itiran_report.pdf"',
            },
        })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 })
    }
}
