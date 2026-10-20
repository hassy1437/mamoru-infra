// 容器ごとの点検結果（別記6・7・8 の その5）の点検年月日（別記6 は容器表面温度も）を、測定の列の見出しに 1 回だけ書くか（2026-10-20）。
//
// ■ なぜ要るか
//   様式は点検年月日（と容器表面温度）を列の見出しに書く作り。アプリは行ごとに描き、見出しは空欄のまま、
//   入力でも容器の数だけ同じ日付を打つ必要があった（本番の通しチェック）。
//   あわせて別記7・8 は、容器の行が雛形の 2 行目から始まり、見出しのすぐ下の 1 行目を一度も使っていなかった（20 行のうち 19 行）。
//
// ■ 検査すること
//   1. src/lib/measure-headers.ts を実際に動かす（見出しの初期値・行に残す日付・温度の書き方の違い・日付の分け方）
//   2. 配線: 3 様式の画面が見出しを入れて保存し、行は違うときだけ日付を出す／ルートが見出しを描き、行は違うときだけ描く
//   3. 別記7・8 の行の位置が雛形の 1 行目（罫線の実測）から始まり、画面の行数と合う
//
// 使い方: node scripts/check-measure-headers.mjs [--self-test]
import fs from "fs"
import path from "path"
import { pathToFileURL } from "url"
import ts from "typescript"

const ROOT = process.cwd()
const SELF_TEST = process.argv.includes("--self-test")
const OUT = path.join(ROOT, "tmp", SELF_TEST ? "measure-headers-selftest" : "measure-headers")
const LIB = "src/lib/measure-headers.ts"
const FORMS = {
    "src/components/inert-gas-bekki6-form.tsx": { n: 4, temp: true, rows: 29 },
    "src/components/halogen-bekki7-form.tsx": { n: 6, temp: false, rows: 20 },
    "src/components/powder-bekki8-form.tsx": { n: 6, temp: false, rows: 20 },
}
const ROUTES = {
    "src/app/api/generate-inert-gas-bekki6-pdf/route.ts": { n: 4, firstRow: 176.0, rows: 29 },
    "src/app/api/generate-halogen-bekki7-pdf/route.ts": { n: 6, firstRow: 143.04, rows: 20 },
    "src/app/api/generate-powder-bekki8-pdf/route.ts": { n: 6, firstRow: 136.92, rows: 20 },
}
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8")

async function load(src) {
    fs.mkdirSync(OUT, { recursive: true })
    const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
    const p = path.join(OUT, `measure-headers.${Date.now()}${Math.random().toString(36).slice(2, 6)}.mjs`)
    fs.writeFileSync(p, js, "utf8")
    return import(pathToFileURL(p).href)
}

