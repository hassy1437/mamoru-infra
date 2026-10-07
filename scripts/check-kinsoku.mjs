// 折り返しの禁則（行頭の「）」「ー」「、」「・」・行末の「（」）が、生成 PDF に残っていないこと（#18・2026-10-06）。
//
// ■ なぜ要るか（2026-10-05 の通し確認）
//   折り返しは幅だけで切っていて、「）」だけ・「ー」だけが次の行に送られていた
//   （措置内容・#22 で 2 行にした社名「…センタ／ー」・報告書の設備一覧「、連結送水管」）。
//   ★字は全部出ていて欠けもしないので、はみ出し・切り詰めの検査では捉えられない種類。
//
// ■ 検査すること
//   長文セット・現実値セットの生成 PDF を行に組み直し、折り返した続きの行（同じ x・同じサイズで真下）について
//   行頭が禁則文字・前の行の行末が開き括弧のものが 0 件であること。
//   ★禁則文字の一覧は src/lib/pdf-form-helpers.ts の NO_LINE_START / NO_LINE_END から読む（ここに書き写さない）。
//   ★禁則は「決まった文字サイズのまま行が入りきるときだけ」使う作りなので、入りきらない欄では残りうる。
//     残ったら、その欄の行の高さ・文字数を見て判断すること（縮めて禁則を守るかは別の判断）。
//
// 使い方: node scripts/check-kinsoku.mjs [--self-test]
import fs from "fs"
import path from "path"
import { spawnSync } from "child_process"

const ROOT = process.cwd()
const HELPERS = path.join(ROOT, "src", "lib", "pdf-form-helpers.ts")
const DIRS = ["pdf-test-bekki234", "pdf-test-bekki5678", "pdf-test-bekki9to12", "pdf-test-bekki13to22", "pdf-test-extra", "pdf-realistic"]
    .map((d) => path.join(ROOT, "tmp", d))

function charSet(name) {
    const src = fs.readFileSync(HELPERS, "utf8")
    const m = src.match(new RegExp(`export const ${name} = new Set\\(Array\\.from\\("([^"]*)"\\)\\)`))
    if (!m) throw new Error(`${name} を pdf-form-helpers.ts から読めない`)
    return new Set(Array.from(m[1]))
}

const SCAN_PY = `
import sys, json, fitz
hints = ("NotoSansJP", "Helvetica", "Arial")
res = []
for path in sys.argv[1:]:
    for pno, page in enumerate(fitz.open(path), start=1):
        spans = []
        for b in page.get_text("dict")["blocks"]:
            for l in b.get("lines", []):
                for s in l["spans"]:
                    if s["text"].strip() and any(h in s["font"] for h in hints):
                        spans.append({"x": s["bbox"][0], "x1": s["bbox"][2], "top": s["bbox"][1], "size": s["size"], "text": s["text"]})
        res.append({"pdf": path, "page": pno, "spans": spans})
print(json.dumps(res, ensure_ascii=False))
`

/** スパンを行に組み直し、折り返しの続きの行の組（前の行・次の行）を返す */
export function continuationPairs(spans) {
    const lines = []
    for (const s of [...spans].sort((a, b) => a.top - b.top || a.x - b.x)) {
        // ラン分割（英数字と日本語で別スパン）を 1 行に戻す: 同じ top・同じサイズで x が続くもの
        const line = lines.find((l) => Math.abs(l.top - s.top) < 0.3 && Math.abs(l.size - s.size) < 0.05 && Math.abs(l.x1 - s.x) < 1.5)
        if (line) {
            line.text += s.text
            line.x1 = s.x1
        } else {
            lines.push({ ...s })
        }
    }
    const pairs = []
    for (const next of lines) {
        // 折り返しの続き: 同じ x・同じサイズで、1 行ぶん（サイズの 1.6 倍以内）真下
        const prev = lines.find((q) => Math.abs(q.x - next.x) < 0.6 && Math.abs(q.size - next.size) < 0.05
            && next.top - q.top > 0.3 && next.top - q.top <= 1.6 * next.size)
        if (prev) pairs.push([prev.text.trim(), next.text.trim()])
    }
    return pairs
}

