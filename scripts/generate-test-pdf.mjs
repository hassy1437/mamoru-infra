import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";

const pdfPath = path.join(process.cwd(), "public", "bekki_soukatu.pdf");
const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf");

const P1_ROW1 = { top: 119.7, bottom: 197.8 };
const P1_ROW2 = { top: 198.2, bottom: 276.5 };
const P1_ROW3 = { top: 276.9, bottom: 324.2 };
const HDR_LEFT_VAL = { x: 120, endX: 288 };
const HDR_RIGHT_VAL = { x: 346, endX: 527 };

const P1_COL = {
    name: { x: 68, w: 88 },
    judge: { x: 162, w: 48 },
    bad: { x: 215, w: 73 },
    action: { x: 294, w: 120 },
    witness: { x: 420, w: 107 },
};

const P1_EQ_ROWS = [
    { top: 387.2, bottom: 435.0 },
    { top: 435.0, bottom: 483.1 },
    { top: 483.1, bottom: 531.4 },
    { top: 531.4, bottom: 579.6 },
    { top: 579.6, bottom: 627.7 },
    { top: 627.7, bottom: 676.0 },
];

const P2_COL = {
    name: { x: 68, w: 88 },
    judge: { x: 162, w: 48 },
    bad: { x: 215, w: 78 },
    action: { x: 299, w: 111 },
    witness: { x: 416, w: 111 },
};

const P2_EQ_ROWS = [
    { top: 173.5, bottom: 221.6 },
    { top: 221.6, bottom: 270.4 },
    { top: 270.4, bottom: 319.1 },
    { top: 319.1, bottom: 367.8 },
    { top: 367.8, bottom: 416.5 },
    { top: 416.5, bottom: 465.2 },
    { top: 465.2, bottom: 513.8 },
    { top: 513.8, bottom: 562.6 },
    { top: 562.6, bottom: 611.3 },
    { top: 611.3, bottom: 660.0 },
    { top: 660.0, bottom: 708.7 },
];

const JUDGE_GOOD_CENTER_X = 169.5;
const JUDGE_BAD_CENTER_X = 194.5;

const normalizeText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const drawDate = (page, font, pageHeight, dateY, size, dateValue, anchors) => {
    if (!dateValue) return;
    const d = new Date(String(dateValue));
    if (Number.isNaN(d.getTime())) return;

    const yearStr = String(d.getFullYear());
    const monthStr = String(d.getMonth() + 1);
    const dayStr = String(d.getDate());

    const yearW = font.widthOfTextAtSize(yearStr, size);
    const monthW = font.widthOfTextAtSize(monthStr, size);
    const dayW = font.widthOfTextAtSize(dayStr, size);

    page.drawText(yearStr, { x: anchors.year - yearW, y: pageHeight - dateY, size, font, color: rgb(0, 0, 0) });
    page.drawText(monthStr, { x: anchors.month - monthW, y: pageHeight - dateY, size, font, color: rgb(0, 0, 0) });
    page.drawText(dayStr, { x: anchors.day - dayW, y: pageHeight - dateY, size, font, color: rgb(0, 0, 0) });
};

const existingPdfBytes = fs.readFileSync(pdfPath);
const fontBytes = fs.readFileSync(fontPath);

const pdfDoc = await PDFDocument.load(existingPdfBytes);
pdfDoc.registerFontkit(fontkit);
const customFont = await pdfDoc.embedFont(fontBytes);

const pages = pdfDoc.getPages();
const page1 = pages[0];
const page2 = pages.length > 1 ? pages[1] : null;
const { height } = page1.getSize();
const height2 = page2 ? page2.getSize().height : height;

