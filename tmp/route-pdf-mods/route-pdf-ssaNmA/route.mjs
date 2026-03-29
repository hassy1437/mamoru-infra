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
    292.67, 304.0, 315.33, 326.67, 338.0, 349.33, 360.67, 372.0, 383.33,
    394.67, 406.0, 417.33, 428.67, 440.0, 451.33, 462.67, 474.0, 485.33,
    496.67, 508.0, 519.33, 530.67, 542.0, 553.33, 564.67, 576.0, 587.33,
    598.67, 610.0, 622.0, 632.67, 644.67, 656.0, 667.33, 678.67, 690.0,
    701.33, 712.67,
];
const P2_ROW_BOUNDS = [
    82.67, 96.0, 110.0, 123.33, 136.67, 150.0, 163.33, 176.67, 190.0, 204.0,
    217.33, 230.67, 244.0, 257.33, 271.33, 284.67, 298.0, 311.33, 324.67,
    338.0, 352.0, 365.33, 378.67, 392.0, 405.33, 419.33, 432.67, 446.0,
    459.33, 472.67, 486.0, 500.0, 513.33, 526.67, 540.0, 553.33, 566.67,
    580.67, 594.0, 607.33, 620.67, 634.0, 647.33, 661.33, 674.67, 688.0,
    701.33, 714.67,
];
const P3_ROW_BOUNDS = [
    82.67, 106.0, 128.67, 152.0, 174.67, 198.0, 220.67, 244.0, 266.67, 290.0,
    312.67, 336.0, 358.67, 382.0, 404.67, 428.0, 450.67, 474.0, 496.67, 520.0,
    542.67, 566.0, 588.67, 612.0, 634.67, 658.0, 680.67, 704.0,
];
const P4_ROW_BOUNDS = [
    104.0, 124.67, 146.0, 166.67, 188.0, 208.67, 230.0, 250.67, 272.0, 292.67,
    314.0, 334.67,
];
const P5_ROW_BOUNDS = [
    173.33, 204.0, 234.0, 264.67, 295.33, 326.0, 356.0, 386.67, 417.33, 448.0,
    478.0, 508.67, 539.33, 570.0, 600.0, 630.67, 661.33, 692.0, 722.0, 752.67,
];
const P5_COLS = [64.0, 106.0, 164.0, 211.33, 258.67, 326.67, 360.67, 394.0, 428.0, 461.33, 495.33, 528.67];
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
            path.join(process.cwd(), "public", "PDF", "s50_kokuji14_bekki7.pdf"),
            path.join(process.cwd(), "public", "s50_kokuji14_bekki7.pdf"),
        ];
        const pdfPath = candidatePdfPaths.find((p) => fs.existsSync(p));
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf");
        if (!pdfPath)
            throw new Error("Template PDF not found: s50_kokuji14_bekki7.pdf");
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
            contentX: 232.0, contentW: 99.33,
            judgmentX: 331.33, judgmentW: 36.67,
            badX: 368.0, badW: 94.67,
            actionX: 462.67, actionW: 66.0,
        });
        drawResultRows(page2, p2Height, body.page2_rows ?? [], P2_ROW_BOUNDS, {
            contentX: 232.67, contentW: 94.0,
            judgmentX: 326.67, judgmentW: 36.66,
            badX: 363.33, badW: 99.34,
            actionX: 462.67, actionW: 66.66,
        });
        drawResultRows(page3, p3Height, body.page3_rows ?? [], P3_ROW_BOUNDS, {
            contentX: 232.67, contentW: 81.33,
            judgmentX: 314.0, judgmentW: 42.0,
            badX: 356.0, badW: 102.67,
            actionX: 458.67, actionW: 70.66,
        });
        drawResultRows(page4, p4Height, body.page4_rows ?? [], P4_ROW_BOUNDS, {
            contentX: 222.0, contentW: 94.67,
            judgmentX: 316.67, judgmentW: 42.0,
            badX: 358.67, badW: 104.66,
            actionX: 463.33, actionW: 65.34,
        });
        drawWrappedInCell(page4, p4Height, body.notes, 96.0, 334.67, 432.67, 294.0, 7.2);
        const device1 = body.device1 ?? {};
        const device2 = body.device2 ?? {};
        drawInCell(page4, p4Height, device1.name, 92.67, 650.0, 36.0, 20.67, 7.0);
        drawInCell(page4, p4Height, device1.model, 128.67, 650.0, 38.66, 20.67, 7.0);
        drawInCell(page4, p4Height, device1.calibrated_at, 167.33, 650.0, 51.34, 20.67, 7.0);
        drawInCell(page4, p4Height, device1.maker, 218.67, 650.0, 52.0, 20.67, 7.0);
        drawInCell(page4, p4Height, device2.name, 321.33, 650.0, 52.67, 20.67, 7.0);
        drawInCell(page4, p4Height, device2.model, 374.0, 650.0, 52.0, 20.67, 7.0);
        drawInCell(page4, p4Height, device2.calibrated_at, 426.0, 650.0, 52.0, 20.67, 7.0);
        drawInCell(page4, p4Height, device2.maker, 478.0, 650.0, 51.33, 20.67, 7.0);
        drawCylinderRows(page5, p5Height, body.page5_rows ?? []);
        const pdfBytes = await pdfDoc.save();
        return new NextResponse(pdfBytes, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": 'attachment; filename="s50_kokuji14_bekki7_filled.pdf"',
            },
        });
    }
    catch (error) {
        console.error(error);
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 });
    }
}