function behaviour(mod) {
    const problems = []
    const eq = (got, want, label) => { if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`${label}: ${JSON.stringify(got)}（期待 ${JSON.stringify(want)}）`) }
    // 見出しの初期値: 保存があればそれ／無ければ行の日付・温度がそろっている測定だけ
    const rows = [
        { measure1_date: "2026/10/14", measure1_temp: "20℃", measure2_date: "2026/04/15" },
        { measure1_date: "2026-10-14", measure1_temp: "20", measure2_date: "2026/04/16" },
        { measure1_date: "", measure1_temp: "" },
    ]
    eq(mod.initialMeasureHeaders(undefined, rows, 2), [{ date: "2026/10/14", temp: "20℃" }, { date: "", temp: "" }], "行の日付がそろう測定は見出しへ・ばらばらは空")
    eq(mod.initialMeasureHeaders([{ date: "2025/01/01", temp: "" }], rows, 2)[0].date, "2025/01/01", "保存の見出しが優先")
    // 行に残す日付・温度: 見出しと同じなら空（書き方の違いを吸収）・違えば残す
    eq(mod.rowOwnMeasure({ measure1_date: "2026-10-14", measure1_temp: "20 ℃" }, 1, { date: "2026/10/14", temp: "20" }), { date: "", temp: "" }, "見出しと同じ日付・温度は行に描かない")
    eq(mod.rowOwnMeasure({ measure1_date: "2026/10/15", measure1_temp: "21" }, 1, { date: "2026/10/14", temp: "20" }), { date: "2026/10/15", temp: "21" }, "見出しと違う日付・温度は行に残す（以前の保存を落とさない）")
    eq(mod.rowOwnMeasure({ measure1_date: "2026/10/15" }, 1, { date: "", temp: "" }).date, "2026/10/15", "見出しが空なら行の日付を描く")
    const stripped = mod.stripRowsCoveredByHeaders([{ measure1_date: "2026/10/14", measure1_temp: "20", measure1_value: "14.2" }], [{ date: "2026/10/14", temp: "20℃" }])
    eq(stripped[0], { measure1_date: "", measure1_temp: "", measure1_value: "14.2" }, "保存の前に見出しと同じ行の日付・温度を空にする（値は残す）")
    eq(mod.normalizeTemp("20 ℃"), "20", "温度の ℃ を外す（様式に刷り込みがある）")
    eq(mod.measureHeaderDateParts("2026-10-04"), { year: "2026", month: "10", day: "4" }, "日付を年・月・日に分ける")
    eq(mod.measureHeaderDateParts("令和8年"), null, "読めない書き方は分けない（文字のまま描く）")
    eq(mod.measureHeaderDateText("2026-10-14"), "2026/10/14", "1 行の見出しは 2026/10/14")
    return problems
}

