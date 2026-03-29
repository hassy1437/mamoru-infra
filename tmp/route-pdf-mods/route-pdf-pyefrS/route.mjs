class NextResponse extends Response {
    static json(data, init = {}) {
        const headers = new Headers(init.headers || {});
        if (!headers.has("Content-Type"))
            headers.set("Content-Type", "application/json");
        return new NextResponse(JSON.stringify(data), { ...init, headers });
    }
}
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";
const P1_ROW_BOUNDS = [
    311, 332, 353, 374, 395, 416, 437, 458, 479, 500,
    521, 542, 563, 584, 605, 626, 647, 668, 689, 710,
];
const P2_ROW_BOUNDS = [
    83, 100, 117, 134, 151, 177, 202, 227, 253, 278,
    296, 313, 329, 346, 364, 380, 397, 415, 431, 448,
    466, 482, 499, 517, 533, 550, 568, 584, 602, 619,
    635, 653, 670, 686, 703,
];
const P3_ROW_BOUNDS = [
    76, 94, 113, 131, 149, 168, 186, 205, 223, 242,
    260, 279, 297, 316, 334, 352, 371, 389, 417, 436,
    454, 473, 491, 505, 520, 534, 559, 573, 588, 602,
    616, 631, 645, 660, 674, 689, 708,
];
const P4_ROW_BOUNDS = [
    83, 105, 132, 160, 186, 214, 241, 268, 295, 322,
    349, 377, 405, 434, 462, 490, 519, 547, 575, 604,
    632, 659, 686, 712,
];
const P5_ROW_BOUNDS = [79, 104, 130, 155, 181, 206, 232, 257, 283, 308, 334, 359];
const normalizeText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const formatDateText = (value) => {
    const raw = normalizeText(value);
    if (!raw)
        return "";
    const date = new Date(raw);
    if (Number.isNaN(date.getTime()))
        return raw;
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
};
export async function POST(req) {
    try {
        const body = (await req.json());
        const candidatePdfPaths = [
            path.join(process.cwd(), "public", "PDF", "s50_kokuji14_bekki3.pdf"),
            path.join(process.cwd(), "public", "s50_kokuji14_bekki3.pdf"),
        ];
        const pdfPath = candidatePdfPaths.find((p) => fs.existsSync(p));
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf");
        if (!pdfPath) {
            throw new Error("Template PDF not found: s50_kokuji14_bekki3.pdf");
        }
        const existingPdfBytes = fs.readFileSync(pdfPath);
        const fontBytes = fs.readFileSync(fontPath);
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        pdfDoc.registerFontkit(fontkit);
        const customFont = await pdfDoc.embedFont(fontBytes);
        const [page1, page2, page3, page4, page5] = pdfDoc.getPages();
        const p1Height = page1.getSize().height;
        const p2Height = page2.getSize().height;
        const p3Height = page3.getSize().height;
        const p4Height = page4.getSize().height;
        const p5Height = page5.getSize().height;
        const drawInCell = (page, pageHeight, text, cellX, cellTopFromTop, cellW, cellH, fontSize = 9, options) => {
            const normalized = normalizeText(text);
            if (!normalized)
                return;
            const paddingX = options?.paddingX ?? 3;
            const paddingY = options?.paddingY ?? 2;
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
            const textWidth = customFont.widthOfTextAtSize(normalized, currentSize);
            const textHeight = customFont.heightAtSize(currentSize, { descender: true });
            let textX = cellX + paddingX;
            if (options?.align === "center") {
                textX = cellX + (cellW - textWidth) / 2;
            }
            const textTopFromTop = cellTopFromTop + (cellH - textHeight) / 2;
            const baselineOffset = textHeight * 0.78;
            page.drawText(normalized, {
                x: textX,
                y: pageHeight - (textTopFromTop + baselineOffset),
                size: currentSize,
                font: customFont,
                color: rgb(0, 0, 0),
            });
        };
        const drawWrappedInCell = (page, pageHeight, text, cellX, cellTopFromTop, cellW, cellH, fontSize = 7.1) => {
            const normalized = normalizeText(text);
            if (!normalized)
                return;
            const paddingX = 2.5;
            const paddingY = 1.5;
            const maxWidth = Math.max(1, cellW - paddingX * 2);
            const maxHeight = Math.max(1, cellH - paddingY * 2);
            const lineHeight = fontSize + 0.9;
            const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));
            const words = normalized.split(" ");
            const lines = [];
            let current = "";
            for (const word of words) {
                const candidate = current ? `${current} ${word}` : word;
                const candidateW = customFont.widthOfTextAtSize(candidate, fontSize);
                if (candidateW <= maxWidth) {
                    current = candidate;
                }
                else {
                    if (current)
                        lines.push(current);
                    current = word;
                }
                if (lines.length >= maxLines)
                    break;
            }
            if (current && lines.length < maxLines)
                lines.push(current);
            if (lines.length === 0)
                return;
            const totalH = lines.length * lineHeight;
            let top = cellTopFromTop + (cellH - totalH) / 2;
            for (const line of lines) {
                const h = customFont.heightAtSize(fontSize, { descender: true });
                const baselineOffset = h * 0.78;
                page.drawText(line, {
                    x: cellX + paddingX,
                    y: pageHeight - (top + baselineOffset),
                    size: fontSize,
                    font: customFont,
                    color: rgb(0, 0, 0),
                });
                top += lineHeight;
            }
        };
        const drawResultRows = (page, pageHeight, rows, rowBounds, columns) => {
            for (let i = 0; i < rowBounds.length - 1; i += 1) {
                const row = rows[i];
                if (!row)
                    continue;
                const top = rowBounds[i];
                const h = rowBounds[i + 1] - rowBounds[i];
                drawWrappedInCell(page, pageHeight, row.content, columns.contentX, top, columns.contentW, h, 6.7);
                drawInCell(page, pageHeight, row.judgment, columns.judgmentX, top, columns.judgmentW, h, 8.4, { align: "center" });
                drawWrappedInCell(page, pageHeight, row.bad_content, columns.badX, top, columns.badW, h, 6.7);
                drawWrappedInCell(page, pageHeight, row.action_content, columns.actionX, top, columns.actionW, h, 6.7);
            }
        };
        drawInCell(page1, p1Height, body.form_name, 119, 108, 224, 26, 9);
        drawInCell(page1, p1Height, body.fire_manager, 406, 108, 124, 26, 8.6);
        drawInCell(page1, p1Height, body.location, 119, 134, 224, 27, 8.8);
        drawInCell(page1, p1Height, body.witness, 406, 134, 124, 27, 8.6);
        drawInCell(page1, p1Height, body.inspection_type || "機器・総合", 119, 161, 87, 18, 8.3, { align: "center" });
        const periodStart = formatDateText(body.period_start);
        const periodEnd = formatDateText(body.period_end);
        const periodText = periodStart && periodEnd ? `${periodStart} ～ ${periodEnd}` : (periodStart || periodEnd);
        drawInCell(page1, p1Height, periodText, 238, 161, 292, 18, 8.3);
        drawInCell(page1, p1Height, body.inspector_name, 119, 179, 87, 42, 8.2);
        drawInCell(page1, p1Height, body.inspector_company, 271, 179, 140, 21, 8.2);
        drawInCell(page1, p1Height, body.inspector_tel, 411, 179, 119, 21, 8.2);
        drawInCell(page1, p1Height, body.inspector_address, 271, 200, 259, 21, 8.0);
        drawInCell(page1, p1Height, body.equipment_name, 119, 221, 38, 36, 7.2);
        drawInCell(page1, p1Height, body.pump_maker, 157, 221, 81, 18, 7.1);
        drawInCell(page1, p1Height, body.pump_model, 157, 239, 81, 18, 7.1);
        drawInCell(page1, p1Height, body.motor_maker, 364, 221, 91, 18, 7.1);
        drawInCell(page1, p1Height, body.motor_model, 364, 239, 91, 18, 7.1);
        drawResultRows(page1, p1Height, body.page1_rows ?? [], P1_ROW_BOUNDS, {
            contentX: 238, contentW: 105,
            judgmentX: 343, judgmentW: 37,
            badX: 380, badW: 75,
            actionX: 455, actionW: 75,
        });
        drawResultRows(page2, p2Height, body.page2_rows ?? [], P2_ROW_BOUNDS, {
            contentX: 237, contentW: 101,
            judgmentX: 338, judgmentW: 38,
            badX: 376, badW: 77,
            actionX: 453, actionW: 77,
        });
        drawResultRows(page3, p3Height, body.page3_rows ?? [], P3_ROW_BOUNDS, {
            contentX: 238, contentW: 105,
            judgmentX: 343, judgmentW: 37,
            badX: 380, badW: 75,
            actionX: 455, actionW: 75,
        });
        drawResultRows(page4, p4Height, body.page4_rows ?? [], P4_ROW_BOUNDS, {
            contentX: 242, contentW: 106,
            judgmentX: 348, judgmentW: 36,
            badX: 384, badW: 71,
            actionX: 455, actionW: 75,
        });
        drawResultRows(page5, p5Height, body.page5_rows ?? [], P5_ROW_BOUNDS, {
            contentX: 242, contentW: 106,
            judgmentX: 348, judgmentW: 36,
            badX: 384, badW: 71,
            actionX: 455, actionW: 75,
        });
        drawWrappedInCell(page5, p5Height, body.notes, 83, 359, 447, 280, 7.4);
        const device1 = body.device1 ?? {};
        const device2 = body.device2 ?? {};
        drawInCell(page5, p5Height, device1.name, 83, 658, 56, 19, 7.2);
        drawInCell(page5, p5Height, device1.model, 139, 658, 55, 19, 7.2);
        drawInCell(page5, p5Height, device1.calibrated_at, 194, 658, 56, 19, 7.2);
        drawInCell(page5, p5Height, device1.maker, 250, 658, 56, 19, 7.2);
        drawInCell(page5, p5Height, device2.name, 306, 658, 56, 19, 7.2);
        drawInCell(page5, p5Height, device2.model, 362, 658, 56, 19, 7.2);
        drawInCell(page5, p5Height, device2.calibrated_at, 418, 658, 56, 19, 7.2);
        drawInCell(page5, p5Height, device2.maker, 474, 658, 56, 19, 7.2);
        const pdfBytes = await pdfDoc.save();
        return new NextResponse(pdfBytes, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": 'attachment; filename="s50_kokuji14_bekki3_filled.pdf"',
            },
        });
    }
    catch (error) {
        console.error(error);
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 });
    }
}
