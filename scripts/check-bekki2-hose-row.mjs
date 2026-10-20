// 別記様式第2（屋内消火栓）のホース・ノズルの行が、長さ・本数・口径の 3 つの欄で入り、紙に正しく出るか（2026-10-20・本番の通しチェック）。
//
// ■ なぜ要るか
//   刷り込みは「ホース ___m× ___本 ｜ ノズル径 ___mm」で空欄が 3 つあるのに、入力欄は 1 つで、
//   「長さ/本数/口径」（例 20/2/19）と書く決まりが画面のどこにも無かった。値を 1 つ書くと長さの空欄にだけ出る。
//   ★PDF はエラーなく出るので、画像の検査やベースラインでは出ない種類。
//
// ■ 検査すること
//   1. ルート: 3 つの欄（content=長さ・hose_count=本数・nozzle_dia=口径）で入れた値が、以前の "/" 区切りと同じ位置・同じ文字で出る
//      （以前に保存した "/" 区切りもそのまま読める）
//   2. 配線: 画面がホースの行（ルートと同じ 8・9 行目）に 3 つの欄を出す（机・スマホ）／以前の "/" 区切りを読むときに 3 つへ分ける
//
// 使い方: node scripts/check-bekki2-hose-row.mjs [--self-test]
import { spawnSync } from "child_process"
import fs from "fs"
import path from "path"
import { runRoutePdf } from "./run-route-pdf.mjs"

const PY = process.platform === "win32" ? "python" : "python3"
const SELF_TEST = process.argv.includes("--self-test")
// ★自己診断と本番で出力先を分ける（check-pdf-all は並列に走らせる）
const OUT = path.join("tmp", SELF_TEST ? "bekki2-hose-row-selftest" : "bekki2-hose-row")
const ROUTE = "src/app/api/generate-shokasen-bekki2-pdf/route.ts"
const FORM = "src/components/shokasen-bekki2-form.tsx"
const REAL = "tmp/pdf-realistic/bekki2_test.payload.json"
const read = (f) => fs.readFileSync(f, "utf8")

// その3 の、アプリが描いた文字（Noto・Helvetica）を位置つきで並べる
const SPANS = String.raw`
import fitz, json, sys
d = fitz.open(sys.argv[1]); out = []
p = d[2]
for b in p.get_text("dict")["blocks"]:
    for l in b.get("lines", []):
        for s in l["spans"]:
            t = s["text"].strip()
            if t and ("Noto" in s["font"] or "Helvetica" in s["font"]):
                out.append([t] + [round(v, 1) for v in s["bbox"]])
print(json.dumps(sorted(out)))
`
const spans = (pdf) => {
    const r = spawnSync(PY, ["-c", SPANS, pdf], { encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } })
    if (r.status !== 0) throw new Error(r.stderr)
    // ★PyMuPDF の版によっては import fitz の警告が標準出力に出る。最後の行だけ読む
    return JSON.parse(r.stdout.trim().split("\n").pop())
}

const LEGACY = [{ content: "20/2/19" }, { content: "15/1/25" }]
const SPLIT = [{ content: "20", hose_count: "2", nozzle_dia: "19" }, { content: "15", hose_count: "1", nozzle_dia: "25" }]
const withHose = (base, rows) => {
    const p = structuredClone(base)
    p.page3_rows[8] = { ...p.page3_rows[8], ...rows[0], hose_count: rows[0].hose_count ?? "", nozzle_dia: rows[0].nozzle_dia ?? "" }
    p.page3_rows[9] = { ...p.page3_rows[9], ...rows[1], hose_count: rows[1].hose_count ?? "", nozzle_dia: rows[1].nozzle_dia ?? "" }
    return p
}

async function routeProblems(routePath) {
    const problems = []
    const base = JSON.parse(read(REAL))
    fs.mkdirSync(OUT, { recursive: true })
    const a = await runRoutePdf({ routePath, payload: withHose(base, LEGACY), outPdfPath: path.join(OUT, "legacy.pdf") })
    const b = await runRoutePdf({ routePath, payload: withHose(base, SPLIT), outPdfPath: path.join(OUT, "split.pdf") })
    if (a.status !== 200 || b.status !== 200) return [`PDF が出ない（${a.status}・${b.status}）`]
    const sa = spans(a.outPdfPath), sb = spans(b.outPdfPath)
    for (const v of ["20", "2", "19", "15", "1", "25"]) if (!sa.some((s) => s[0] === v)) problems.push(`以前の "/" 区切りで「${v}」が出ない`)
    if (JSON.stringify(sa) !== JSON.stringify(sb)) {
        const only = sa.filter((s) => !sb.some((t) => JSON.stringify(t) === JSON.stringify(s))).map((s) => s[0])
        problems.push(`3 つの欄で入れた値が、"/" 区切りと同じに出ない（"/" 区切りにだけ出た: ${only.join("・") || "なし"}）`)
    }
    return problems
}