function wiring(forms, routes) {
    const problems = []
    for (const [f, c] of Object.entries(FORMS)) {
        const s = forms[f]
        if (!s.includes('import MeasureHeaderInputs from "@/components/measure-header-inputs"')) problems.push(`${f}: 見出しの入力の部品を使っていない`)
        if (!new RegExp(`initialMeasureHeaders\\(saved\\.measure_headers, \\(saved\\.page5_rows \\?\\? \\[\\]\\)[^)]*, ${c.n}\\)`).test(s)) problems.push(`${f}: 見出しの初期値を保存（無ければ行）から決めていない`)
        if (!/measure_headers: measureHeaders,/.test(s)) problems.push(`${f}: 見出しを保存していない`)
        if (!/page5_rows: stripRowsCoveredByHeaders\(page5Rows, measureHeaders\),/.test(s)) problems.push(`${f}: 保存の前に見出しと同じ行の日付を外していない`)
        if (!new RegExp(`<MeasureHeaderInputs headers=\\{measureHeaders\\} onChange=\\{setMeasureHeaders\\} withTemp=\\{${c.temp}\\} />`).test(s)) problems.push(`${f}: 見出しの入力を表の前に置いていない（温度の有無 ${c.temp}）`)
        if ((s.match(/const own = rowOwnMeasure\(row, n, measureHeaders\[n - 1\]\)/g) ?? []).length !== 2) problems.push(`${f}: 机・スマホの両方で、行の日付を「見出しと違うときだけ」出していない`)
        if ((s.match(/\{own\.date && \(/g) ?? []).length !== 2) problems.push(`${f}: 行の日付の欄をいつも出している（見出しに書く日付をまた打たせる）`)
        const m = s.match(/const PAGE5_ROW_COUNT = (\d+)/)
        if (!m || Number(m[1]) !== c.rows) problems.push(`${f}: その5 の行数が ${m?.[1]}（雛形は ${c.rows} 行）`)
    }
    for (const [f, c] of Object.entries(ROUTES)) {
        const s = routes[f]
        if (!new RegExp(`coerceMeasureHeaders\\(body\\.measure_headers, ${c.n}\\)`).test(s)) problems.push(`${f}: 見出しを読んでいない`)
        if (!/drawMeasureHeaders\(page5, p5Height\)\n\s*drawCylinderRows\(page5, p5Height/.test(s)) problems.push(`${f}: 見出しを描いていない`)
        if (!/rowOwnMeasure\(row as Record<string, unknown>, n, measureHeaders\[n - 1\]\)/.test(s)) problems.push(`${f}: 行の日付を「見出しと違うときだけ」描いていない`)
        const b = s.match(/const P5_ROW_BOUNDS = \[([^\]]+)\]/)
        const bounds = b ? b[1].split(",").map((v) => Number(v.trim())).filter((v) => !Number.isNaN(v) && v !== 0) : []
        if (bounds[0] !== c.firstRow) problems.push(`${f}: 容器の行が雛形の 1 行目（${c.firstRow}）から始まっていない（${bounds[0]}）`)
        if (bounds.length - 1 !== c.rows) problems.push(`${f}: 容器の行が ${bounds.length - 1} 行（雛形は ${c.rows} 行）`)
    }
    return problems
}

const lib = read(LIB)
const forms = Object.fromEntries(Object.keys(FORMS).map((f) => [f, read(f)]))
const routes = Object.fromEntries(Object.keys(ROUTES).map((f) => [f, read(f)]))

if (SELF_TEST) {
    const neg = [...behaviour(await load(lib)), ...wiring(forms, routes)]
    if (neg.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of neg) console.log("   ", p)
        process.exit(1)
    }
    const libMutants = [
        ["行から見出しを決めない", "    if (hasAny(headers)) return headers\n", "    return headers\n", "行の日付がそろう測定は見出しへ"],
        ["見出しと同じでも行に描く", "own.date && dateKey(own.date) !== dateKey(header?.date) ? own.date : \"\"", "own.date", "見出しと同じ日付・温度は行に描かない"],
        ["温度の ℃ を区別する", '.replace(/\\s|℃|°C|°/g, "")', '.replace(/\\s/g, "")', "見出しと同じ日付・温度は行に描かない"],
    ]
    for (const [label, from, to, expect] of libMutants) {
        if (!lib.includes(from)) { console.log(`自己診断: 書き換える箇所が ${LIB} に無い: ${JSON.stringify(from)}`); process.exit(1) }
        const r = behaviour(await load(lib.replace(from, to)))
        if (!r.some((p) => p.includes(expect))) { console.log(`自己診断: ${label} → 検出できない`); process.exit(1) }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    const F7 = "src/components/halogen-bekki7-form.tsx", R7 = "src/app/api/generate-halogen-bekki7-pdf/route.ts", R6 = "src/app/api/generate-inert-gas-bekki6-pdf/route.ts"
    const wireMutants = [
        ["別記7 の行数を 19 に戻す", { ...forms, [F7]: forms[F7].replace("const PAGE5_ROW_COUNT = 20", "const PAGE5_ROW_COUNT = 19") }, routes, "その5 の行数が 19"],
        ["別記7 の行を 2 行目から始める", forms, { ...routes, [R7]: routes[R7].replace("    143.04, 173.52,", "    173.52,") }, "1 行目（143.04）から始まっていない"],
        ["別記6 の見出しを描かない", forms, { ...routes, [R6]: routes[R6].replace("        drawMeasureHeaders(page5, p5Height)\n", "") }, "見出しを描いていない"],
        ["別記7 の行の日付をいつも出す", { ...forms, [F7]: forms[F7].replaceAll("{own.date && (", "{(") }, routes, "行の日付の欄をいつも出している"],
    ]
    for (const [label, f, r, expect] of wireMutants) {
        if (f === forms && r === routes) { console.log(`自己診断: 書き換えられない: ${label}`); process.exit(1) }
        if (!wiring(f, r).some((x) => x.includes(expect))) { console.log(`自己診断: ${label} → 検出できない`); process.exit(1) }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    console.log("  陰性対照: 見出しの初期値・行に残す日付・温度の書き方・日付の分け方・3 様式の画面とルート・行の位置")
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const problems = [...behaviour(await load(lib)), ...wiring(forms, routes)]
console.log("その5 の見出しを検査: 見出しの初期値・行に残す日付・画面とルートの配線・別記7・8 の行の位置")
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("MEASURE_HEADERS_OK")
