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
    265.67, 277.0, 288.33, 299.67, 311.0, 322.33, 333.67, 345.0, 356.67,
    367.67, 379.33, 390.33, 402.0, 413.33, 424.67, 436.0, 447.33, 458.67,
    470.0, 481.67, 493.0, 504.33, 515.67, 527.0, 538.33, 549.67, 561.0,
    572.33, 583.67, 595.0, 606.33, 617.67, 629.0, 640.33, 651.67, 663.0,
    674.33, 685.67, 697.0, 708.67,
];
const P2_ROW_BOUNDS = [
    83.33, 96.33, 110.0, 123.67, 137.0, 150.33, 163.67, 177.0, 190.67, 204.33,
    217.67, 231.0, 244.33, 258.0, 271.67, 285.0, 298.33, 311.67, 325.0, 338.67,
    352.0, 365.67, 379.0, 392.33, 406.0, 419.33, 433.0, 446.33, 459.67, 473.0,
    486.33, 500.0, 513.67, 527.0, 540.33, 553.67, 567.33, 581.0, 594.33, 607.67,
    621.0, 634.33, 648.0, 661.67, 675.0, 688.67,
];
const P3_ROW_BOUNDS = [
    77.33, 100.0, 123.0, 146.33, 169.0, 192.33, 215.0, 238.0, 261.0, 284.33,
    307.0, 330.33, 353.0, 376.0, 399.0, 422.33, 445.0, 468.33, 491.0, 514.0,
    537.0, 560.33, 583.0, 606.33, 629.0, 652.67,
];
const P4_ROW_BOUNDS = [
    114.33, 135.0, 156.33, 177.0, 198.33, 219.0, 240.33, 261.0, 282.33, 303.0,
    324.33, 345.0,
];
const P5_ROW_BOUNDS = [
    167.67, 198.33, 228.33, 259.0, 289.67, 320.33, 350.67, 381.0, 411.67, 442.0,
    472.67, 503.0, 533.67, 564.33, 594.33, 625.0, 655.67, 686.33, 716.67, 747.33,
];
const P5_COLS = [64.67, 106.33, 164.33, 211.33, 258.67, 327.0, 359.0, 391.33, 423.67, 455.0, 497.0, 529.33];
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
            path.join(process.cwd(), "public", "PDF", "s50_kokuji14_bekki8.pdf"),
            path.join(process.cwd(), "public", "s50_kokuji14_bekki8.pdf"),
        ];
        const pdfPath = candidatePdfPaths.find((p) => fs.existsSync(p));
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf");
        if (!pdfPath)
            throw new Error("Template PDF not found: s50_kokuji14_bekki8.pdf");
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
            const paddingX = options?.paddingX ?? 2.5;
            const paddingY = options?.paddingY ?? 1.8;
            const minFontSize = options?.minFontSize ?? 3.5;
            let currentSize = Math.min(fontSize, options?.maxFontSize ?? fontSize);
            const maxWidth = Math.max(1, cellW - paddingX * 2);
            const maxHeight = Math.max(1, cellH - paddingY * 2);
            const widthAtCurrent = customFont.widthOfTextAtSize(normalized, currentSize);
            if (widthAtCurrent > maxWidth)
                currentSize *= maxWidth / widthAtCurrent;
            const heightAtCurrent = customFont.heightAtSize(currentSize, { descender: true });
            if (heightAtCurrent > maxHeight)
                currentSize *= maxHeight / heightAtCurrent;
            currentSize = Math.max(currentSize, minFontSize);
            const textWidth = customFont.widthOfTextAtSize(normalized, currentSize);
            const textHeight = customFont.heightAtSize(currentSize, { descender: true });
            let textX = cellX + paddingX;
            if (options?.align === "center") {
                textX = cellX + (cellW - textWidth) / 2;
            }
            const textTop = cellTopFromTop + (cellH - textHeight) / 2;
            const baselineOffset = textHeight * 0.78;
            page.drawText(normalized, {
                x: textX,
                y: pageHeight - (textTop + baselineOffset),
                size: currentSize,
                font: customFont,
                color: rgb(0, 0, 0),
            });
        };
        const drawWrappedInCell = (page, pageHeight, text, cellX, cellTopFromTop, cellW, cellH, fontSize = 7.0) => {
            const normalized = normalizeText(text);
            if (!normalized)
                return;
            const paddingX = 2.2;
            const paddingY = 1.2;
            const maxWidth = Math.max(1, cellW - paddingX * 2);
            const maxHeight = Math.max(1, cellH - paddingY * 2);
            const lineHeight = fontSize + 0.7;
            const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));
            const words = normalized.split(" ");
            const lines = [];
            let current = "";
            for (const word of words) {
                const candidate = current ? `${current} ${word}` : word;
                if (customFont.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
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
                drawWrappedInCell(page, pageHeight, row.content, columns.contentX, top, columns.contentW, h, 6.6);
                drawInCell(page, pageHeight, row.judgment, columns.judgmentX, top, columns.judgmentW, h, 8.0, { align: "center" });
                drawWrappedInCell(page, pageHeight, row.bad_content, columns.badX, top, columns.badW, h, 6.4);
                drawWrappedInCell(page, pageHeight, row.action_content, columns.actionX, top, columns.actionW, h, 6.4);
            }
        };
        const drawCylinderRows = (page, pageHeight, rows) => {
            for (let i = 0; i < P5_ROW_BOUNDS.length - 1; i += 1) {
                const row = rows[i];
                if (!row)
                    continue;
                const top = P5_ROW_BOUNDS[i];
                const h = P5_ROW_BOUNDS[i + 1] - top;
                const values = [
                    row.no,
                    row.cylinder_no,
                    row.spec1,
                    row.spec2,
                    row.spec3,
                    row.measure1,
                    row.measure2,
                    row.measure3,
                    row.measure4,
                    row.measure5,
                    row.measure6,
                ];
                for (let c = 0; c < values.length; c += 1) {
                    const x = P5_COLS[c];
                    const w = P5_COLS[c + 1] - P5_COLS[c];
                    const isShort = c <= 5;
                    drawWrappedInCell(page, pageHeight, values[c], x, top, w, h, isShort ? 6.2 : 5.8);
                }
            }
        };
        // Page1 header
        drawInCell(page1, p1Height, body.zone_name, 470, 82, 54, 12, 7.6);
        drawInCell(page1, p1Height, body.equipment_system, 150, 100, 145, 12, 7.6);
        drawInCell(page1, p1Height, body.form_name, 113.33, 116.0, 266.0, 27.33, 8.8);
        drawInCell(page1, p1Height, body.fire_manager, 422.67, 116.0, 106.0, 27.33, 8.4);
        drawInCell(page1, p1Height, body.location, 113.33, 143.33, 266.0, 28.0, 8.5);
        drawInCell(page1, p1Height, body.witness, 422.67, 143.33, 106.0, 28.0, 8.3);
        drawInCell(page1, p1Height, body.inspection_type || "機器・総合", 113.33, 171.33, 92.0, 16.0, 8.0, { align: "center" });
        const start = formatDateText(body.period_start);
        const end = formatDateText(body.period_end);
        const periodText = start && end ? `${start} ～ ${end}` : (start || end);
        drawInCell(page1, p1Height, periodText, 263.33, 171.33, 265.34, 16.0, 7.8);
        drawInCell(page1, p1Height, body.inspector_name, 113.33, 187.33, 92.0, 48.0, 8.0);
        drawInCell(page1, p1Height, body.inspector_company, 263.33, 187.33, 143.0, 23.0, 7.8);
        drawInCell(page1, p1Height, body.inspector_tel, 406.33, 187.33, 122.34, 23.0, 7.8);
        drawInCell(page1, p1Height, body.inspector_address, 263.33, 210.0, 265.34, 25.33, 7.6);
        drawResultRows(page1, p1Height, body.page1_rows ?? [], P1_ROW_BOUNDS, {
            contentX: 231.67, contentW: 99.66,
            judgmentX: 331.33, judgmentW: 36.67,
            badX: 368.0, badW: 94.67,
            actionX: 462.67, actionW: 66.0,
        });
        drawResultRows(page2, p2Height, body.page2_rows ?? [], P2_ROW_BOUNDS, {
            contentX: 232.67, contentW: 94.33,
            judgmentX: 327.0, judgmentW: 36.67,
            badX: 363.67, badW: 99.33,
            actionX: 463.0, actionW: 67.0,
        });
        drawResultRows(page3, p3Height, body.page3_rows ?? [], P3_ROW_BOUNDS, {
            contentX: 233.0, contentW: 81.33,
            judgmentX: 314.33, judgmentW: 42.0,
            badX: 356.33, badW: 102.67,
            actionX: 459.0, actionW: 71.0,
        });
        drawResultRows(page4, p4Height, body.page4_rows ?? [], P4_ROW_BOUNDS, {
            contentX: 222.33, contentW: 94.67,
            judgmentX: 317.0, judgmentW: 42.0,
            badX: 359.0, badW: 105.0,
            actionX: 464.0, actionW: 65.67,
        });
        drawWrappedInCell(page4, p4Height, body.notes, 96.33, 345.0, 433.34, 294.0, 7.2);
        const device1 = body.device1 ?? {};
        const device2 = body.device2 ?? {};
        drawInCell(page4, p4Height, device1.name, 96.33, 660.33, 42.0, 20.67, 7.0);
        drawInCell(page4, p4Height, device1.model, 138.33, 660.33, 52.67, 20.67, 7.0);
        drawInCell(page4, p4Height, device1.calibrated_at, 191.0, 660.33, 55.33, 20.67, 7.0);
        drawInCell(page4, p4Height, device1.maker, 246.33, 660.33, 54.67, 20.67, 7.0);
        drawInCell(page4, p4Height, device2.name, 364.0, 660.33, 54.0, 20.67, 7.0);
        drawInCell(page4, p4Height, device2.model, 418.0, 660.33, 46.0, 20.67, 7.0);
        drawInCell(page4, p4Height, device2.calibrated_at, 471.67, 660.33, 58.0, 20.67, 7.0);
        drawInCell(page4, p4Height, device2.maker, 464.0, 681.0, 65.67, 20.67, 7.0);
        drawCylinderRows(page5, p5Height, body.page5_rows ?? []);
        const pdfBytes = await pdfDoc.save();
        return new NextResponse(pdfBytes, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": 'attachment; filename="s50_kokuji14_bekki8_filled.pdf"',
            },
        });
    }
    catch (error) {
        console.error(error);
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 });
    }
}
