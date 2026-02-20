import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        // 1. ファイルの読み込み
        const pdfPath = path.join(process.cwd(), "public", "PDF", "bekki_houkoku.pdf");
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf");

        const existingPdfBytes = fs.readFileSync(pdfPath);
        const fontBytes = fs.readFileSync(fontPath);

        // 2. PDFロード & フォント埋め込み
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        pdfDoc.registerFontkit(fontkit);
        const customFont = await pdfDoc.embedFont(fontBytes);

        const pages = pdfDoc.getPages();
        const firstPage = pages[0];
        const { height } = firstPage.getSize();

        // ----------------------------------------------------
        // ★デバッグ用グリッド線（10pt刻み）
        // ----------------------------------------------------
        /*for (let i = 0; i < 850; i += 10) {
            // 50の倍数のときだけ、線を濃くして数字を表示する
            const isMajor = i % 50 === 0;
            const opacity = isMajor ? 0.5 : 0.15; // 10刻みは薄く(0.15)、50刻みは濃く(0.5)
            const thickness = isMajor ? 1 : 0.5;

            // 縦線 (x座標)
            firstPage.drawLine({
                start: { x: i, y: 0 },
                end: { x: i, y: height },
                thickness: thickness,
                color: rgb(1, 0, 0),
                opacity: opacity
            });

            if (isMajor) {
                firstPage.drawText(String(i), { x: i + 2, y: height - 10, size: 8, color: rgb(1, 0, 0), font: customFont });
            }

            // 横線 (y座標)
            const yPos = height - i;
            if (yPos > 0) {
                firstPage.drawLine({
                    start: { x: 0, y: yPos },
                    end: { x: 600, y: yPos },
                    thickness: thickness,
                    color: rgb(1, 0, 0),
                    opacity: opacity
                });

                if (isMajor) {
                    firstPage.drawText(String(i), { x: 5, y: yPos + 2, size: 8, color: rgb(1, 0, 0), font: customFont });
                }
            }
        }*/
        // ----------------------------------------------------

        // ★文字描画関数 (自動縮小機能付き)
        // maxWidthを指定すると、はみ出す場合に文字を小さくします
        const draw = (text: string | null | undefined, x: number, y: number, size = 10.5, maxWidth?: number) => {
            if (!text) return;
            const textStr = String(text);
            let currentSize = size;

            if (maxWidth) {
                const textWidth = customFont.widthOfTextAtSize(textStr, currentSize);
                if (textWidth > maxWidth) {
                    currentSize = currentSize * (maxWidth / textWidth);
                }
            }

            firstPage.drawText(textStr, {
                x,
                y: height - y,
                size: currentSize,
                font: customFont,
                color: rgb(0, 0, 0),
            });
        };

        // --- 日付 (右上の枠) ---
        // いただいた数値を適用しました
        const d = new Date(body.report_date);
        draw(d.getFullYear().toString(), 380, 100);
        draw((d.getMonth() + 1).toString(), 430, 100);
        draw(d.getDate().toString(), 480, 100);

        // --- 宛名 (左上) ---
        // ※ここも位置調整が必要かもしれません（とりあえず初期値）
        draw(body.fire_department_name, 60, 95, 12);

        // --- 届出者欄 ---
        // いただいた数値を適用しました
        const notifierX = 312;
        // 住所や名前は長くなりやすいので maxWidth(220) を設定しておくと安心です
        draw(body.notifier_address, notifierX, 151, 10.5, 200);
        draw(body.notifier_name, notifierX, 168, 10.5, 200);
        draw(body.notifier_phone, notifierX, 185, 10.5, 200);

        // --- 防火対象物 (表組み) ---
        // いただいた数値を適用しました
        const tableX = 150;
        // 建物名なども長くなりやすいので maxWidth(350) を設定
        draw(body.building_address, tableX, 269, 10.5, 350);
        draw(body.building_name, tableX, 305, 10.5, 350);
        draw(body.building_usage, tableX, 340, 10.5, 180);

        // --- 規模 (地上・地下・面積) ---
        // ※ここから下はまだ未調整のようなので、グリッドを見ながら合わせてみてください
        draw(body.floor_above?.toString(), 190, 381); // 地上
        draw(body.floor_below?.toString() || "0", 300, 381); // 地下
        draw(body.total_floor_area?.toString(), 430, 381); // 面積

        // --- 設備リスト ---
        const equipments = body.equipment_types ? body.equipment_types.join("、") : "";
        draw(equipments, tableX, 410, 9, 380);


        // 4. 生成して返却
        const pdfBytes = await pdfDoc.save();

        return new NextResponse(pdfBytes as any, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": 'attachment; filename="official_report.pdf"',
            },
        });

    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 });
    }
}
