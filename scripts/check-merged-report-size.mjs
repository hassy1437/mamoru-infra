// 結合PDF（一括ダウンロード・オーナーへ納品）が納品の上限に収まり、見た目が変わらないかを検査する。
//
// ■ なぜ要るか（#27・2026-10-06）
//   各様式のルートは NotoSansJP を丸ごと埋め込むので、綴じるとフォント本体（約 3.1MB）が
//   様式の数だけ重なる。現実値の 26 様式で 88,653,698 バイトになり、Storage（report-deliveries）の
//   上限 50MB を超えて、本番で 17 種の物件がオーナーへ納品できなかった（別記 11 様式前後が上限）。
//   src/lib/merge-pdf-buffers.ts が「辞書もバイトも同じストリーム」を 1 つにまとめて直した。
//   ★まとめる処理が消えても、ルートが様式ごとに違うバイトのフォントを入れ始めても、
//     画面では何も起きず納品のときだけ落ちる。＝ここで見ないと次に気付くのは業者。
//
// ■ 検査すること（tmp/pdf-realistic の全様式を、本番の mergePdfBuffers でそのまま綴じる）
//   1. 大きさが納品の上限（52,428,800 バイト）より小さい
//      ★上限は mamoruinfra-web の supabase/migrations（report-deliveries の file_size_limit）。別リポジトリなのでここに写す
//   2. 64KB 以上のストリームに「辞書もバイトも同じもの」が 2 つ以上残っていない
//   3. まとめない結合と、全ページの描画（150dpi）と文字の抜き出しが一致する（★見た目が変わらない）
//   4. ページ数 ＝ 各様式のページ数の合計
//
// 使い方: node scripts/check-merged-report-size.mjs [--self-test]
//   ★tmp/pdf-realistic が要る（node scripts/generate-realistic-route-tests.mjs か check-pdf-all --regen）
import { spawnSync } from "child_process"
import fs from "fs"
import path from "path"
import ts from "typescript"
import { pathToFileURL } from "url"
import { PDFDocument, PDFRawStream } from "pdf-lib"

const ROOT = process.cwd()
const PY = process.platform === "win32" ? "python" : "python3"
const DELIVERY_LIMIT = 52_428_800
const MIN_STREAM = 64 * 1024
const DIR = path.join(ROOT, "tmp", "pdf-realistic")
// ★自己診断と本番で出力先を分ける（2026-10-07）。check-pdf-all は両方を並列に走らせ、同じ merged.pdf /
//   merged-plain.pdf を書き合っていた。片方の突き合わせの最中にもう片方が上書きし、CI で自己診断の陰性対照が
//   「全 66 ページ違う」で落ちた（手元では間に合って通っていた）。
const OUT = path.join(ROOT, "tmp", process.argv.includes("--self-test") ? "merged-report-size-selftest" : "merged-report-size")
fs.mkdirSync(OUT, { recursive: true })

// ★本番の実体を読む（写しを検査すると、本番だけ戻されても緑のまま）。load-pdf-helpers.mjs と同じ形
async function loadMerge() {
    const src = fs.readFileSync(path.join(ROOT, "src", "lib", "merge-pdf-buffers.ts"), "utf8")
    const js = ts.transpileModule(src, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText
    const outPath = path.join(OUT, "merge-pdf-buffers.generated.mjs")   // ★これも並列の相手と分ける
    fs.writeFileSync(outPath, js)
    return (await import(pathToFileURL(outPath).href)).mergePdfBuffers
}

/** 報告書・総括表・点検者一覧・別記（__ の付いた派生は除く） */
const inputNames = () => fs.existsSync(DIR)
    ? fs.readdirSync(DIR).filter((f) => /^(houkoku|soukatu|itiran|bekki[\d_]+)_test\.pdf$/.test(f)).sort()
    : []
const toArrayBuffer = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)

/** 64KB 以上で「辞書もバイトも同じ」ストリームが余分に何個あるか */
async function countDuplicateStreams(bytes) {
    const doc = await PDFDocument.load(bytes)
    const seen = new Map()
    let dup = 0
    for (const [, obj] of doc.context.enumerateIndirectObjects()) {
        if (!(obj instanceof PDFRawStream) || obj.contents.length < MIN_STREAM) continue
        const key = `${obj.contents.length}\n${obj.dict.toString()}`
        const list = seen.get(key) ?? []
        if (list.some((c) => Buffer.from(c).equals(Buffer.from(obj.contents)))) dup += 1
        else list.push(obj.contents)
        seen.set(key, list)
    }
    return dup
}

/** 2 つの PDF の全ページを描画して画素と文字を突き合わせる。違うページ数を返す */
function compareRender(a, b) {
    const code = [
        "import hashlib, json, sys, fitz",
        "a, b = fitz.open(sys.argv[1]), fitz.open(sys.argv[2]); m = fitz.Matrix(150/72, 150/72); bad = []",
        "for i in range(max(a.page_count, b.page_count)):",
        "    if i >= a.page_count or i >= b.page_count: bad.append(i + 1); continue",
        "    pa, pb = a[i].get_pixmap(matrix=m, alpha=False), b[i].get_pixmap(matrix=m, alpha=False)",
        "    if hashlib.sha256(pa.samples).digest() != hashlib.sha256(pb.samples).digest() or a[i].get_text() != b[i].get_text(): bad.append(i + 1)",
        "print(json.dumps({'pages': [a.page_count, b.page_count], 'bad': bad}))",
    ].join("\n")
    const r = spawnSync(PY, ["-c", code, a, b], { encoding: "utf8", maxBuffer: 1 << 24 })
    if (r.status !== 0) throw new Error(`描画の突き合わせに失敗: ${r.stderr}`)
    return JSON.parse(r.stdout.trim().split("\n").pop())
}

