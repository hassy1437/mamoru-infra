// PDFコンテンツストリームをzlibで解凍して罫線座標を抽出
import { PDFDocument, PDFName, PDFArray, PDFRef } from "pdf-lib";
import fs from "fs";
import path from "path";
import zlib from "zlib";

const pdfPath = path.join(process.cwd(), "public", "bekki_soukatu.pdf");
const pdfBytes = fs.readFileSync(pdfPath);

const pdfDoc = await PDFDocument.load(pdfBytes);
const pages = pdfDoc.getPages();

for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const page = pages[pageIndex];
    const { width, height } = page.getSize();
    console.log(`\n=== Page ${pageIndex + 1} (${width} x ${height}) ===`);

    const node = page.node;
    const contentsRef = node.get(PDFName.of("Contents"));

    let refs = [];
    if (contentsRef instanceof PDFArray) {
        for (let i = 0; i < contentsRef.size(); i++) {
            refs.push(contentsRef.get(i));
        }
    } else if (contentsRef instanceof PDFRef) {
        refs.push(contentsRef);
    } else if (contentsRef) {
        refs.push(contentsRef);
    }

    let allContent = "";

    for (const ref of refs) {
        let stream;
        if (ref instanceof PDFRef) {
            stream = pdfDoc.context.lookup(ref);
        } else {
            stream = ref;
        }

        // Get raw bytes from the stream
        const rawContents = stream.contents;
        if (!rawContents) continue;

        // Check filter type
        const filterObj = stream.dict?.get(PDFName.of("Filter"));
        const filterName = filterObj?.toString?.() || "";

        let decoded;
        if (filterName.includes("FlateDecode")) {
            try {
                decoded = zlib.inflateSync(Buffer.from(rawContents));
            } catch (e) {
                // Try raw inflate
                try {
                    decoded = zlib.inflateRawSync(Buffer.from(rawContents));
                } catch (e2) {
                    console.log(`Cannot decode stream: ${e2.message}`);
                    continue;
                }
            }
        } else {
            decoded = Buffer.from(rawContents);
        }

        allContent += decoded.toString("latin1") + "\n";
    }

    // Parse the content stream for line/rectangle operations
    const lines = allContent.split(/[\r\n]+/);
    const horizontalLines = [];
    const verticalLines = [];
    const rects = [];
    let cx = 0, cy = 0; // current point

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Rectangle: x y w h re
        const rectMatch = trimmed.match(/^([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+re$/);
        if (rectMatch) {
            const [, xs, ys, ws, hs] = rectMatch;
            const x = parseFloat(xs), y = parseFloat(ys), w = parseFloat(ws), h = parseFloat(hs);
            rects.push({ x, y, w, h, topFromTop: height - y - Math.max(h, 0), left: x, right: x + w });
        }

        // MoveTo: x y m
        const moveMatch = trimmed.match(/^([\d.-]+)\s+([\d.-]+)\s+m$/);
        if (moveMatch) {
            cx = parseFloat(moveMatch[1]);
            cy = parseFloat(moveMatch[2]);
        }

        // LineTo: x y l
        const lineMatch = trimmed.match(/^([\d.-]+)\s+([\d.-]+)\s+l$/);
        if (lineMatch) {
            const lx = parseFloat(lineMatch[1]);
            const ly = parseFloat(lineMatch[2]);

            if (Math.abs(cy - ly) < 2) {
                // Horizontal line
                horizontalLines.push({
                    y: cy,
                    fromTop: height - cy,
                    x1: Math.min(cx, lx),
                    x2: Math.max(cx, lx),
                });
            } else if (Math.abs(cx - lx) < 2) {
                // Vertical line
                verticalLines.push({
                    x: cx,
                    y1: Math.min(cy, ly),
                    y2: Math.max(cy, ly),
                    fromTop1: height - Math.max(cy, ly),
                    fromTop2: height - Math.min(cy, ly),
                });
            }
            cx = lx;
            cy = ly;
        }
    }

    // Sort and output
    horizontalLines.sort((a, b) => a.fromTop - b.fromTop);
    verticalLines.sort((a, b) => a.x - b.x);

    console.log(`\n--- Horizontal Lines (${horizontalLines.length}) ---`);
    for (const hl of horizontalLines) {
        console.log(`  fromTop=${hl.fromTop.toFixed(1)}, x: ${hl.x1.toFixed(1)} - ${hl.x2.toFixed(1)} (width=${(hl.x2 - hl.x1).toFixed(1)})`);
    }

    console.log(`\n--- Vertical Lines (${verticalLines.length}) ---`);
    for (const vl of verticalLines) {
        console.log(`  x=${vl.x.toFixed(1)}, fromTop: ${vl.fromTop1.toFixed(1)} - ${vl.fromTop2.toFixed(1)} (height=${(vl.fromTop2 - vl.fromTop1).toFixed(1)})`);
    }

    if (rects.length > 0) {
        console.log(`\n--- Rectangles (${rects.length}) ---`);
        for (const r of rects) {
            console.log(`  x=${r.x.toFixed(1)}, y=${r.y.toFixed(1)}, w=${r.w.toFixed(1)}, h=${r.h.toFixed(1)} | fromTop=${r.topFromTop.toFixed(1)}`);
        }
    }
}