export function violations(pairs, noStart, noEnd) {
    return pairs.filter(([prev, next]) => noStart.has(Array.from(next)[0]) || noEnd.has(Array.from(prev).pop()))
}

const noStart = charSet("NO_LINE_START")
const noEnd = charSet("NO_LINE_END")

if (process.argv.includes("--self-test")) {
    // ★陽性対照: 折り返しの続きの行頭に「ー」「）」・行末に「（」を置いた行を作ると検出する
    const line = (text, top, x = 100) => ({ x, x1: x + text.length * 6, top, size: 6, text })
    const bad = [
        [line("株式会社サンプル消防設備保守センタ", 10), line("ー", 17)],
        [line("部品交換および再試験を実施予定（", 40), line("長文フィット確認用テキスト）", 47)],
        [line("消防用水、排煙設備、連結散水設備", 70), line("、連結送水管", 77)],
    ]
    for (const spans of bad) {
        const v = violations(continuationPairs(spans), noStart, noEnd)
        if (v.length !== 1) {
            console.log(`自己診断: 禁則違反を検出できない ―― ${spans.map((s) => s.text).join(" / ")}`)
            process.exit(1)
        }
    }
    // ★陰性対照: 隣の欄（x が違う）・次の行の欄（1 行ぶんより下）は続きと見なさない
    const notCont = [line("備考", 10), line("）から始まる別の欄", 10, 300), line("・別の行の欄", 40)]
    if (violations(continuationPairs(notCont), noStart, noEnd).length !== 0) {
        console.log("自己診断: 折り返しの続きでない行を違反と見なした")
        process.exit(1)
    }
    console.log(`  陽性対照: 行頭「ー」「、」・行末「（」の 3 通り → 検出`)
    console.log(`  陰性対照: 隣の欄・次の行の欄は続きと見なさない`)
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const pdfs = DIRS.filter((d) => fs.existsSync(d))
    .flatMap((d) => fs.readdirSync(d).filter((f) => f.endsWith(".pdf") && !f.includes("debug")).map((f) => path.join(d, f)))
if (pdfs.length === 0) {
    console.log("★生成 PDF が無い。先に node scripts/check-pdf-all.mjs --regen を実行すること")
    process.exit(1)
}
const r = spawnSync("python", ["-c", SCAN_PY, ...pdfs], {
    encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" }, maxBuffer: 1 << 28,
})
if (r.status !== 0) {
    console.log(`★PDF を読めない: ${r.stderr.slice(0, 500)}`)
    process.exit(1)
}
// ★結果は最後の 1 行だけ読む。PyMuPDF 1.28 は「`fitz` API is deprecated」の警告を標準出力に出し、
//   出力全体を JSON として読むと CI（requirements.txt が版を固定していなかった）だけで落ちていた（2026-10-06）
const pages = JSON.parse(r.stdout.trim().split(/\r?\n/).pop())
let pairCount = 0
const found = []
for (const pg of pages) {
    const pairs = continuationPairs(pg.spans)
    pairCount += pairs.length
    for (const [prev, next] of violations(pairs, noStart, noEnd)) {
        found.push(`${path.basename(pg.pdf)} p${pg.page}: 「${prev}」／「${next}」`)
    }
}
console.log(`禁則を検査: PDF ${pdfs.length} 本・${pages.length} ページ・折り返しの続きの行 ${pairCount} 組`)
if (pairCount === 0) {
    console.log("★折り返しの続きの行が 1 組も見つからない（行の組み直しが壊れている）")
    process.exit(1)
}
if (found.length) {
    for (const f of found.slice(0, 20)) console.log(`  NG  ${f}`)
    console.log(`\n${found.length} 件`)
    process.exit(1)
}
console.log("KINSOKU_OK")