function wiring(route, form) {
    const problems = []
    const routeRows = route.match(/for \(const hi of \[(\d+), (\d+)\]\)/)
    const formRows = form.match(/const HOSE_ROW_INDEXES = \[(\d+), (\d+)\] as const/)
    if (!routeRows || !formRows || routeRows[1] !== formRows[1] || routeRows[2] !== formRows[2]) problems.push(`ホースの行の番号が画面とルートで違う（画面 ${formRows?.slice(1).join("・")}・ルート ${routeRows?.slice(1).join("・")}）`)
    if (!/choiceRowsOf\("\/api\/generate-shokasen-bekki2-pdf", "page3_rows"\), HOSE_ROW_INDEXES\)\}/.test(form)) problems.push(`${FORM}: （その3）の表にホースの行を渡していない`)
    if ((form.match(/\{hoseRowIndexes\?\.includes\(idx\) \? \(/g) ?? []).length < 2) problems.push(`${FORM}: 表（机・スマホ）の両方でホースの行に 3 つの欄を出していない`)
    if ((form.match(/updateRowField\(setter, idx, "hose_count", e\.target\.value\)/g) ?? []).length < 2 || (form.match(/updateRowField\(setter, idx, "nozzle_dia", e\.target\.value\)/g) ?? []).length < 2) problems.push(`${FORM}: 本数・口径の欄が無い`)
    if (!/HOSE_ROW_INDEXES as readonly number\[\]\)\.includes\(i\) \? splitLegacyHoseRow\(row\)/.test(form)) problems.push(`${FORM}: 以前の "/" 区切りを読むときに 3 つへ分けていない（長さの欄に 20/2/19 と出る）`)
    return problems
}

if (!fs.existsSync(REAL)) {
    console.log(`現実値セットが無い（${REAL}）。node scripts/check-pdf-all.mjs --regen で作ってから走らせてください`)
    process.exit(1)
}

if (SELF_TEST) {
    const neg = [...await routeProblems(ROUTE), ...wiring(read(ROUTE), read(FORM))]
    if (neg.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of neg) console.log("   ", p)
        process.exit(1)
    }
    // ルートが新しいキーを読まない（直す前）
    const mutRoute = path.join(OUT, "route-mutant", "route.ts")
    fs.mkdirSync(path.dirname(mutRoute), { recursive: true })
    const src = read(ROUTE)
    const from = 'const parts = hCount || nDia ? [hContent, hCount, nDia] : hContent.split("/")'
    if (!src.includes(from)) { console.log("自己診断: 書き換える箇所がルートに無い"); process.exit(1) }
    fs.writeFileSync(mutRoute, src.replace(from, 'const parts = hContent.split("/")'), "utf8")
    if (!(await routeProblems(mutRoute)).some((p) => p.includes("同じに出ない"))) { console.log("自己診断: ルートが新しいキーを読まない → 検出できない"); process.exit(1) }
    console.log("  陽性対照: ルートが本数・口径の欄を読まない → 検出")
    const form = read(FORM), route = read(ROUTE)
    const wireMutants = [
        ["画面のホースの行をずらす", form.replace("const HOSE_ROW_INDEXES = [8, 9] as const", "const HOSE_ROW_INDEXES = [8, 10] as const"), route, "画面とルートで違う"],
        ["（その3）にホースの行を渡さない", form.replace('"page3_rows"), HOSE_ROW_INDEXES)}', '"page3_rows"))}'), route, "ホースの行を渡していない"],
        ["以前の \"/\" 区切りを分けない", form.replace("(HOSE_ROW_INDEXES as readonly number[]).includes(i) ? splitLegacyHoseRow(row) : row", "row"), route, "3 つへ分けていない"],
    ]
    for (const [label, f, r, expect] of wireMutants) {
        if (f === form && r === route) { console.log(`自己診断: 書き換えられない: ${label}`); process.exit(1) }
        if (!wiring(r, f).some((p) => p.includes(expect))) { console.log(`自己診断: ${label} → 検出できない`); process.exit(1) }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    console.log("  陰性対照: \"/\" 区切りと 3 つの欄で同じ位置・同じ文字（2 行）・画面の配線")
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const problems = [...await routeProblems(ROUTE), ...wiring(read(ROUTE), read(FORM))]
console.log("別記2 のホース・ノズルの行を検査: \"/\" 区切りと 3 つの欄の印字を突き合わせ・画面の配線")
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("BEKKI2_HOSE_ROW_OK")
