// 日付行のキャリブレーション用PDF生成
// 10pt刻みでx座標マーカーを描画して、プリプリントラベルの正確な位置を特定
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";

const pdfPath = path.join(process.cwd(), "public", "bekki_soukatu.pdf");
const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf");

const existingPdfBytes = fs.readFileSync(pdfPath);
const fontBytes = fs.readFileSync(fontPath);

const pdfDoc = await PDFDocument.load(existingPdfBytes);
pdfDoc.registerFontkit(fontkit);
const customFont = await pdfDoc.embedFont(fontBytes);

const page1 = pdfDoc.getPages()[0];
const { width, height } = page1.getSize();

// 点検年月日の行: fromTop 277 - 324 → y = 518 - 565
// 日付エリア: x = 291 ~ 530

// 10pt刻みでx座標マーカーを描画
for (let x = 290; x <= 540; x += 10) {
    const isMajor = x % 50 === 0;
    const color = isMajor ? rgb(1, 0, 0) : rgb(0, 0, 1);
    const thickness = isMajor ? 1.0 : 0.3;

    // 縦線（日付行内のみ）
    page1.drawLine({
        start: { x, y: height - 277 },
        end: { x, y: height - 324 },
        thickness,
        color,
        opacity: 0.6,
    });

    // x座標ラベル
    if (x % 20 === 0) {
        page1.drawText(String(x), {
            x: x - 5, y: height - 272,
            size: 5, font: customFont, color,
        });
    }
}

// 判定列のキャリブレーション（最初の設備行）
// 判定列: x = 159.8 - 211.8, 最初の行: fromTop 387.2 - 435.0
for (let x = 155; x <= 215; x += 5) {
    const isMajor = x % 10 === 0;
    const color = isMajor ? rgb(1, 0, 0) : rgb(0, 0, 1);
    page1.drawLine({
        start: { x, y: height - 387 },
        end: { x, y: height - 435 },
        thickness: isMajor ? 0.8 : 0.3,
        color,
        opacity: 0.4,
    });
    if (isMajor) {
        page1.drawText(String(x), {
            x: x - 5, y: height - 383,
            size: 4, font: customFont, color,
        });
    }
}

// 点検種別のキャリブレーション
// 点検種別テキストエリア: x = 118 - 228, fromTop 277 - 324
for (let x = 115; x <= 230; x += 10) {
    const isMajor = x % 50 === 0;
    const color = isMajor ? rgb(1, 0, 0) : rgb(0, 0.6, 0);
    page1.drawLine({
        start: { x, y: height - 277 },
        end: { x, y: height - 324 },
        thickness: isMajor ? 0.8 : 0.3,
        color,
        opacity: 0.4,
    });
    if (x % 20 === 0) {
        page1.drawText(String(x), {
            x: x - 5, y: height - 272,
            size: 5, font: customFont, color,
        });
    }
}

const pdfBytes = await pdfDoc.save();
const outputPath = path.join(process.cwd(), "public", "test_calibration.pdf");
fs.writeFileSync(outputPath, pdfBytes);
console.log(`キャリブレーションPDF生成完了: ${outputPath}`);
