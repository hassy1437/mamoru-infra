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
    333.33, 354.0, 374.67, 395.33, 415.33, 436.0, 456.67, 476.67, 497.33,
    518.0, 538.67, 558.67, 579.33, 600.0, 620.67, 641.33, 661.33, 682.0, 702.67,
];
const P2_ROW_BOUNDS = [
    82.67, 100.0, 116.67, 134.0, 150.67, 168.0, 184.67, 202.0, 218.67, 236.0,
    252.67, 270.0, 286.67, 304.0, 320.67, 338.0, 354.67, 372.0, 388.67, 406.0,
    422.67, 440.0, 456.67, 474.0, 490.67, 508.0, 524.67, 542.0, 558.67, 576.0,
    592.67, 610.0, 626.67, 644.0, 660.67, 678.0, 694.67,
];
const P3_ROW_BOUNDS = [
    82.67, 103.33, 124.0, 144.0, 171.33, 192.0, 212.67, 232.67, 253.33, 274.0,
    294.67, 314.67, 335.33, 356.0, 376.67, 396.67, 417.33, 438.0, 458.67, 478.67,
    499.33, 520.0, 540.67,
];
const PERIOD_ROW = { top: 161.33, h: 21.34 };
const PERIOD_START_ANCHORS = { year: 302.5, month: 340.5, day: 378.5 };
const PERIOD_END_ANCHORS = { year: 427.3, month: 465.7, day: 503.6 };
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
            path.join(process.cwd(), "public", "PDF", "s50_kokuji14_bekki9.pdf"),
            path.join(process.cwd(), "public", "s50_kokuji14_bekki9.pdf"),
        ];
        const pdfPath = candidatePdfPaths.find((p) => fs.existsSync(p));
        const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf");
        if (!pdfPath)
            throw new Error("Template PDF not found: s50_kokuji14_bekki9.pdf");
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
        const drawResultRows = (page, pageHeight, rows, rowBounds, columns) => {
            for (let i = 0; i < rowBounds.length - 1; i += 1) {
                const row = rows[i];
                if (!row)
                    continue;
                const top = rowBounds[i];
                const h = rowBounds[i + 1] - rowBounds[i];
                drawWrappedInCell(page, pageHeight, row.content, columns.contentX, top, columns.contentW, h, 6.5);
                drawInCell(page, pageHeight, row.judgment, columns.judgmentX, top, columns.judgmentW, h, 8.0, { align: "center" });
                drawWrappedInCell(page, pageHeight, row.bad_content, columns.badX, top, columns.badW, h, 6.2);
                drawWrappedInCell(page, pageHeight, row.action_content, columns.actionX, top, columns.actionW, h, 6.2);
            }
        };
        const drawRightAt = (page, pageHeight, text, anchorX, rowTop, rowH, size = 7.7) => {
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
            drawRightAt(page1, p1Height, parts.year, anchors.year, PERIOD_ROW.top, PERIOD_ROW.h, 7.7);
            drawRightAt(page1, p1Height, parts.month, anchors.month, PERIOD_ROW.top, PERIOD_ROW.h, 7.7);
            drawRightAt(page1, p1Height, parts.day, anchors.day, PERIOD_ROW.top, PERIOD_ROW.h, 7.7);
        };
        drawInCell(page1, p1Height, body.form_name, 112.0, 108.67, 237.33, 26.66, 8.7);
        drawInCell(page1, p1Height, body.fire_manager, 439.33, 108.67, 90.0, 26.66, 8.0);
        drawInCell(page1, p1Height, body.location, 112.0, 135.33, 237.33, 26.0, 8.2);
        drawInCell(page1, p1Height, body.witness, 439.33, 135.33, 90.0, 26.0, 8.0);
        drawInCell(page1, p1Height, body.inspection_type || "機器・総合", 112.0, 161.33, 96.0, 21.34, 7.7, { align: "center" });
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
            drawInCell(page1, p1Height, periodText, 208.0, PERIOD_ROW.top, 321.33, PERIOD_ROW.h, 7.7);
        }
        drawInCell(page1, p1Height, body.inspector_name, 112.0, 182.67, 96.0, 52.0, 7.7);
        drawInCell(page1, p1Height, body.inspector_company, 307.33, 182.67, 132.0, 26.0, 7.4);
        drawInCell(page1, p1Height, body.inspector_tel, 439.33, 182.67, 90.0, 26.0, 7.4);
        drawInCell(page1, p1Height, body.inspector_address, 307.33, 208.67, 222.0, 26.0, 7.3);
        // The left cells here are fixed labels (ポンチE/ 電動橁E, so avoid overwriting them.
        drawInCell(page1, p1Height, getExtra(body, "pump_maker"), 164, 207, 74, 21, 7.2);
        drawInCell(page1, p1Height, getExtra(body, "pump_model"), 164, 228, 74, 21, 7.2);
        drawInCell(page1, p1Height, getExtra(body, "motor_maker"), 359, 207, 96, 21, 7.2);
        drawInCell(page1, p1Height, getExtra(body, "motor_model"), 359, 228, 96, 21, 7.2);
        drawResultRows(page1, p1Height, body.page1_rows ?? [], P1_ROW_BOUNDS, {
            contentX: 208.0,
            contentW: 99.33,
            judgmentX: 307.33,
            judgmentW: 42.0,
            badX: 349.33,
            badW: 90.0,
            actionX: 439.33,
            actionW: 90.0,
        });
        drawResultRows(page2, p2Height, body.page2_rows ?? [], P2_ROW_BOUNDS, {
            contentX: 208.0,
            contentW: 99.33,
            judgmentX: 307.33,
            judgmentW: 42.0,
            badX: 349.33,
            badW: 90.0,
            actionX: 439.33,
            actionW: 90.0,
        });
        drawResultRows(page3, p3Height, body.page3_rows ?? [], P3_ROW_BOUNDS, {
            contentX: 216.67,
            contentW: 94.66,
            judgmentX: 311.33,
            judgmentW: 42.0,
            badX: 353.33,
            badW: 89.34,
            actionX: 442.67,
            actionW: 86.66,
        });
        drawWrappedInCell(page3, p3Height, body.notes, 82.67, 540.67, 446.66, 88.66, 7.2);
        const device1 = body.device1 ?? {};
        const device2 = body.device2 ?? {};
        drawInCell(page3, p3Height, device1.name, 83, 649, 55, 14, 7.0);
        drawInCell(page3, p3Height, device1.model, 138, 649, 56, 14, 7.0);
        drawInCell(page3, p3Height, device1.calibrated_at, 194, 649, 56, 14, 7.0);
        drawInCell(page3, p3Height, device1.maker, 250, 649, 56, 14, 7.0);
        drawInCell(page3, p3Height, device2.name, 306, 649, 56, 14, 7.0);
        drawInCell(page3, p3Height, device2.model, 362, 649, 56, 14, 7.0);
        drawInCell(page3, p3Height, device2.calibrated_at, 418, 649, 56, 14, 7.0);
        drawInCell(page3, p3Height, device2.maker, 474, 649, 55, 14, 7.0);
        const pdfBytes = await pdfDoc.save();
        return new NextResponse(pdfBytes, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": 'attachment; filename="s50_kokuji14_bekki9_filled.pdf"',
            },
        });
    }
    catch (error) {
        console.error(error);
        return NextResponse.json({ error: "PDF generation failed" }, { status: 500 });
    }
}
