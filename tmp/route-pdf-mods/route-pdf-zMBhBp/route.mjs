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
    312, 333, 354, 375, 396, 417, 438, 459, 480, 501,
    522, 543, 564, 585, 606, 627, 648, 669, 690,
];
const P2_ROW_BOUNDS = [
    74, 92, 110, 128, 146, 164, 182, 200, 218, 237,
    256, 275, 293, 311, 329, 347, 365, 383, 401, 419,
    437, 455, 473, 491, 509, 527, 545, 563, 581, 599,
    617, 635, 653, 671, 689,
];
const P3_ROW_BOUNDS_A = [
    74, 91, 108, 125, 142, 159, 174, 188, 202, 230, 259, 273,
    287, 300, 314, 328, 342, 356, 371, 385, 399, 413, 430,
];
const P3_ROW_BOUNDS_B = [
    447, 461, 475, 490, 504, 518, 532, 546, 560, 574, 589,
];
const PERIOD_ROW = { top: 144, h: 21 };
const PERIOD_START_ANCHORS = { year: 328.8, month: 359.8, day: 392.5 };
const PERIOD_END_ANCHORS = { year: 451.0, month: 482.0, day: 514.8 };
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
const parseDateParts = (value) => {
    const raw = normalizeText(value);
    if (!raw)
        return null;
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) {
        return {
            year: String(date.getFullYear()),
            month: String(date.getMonth() + 1),
            day: String(date.getDate()),
        };
    }
    const match = raw.match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})$/);
    if (!match)
        return null;
    return {
        year: match[1],
        month: String(Number(match[2])),
        day: String(Number(match[3])),
    };
};
export async function POST(req) {
    try {
        const body = (await req.json());
        const candidatePdfPaths = [
            path.join(process.cwd(), "public", "PDF", "s50_kokuji14_bekki2.pdf"),
            path.join(process.cwd(), "public", "s50_kokuji14_bekki2.pdf"),
        ];
        const pdfPath = candidatePdfPaths.find((p) => fs.existsSync(p));
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf");
        if (!pdfPath) {
            throw new Error("Template PDF not found: s50_kokuji14_bekki2.pdf");
        }
        const existingPdfBytes = fs.readFileSync(pdfPath);
        const fontBytes = fs.readFileSync(fontPath);
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        pdfDoc.registerFontkit(fontkit);
        const customFont = await pdfDoc.embedFont(fontBytes);
        const [page1, page2, page3] = pdfDoc.getPages();
        const p1Height = page1.getSize().height;
        const p2Height = page2.getSize().height;
        const p3Height = page3.getSize().height;
        const truncateToFitWidth = (value, size, maxWidth) => {
            if (!value)
                return "";
            if (customFont.widthOfTextAtSize(value, size) <= maxWidth)
                return value;
            const suffix = "...";
            if (customFont.widthOfTextAtSize(suffix, size) > maxWidth)
                return "";
            let cut = value.length;
            while (cut > 0) {
                const candidate = `${value.slice(0, cut).trimEnd()}${suffix}`;
                if (customFont.widthOfTextAtSize(candidate, size) <= maxWidth)
                    return candidate;
                cut -= 1;
            }
            return suffix;
        };
        const wrapTextByWidth = (value, size, maxWidth) => {
            const lines = [];
            let current = "";
            for (const ch of Array.from(value)) {
                if (!current && ch === " ")
                    continue;
                const candidate = `${current}${ch}`;
                if (current && customFont.widthOfTextAtSize(candidate, size) > maxWidth + 0.1) {
                    const trimmed = current.trimEnd();
                    if (trimmed)
                        lines.push(trimmed);
                    current = ch === " " ? "" : ch;
                    continue;
                }
                current = candidate;
            }
            const last = current.trimEnd();
            if (last)
                lines.push(last);
            return lines;
        };
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
            const textToDraw = truncateToFitWidth(normalized, currentSize, maxWidth);
            if (!textToDraw)
                return;
            const textWidth = customFont.widthOfTextAtSize(textToDraw, currentSize);
            const textHeight = customFont.heightAtSize(currentSize, { descender: true });
            let textX = cellX + paddingX;
            if (options?.align === "center") {
                textX = cellX + (cellW - textWidth) / 2;
            }
            const textTopFromTop = cellTopFromTop + (cellH - textHeight) / 2;
            const baselineOffset = textHeight * 0.78;
            page.drawText(textToDraw, {
                x: textX,
                y: pageHeight - (textTopFromTop + baselineOffset),
                size: currentSize,
                font: customFont,
                color: rgb(0, 0, 0),
            });
        };
        const drawWrappedInCell = (page, pageHeight, text, cellX, cellTopFromTop, cellW, cellH, fontSize = 7.2) => {
            const normalized = normalizeText(text);
            if (!normalized)
                return;
            const paddingX = 2.5;
            const paddingY = 1.5;
            const minFontSize = 3.5;
            const maxWidth = Math.max(1, cellW - paddingX * 2);
            const maxHeight = Math.max(1, cellH - paddingY * 2);
            const lineGap = 0.9;
            const buildWrapped = (size) => {
                const lineHeight = size + lineGap;
                const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));
                const lines = wrapTextByWidth(normalized, size, maxWidth);
                return { lineHeight, maxLines, lines };
            };
            let size = fontSize;
            let wrapped = buildWrapped(size);
            while (size > minFontSize && wrapped.lines.length > wrapped.maxLines) {
                size = Math.max(minFontSize, size - 0.2);
                wrapped = buildWrapped(size);
            }
            if (wrapped.lines.length === 0)
                return;
            let lines = wrapped.lines;
            if (lines.length > wrapped.maxLines) {
                lines = lines.slice(0, wrapped.maxLines);
                const lastIndex = lines.length - 1;
                lines[lastIndex] = truncateToFitWidth(`${lines[lastIndex]}...`, size, maxWidth);
            }
            lines = lines
                .map((line) => truncateToFitWidth(line, size, maxWidth))
                .filter((line) => line.length > 0);
            if (lines.length === 0)
                return;
            const totalH = lines.length * wrapped.lineHeight;
            let top = cellTopFromTop + Math.max(paddingY, (cellH - totalH) / 2);
            for (const line of lines) {
                const h = customFont.heightAtSize(size, { descender: true });
                const baselineOffset = h * 0.78;
                page.drawText(line, {
                    x: cellX + paddingX,
                    y: pageHeight - (top + baselineOffset),
                    size,
                    font: customFont,
                    color: rgb(0, 0, 0),
                });
                top += wrapped.lineHeight;
            }
        };
        const drawResultRows = (page, pageHeight, rows, rowBounds, startIndex = 0) => {
            for (let i = 0; i < rowBounds.length - 1; i += 1) {
                const row = rows[startIndex + i];
                if (!row)
                    continue;
                const top = rowBounds[i];
                const h = rowBounds[i + 1] - rowBounds[i];
                drawWrappedInCell(page, pageHeight, row.content, 239, top, 104, h, 6.8);
                drawInCell(page, pageHeight, row.judgment, 343, top, 37, h, 8.6, { align: "center" });
                drawWrappedInCell(page, pageHeight, row.bad_content, 380, top, 75, h, 6.8);
                drawWrappedInCell(page, pageHeight, row.action_content, 455, top, 74, h, 6.8);
            }
        };
        const drawRightAt = (page, pageHeight, text, anchorX, rowTop, rowH, size = 8.1) => {
            if (!text)
                return;
            const textHeight = customFont.heightAtSize(size, { descender: true });
            const textTop = rowTop + (rowH - textHeight) / 2;
            const y = pageHeight - (textTop + textHeight * 0.78);
            const textWidth = customFont.widthOfTextAtSize(text, size);
            page.drawText(text, { x: anchorX - textWidth, y, size, font: customFont, color: rgb(0, 0, 0) });
        };
        const drawPeriodDate = (dateValue, anchors) => {
            const parts = parseDateParts(dateValue);
            if (!parts)
                return;
            drawRightAt(page1, p1Height, parts.year, anchors.year, PERIOD_ROW.top, PERIOD_ROW.h, 8.1);
            drawRightAt(page1, p1Height, parts.month, anchors.month, PERIOD_ROW.top, PERIOD_ROW.h, 8.1);
            drawRightAt(page1, p1Height, parts.day, anchors.day, PERIOD_ROW.top, PERIOD_ROW.h, 8.1);
        };
        drawInCell(page1, p1Height, body.form_name, 119, 100, 224, 23, 9);
        drawInCell(page1, p1Height, body.fire_manager, 406, 100, 123, 23, 8.6);
        drawInCell(page1, p1Height, body.location, 119, 123, 224, 21, 8.8);
        drawInCell(page1, p1Height, body.witness, 406, 123, 123, 21, 8.6);
        drawInCell(page1, p1Height, body.inspection_type || "機器・総合", 119, 144, 92, 21, 8.4, { align: "center" });
        const periodStart = formatDateText(body.period_start);
        const periodEnd = formatDateText(body.period_end);
        if (parseDateParts(body.period_start) || parseDateParts(body.period_end)) {
            drawPeriodDate(body.period_start, PERIOD_START_ANCHORS);
            drawPeriodDate(body.period_end, PERIOD_END_ANCHORS);
        }
        else {
            const periodText = periodStart && periodEnd ? `${periodStart} - ${periodEnd}` : (periodStart || periodEnd);
            drawInCell(page1, p1Height, periodText, 238, PERIOD_ROW.top, 291, PERIOD_ROW.h, 8.5);
        }
        drawInCell(page1, p1Height, body.inspector_name, 119, 165, 92, 42, 8.4);
        drawInCell(page1, p1Height, body.inspector_company, 280, 165, 79, 21, 8.2);
        drawInCell(page1, p1Height, body.inspector_tel, 406, 165, 123, 21, 8.2);
        drawInCell(page1, p1Height, body.inspector_address, 280, 186, 249, 21, 8.2);
        drawInCell(page1, p1Height, body.equipment_name, 119, 207, 45, 42, 7.4);
        drawInCell(page1, p1Height, body.pump_maker, 164, 207, 74, 21, 7.4);
        drawInCell(page1, p1Height, body.pump_model, 164, 228, 74, 21, 7.4);
        drawInCell(page1, p1Height, body.motor_maker, 359, 207, 96, 21, 7.4);
        drawInCell(page1, p1Height, body.motor_model, 359, 228, 96, 21, 7.4);
        drawResultRows(page1, p1Height, body.page1_rows ?? [], P1_ROW_BOUNDS);
        drawResultRows(page2, p2Height, body.page2_rows ?? [], P2_ROW_BOUNDS);
        const p3Rows = body.page3_rows ?? [];
        drawResultRows(page3, p3Height, p3Rows, P3_ROW_BOUNDS_A, 0);
        drawResultRows(page3, p3Height, p3Rows, P3_ROW_BOUNDS_B, 22);
        drawWrappedInCell(page3, p3Height, body.notes, 83, 589, 446, 43, 7.3);
        const device1 = body.device1 ?? {};
        const device2 = body.device2 ?? {};
        drawInCell(page3, p3Height, device1.name, 83, 649, 55, 14, 7.2);
        drawInCell(page3, p3Height, device1.model, 138, 649, 56, 14, 7.2);
        drawInCell(page3, p3Height, device1.calibrated_at, 194, 649, 56, 14, 7.2);
        drawInCell(page3, p3Height, device1.maker, 250, 649, 56, 14, 7.2);
        drawInCell(page3, p3Height, device2.name, 306, 649, 56, 14, 7.2);
        drawInCell(page3, p3Height, device2.model, 362, 649, 56, 14, 7.2);
        drawInCell(page3, p3Height, device2.calibrated_at, 418, 649, 56, 14, 7.2);
        drawInCell(page3, p3Height, device2.maker, 474, 649, 55, 14, 7.2);
        const pdfBytes = await pdfDoc.save();
        return new NextResponse(pdfBytes, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": 'attachment; filename="s50_kokuji14_bekki2_filled.pdf"',
            },
        });
    }
    catch (error) {
        console.error(error);
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 });
    }
}
