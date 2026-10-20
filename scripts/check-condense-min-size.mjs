// 背の低い行で 1 行のまま 5pt を割る値を、5pt のまま横を縮めて（長体）入れているか（2026-10-20・本番の通しチェック）。
//
// ■ なぜ要るか
//   不活性ガス（第6）・ハロゲン化物（第7）の不良内容は行の高さが 11〜13pt で、5pt では 2 行が入らない。
//   17〜18 字の不良内容が 1 行のまま 4.6〜4.9pt まで縮んでいた（PDF 出力の 5pt 未満の警告が出る・判読しづらい）。
//   枠内収容の手順は 折返し → 縮小 → 字間 → 略称。縮小で 5pt を割るなら次は字間（ここでは長体・MIN_CONDENSE）。
//   ★小さい文字は正常な見た目なので、目で見る照合では「小さいな」で流れる種類。
//
// ■ 検査すること（実際に PDF を作って測る）
//   1. 本番で 5pt を割った値（第6・第7 の 13 行目）: 5pt 未満の警告が出ない・全文が出る・欄の中に収まる
//      第6 は横を縮めている（Tz）。第7 は縮めなくても 5pt で入る（縮小の刻み 0.3pt で 4.9pt に落ちていた分も拾う）
//   2. 短い値: 縮めない（★収まっている値の見た目を変えない）
//   3. 15% 縮めても入らない値: 今までどおり小さく描いて 5pt 未満の警告を出す（＝測り方が小さい文字を捉えている）
//
// 使い方: node scripts/check-condense-min-size.mjs [--self-test]
//   ★自己診断は src/lib/pdf-form-helpers.ts を一時的に書き換える（check-pdf-all では排他で走らせる）
import { spawnSync } from "child_process"
import fs from "fs"
import path from "path"
import { runRoutePdf } from "./run-route-pdf.mjs"

const PY = process.platform === "win32" ? "python" : "python3"
const SELF_TEST = process.argv.includes("--self-test")
const OUT = path.join("tmp", SELF_TEST ? "condense-min-size-selftest" : "condense-min-size")
const HELPERS = "src/lib/pdf-form-helpers.ts"

const CASES = [
    { name: "第6 の不良内容（17 字・縮めて入る）", form: "bekki6", route: "src/app/api/generate-inert-gas-bekki6-pdf/route.ts", row: 13, text: "不活性ガス消火設備の一部に損傷あり", cell: [359.33, 444.0], rowY: [444.67, 458.0], expect: "condensed" },
    { name: "第7 の不良内容（18 字・5pt で入る）", form: "bekki7", route: "src/app/api/generate-halogen-bekki7-pdf/route.ts", row: 13, text: "ハロゲン化物消火設備の一部に損傷あり", cell: [368.0, 462.67], rowY: [440.0, 451.33], expect: "fits" },
    { name: "第6 の短い不良内容（縮めない）", form: "bekki6", route: "src/app/api/generate-inert-gas-bekki6-pdf/route.ts", row: 13, text: "部品交換", cell: [359.33, 444.0], rowY: [444.67, 458.0], expect: "plain" },
    { name: "第6 の不良内容（18 字・2 行に割らず縮めて 1 行）", form: "bekki6", route: "src/app/api/generate-inert-gas-bekki6-pdf/route.ts", row: 13, text: "不活性ガス消火設備の一部に損傷ありA", cell: [359.33, 444.0], rowY: [444.67, 458.0], expect: "condensed" },
    { name: "第6 の長すぎる不良内容（15% 縮めても入らない）", form: "bekki6", route: "src/app/api/generate-inert-gas-bekki6-pdf/route.ts", row: 13, text: "不活性ガス消火設備の容器弁開放装置の一部に損傷あり", cell: [359.33, 444.0], rowY: [444.67, 458.0], expect: "small" },
]

// 1 頁目: 値の文字のかたまり（位置）と、横の倍率（Tz）がページに書かれているか
const MEASURE = String.raw`
import fitz, json, re, sys
pdf, value = sys.argv[1], sys.argv[2]
p = fitz.open(pdf)[0]
spans = []
for b in p.get_text("rawdict")["blocks"]:
    for l in b.get("lines", []):
        for s in l["spans"]:
            t = "".join(c["c"] for c in s["chars"])
            # アプリが描いた文字だけ（刷り込みの明朝の 1 字を拾わない）
            if not any(h in s["font"] for h in ("Noto", "Helvetica")):
                continue
            if t.strip() and t.strip() in value:
                spans.append([t.strip()] + [round(v, 2) for v in s["bbox"]])
tz = [float(m) for m in re.findall(rb"([0-9.]+) Tz", p.read_contents())]
full = "".join(p.get_text().split()).count(value)
print(json.dumps({"spans": spans, "tz": [v for v in tz if v < 100], "full": full}))
`
const measure = (pdf, value) => {
    const r = spawnSync(PY, ["-c", MEASURE, pdf, value], { encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } })
    if (r.status !== 0) throw new Error(r.stderr)
    // ★PyMuPDF の版によっては import fitz の警告が標準出力に出る。最後の行だけ読む
    return JSON.parse(r.stdout.trim().split("\n").pop())
}
const warnings = (headers) => {
    const b64 = headers?.["x-fit-warnings"]
    return b64 ? JSON.parse(Buffer.from(b64, "base64").toString("utf8")) : null
}

