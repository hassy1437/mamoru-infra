import { NextRequest, NextResponse } from "next/server"
import { PDFDocument, rgb, StandardFonts } from "pdf-lib"
import {
    drawTextRuns,
    drawWrappedTextInCell,
    measureRuns,
    pickFont,
    type ReportFonts,
} from "@/lib/pdf-form-helpers"
import fontkit from "@pdf-lib/fontkit"
import fs from "fs"
import path from "path"
import { formatUsageShort } from "@/lib/usage-categories"

type GeneratePdfBody = {
    report_date?: string
    fire_department_name?: string
    notifier_address?: string
    notifier_name?: string
    notifier_phone?: string
    building_address?: string
    building_name?: string
    building_usage?: string
    floor_above?: number | string | null
    floor_below?: number | string | null
    total_floor_area?: number | string | null
    equipment_types?: string[] | null
}

const toText = (value: unknown) => {
    if (value === null || value === undefined) return undefined
    const text = String(value).trim()
    return text.length > 0 ? text : undefined
}

export async function POST(req: NextRequest) {
    try {
        const body = (await req.json()) as GeneratePdfBody

        const pdfPath = path.join(process.cwd(), "public", "PDF", "bekki_houkoku.pdf")
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf")

        const existingPdfBytes = fs.readFileSync(pdfPath)
        const fontBytes = fs.readFileSync(fontPath)

        const pdfDoc = await PDFDocument.load(existingPdfBytes)
        pdfDoc.registerFontkit(fontkit)
        const customFont = await pdfDoc.embedFont(fontBytes)
        // ASCII(型式・番号・日付等)は Helvetica で描く。NotoSansJP は「英字+ハイフン+数字」で
        // 数字がCJK拡張Aのグリフに化け、計測幅と実描画幅が最大+41.6%ズレて枠をはみ出すため。
        const latinFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
        const fonts: ReportFonts = { jp: customFont, latin: latinFont }

        const firstPage = pdfDoc.getPages()[0]
        const { height } = firstPage.getSize()

        const draw = (text: string | undefined, x: number, y: number, size = 10.5, maxWidth?: number) => {
            if (!text) return
            let currentSize = size

            if (maxWidth) {
                const textWidth = measureRuns(fonts, String(text ?? ""), currentSize)
                if (textWidth > maxWidth) {
                    currentSize = currentSize * (maxWidth / textWidth)
                }
            }

            drawTextRuns(firstPage, fonts, String(text ?? ""), x, height - y, currentSize)
        }

        /**
         * 折り返せる欄。セル矩形はテンプレートの罫線から実測した値。
         *
         * ★ローカルの draw は**1行しか描けず**、入らないと比率で縮めるだけだった
         *   （規定は「折返し→縮小→字間→略称」で、第一手の折り返しが存在しなかった）。
         *   設備欄は 198.5pt ＝ 9pt で22行分あるのに1行しか使っておらず、
         *   10設備で 4.69pt、23設備で 2.01pt まで縮んで判読できなかった。
         *
         * ★届出者の住所・氏名・電話は入れていない。あのブロックには内部の罫線が無く、
         *   刷り込みラベル（住所 y=151.7 / 氏名 y=168.7 / 電話 y=185.7）が 17pt 間隔で
         *   行を定義しているので、折り返す余地が無い。
         *   ＝ 罫線が無い箇所では、刷り込みラベルが行を定義する。
         */
        const drawWrapped = (
            text: string | undefined, cellX: number, cellTop: number,
            cellW: number, cellH: number, size: number,
        ) => {
            if (!text) return
            drawWrappedTextInCell({
                page: firstPage, pageHeight: height, fonts, text,
                cellX, cellTopFromTop: cellTop, cellW, cellH,
                fontSize: size, options: { verticalAlign: "top" },
            })
        }

        const d = new Date(body.report_date ?? "")
        if (!Number.isNaN(d.getTime())) {
            draw(String(d.getFullYear()), 380, 100)
            draw(String(d.getMonth() + 1), 430, 100)
            draw(String(d.getDate()), 480, 100)
        }

        // ★x=60 は左の縦罫線 64.9 の**外側**で、12ptの文字が罫線をまたいでいた。
        //   刷り込み「消防長（消防署長）（市町村長） 殿」の左端 70.4 に揃えて枠内に入れる。
        //
        // ★y（どこに書くか）は触っていない。様式から決まらないため:
        //     ・公式の記載例は宛名を刷り込みのままにして本部名を書いていない
        //     ・実務では「東京消防庁 ○○消防署長 殿」と書く例がある
        //     ・宛名の行に足そうにも、罫線 64.9 と刷り込み 70.4 の間は 5.5pt しかなく入らない
        //   ＝「どこに書くか」は実務の記入方法の話で、推測で動かすと
        //     「間違った場所に正しく描く」ことになる。共同創立者に確認する。
        draw(toText(body.fire_department_name), 70.4, 95, 12)

        // ★幅はテンプレート実測。旧値 200 は出所不明で、実物より 19pt(9.5%) 狭かった。
        //   刷り込み「住 所」の右端 309.48 / 右の縦罫線 531.0 → 312 から 219.0pt 使える。
        //   狭いままだと同じ住所が 27字で 7.61pt、実測幅なら 8.33pt（規定の下限 7pt を超える）。
        // ★この3欄は折り返せない。ブロック内に罫線が無く、刷り込みラベルが
        //   17pt 間隔（住所 151.7 / 氏名 168.7 / 電話 185.7）で行を定義しているため。
        const notifierX = 312
        // ★罫線ぴったり(219.0)にすると、35字の住所でインクが縦罫線に5画素触れた。
        //   他の欄は「セル右端＝刷り込みの左端」で余白を padding が担うが、
        //   この draw は padding を持たないので幅から引く（他の欄の実践は 2.2〜2.9pt）。
        const notifierW = 216.5
        draw(toText(body.notifier_address), notifierX, 151, 10.5, notifierW)
        draw(toText(body.notifier_name), notifierX, 168, 10.5, notifierW)
        draw(toText(body.notifier_phone), notifierX, 185, 10.5, notifierW)

        const tableX = 150
        // 罫線 257.6/292.1/326.6/361.1 の実測。各 34.5pt ＝ 10.5pt で約2行
        drawWrapped(toText(body.building_address), tableX, 257.6, 350, 34.5, 10.5)
        drawWrapped(toText(body.building_name), tableX, 292.1, 350, 34.5, 10.5)
        drawWrapped(formatUsageShort(body.building_usage), tableX, 326.6, 180, 34.5, 10.5)

        draw(toText(body.floor_above), 190, 381)
        draw(toText(body.floor_below) ?? "0", 300, 381)
        draw(toText(body.total_floor_area), 430, 381)

        const equipments = Array.isArray(body.equipment_types) ? body.equipment_types.join("、") : ""
        // 罫線 395.6–594.1 の実測。198.5pt ＝ 9pt で22行分。左のラベル列は縦中央寄せで、
        // 値の列はブロック全体を使う（他の欄と違い内部のラベル行分割が無い）
        drawWrapped(equipments || undefined, tableX, 395.6, 380, 198.5, 9)

        const pdfBytes = await pdfDoc.save()

        return new NextResponse(pdfBytes as unknown as BodyInit, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": 'attachment; filename="official_report.pdf"',
            },
        })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 })
    }
}