const drawInCell = (page, pageHeight, text, cellX, cellTopFromTop, cellW, cellH, fontSize = 10, options) => {
    const normalized = normalizeText(text);
    if (!normalized) return;

    const paddingX = options?.paddingX ?? 4;
    const paddingY = options?.paddingY ?? 3;
    const minFontSize = options?.minFontSize ?? 3.5;
    let currentSize = Math.min(fontSize, options?.maxFontSize ?? fontSize);

    const maxWidth = Math.max(1, cellW - paddingX * 2);
    const maxHeight = Math.max(1, cellH - paddingY * 2);

    const widthAtCurrent = customFont.widthOfTextAtSize(normalized, currentSize);
    if (widthAtCurrent > maxWidth) {
        currentSize = currentSize * (maxWidth / widthAtCurrent);
    }

    const heightAtCurrent = customFont.heightAtSize(currentSize, { descender: true });
    if (heightAtCurrent > maxHeight) {
        currentSize = currentSize * (maxHeight / heightAtCurrent);
    }

    currentSize = Math.max(currentSize, minFontSize);

    const truncateToFit = (value) => {
        if (customFont.widthOfTextAtSize(value, currentSize) <= maxWidth) {
            return value;
        }

        const suffix = "...";
        const suffixWidth = customFont.widthOfTextAtSize(suffix, currentSize);
        if (suffixWidth > maxWidth) return "";

        let cut = value.length;
        while (cut > 0) {
            const candidate = `${value.slice(0, cut).trimEnd()}${suffix}`;
            if (customFont.widthOfTextAtSize(candidate, currentSize) <= maxWidth) {
                return candidate;
            }
            cut -= 1;
        }

        return suffix;
    };

    const textToDraw = truncateToFit(normalized);
    if (!textToDraw) return;

    const textWidth = customFont.widthOfTextAtSize(textToDraw, currentSize);
    const textHeight = customFont.heightAtSize(currentSize, { descender: true });
    const xOffset = options?.xOffset ?? 0;
    const yOffset = options?.yOffset ?? 0;
    let textX = cellX + paddingX + xOffset;

    if (options?.align === "center") {
        textX = cellX + (cellW - textWidth) / 2 + xOffset;
    }

    const textTopFromTop = cellTopFromTop + (cellH - textHeight) / 2 + yOffset;
    const baselineOffset = textHeight * 0.78;

    page.drawText(textToDraw, {
        x: textX,
        y: pageHeight - (textTopFromTop + baselineOffset),
        size: currentSize,
        font: customFont,
        color: rgb(0, 0, 0),
    });
};

const drawJudgeCircle = (page, pageHeight, isGood, rowTop, rowBottom) => {
    const centerX = isGood ? JUDGE_GOOD_CENTER_X : JUDGE_BAD_CENTER_X;
    const centerY = pageHeight - (rowTop + (rowBottom - rowTop) / 2);
    const radiusX = isGood ? 9 : 13;
    const radiusY = 8;

    page.drawEllipse({
        x: centerX,
        y: centerY,
        xScale: radiusX,
        yScale: radiusY,
        borderColor: rgb(0, 0, 0),
        borderWidth: 1.2,
        color: undefined,
        opacity: 0,
    });
};

const testBody = {
    building_name: "テストビル管理組合（長文フィット確認用サンプル）",
    notifier_name: "山田太郎消防設備点検株式会社",
    building_address: "東京都千代田区永田町一丁目二番三号 テストタワーウエスト棟 12F",
    notifier_address: "東京都港区芝公園四丁目二番八号 点検センタービル三階",
    inspection_type: "機器点検",
    inspection_period_start: "2026-01-15",
    inspection_period_end: "2026-02-14",
    equipment_results: [
        { name: "消火器", result: "指摘なし" },
        { name: "屋内消火栓設備", result: "指摘なし" },
        { name: "スプリンクラー設備", result: "要改善", bad_detail: "ヘッド接続部緩み", action: "交換予定（次回訪問時）" },
        { name: "自動火災報知設備", result: "指摘なし" },
        { name: "漏電火災警報器", result: "指摘なし" },
        { name: "消防機関へ通報する火災報知設備", result: "指摘なし" },
        { name: "非常警報器具及び設備", result: "指摘なし" },
        { name: "避難器具", result: "要改善", bad_detail: "降下障害あり", action: "障害物除去済み", witness: "管理会社 佐藤" },
        { name: "誘導灯・誘導標識", result: "指摘なし" },
        { name: "消防用水", result: "指摘なし" },
        { name: "排煙設備", result: "指摘なし" },
        { name: "連結散水設備", result: "指摘なし" },
        { name: "連結送水管", result: "指摘なし" },
        { name: "非常コンセント設備", result: "指摘なし" },
        { name: "無線通信補助設備", result: "指摘なし" },
        { name: "動力消防ポンプ設備", result: "指摘なし" },
        { name: "泡消火設備", result: "指摘なし" },
    ],
};

