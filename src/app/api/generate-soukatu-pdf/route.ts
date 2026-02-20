import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, rgb, PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";

// Coordinates are in PDF points. x is from left, top/bottom are from top.
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

type DrawInCellOptions = {
    align?: "left" | "center";
    paddingX?: number;
    paddingY?: number;
    minFontSize?: number;
    maxFontSize?: number;
    xOffset?: number;
    yOffset?: number;
};

type EquipmentItem = {
    name?: string;
    result?: string;
    bad_detail?: string;
    action?: string;
    witness?: string;
};

const normalizeText = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();

const parseDate = (value: unknown) => {
    if (!value) return null;
    const d = new Date(String(value));
    return Number.isNaN(d.getTime()) ? null : d;
};

const isGoodResult = (value: unknown) => {
    const text = normalizeText(value);
    if (!text) return true;
    return (
        text.includes("指摘なし") ||
        text.includes("良") ||
        text.toLowerCase() === "good"
    );
};

const isGeneralInspectionType = (value: unknown) => {
    const text = normalizeText(value);
    if (!text) return true;

    return (
        text.includes("機器") ||
        text.includes("器具") ||
        text.includes("定期") ||
        text.includes("讖溷勣")
    );
};

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        const pdfPath = path.join(process.cwd(), "public", "bekki_soukatu.pdf");
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf");

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

        const drawInCell = (
            page: PDFPage,
            pageHeight: number,
            text: unknown,
            cellX: number,
            cellTopFromTop: number,
            cellW: number,
            cellH: number,
            fontSize = 10,
            options?: DrawInCellOptions,
        ) => {
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

            const truncateToFit = (value: string) => {
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

        const drawJudgeCircle = (
            page: PDFPage,
            pageHeight: number,
            isGood: boolean,
            rowTop: number,
            rowBottom: number,
        ) => {
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

        const row1H = P1_ROW1.bottom - P1_ROW1.top;
        drawInCell(
            page1,
            height,
            body.building_name,
            HDR_LEFT_VAL.x,
            P1_ROW1.top,
            HDR_LEFT_VAL.endX - HDR_LEFT_VAL.x,
            row1H,
            10.5,
            { paddingX: 4, paddingY: 3, minFontSize: 4.2 },
        );

        drawInCell(
            page1,
            height,
            body.notifier_name,
            HDR_RIGHT_VAL.x,
            P1_ROW1.top,
            HDR_RIGHT_VAL.endX - HDR_RIGHT_VAL.x,
            row1H,
            10.5,
            { paddingX: 4, paddingY: 3, minFontSize: 4.2 },
        );

        const row2H = P1_ROW2.bottom - P1_ROW2.top;
        drawInCell(
            page1,
            height,
            body.building_address,
            HDR_LEFT_VAL.x,
            P1_ROW2.top,
            HDR_LEFT_VAL.endX - HDR_LEFT_VAL.x,
            row2H,
            9.5,
            { paddingX: 4, paddingY: 3, minFontSize: 3.8 },
        );

        drawInCell(
            page1,
            height,
            body.notifier_address,
            HDR_RIGHT_VAL.x,
            P1_ROW2.top,
            HDR_RIGHT_VAL.endX - HDR_RIGHT_VAL.x,
            row2H,
            9.5,
            { paddingX: 4, paddingY: 3, minFontSize: 3.8 },
        );

        const row3H = P1_ROW3.bottom - P1_ROW3.top;
        const typeTextY = height - (P1_ROW3.top + 14);

        if (isGeneralInspectionType(body.inspection_type)) {
            page1.drawEllipse({
                x: 136,
                y: typeTextY,
                xScale: 21,
                yScale: 8,
                borderColor: rgb(0, 0, 0),
                borderWidth: 1.2,
                color: undefined,
                opacity: 0,
            });
        } else {
            page1.drawEllipse({
                x: 176,
                y: typeTextY,
                xScale: 21,
                yScale: 8,
                borderColor: rgb(0, 0, 0),
                borderWidth: 1.2,
                color: undefined,
                opacity: 0,
            });
        }

        const dateY = P1_ROW3.top + (row3H + 9) / 2 - 1.8;
        const dateSize = 9;

        const drawDate = (dateValue: unknown, anchors: { year: number; month: number; day: number }) => {
            const d = parseDate(dateValue);
            if (!d) return;

            const yearStr = String(d.getFullYear());
            const monthStr = String(d.getMonth() + 1);
            const dayStr = String(d.getDate());

            const yearW = customFont.widthOfTextAtSize(yearStr, dateSize);
            const monthW = customFont.widthOfTextAtSize(monthStr, dateSize);
            const dayW = customFont.widthOfTextAtSize(dayStr, dateSize);

            page1.drawText(yearStr, {
                x: anchors.year - yearW,
                y: height - dateY,
                size: dateSize,
                font: customFont,
                color: rgb(0, 0, 0),
            });
            page1.drawText(monthStr, {
                x: anchors.month - monthW,
                y: height - dateY,
                size: dateSize,
                font: customFont,
                color: rgb(0, 0, 0),
            });
            page1.drawText(dayStr, {
                x: anchors.day - dayW,
                y: height - dateY,
                size: dateSize,
                font: customFont,
                color: rgb(0, 0, 0),
            });
        };

        drawDate(body.inspection_period_start || body.inspection_date, {
            year: 346,
            month: 367,
            day: 389,
        });
        drawDate(body.inspection_period_end, {
            year: 451,
            month: 472,
            day: 494,
        });

        const results = ((body.equipment_results as EquipmentItem[] | null) ?? []).filter((item) => {
            return normalizeText(item?.result) !== "該当なし";
        });

        let rowIndex = 0;
        for (const item of results) {
            let page: PDFPage;
            let pageHeight: number;
            let row: { top: number; bottom: number };
            let col: typeof P1_COL;

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

            drawJudgeCircle(page, pageHeight, isGoodResult(item.result), row.top, row.bottom);

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

        return new NextResponse(pdfBytes as any, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": 'attachment; filename="soukatsu_report.pdf"',
            },
        });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 });
    }
}

