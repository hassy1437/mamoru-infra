import { PDFArray, PDFDict, PDFDocument, PDFRawStream, PDFRef, PDFStream, type PDFObject } from "pdf-lib"

/**
 * 各様式の PDF を 1 つに綴じる（「一括ダウンロード」と「オーナーへ納品」の共通・build-merged-report.ts から呼ぶ）。
 *
 * ■ ★中身が同じストリームは 1 つにまとめる（#27・2026-10-06）
 *   各様式のルートは NotoSansJP を丸ごと（subset:false）埋め込むので、フォントの本体
 *   （3,139,425 バイト）が様式の数だけ同じバイトで入る。現実値の 26 様式を綴じると
 *   88,653,698 バイトのうち 81,625,050 バイトがこの重複で、Storage（report-deliveries）の
 *   上限 50MB を超えてオーナーへ納品できなかった（別記 11 様式前後が上限・本番で実測）。
 *   ★まとめるのは「辞書もバイトも完全に同じ」ストリームだけ。参照を付け替えるだけなので
 *     描画は変わらない（全ページの描画結果が一致することを scripts/check-merged-report-size.mjs で見る）。
 *   ★各様式のルート（subset:false）には触らない。subset:true は CJK グリフが落ちる（pdf-form-helpers.ts）。
 */

/** これより小さいストリームはまとめる対象にしない（重複して効くのはフォント本体の大きさ） */
const MIN_DEDUPE_BYTES = 64 * 1024

export type MergeResult = {
    bytes: Uint8Array
    pageCount: number
    /** まとめて消したストリームの数とバイト数（確かめ用） */
    dedupedStreams: number
    dedupedBytes: number
}

/**
 * @param options.dedupe ★検査（まとめる前との描画の突き合わせ）のためだけの口。本番では渡さない。
 */
export async function mergePdfBuffers(
    buffers: ArrayBuffer[],
    options: { dedupe?: boolean } = {},
): Promise<MergeResult> {
    const merged = await PDFDocument.create()
    for (const buf of buffers) {
        const donor = await PDFDocument.load(buf)
        const pages = await merged.copyPages(donor, donor.getPageIndices())
        for (const page of pages) merged.addPage(page)
    }
    const deduped = options.dedupe === false ? { streams: 0, bytes: 0 } : dedupeIdenticalStreams(merged)
    const bytes = await merged.save()
    return { bytes, pageCount: merged.getPageCount(), dedupedStreams: deduped.streams, dedupedBytes: deduped.bytes }
}

function dedupeIdenticalStreams(doc: PDFDocument): { streams: number; bytes: number } {
    const context = doc.context
    // 長さ＋辞書の書き出しで仕分け、同じ組の中だけバイトを突き合わせる。
    // ★辞書に参照（"12 0 R"）を含むものは様式ごとに番号が違うので、まとまらない側に倒れる。
    const kept = new Map<string, { ref: PDFRef; stream: PDFRawStream }[]>()
    const replace = new Map<string, PDFRef>()
    let bytes = 0
    for (const [ref, obj] of context.enumerateIndirectObjects()) {
        if (!(obj instanceof PDFRawStream) || obj.contents.length < MIN_DEDUPE_BYTES) continue
        const key = `${obj.contents.length}\n${obj.dict.toString()}`
        const group = kept.get(key) ?? []
        const same = group.find((k) => sameBytes(k.stream.contents, obj.contents))
        if (same) {
            replace.set(ref.tag, same.ref)
            bytes += obj.contents.length
        } else {
            group.push({ ref, stream: obj })
            kept.set(key, group)
        }
    }
    if (replace.size === 0) return { streams: 0, bytes: 0 }

    for (const [, obj] of context.enumerateIndirectObjects()) relink(obj, replace)
    for (const [ref] of context.enumerateIndirectObjects()) {
        if (replace.has(ref.tag)) context.delete(ref)
    }
    return { streams: replace.size, bytes }
}

/** 消すストリームを指している参照を、残すほうへ付け替える（辞書・配列・ストリームの辞書をたどる） */
function relink(obj: PDFObject, replace: Map<string, PDFRef>): void {
    if (obj instanceof PDFDict) {
        for (const [key, value] of obj.entries()) {
            const to = value instanceof PDFRef ? replace.get(value.tag) : undefined
            if (to) obj.set(key, to)
            else relink(value, replace)
        }
    } else if (obj instanceof PDFArray) {
        for (let i = 0; i < obj.size(); i++) {
            const value = obj.get(i)
            const to = value instanceof PDFRef ? replace.get(value.tag) : undefined
            if (to) obj.set(i, to)
            else relink(value, replace)
        }
    } else if (obj instanceof PDFStream) {
        relink(obj.dict, replace)
    }
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false
    }
    return true
}