const row1H = P1_ROW1.bottom - P1_ROW1.top;
drawInCell(page1, height, testBody.building_name, HDR_LEFT_VAL.x, P1_ROW1.top, HDR_LEFT_VAL.endX - HDR_LEFT_VAL.x, row1H, 10.5, {
    paddingX: 4,
    paddingY: 3,
    minFontSize: 4.2,
});
drawInCell(page1, height, testBody.notifier_name, HDR_RIGHT_VAL.x, P1_ROW1.top, HDR_RIGHT_VAL.endX - HDR_RIGHT_VAL.x, row1H, 10.5, {
    paddingX: 4,
    paddingY: 3,
    minFontSize: 4.2,
});

const row2H = P1_ROW2.bottom - P1_ROW2.top;
drawInCell(page1, height, testBody.building_address, HDR_LEFT_VAL.x, P1_ROW2.top, HDR_LEFT_VAL.endX - HDR_LEFT_VAL.x, row2H, 9.5, {
    paddingX: 4,
    paddingY: 3,
    minFontSize: 3.8,
});
drawInCell(page1, height, testBody.notifier_address, HDR_RIGHT_VAL.x, P1_ROW2.top, HDR_RIGHT_VAL.endX - HDR_RIGHT_VAL.x, row2H, 9.5, {
    paddingX: 4,
    paddingY: 3,
    minFontSize: 3.8,
});

const row3H = P1_ROW3.bottom - P1_ROW3.top;
const typeTextY = height - (P1_ROW3.top + 14);
page1.drawEllipse({
    x: testBody.inspection_type.includes("総合") ? 176 : 136,
    y: typeTextY,
    xScale: 21,
    yScale: 8,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1.2,
    color: undefined,
    opacity: 0,
});

const dateY = P1_ROW3.top + (row3H + 9) / 2 - 1.8;
drawDate(page1, customFont, height, dateY, 9, testBody.inspection_period_start, { year: 346, month: 367, day: 389 });
drawDate(page1, customFont, height, dateY, 9, testBody.inspection_period_end, { year: 451, month: 472, day: 494 });

let rowIndex = 0;
for (const item of testBody.equipment_results) {
    let page;
    let pageHeight;
    let row;
    let col;

    if (rowIndex < P1_EQ_ROWS.length) {
        page = page1;
        pageHeight = height;
        row = P1_EQ_ROWS[rowIndex];
        col = P1_COL;
    } else if (page2 && rowIndex - P1_EQ_ROWS.length < P2_EQ_ROWS.length) {
        page = page2;
        pageHeight = height2;
        row = P2_EQ_ROWS[rowIndex - P1_EQ_ROWS.length];
        col = P2_COL;
    } else {
        break;
    }

    const rowH = row.bottom - row.top;

    drawInCell(page, pageHeight, item.name, col.name.x, row.top, col.name.w, rowH, 8.8, {
        paddingX: 3.5,
        paddingY: 3,
        minFontSize: 3.4,
    });

    const isGood = normalizeText(item.result).includes("指摘なし") || normalizeText(item.result).includes("良");
    drawJudgeCircle(page, pageHeight, isGood, row.top, row.bottom);

    if (item.bad_detail) {
        drawInCell(page, pageHeight, item.bad_detail, col.bad.x, row.top, col.bad.w, rowH, 7.6, {
            paddingX: 3,
            paddingY: 3,
            minFontSize: 3.2,
        });
    }

    if (item.action) {
        drawInCell(page, pageHeight, item.action, col.action.x, row.top, col.action.w, rowH, 7.6, {
            paddingX: 3,
            paddingY: 3,
            minFontSize: 3.2,
        });
    }

    if (item.witness) {
        drawInCell(page, pageHeight, item.witness, col.witness.x, row.top, col.witness.w, rowH, 7.6, {
            paddingX: 3,
            paddingY: 3,
            minFontSize: 3.2,
        });
    }

    rowIndex += 1;
}

const pdfBytes = await pdfDoc.save();
const outputPath = path.join(process.cwd(), "public", "test_output.pdf");
fs.writeFileSync(outputPath, pdfBytes);
console.log(`Generated: ${outputPath}`);

