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
    294.0, 308.0, 322.0, 336.0, 350.0, 364.0, 378.0, 392.0, 406.0, 420.0, 434.0,
    448.0, 462.0, 476.0, 490.0, 504.0, 518.0, 532.0, 546.0, 560.0, 574.0, 588.0,
    602.0, 616.0, 630.0, 644.0, 658.0, 672.0, 686.0,
];
const P2_ROW_BOUNDS = [
    82.67, 106.0, 128.67, 152.0, 174.67, 198.0, 220.67, 244.0, 266.67, 290.0,
    312.67, 336.0, 358.67, 382.0, 404.67, 428.0, 450.67, 474.0, 496.67, 520.0,
    542.67, 566.0, 588.67, 612.0, 634.67, 658.0,
];
const P3_ROW_BOUNDS = [
    82.67, 106.0, 128.67, 152.0, 174.67, 198.0, 220.67, 244.0, 266.67, 290.0,
    313.33, 336.67, 359.33,
];
const PERIOD_ROW = { top: 162.0, h: 14.0 };
const PERIOD_START_ANCHORS = { year: 312.0, month: 352.7, day: 388.7 };
const PERIOD_END_ANCHORS = { year: 436.0, month: 472.0, day: 510.0 };
const normalizeText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const getExtra = (body, key) => normalizeText(body.extra_fields?.[key]);
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
            path.join(process.cwd(), "public", "PDF", "s50_kokuji14_bekki11_1.pdf"),
            path.join(process.cwd(), "public", "s50_kokuji14_bekki11_1.pdf"),
        ];
        const pdfPath = candidatePdfPaths.find((v) => fs.existsSync(v));
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf");
        if (!pdfPath)
            throw new Error("Template PDF not found: s50_kokuji14_bekki11_1.pdf");
        const pdfDoc = await PDFDocument.load(fs.readFileSync(pdfPath));
        pdfDoc.registerFontkit(fontkit);
        const customFont = await pdfDoc.embedFont(fs.readFileSync(fontPath));
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
            page.drawText(textToDraw, { x: textX, y: pageHeight - (textTop + baselineOffset), size: currentSize, font: customFont, color: rgb(0, 0, 0) });
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
                drawWrappedInCell(page, pageHeight, row.content, cols.contentX, top, cols.contentW, h, 6.3);
                drawInCell(page, pageHeight, row.judgment, cols.judgmentX, top, cols.judgmentW, h, 7.8, { align: "center" });
                drawWrappedInCell(page, pageHeight, row.bad_content, cols.badX, top, cols.badW, h, 6.1);
                drawWrappedInCell(page, pageHeight, row.action_content, cols.actionX, top, cols.actionW, h, 6.1);
            }
        };
        const drawRightAt = (page, pageHeight, text, anchorX, rowTop, rowH, size = 7.0) => {
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
            drawRightAt(page1, p1Height, parts.year, anchors.year, PERIOD_ROW.top, PERIOD_ROW.h, 7.0);
            drawRightAt(page1, p1Height, parts.month, anchors.month, PERIOD_ROW.top, PERIOD_ROW.h, 7.0);
            drawRightAt(page1, p1Height, parts.day, anchors.day, PERIOD_ROW.top, PERIOD_ROW.h, 7.0);
        };
        // page1 header
        drawInCell(page1, p1Height, body.form_name, 83.33, 114.0, 365.34, 24.0, 8.6);
        drawInCell(page1, p1Height, body.fire_manager, 448.67, 114.0, 80.66, 24.0, 7.8);
        drawInCell(page1, p1Height, body.location, 83.33, 138.0, 365.34, 24.0, 8.1);
        drawInCell(page1, p1Height, body.witness, 448.67, 138.0, 80.66, 24.0, 7.8);
        drawInCell(page1, p1Height, body.inspection_type || "機器・総合", 83.33, 162.0, 146.67, 14.0, 7.0, { align: "center" });
        const periodText = (() => {
            const start = formatDateText(body.period_start);
            const end = formatDateText(body.period_end);
            return start && end ? `${start} - ${end}` : (start || end);
        })();
        if (parseDateParts(body.period_start) || parseDateParts(body.period_end)) {
            drawPeriodDate(body.period_start, PERIOD_START_ANCHORS);
            drawPeriodDate(body.period_end, PERIOD_END_ANCHORS);
        }
        else {
            drawInCell(page1, p1Height, periodText, 230.0, PERIOD_ROW.top, 299.33, PERIOD_ROW.h, 7.0);
        }
        drawInCell(page1, p1Height, body.inspector_name, 83.33, 176.0, 146.67, 48.0, 7.2);
        drawInCell(page1, p1Height, body.inspector_company, 335.33, 176.0, 113.34, 24.0, 7.0);
        drawInCell(page1, p1Height, body.inspector_tel, 448.67, 176.0, 80.66, 24.0, 7.0);
        drawInCell(page1, p1Height, body.inspector_address, 335.33, 200.0, 194.0, 24.0, 6.8);
        // The "受信橁E cell is a fixed label in this template, so avoid overwriting it with equipment_name.
        drawInCell(page1, p1Height, getExtra(body, "receiver_maker"), 294.8, 238.0, 234.53, 14.0, 6.8);
        drawInCell(page1, p1Height, getExtra(body, "receiver_model"), 294.8, 252.0, 234.53, 14.0, 6.8);
        drawResultRows(page1, p1Height, body.page1_rows ?? [], P1_ROW_BOUNDS, {
            contentX: 230.0, contentW: 105.33,
            judgmentX: 335.33, judgmentW: 32.0,
            badX: 367.33, badW: 81.34,
            actionX: 448.67, actionW: 80.66,
        });
        drawResultRows(page2, p2Height, body.page2_rows ?? [], P2_ROW_BOUNDS, {
            contentX: 230.0, contentW: 110.67,
            judgmentX: 340.67, judgmentW: 32.0,
            badX: 372.67, badW: 78.0,
            actionX: 450.67, actionW: 78.66,
        });
        drawResultRows(page3, p3Height, body.page3_rows ?? [], P3_ROW_BOUNDS, {
            contentX: 222.0, contentW: 105.0,
            judgmentX: 327.0, judgmentW: 34.5,
            badX: 361.5, badW: 84.0,
            actionX: 445.5, actionW: 84.0,
        });
        drawWrappedInCell(page3, p3Height, body.notes, 80.0, 359.33, 449.33, 180.0, 7.0);
        const device1 = body.device1 ?? {};
        const device2 = body.device2 ?? {};
        // page3 bottom measurement table (approx.)
        const deviceTableTop = 560.8;
        const deviceTableRowH = 20.8;
        drawInCell(page3, p3Height, device1.name, 96.0, deviceTableTop, 58.0, deviceTableRowH, 6.6);
        drawInCell(page3, p3Height, device1.model, 154.0, deviceTableTop, 36.8, deviceTableRowH, 6.6);
        drawInCell(page3, p3Height, device1.calibrated_at, 190.8, deviceTableTop, 57.2, deviceTableRowH, 6.4);
        drawInCell(page3, p3Height, device1.maker, 248.0, deviceTableTop, 56.4, deviceTableRowH, 6.4);
        drawInCell(page3, p3Height, device2.name, 304.4, deviceTableTop, 74.0, deviceTableRowH, 6.6);
        drawInCell(page3, p3Height, device2.model, 378.4, deviceTableTop, 36.8, deviceTableRowH, 6.4);
        drawInCell(page3, p3Height, device2.calibrated_at, 415.2, deviceTableTop, 57.2, deviceTableRowH, 6.2);
        drawInCell(page3, p3Height, device2.maker, 472.4, deviceTableTop, 57.2, deviceTableRowH, 6.2);
        const pdfBytes = await pdfDoc.save();
        return new NextResponse(pdfBytes, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": 'attachment; filename="s50_kokuji14_bekki11_1_filled.pdf"',
            },
        });
    }
    catch (error) {
        console.error(error);
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 });
    }
}
