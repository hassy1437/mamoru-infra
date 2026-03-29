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
    324.0, 340.56, 357.0, 373.56, 390.0, 406.56, 423.0, 439.56, 456.0, 472.56, 489.0, 505.56,
    522.0, 538.56, 555.0, 571.56, 588.0, 604.56, 621.0, 637.56, 654.0, 670.56, 687.0, 703.56,
];
const P2_ROW_BOUNDS = [105.96, 129.0, 152.04, 174.96, 198.0];
const PERIOD_ROW = { top: 162.0, h: 14.0 };
const PERIOD_START_ANCHORS = { year: 316.5, month: 353.0, day: 388.5 };
const PERIOD_END_ANCHORS = { year: 440.0, month: 476.5, day: 512.0 };
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
            path.join(process.cwd(), "public", "PDF", "s50_kokuji14_bekki12.pdf"),
            path.join(process.cwd(), "public", "s50_kokuji14_bekki12.pdf"),
        ];
        const pdfPath = candidatePdfPaths.find((v) => fs.existsSync(v));
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf");
        if (!pdfPath)
            throw new Error("Template PDF not found: s50_kokuji14_bekki12.pdf");
        const pdfDoc = await PDFDocument.load(fs.readFileSync(pdfPath));
        pdfDoc.registerFontkit(fontkit);
        const customFont = await pdfDoc.embedFont(fs.readFileSync(fontPath));
        const [page1, page2] = pdfDoc.getPages();
        const p1Height = page1.getSize().height;
        const p2Height = page2.getSize().height;
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
        const drawInCell = (page, pageHeight, text, cellX, cellTopFromTop, cellW, cellH, fontSize = 9, options) => {
            const normalized = normalizeText(text);
            if (!normalized)
                return;
            const paddingX = options?.paddingX ?? 2.5;
            const paddingY = options?.paddingY ?? 1.6;
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
            const textToDraw = truncateToFitWidth(normalized, currentSize, maxWidth);
            if (!textToDraw)
                return;
            const textWidth = customFont.widthOfTextAtSize(textToDraw, currentSize);
            const textHeight = customFont.heightAtSize(currentSize, { descender: true });
            let textX = cellX + paddingX;
            if (options?.align === "center")
                textX = cellX + (cellW - textWidth) / 2;
            const textTop = cellTopFromTop + (cellH - textHeight) / 2;
            const baselineOffset = textHeight * 0.78;
            page.drawText(textToDraw, {
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
            const paddingX = 2.0;
            const paddingY = 1.0;
            const minFontSize = 4.5;
            const maxWidth = Math.max(1, cellW - paddingX * 2);
            const maxHeight = Math.max(1, cellH - paddingY * 2);
            const tokenize = (value) => {
                if (value.includes(" "))
                    return value.split(/(\s+)/).filter((v) => v.length > 0);
                return Array.from(value);
            };
            const wrapLines = (value, size) => {
                const lineHeight = size + 0.7;
                const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));
                const tokens = tokenize(value);
                const lines = [];
                let current = "";
                for (const token of tokens) {
                    if (/^\s+$/.test(token)) {
                        if (current)
                            current += " ";
                        continue;
                    }
                    const candidate = current ? `${current}${token}` : token;
                    if (customFont.widthOfTextAtSize(candidate, size) <= maxWidth) {
                        current = candidate;
                        continue;
                    }
                    if (current) {
                        lines.push(current.trimEnd());
                        current = "";
                    }
                    if (customFont.widthOfTextAtSize(token, size) > maxWidth) {
                        let chunk = "";
                        for (const ch of Array.from(token)) {
                            const next = `${chunk}${ch}`;
                            if (chunk && customFont.widthOfTextAtSize(next, size) > maxWidth) {
                                lines.push(chunk);
                                chunk = ch;
                                if (lines.length >= maxLines)
                                    break;
                            }
                            else {
                                chunk = next;
                            }
                        }
                        if (lines.length >= maxLines)
                            break;
                        current = chunk;
                    }
                    else {
                        current = token;
                    }
                    if (lines.length >= maxLines)
                        break;
                }
                if (current && lines.length < maxLines)
                    lines.push(current.trimEnd());
                return { lines, lineHeight, maxLines };
            };
            let size = fontSize;
            let wrapped = wrapLines(normalized, size);
            while (wrapped.lines.length > wrapped.maxLines && size > minFontSize) {
                size = Math.max(minFontSize, size - 0.3);
                wrapped = wrapLines(normalized, size);
                if (size <= minFontSize)
                    break;
            }
            while (size > minFontSize &&
                wrapped.lines.some((line) => customFont.widthOfTextAtSize(line, size) > maxWidth + 0.1)) {
                size = Math.max(minFontSize, size - 0.2);
                wrapped = wrapLines(normalized, size);
                if (size <= minFontSize)
                    break;
            }
            let lines = wrapped.lines;
            if (lines.length > wrapped.maxLines) {
                lines = lines.slice(0, wrapped.maxLines);
                const lastIndex = lines.length - 1;
                lines[lastIndex] = truncateToFitWidth(`${lines[lastIndex]}...`, size, maxWidth);
            }
            lines = lines
                .map((line) => truncateToFitWidth(line, size, maxWidth))
                .filter((line) => line.length > 0);
            if (!lines.length)
                return;
            const lineHeight = size + 0.7;
            const totalH = lines.length * lineHeight;
            let top = cellTopFromTop + (cellH - totalH) / 2;
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
                top += lineHeight;
            }
        };
        const drawResultRows = (page, pageHeight, rows, rowBounds, cols) => {
            for (let i = 0; i < rowBounds.length - 1; i += 1) {
                const row = rows[i];
                if (!row)
                    continue;
                const top = rowBounds[i];
                const h = rowBounds[i + 1] - top;
                drawWrappedInCell(page, pageHeight, row.content, cols.contentX, top, cols.contentW, h, 6.2);
                drawInCell(page, pageHeight, row.judgment, cols.judgmentX, top, cols.judgmentW, h, 7.4, { align: "center" });
                drawWrappedInCell(page, pageHeight, row.bad_content, cols.badX, top, cols.badW, h, 6.0);
                drawWrappedInCell(page, pageHeight, row.action_content, cols.actionX, top, cols.actionW, h, 6.0);
            }
        };
        const drawRightAt = (page, pageHeight, text, anchorX, rowTop, rowH, size = 6.8) => {
            if (!text)
                return;
            const textHeight = customFont.heightAtSize(size, { descender: true });
            const textTop = rowTop + (rowH - textHeight) / 2;
            const y = pageHeight - (textTop + textHeight * 0.78);
            const textWidth = customFont.widthOfTextAtSize(text, size);
            page.drawText(text, { x: anchorX - textWidth, y, size, font: customFont, color: rgb(0, 0, 0) });
        };
        const drawPeriodDate = (page, pageHeight, dateValue, anchors) => {
            const parts = parseDateParts(dateValue);
            if (!parts)
                return;
            drawRightAt(page, pageHeight, parts.year, anchors.year, PERIOD_ROW.top, PERIOD_ROW.h, 6.8);
            drawRightAt(page, pageHeight, parts.month, anchors.month, PERIOD_ROW.top, PERIOD_ROW.h, 6.8);
            drawRightAt(page, pageHeight, parts.day, anchors.day, PERIOD_ROW.top, PERIOD_ROW.h, 6.8);
        };
        const drawHeader = (page, pageHeight) => {
            drawInCell(page, pageHeight, body.form_name, 83.33, 114.0, 365.34, 24.0, 8.6);
            drawInCell(page, pageHeight, body.fire_manager, 448.67, 114.0, 80.66, 24.0, 7.8);
            drawInCell(page, pageHeight, body.location, 83.33, 138.0, 365.34, 24.0, 8.1);
            drawInCell(page, pageHeight, body.witness, 448.67, 138.0, 80.66, 24.0, 7.8);
            drawInCell(page, pageHeight, body.inspection_type || "", 83.33, PERIOD_ROW.top, 146.67, PERIOD_ROW.h, 7.0, { align: "center" });
            const periodText = (() => {
                const start = formatDateText(body.period_start);
                const end = formatDateText(body.period_end);
                return start && end ? `${start} - ${end}` : (start || end);
            })();
            if (parseDateParts(body.period_start) || parseDateParts(body.period_end)) {
                drawPeriodDate(page, pageHeight, body.period_start, PERIOD_START_ANCHORS);
                drawPeriodDate(page, pageHeight, body.period_end, PERIOD_END_ANCHORS);
            }
            else {
                drawInCell(page, pageHeight, periodText, 230.0, PERIOD_ROW.top, 299.33, PERIOD_ROW.h, 6.8);
            }
            drawInCell(page, pageHeight, body.inspector_name, 83.33, 176.0, 146.67, 48.0, 7.2);
            drawInCell(page, pageHeight, body.inspector_company, 335.33, 176.0, 113.34, 24.0, 7.0);
            drawInCell(page, pageHeight, body.inspector_tel, 448.67, 176.0, 80.66, 24.0, 7.0);
            drawInCell(page, pageHeight, body.inspector_address, 335.33, 200.0, 194.0, 24.0, 6.8);
        };
        drawHeader(page1, p1Height);
        drawResultRows(page1, p1Height, body.page1_rows ?? [], P1_ROW_BOUNDS, {
            contentX: 222.72,
            contentW: 99.24,
            judgmentX: 322.56,
            judgmentW: 36.24,
            badX: 359.28,
            badW: 85.32,
            actionX: 445.08,
            actionW: 84.48,
        });
        drawResultRows(page2, p2Height, body.page2_rows ?? [], P2_ROW_BOUNDS, {
            contentX: 217.56,
            contentW: 104.52,
            judgmentX: 322.56,
            judgmentW: 36.24,
            badX: 359.28,
            badW: 85.32,
            actionX: 445.08,
            actionW: 84.48,
        });
        drawWrappedInCell(page2, p2Height, body.notes, 80.52, 198.48, 449.04, 419.52, 7.0);
        const device1 = body.device1 ?? {};
        const device2 = body.device2 ?? {};
        const deviceRowTop = 618.48;
        const deviceRowH = 22.56;
        drawInCell(page2, p2Height, device1.name, 81.0, deviceRowTop, 72.96, deviceRowH, 6.4);
        drawInCell(page2, p2Height, device1.model, 154.56, deviceRowTop, 36.24, deviceRowH, 6.2);
        drawInCell(page2, p2Height, device1.calibrated_at, 191.28, deviceRowTop, 56.52, deviceRowH, 6.0);
        drawInCell(page2, p2Height, device1.maker, 248.28, deviceRowTop, 56.28, deviceRowH, 6.0);
        drawInCell(page2, p2Height, device2.name, 305.4, deviceRowTop, 72.36, deviceRowH, 6.4);
        drawInCell(page2, p2Height, device2.model, 379.08, deviceRowTop, 36.12, deviceRowH, 6.2);
        drawInCell(page2, p2Height, device2.calibrated_at, 415.68, deviceRowTop, 57.12, deviceRowH, 6.0);
        drawInCell(page2, p2Height, device2.maker, 473.28, deviceRowTop, 56.28, deviceRowH, 6.0);
        const pdfBytes = await pdfDoc.save();
        return new NextResponse(pdfBytes, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": 'attachment; filename="s50_kokuji14_bekki12_filled.pdf"',
            },
        });
    }
    catch (error) {
        console.error(error);
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 });
    }
}