async function run() {
    const problems = []
    fs.mkdirSync(OUT, { recursive: true })
    for (const c of CASES) {
        const payload = JSON.parse(fs.readFileSync(`tmp/pdf-realistic/${c.form}_test.payload.json`, "utf8"))
        // ★他の行の長い値で別の警告が混ざらないよう、この行以外の不良内容・措置内容は空にする
        for (const k of Object.keys(payload)) if (k.endsWith("_rows")) payload[k] = payload[k].map((r) => ({ ...r, bad_content: "", action_content: "" }))
        payload.page1_rows[c.row] = { ...payload.page1_rows[c.row], judgment: "否", bad_content: c.text }
        const pdf = path.join(OUT, `${c.form}-${c.expect}.pdf`)
        const res = await runRoutePdf({ routePath: c.route, payload, outPdfPath: pdf })
        if (res.status !== 200) { problems.push(`${c.name}: PDF が出ない（${res.status}）`); continue }
        const small = (warnings(res.headers)?.belowMin ?? []).filter((w) => w.text === c.text)
        const m = measure(pdf, c.text)
        // その行（縦の範囲）の、値のかたまりだけを見る（同じページのほかの欄の 1 字を拾わない）
        const own = m.spans.filter(([, , y0, , y1]) => (y0 + y1) / 2 >= c.rowY[0] && (y0 + y1) / 2 <= c.rowY[1])
        const inCell = own.length > 0 && own.every(([, x0, , x1]) => x0 >= c.cell[0] - 0.5 && x1 <= c.cell[1] + 0.5)
        if (c.expect === "small") {
            if (!small.length) problems.push(`${c.name}: 5pt 未満の警告が出ない（測り方が小さい文字を捉えていない）`)
            if (m.tz.length) problems.push(`${c.name}: 15% を超えて横を縮めている（Tz ${m.tz.join("・")}）`)
            continue
        }
        if (small.length) problems.push(`${c.name}: 5pt 未満の警告が出る（${small.map((w) => w.size).join("・")}pt）`)
        if (m.full < 1) problems.push(`${c.name}: 全文が出ていない`)
        if (!inCell) problems.push(`${c.name}: 欄（x ${c.cell.join("〜")}）からはみ出す: ${JSON.stringify(own)}`)
        if (c.expect === "condensed" && !(m.tz.length && m.tz.every((v) => v >= 85 && v < 100))) problems.push(`${c.name}: 横を縮めて入れていない（Tz ${JSON.stringify(m.tz)}）`)
        if (c.expect !== "condensed" && m.tz.length) problems.push(`${c.name}: 縮めなくてよい値を縮めている（Tz ${m.tz.join("・")}）`)
    }
    return problems
}

if (!fs.existsSync("tmp/pdf-realistic/bekki6_test.payload.json")) {
    console.log("現実値セットが無い。node scripts/check-pdf-all.mjs --regen で作ってから走らせてください")
    process.exit(1)
}

if (SELF_TEST) {
    const neg = await run()
    if (neg.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of neg) console.log("   ", p)
        process.exit(1)
    }
    const src = fs.readFileSync(HELPERS, "utf8")
    const mutants = [
        ["長体をやめる（直す前）", "export const MIN_CONDENSE = 0.85", "export const MIN_CONDENSE = 1.01", "5pt 未満の警告が出る"],
        ["縮める下限を緩めすぎる（50%）", "export const MIN_CONDENSE = 0.85", "export const MIN_CONDENSE = 0.5", "15% を超えて横を縮めている"],
        ["収まる値まで縮める", "    if (width <= maxWidth) return 1\n", "    if (width <= maxWidth) return 0.95\n", "縮めなくてよい値を縮めている"],
    ]
    // ★process.exit は finally を飛ばす（書き換えたまま残る）。失敗は印だけ付けて、元に戻してから終わる
    let failed = false
    try {
        for (const [label, from, to, expect] of mutants) {
            if (!src.includes(from)) { console.log(`自己診断: 書き換える箇所が ${HELPERS} に無い: ${from}`); failed = true; break }
            fs.writeFileSync(HELPERS, src.replace(from, to), "utf8")
            const got = await run()
            if (!got.some((p) => p.includes(expect))) { console.log(`自己診断: ${label} → 検出できない`); for (const p of got) console.log("   ", p); failed = true; break }
            console.log(`  陽性対照: ${label} → 検出`)
        }
    } finally {
        fs.writeFileSync(HELPERS, src, "utf8")
    }
    if (failed) process.exit(1)
    console.log(`  陰性対照: ${CASES.length} 通り（縮めて入る・5pt で入る・短い値・2 行に割れていた値・長すぎる値）`)
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const problems = await run()
console.log(`長体で 5pt を守る検査: ${CASES.length} 通り`)
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("CONDENSE_MIN_SIZE_OK")
