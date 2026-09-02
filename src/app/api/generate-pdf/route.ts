import { NextRequest, NextResponse } from "next/server"
import { PDFDocument, rgb, StandardFonts } from "pdf-lib"
import {
    drawRightAt,
    drawTextInCell,
    drawTextRuns,
    drawWrappedTextInCell,
    measureRuns,
    pickFont,
    type ReportFonts,
} from "@/lib/pdf-form-helpers"
import { buildFitError, createFitCollector, fitWarningHeader, logFitDebug, systemFitFailures } from "@/lib/pdf-fit-report"
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
        // ★この様式だけ fit コレクタが無く、縮小も絶対下限割れも**どこにも出なかった**。
        //   実測: 延べ面積に40桁を入れると 4.19pt まで縮むのに X-Fit-Warnings が空。
        //   右寄せ＋縮小を入れた経路が網の外に出るので、先に塞ぐ。
        //   ★422（切り詰めエラー）は入れない。いま通っている報告書が落ちるようになるのは
        //     別の判断が要るので、この変更では警告だけを載せる。
        const fonts: ReportFonts = { jp: customFont, latin: latinFont, fit: createFitCollector() }

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

        /**
         * 単位が刷り込まれている欄は右寄せにする。
         *
         * ★消防庁の公式記入例（prevention001_18_tenken_pamphlet.pdf p11 の報告書記入例）を
         *   実測すると、値は単位の直前 3.03 / 3.10 / 3.90pt に置かれている。
         *   左詰めの固定 x だと桁数で間隔が変わり、実測で 2.13〜51.04pt とばらついていた
         *   （延べ面積は5桁でも 51pt 空く）。
         * ★間隔は 3.10pt（3件の中央値）。中点 3.5 ではなく中央値を採る理由:
         *   3.03 と 3.10 は別の単位で独立に測って 0.07pt 一致しており、3.90 は同じ「階」で
         *   数字が違うだけの外れ値（墨の右サイドベアリングが乗る）。
         * ★対象は報告書だけ。別記様式の単位欄は公式記入例が空欄で基準が読めないため広げない。
         */
        const UNIT_GAP = 3.10
        const drawBeforeUnit = (
            text: string | undefined,
            unitLeftX: number,
            leftLimitX: number,
            baselineY: number,
            size = 10.5,
        ) => {
            if (!text) return
            const rightX = unitLeftX - UNIT_GAP
            drawRightAt({
                page: firstPage, pageHeight: height, fonts, text,
                rightX, baselineY, fontSize: size,
                // 左の刷り込み／罫線まで。超えたら縮める（右寄せは左へ伸びるため）
                maxWidth: rightX - leftLimitX,
            })
        }

        const d = new Date(body.report_date ?? "")
        if (!Number.isNaN(d.getTime())) {
            // 刷り込み実測: 年 x0=405.48 / 月 453.48 / 日 501.48、ベースライン 100.68
            drawBeforeUnit(String(d.getFullYear()), 405.48, 64.92, 100.68)
            drawBeforeUnit(String(d.getMonth() + 1), 453.48, 417.48, 100.68)
            drawBeforeUnit(String(d.getDate()), 501.48, 465.48, 100.68)
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
        /**
         * ★共有ヘルパーに通す（折り返しはしない・できない）。
         *
         * ローカルの draw は下限も報告も持たず、入らないと**無制限に縮む**。
         * 実測では 35字の住所で 5.99pt（幅を実測値に直した後でも 6.56pt）まで縮み、
         * 規定の下限 7pt を割ったまま黙って出ていた。共有ヘルパーなら
         * ⑧の切り詰め報告と⑨の縮小警告が効き、業者に「小さく印字される」と伝わる。
         *
         * ★これは根本解決ではない。この3欄は折り返せない（ブロック内に罫線が無く、
         *   刷り込みラベルが 17pt 間隔で行を定義している）ので、縮小以外に手が無い。
         *   下限を割るのは34字以上——都道府県から建物名・階数まで書いた住所が該当する。
         *   欄そのものが足りないという話は略称・別紙といった実務の慣行に関わり、
         *   我々には決められない。共同創立者に確認する材料として残す。
         *
         * cellH は刷り込みラベルの間隔（17pt）、cellTopFromTop はベースラインから1行分。
         */
        const drawNotifier = (text: string | undefined, printedBaseline: number) => {
            if (!text) return
            drawTextInCell({
                page: firstPage, pageHeight: height, fonts, text,
                cellX: notifierX, cellTopFromTop: printedBaseline - 13.0,
                cellW: notifierW, cellH: 17.0, fontSize: 10.5,
                // ★刷り込みラベルのベースラインに合わせる。共有ヘルパーはセル中央に置くので、
                //   指定しないと縮小の度合いで上下がばらつく（実測 149.32 対 刷り込み 151.7）。
                baselineY: printedBaseline,
            })
        }
        // 刷り込み「住 所」「氏 名」「電話番号」のベースライン実測値
        drawNotifier(toText(body.notifier_address), 151.7)
        drawNotifier(toText(body.notifier_name), 168.7)
        drawNotifier(toText(body.notifier_phone), 185.7)

        const tableX = 150
        // 罫線 257.6/292.1/326.6/361.1 の実測。各 34.5pt ＝ 10.5pt で約2行
        drawWrapped(toText(body.building_address), tableX, 257.6, 350, 34.5, 10.5)
        drawWrapped(toText(body.building_name), tableX, 292.1, 350, 34.5, 10.5)
        drawWrapped(formatUsageShort(body.building_usage), tableX, 326.6, 180, 34.5, 10.5)

        // 刷り込み実測: 階 x0=225.36 / 階 332.16 / ｍ² 510.23、ベースライン 381.54
        // 左の限界は刷り込み「上」x1=176.52 /「下」283.32 /「積」413.87
        drawBeforeUnit(toText(body.floor_above), 225.36, 176.52, 381.54)
        // ★地下階数に既定値を当てない（2026-09-03）。
        //   ★以前は ?? "0" で、未入力のとき紙に「地下 0 階」と出ていた。
        //   ★これは「地下は無い」という★業者が書いていない主張になる（法定書類）。
        //   ★地上階数・延べ面積には既定が無く空欄なので、地下だけ既定があるのも不整合だった。
        //   ★本番の総括表 80 件中 6 件が floor_below 未入力（2026-09-03 実測）。
        //   ★成約から自動生成した点検物件には地下階の値が入らない（マッチング側に地下階の欄が無い）
        //     ＝ 自動生成の物件は★必ずここに来る。
        drawBeforeUnit(toText(body.floor_below), 332.16, 283.32, 381.54)
        drawBeforeUnit(toText(body.total_floor_area), 510.23, 413.87, 381.54)

        const equipments = Array.isArray(body.equipment_types) ? body.equipment_types.join("、") : ""
        // 罫線 395.6–594.1 の実測。198.5pt ＝ 9pt で22行分。左のラベル列は縦中央寄せで、
        // 値の列はブロック全体を使う（他の欄と違い内部のラベル行分割が無い）
        drawWrapped(equipments || undefined, tableX, 395.6, 380, 198.5, 9)

        // ⑧ 枠に収まらなかった項目があればPDFを返さずに一覧を返す（他25本と同じ扱いにする）。
        // ★入れる前に測った: 現実値セット 0件 / 長文セット 0件。既存の出力は落ちない。
        //   一方で届出者住所に80字を入れると **21文字が黙って消えて 200 が返って**いた
        //   （実測。3.5pt まで縮んだ上で切り詰め）。落ちるのは実際に情報が欠落したときだけ。
        fonts.fit?.resolve(body)
        const systemOverflow = systemFitFailures(fonts.fit!)
        if (systemOverflow.length) {
            console.error("[pdf] 収容不能(システム由来)", { form: "報告書", items: systemOverflow })
        }
        logFitDebug("報告書", fonts.fit!)
        if (fonts.fit?.smalls.length) {
            console.warn("[pdf] 極小フォントで描画", { count: fonts.fit.smalls.length })
        }
        const fitError = buildFitError("報告書", fonts.fit!)
        if (fitError) return NextResponse.json(fitError, { status: 422 })

        const pdfBytes = await pdfDoc.save()

        return new NextResponse(pdfBytes as unknown as BodyInit, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": 'attachment; filename="official_report.pdf"',
                ...fitWarningHeader("報告書", fonts.fit!),
            },
        })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 })
    }
}
