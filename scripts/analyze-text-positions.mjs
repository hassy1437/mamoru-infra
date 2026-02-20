// PDFテンプレートのテキスト描画位置を抽出するスクリプト
import { PDFDocument, PDFName, PDFArray, PDFRef } from "pdf-lib";
import fs from "fs";
import path from "path";
import zlib from "zlib";

const pdfPath = path.join(process.cwd(), "public", "bekki_soukatu.pdf");
const pdfBytes = fs.readFileSync(pdfPath);
const pdfDoc = await PDFDocument.load(pdfBytes);
const pages = pdfDoc.getPages();

for (let pageIndex = 0; pageIndex < 1; pageIndex++) {
    const page = pages[pageIndex];
    const { height } = page.getSize();
    console.log(`=== Page ${pageIndex + 1} ===`);

    const node = page.node;
    const contentsRef = node.get(PDFName.of("Contents"));
    let refs = [];
    if (contentsRef instanceof PDFArray) {
        for (let i = 0; i < contentsRef.size(); i++) refs.push(contentsRef.get(i));
    } else if (contentsRef) refs.push(contentsRef);

    let allContent = "";
    for (const ref of refs) {
        let stream = ref instanceof PDFRef ? pdfDoc.context.lookup(ref) : ref;
        const rawContents = stream.contents;
        if (!rawContents) continue;
        const filterObj = stream.dict?.get(PDFName.of("Filter"));
        const filterName = filterObj?.toString?.() || "";
        let decoded;
        if (filterName.includes("FlateDecode")) {
            try { decoded = zlib.inflateSync(Buffer.from(rawContents)); }
            catch { try { decoded = zlib.inflateRawSync(Buffer.from(rawContents)); } catch { continue; } }
        } else {
            decoded = Buffer.from(rawContents);
        }
        allContent += decoded.toString("latin1") + "\n";
    }

    // テキスト描画オペレーションを解析
    // BT...ET ブロック内の Tm, Td, Tj, TJ を追跡
    const lines = allContent.split(/[\r\n]+/);
    let inTextBlock = false;
    let textMatrix = { x: 0, y: 0 };
    let currentPos = { x: 0, y: 0 };

    // 点検年月日行のy座標範囲 (fromTop 277 - 324, つまり y = 841.92-324 ~ 841.92-277 = 518 ~ 565)
    const targetYmin = 517;
    const targetYmax = 566;

    for (const line of lines) {
        const t = line.trim();

        if (t === "BT") { inTextBlock = true; continue; }
        if (t === "ET") { inTextBlock = false; continue; }

        if (!inTextBlock) continue;

        // Tm: text matrix
        const tmMatch = t.match(/^([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+Tm$/);
        if (tmMatch) {
            textMatrix = { x: parseFloat(tmMatch[5]), y: parseFloat(tmMatch[6]) };
            currentPos = { ...textMatrix };
        }

        // Td: text position offset
        const tdMatch = t.match(/^([\d.-]+)\s+([\d.-]+)\s+Td$/);
        if (tdMatch) {
            currentPos = {
                x: currentPos.x + parseFloat(tdMatch[1]),
                y: currentPos.y + parseFloat(tdMatch[2]),
            };
        }

        // Tf: font size
        const tfMatch = t.match(/\/(F\d+)\s+([\d.]+)\s+Tf$/);

        // Tj: show text
        if (t.includes("Tj") || t.includes("TJ")) {
            const fromTop = height - currentPos.y;
            // 点検年月日の行付近のみ表示（fromTop 270-330）
            if (fromTop > 270 && fromTop < 340) {
                console.log(`  x=${currentPos.x.toFixed(1)}, fromTop=${fromTop.toFixed(1)}: ${t.substring(0, 120)}`);
            }
        }
    }

    // すべてのテキスト位置を表示（ヘッダー部分）
    console.log("\n--- All text positions in header area (fromTop 100-340) ---");
    let inTextBlock2 = false;
    let tm2 = { x: 0, y: 0 };
    let cp2 = { x: 0, y: 0 };

    for (const line of lines) {
        const t = line.trim();
        if (t === "BT") { inTextBlock2 = true; tm2 = { x: 0, y: 0 }; cp2 = { x: 0, y: 0 }; continue; }
        if (t === "ET") { inTextBlock2 = false; continue; }
        if (!inTextBlock2) continue;

        const tmMatch = t.match(/^([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+Tm$/);
        if (tmMatch) {
            tm2 = { x: parseFloat(tmMatch[5]), y: parseFloat(tmMatch[6]) };
            cp2 = { ...tm2 };
        }
        const tdMatch = t.match(/^([\d.-]+)\s+([\d.-]+)\s+Td$/);
        if (tdMatch) {
            cp2 = { x: cp2.x + parseFloat(tdMatch[1]), y: cp2.y + parseFloat(tdMatch[2]) };
        }

        if (t.includes("Tj") || t.includes("TJ")) {
            const fromTop = height - cp2.y;
            if (fromTop > 100 && fromTop < 340) {
                console.log(`  x=${cp2.x.toFixed(1)}, fromTop=${fromTop.toFixed(1)}: ${t.substring(0, 150)}`);
            }
        }
    }
}
