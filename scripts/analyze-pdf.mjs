// PDFのコンテンツストリームを解析し、罫線の座標を抽出するスクリプト
import { PDFDocument } from "pdf-lib";
import fs from "fs";
import path from "path";

const pdfPath = path.join(process.cwd(), "public", "bekki_soukatu.pdf");
const pdfBytes = fs.readFileSync(pdfPath);

const pdfDoc = await PDFDocument.load(pdfBytes);
const pages = pdfDoc.getPages();

for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const page = pages[pageIndex];
    const { width, height } = page.getSize();
    console.log(`\n=== Page ${pageIndex + 1} ===`);
    console.log(`Size: ${width} x ${height} (A4 = 595.28 x 841.89)`);

    // コンテンツストリームのオペレーターを取得
    const ref = page.node.get(PDFDocument.prototype.context ? undefined : undefined);

    // pdf-libのページからcontentStreamを直接取得
    const dict = page.node;
    const contentsRef = dict.get(pdfDoc.context.obj("Contents"));

    // Contentsが配列の場合とストリーム単体の場合に対応
    let streamRefs = [];
    if (contentsRef && contentsRef.constructor.name === "PDFArray") {
        for (let i = 0; i < contentsRef.size(); i++) {
            streamRefs.push(contentsRef.get(i));
        }
    } else if (contentsRef) {
        streamRefs.push(contentsRef);
    }

    // 各ストリームの内容をデコードして解析
    for (const streamRef of streamRefs) {
        let stream;
        if (streamRef.constructor.name === "PDFRef") {
            stream = pdfDoc.context.lookup(streamRef);
        } else {
            stream = streamRef;
        }

        if (!stream || !stream.getContents) continue;

        const content = stream.getContents();
        const text = new TextDecoder("latin1").decode(content);

        // 罫線（re = rectangle, m/l = moveTo/lineTo）を抽出
        const lines = text.split("\n");
        const rects = [];
        const paths = [];
        let currentPath = [];

        for (const line of lines) {
            const trimmed = line.trim();

            // Rectangle: x y w h re
            const rectMatch = trimmed.match(
                /^([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+re$/
            );
            if (rectMatch) {
                const [, x, y, w, h] = rectMatch.map(Number);
                rects.push({
                    x,
                    y,
                    w,
                    h,
                    topFromTop: height - (y + h),
                    bottomFromTop: height - y,
                });
            }

            // MoveTo: x y m
            const moveMatch = trimmed.match(/^([\d.]+)\s+([\d.]+)\s+m$/);
            if (moveMatch) {
                currentPath = [
                    {
                        x: Number(moveMatch[1]),
                        y: Number(moveMatch[2]),
                        fromTop: height - Number(moveMatch[2]),
                    },
                ];
            }

            // LineTo: x y l
            const lineMatch = trimmed.match(/^([\d.]+)\s+([\d.]+)\s+l$/);
            if (lineMatch) {
                currentPath.push({
                    x: Number(lineMatch[1]),
                    y: Number(lineMatch[2]),
                    fromTop: height - Number(lineMatch[2]),
                });
            }

            // Stroke: S or s
            if (trimmed === "S" || trimmed === "s" || trimmed === "f" || trimmed === "B") {
                if (currentPath.length > 1) {
                    paths.push([...currentPath]);
                }
                currentPath = [];
            }
        }

        if (rects.length > 0) {
            console.log(`\n--- Rectangles (${rects.length}) ---`);
            for (const r of rects) {
                console.log(
                    `  rect: x=${r.x.toFixed(1)}, y=${r.y.toFixed(1)}, w=${r.w.toFixed(1)}, h=${r.h.toFixed(1)} | topFromTop=${r.topFromTop.toFixed(1)}, bottomFromTop=${r.bottomFromTop.toFixed(1)}`
                );
            }
        }

        if (paths.length > 0) {
            console.log(`\n--- Line Paths (${paths.length}) ---`);
            for (const p of paths) {
                const isHorizontal =
                    p.length === 2 &&
                    Math.abs(p[0].y - p[1].y) < 1;
                const isVertical =
                    p.length === 2 &&
                    Math.abs(p[0].x - p[1].x) < 1;

                if (isHorizontal) {
                    console.log(
                        `  H-line: x=${Math.min(p[0].x, p[1].x).toFixed(1)}-${Math.max(p[0].x, p[1].x).toFixed(1)}, fromTop=${p[0].fromTop.toFixed(1)}`
                    );
                } else if (isVertical) {
                    console.log(
                        `  V-line: x=${p[0].x.toFixed(1)}, fromTop=${Math.min(p[0].fromTop, p[1].fromTop).toFixed(1)}-${Math.max(p[0].fromTop, p[1].fromTop).toFixed(1)}`
                    );
                } else {
                    console.log(
                        `  Path: ${p.map((pt) => `(${pt.x.toFixed(1)}, fromTop=${pt.fromTop.toFixed(1)})`).join(" -> ")}`
                    );
                }
            }
        }

        // テキスト描画（Tj, TJ）も解析
        // cm, Tm変換行列を追跡
        const textOps = [];
        const allLines = text.split("\n");
        let currentTm = null;
        let currentTd = null;

        for (const line of allLines) {
            const trimmed = line.trim();

            // Text Matrix: a b c d e f Tm
            const tmMatch = trimmed.match(
                /^([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+Tm$/
            );
            if (tmMatch) {
                currentTm = { x: Number(tmMatch[5]), y: Number(tmMatch[6]) };
            }

            // Td offset
            const tdMatch = trimmed.match(/^([\d.-]+)\s+([\d.-]+)\s+Td$/);
            if (tdMatch) {
                currentTd = { x: Number(tdMatch[1]), y: Number(tdMatch[2]) };
            }

            // Tj text show
            if (trimmed.includes("Tj") || trimmed.includes("TJ")) {
                const pos = currentTm || currentTd;
                if (pos) {
                    textOps.push({
                        x: pos.x,
                        y: pos.y,
                        fromTop: height - pos.y,
                        line: trimmed.substring(0, 80),
                    });
                }
            }
        }

        if (textOps.length > 0) {
            console.log(`\n--- Text Positions (${textOps.length}) ---`);
            for (const t of textOps) {
                console.log(
                    `  text at x=${t.x.toFixed(1)}, fromTop=${t.fromTop.toFixed(1)}: ${t.line}`
                );
            }
        }
    }
}