async function judge(mergePdfBuffers, names, options, { render = true } = {}) {
    const problems = []
    const bufs = names.map((n) => fs.readFileSync(path.join(DIR, n)))
    let pagesSum = 0
    for (const b of bufs) pagesSum += (await PDFDocument.load(b)).getPageCount()
    const merged = await mergePdfBuffers(bufs.map(toArrayBuffer), options)
    const plain = await mergePdfBuffers(bufs.map(toArrayBuffer), { dedupe: false })
    if (merged.bytes.length >= DELIVERY_LIMIT) {
        problems.push(`大きさ ${merged.bytes.length.toLocaleString()} バイトが納品の上限 ${DELIVERY_LIMIT.toLocaleString()} 以上`)
    }
    const dup = await countDuplicateStreams(merged.bytes)
    if (dup > 0) problems.push(`64KB 以上の同じストリームが ${dup} 個余分に残っている`)
    if (merged.pageCount !== pagesSum) problems.push(`ページ数 ${merged.pageCount} ≠ 各様式の合計 ${pagesSum}`)
    const a = path.join(OUT, "merged.pdf")
    const b = path.join(OUT, "merged-plain.pdf")
    fs.writeFileSync(a, merged.bytes)
    fs.writeFileSync(b, plain.bytes)
    if (!render) return { problems, merged, plain, pagesSum, pages: null, out: a }
    const cmp = compareRender(a, b)
    if (cmp.bad.length) problems.push(`まとめない結合と描画・文字が違うページ: ${cmp.bad.join(", ")}`)
    return { problems, merged, plain, pagesSum, pages: cmp.pages, out: a }
}

const mergePdfBuffers = await loadMerge()
const names = inputNames()
if (names.length < 26) {
    // ★空振りで緑にしない（生成していない端末で「0 件を検査して OK」にならないように）
    console.log(`★NG: tmp/pdf-realistic の様式が ${names.length} 件（26 件あるはず）。generate-realistic-route-tests.mjs を走らせること`)
    process.exit(1)
}

if (process.argv.includes("--self-test")) {
    // 陰性対照: 今の状態が全部通る
    const ok = await judge(mergePdfBuffers, names, {})
    if (ok.problems.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of ok.problems) console.log("   ", p)
        process.exit(1)
    }
    console.log(`  陰性対照: ${names.length} 様式を綴じて ${ok.merged.bytes.length.toLocaleString()} バイト・重複 0・描画一致`)
    // 陽性対照 1: まとめる処理を外すと、上限超えと重複の両方を検出する（★描画はまとめない同士なので比べない）
    const off = await judge(mergePdfBuffers, names, { dedupe: false }, { render: false })
    const caughtSize = off.problems.some((p) => p.includes("上限"))
    const caughtDup = off.problems.some((p) => p.includes("同じストリーム"))
    if (!caughtSize || !caughtDup) {
        console.log(`自己診断: まとめないで綴じても検出できない（上限 ${caughtSize}・重複 ${caughtDup}）`)
        process.exit(1)
    }
    console.log(`  陽性対照: まとめないで綴じる → ${off.merged.bytes.length.toLocaleString()} バイトで上限超え・重複を検出`)
    // 陽性対照 2: 描画の突き合わせが 1 ページの違いを拾う（地下階の有無だけ違う報告書に差し替える）
    const swapped = names.map((n) => (n === "houkoku_test.pdf" ? "houkoku_test__no_basement.pdf" : n))
    const other = await mergePdfBuffers(swapped.map((n) => toArrayBuffer(fs.readFileSync(path.join(DIR, n)))))
    const otherPath = path.join(OUT, "merged-swapped.pdf")
    fs.writeFileSync(otherPath, other.bytes)
    const cmp = compareRender(ok.out, otherPath)
    if (cmp.bad.length === 0) {
        console.log("自己診断: 報告書を差し替えても描画の違いを検出できない")
        process.exit(1)
    }
    console.log(`  陽性対照: 報告書だけ地下階なしに差し替える → 違うページ ${cmp.bad.join(", ")} を検出`)
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const r = await judge(mergePdfBuffers, names, {})
console.log(`結合PDFを検査: ${names.length} 様式・${r.pagesSum} ページ`)
console.log(`  まとめない ${r.plain.bytes.length.toLocaleString()} → まとめる ${r.merged.bytes.length.toLocaleString()} バイト`
    + `（ストリーム ${r.merged.dedupedStreams} 個・${r.merged.dedupedBytes.toLocaleString()} バイトを除いた／上限 ${DELIVERY_LIMIT.toLocaleString()}）`)
if (r.problems.length) {
    console.log("★NG:")
    for (const p of r.problems) console.log("   ", p)
    process.exit(1)
}
console.log(`  全 ${r.pages[0]} ページの描画（150dpi）と文字がまとめない結合と一致`)
console.log("MERGED_REPORT_SIZE_OK")
