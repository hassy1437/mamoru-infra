// PDFのコンテンツストリーム生データを出力するスクリプト
import { PDFDocument, PDFName, PDFArray, PDFRef, PDFRawStream, PDFContentStream } from "pdf-lib";
import fs from "fs";
import path from "path";
import { decodePDFRawStream } from "pdf-lib/cjs/core/streams/decode.js";

const pdfPath = path.join(process.cwd(), "public", "bekki_soukatu.pdf");
const pdfBytes = fs.readFileSync(pdfPath);

const pdfDoc = await PDFDocument.load(pdfBytes);
const pages = pdfDoc.getPages();

for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const page = pages[pageIndex];
    const { width, height } = page.getSize();
    console.log(`\n=== Page ${pageIndex + 1} (${width} x ${height}) ===\n`);

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

    console.log(`Content streams: ${refs.length}`);

    for (const ref of refs) {
        let stream;
        if (ref instanceof PDFRef) {
            stream = pdfDoc.context.lookup(ref);
        } else {
            stream = ref;
        }

        console.log(`Stream type: ${stream?.constructor?.name}`);

        // Try to get decoded contents
        let bytes;
        try {
            if (stream.getContents) {
                bytes = stream.getContents();
            } else if (stream.contents) {
                bytes = stream.contents;
            } else if (stream.encode) {
                bytes = stream.encode();
            }
        } catch (e) {
            console.log(`Error getting contents: ${e.message}`);
            // try raw decode
            try {
                const decoded = decodePDFRawStream(stream);
                bytes = decoded.decode();
            } catch (e2) {
                console.log(`Error decoding: ${e2.message}`);
            }
        }

        if (bytes) {
            const text = new TextDecoder("latin1").decode(bytes);
            // Print first 5000 chars
            console.log(text.substring(0, 5000));
            if (text.length > 5000) {
                console.log(`... (${text.length} total chars)`);
            }
        }
    }
}
