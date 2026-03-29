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
    336.0, 350.67, 365.33, 380.0, 394.0, 408.67, 423.33, 438.0, 452.0, 466.67,
    481.33, 496.0, 510.0, 524.67, 539.33, 554.0, 568.0, 582.67, 597.33, 612.0,
    626.0, 640.67, 655.33, 670.0, 684.0, 698.67,
];
const P2_ROW_BOUNDS = [
    82.67, 104.0, 124.67, 146.0, 168.67, 190.0, 210.67, 232.0, 252.67, 274.0,
    294.67, 316.0, 336.67, 358.0,
];
const PERIOD_ROW = { top: 166.67, h: 28.0 };
const PERIOD_START_ANCHORS = { year: 293.3, month: 335.8, day: 377.3 };
const PERIOD_END_ANCHORS = { year: 430.3, month: 472.5, day: 514.0 };
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
            path.join(process.cwd(), "public", "PDF", "s50_kokuji14_bekki10.pdf"),
            path.join(process.cwd(), "public", "s50_kokuji14_bekki10.pdf"),
        ];
        const pdfPath = candidatePdfPaths.find((v) => fs.existsSync(v));
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf");
        if (!pdfPath)
            throw new Error("Template PDF not found: s50_kokuji14_bekki10.pdf");
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
        const drawResultRows = (page, pageHeight, rows, rowBounds, columns) => {
            for (let i = 0; i < rowBounds.length - 1; i += 1) {
                const row = rows[i];
                if (!row)
                    continue;
                const top = rowBounds[i];
                const h = rowBounds[i + 1] - top;
                drawWrappedInCell(page, pageHeight, row.content, columns.contentX, top, columns.contentW, h, 6.4);
                drawInCell(page, pageHeight, row.judgment, columns.judgmentX, top, columns.judgmentW, h, 7.8, { align: "center" });
                drawWrappedInCell(page, pageHeight, row.bad_content, columns.badX, top, columns.badW, h, 6.2);
                drawWrappedInCell(page, pageHeight, row.action_content, columns.actionX, top, columns.actionW, h, 6.2);
            }
        };
        const drawRightAt = (page, pageHeight, text, anchorX, rowTop, rowH, size = 7.6) => {
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
            drawRightAt(page1, p1Height, parts.year, anchors.year, PERIOD_ROW.top, PERIOD_ROW.h, 7.6);
            drawRightAt(page1, p1Height, parts.month, anchors.month, PERIOD_ROW.top, PERIOD_ROW.h, 7.6);
            drawRightAt(page1, p1Height, parts.day, anchors.day, PERIOD_ROW.top, PERIOD_ROW.h, 7.6);
        };
        // header page1
        drawInCell(page1, p1Height, body.form_name, 106.67, 110.67, 330.66, 28.0, 8.8);
        drawInCell(page1, p1Height, body.fire_manager, 437.33, 110.67, 92.0, 28.0, 8.0);
        drawInCell(page1, p1Height, body.location, 106.67, 138.67, 330.66, 28.0, 8.2);
        drawInCell(page1, p1Height, body.witness, 437.33, 138.67, 92.0, 28.0, 8.0);
        drawInCell(page1, p1Height, body.inspection_type || "機器・総合", 106.67, 166.67, 104.66, 28.0, 7.6, { align: "center" });
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
            drawInCell(page1, p1Height, periodText, 211.33, PERIOD_ROW.top, 318.0, PERIOD_ROW.h, 7.6);
        }
        drawInCell(page1, p1Height, body.inspector_name, 106.67, 194.67, 104.66, 52.66, 7.6);
        drawInCell(page1, p1Height, body.inspector_company, 306.0, 194.67, 131.33, 26.33, 7.4);
        drawInCell(page1, p1Height, body.inspector_tel, 437.33, 194.67, 92.0, 26.33, 7.4);
        drawInCell(page1, p1Height, body.inspector_address, 306.0, 221.0, 223.33, 26.33, 7.2);
        // The "本佁E cell is a fixed label in this template, so we do not draw equipment_name here.
        drawInCell(page1, p1Height, getExtra(body, "body_maker"), 264.4, 221.33, 264.93, 23.34, 7.2);
        drawInCell(page1, p1Height, getExtra(body, "body_model"), 264.4, 244.67, 264.93, 23.33, 7.2);
        drawResultRows(page1, p1Height, body.page1_rows ?? [], P1_ROW_BOUNDS, {
            contentX: 211.33, contentW: 94.67,
            judgmentX: 306.0, judgmentW: 36.67,
            badX: 342.67, badW: 94.66,
            actionX: 437.33, actionW: 92.0,
        });
        drawResultRows(page2, p2Height, body.page2_rows ?? [], P2_ROW_BOUNDS, {
            contentX: 217.0, contentW: 94.5,
            judgmentX: 311.5, judgmentW: 42.0,
            badX: 353.5, badW: 88.0,
            actionX: 441.5, actionW: 88.0,
        });
        drawWrappedInCell(page2, p2Height, body.notes, 82.67, 358.0, 446.66, 266.0, 7.0);
        const device1 = body.device1 ?? {};
        const device2 = body.device2 ?? {};
        // page2 bottom measurement table (approx.)
        const deviceTableTop = 644.8;
        const deviceTableRowH = 20.8;
        drawInCell(page2, p2Height, device1.name, 82.8, deviceTableTop, 55.6, deviceTableRowH, 7.0);
        drawInCell(page2, p2Height, device1.model, 138.4, deviceTableTop, 56.0, deviceTableRowH, 7.0);
        drawInCell(page2, p2Height, device1.calibrated_at, 194.4, deviceTableTop, 56.0, deviceTableRowH, 7.0);
        drawInCell(page2, p2Height, device1.maker, 250.4, deviceTableTop, 55.6, deviceTableRowH, 7.0);
        drawInCell(page2, p2Height, device2.name, 306.0, deviceTableTop, 56.0, deviceTableRowH, 7.0);
        drawInCell(page2, p2Height, device2.model, 362.0, deviceTableTop, 56.0, deviceTableRowH, 7.0);
        drawInCell(page2, p2Height, device2.calibrated_at, 418.0, deviceTableTop, 55.6, deviceTableRowH, 7.0);
        drawInCell(page2, p2Height, device2.maker, 473.6, deviceTableTop, 56.0, deviceTableRowH, 7.0);
        const pdfBytes = await pdfDoc.save();
        return new NextResponse(pdfBytes, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": 'attachment; filename="s50_kokuji14_bekki10_filled.pdf"',
            },
        });
    }
    catch (error) {
        console.error(error);
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 });
    }
}
