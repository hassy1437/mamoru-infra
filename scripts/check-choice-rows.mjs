// 点検票の「選択肢の欄」（専用・兼用／一斉・区分…）が画面で選べ、紙の○と食い違わないか（2026-10-20・本番の通しチェック）。
//
// ■ なぜ要るか
//   選択肢の欄が画面ではただの文字の欄で、何を書けば○が付くか分からなかった（泡・ガス系は行の名前にも出ない）。
//   合わない文字だと○が付かないまま PDF は出る＝全検査が緑のまま情報だけ落ちる経路（check-choice-mismatch-warning の前提）。
//   画面の選択肢（src/lib/bekki-choice-rows.ts）とルートの○の語（drawChoiceCircle の label）は別々に書いてあるので、
//   片方だけ直すと「画面で選んだのに○が付かない」になる。それを突き合わせる。
//
// ■ 検査すること
//   1. 対応: 各ルートの drawChoiceCircle（行の欄・設備方式）と、画面の選択肢の定義が、様式・表・行・語の順まで一致する
//   2. 動き: 1 つだけ選ぶ欄は選び直すと前を外す／もう一度押すと外す／複数の欄は足せる／以前の「一斉鳴動」も一斉に付いて見える／
//      どれにも合わない以前の文字は「合わない」と出す
//   3. 配線: 選択肢のある様式の画面がその表に選択肢を渡し、文字の欄の代わりに選ぶ欄を出す（共有ベースは apiPath で自動）
//
// 使い方: node scripts/check-choice-rows.mjs [--self-test]
import fs from "fs"
import path from "path"
import { pathToFileURL } from "url"
import ts from "typescript"

const ROOT = process.cwd()
const SELF_TEST = process.argv.includes("--self-test")
// ★自己診断と本番で出力先を分ける（check-pdf-all は並列に走らせる）
const OUT = path.join(ROOT, "tmp", SELF_TEST ? "choice-rows-selftest" : "choice-rows")
const LIB = "src/lib/bekki-choice-rows.ts"
const BASE = "src/components/bekki-result-form-base.tsx"
const API = "src/app/api"
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8")
const js = (src) => ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText

async function load(libSrc) {
    fs.mkdirSync(OUT, { recursive: true })
    const p = path.join(OUT, `bekki-choice-rows.${Date.now()}${Math.random().toString(36).slice(2, 6)}.mjs`)
    fs.writeFileSync(p, js(libSrc), "utf8")
    return import(pathToFileURL(p).href)
}

/** ルートの drawChoiceCircle を読む → { apiPath: { rows: {rowsKey: {row: labels}}, system: labels } } */
function routeChoices(routeFiles) {
    const out = {}
    for (const [f, s] of Object.entries(routeFiles)) {
        const apiPath = `/api/${f.split("/")[3]}`
        let i = 0
        while ((i = s.indexOf("drawChoiceCircle(", i)) >= 0) {
            let j = i + "drawChoiceCircle(".length, depth = 1
            for (; depth > 0; j++) { if ("([{".includes(s[j])) depth++; else if (")]}".includes(s[j])) depth-- }
            const inner = s.slice(i, j)
            const labels = [...inner.matchAll(/label: "([^"]+)"/g)].map((m) => m[1])
            const row = inner.match(/\{ rowsKey: "(page\d_rows)", row: (\d+), column: "content" \}\s*\)$/)
            if (row) ((out[apiPath] ??= { rows: {} }).rows[row[1]] ??= {})[row[2]] = labels
            else if (/\{ column: "equipment_system" \}\s*\)$/.test(inner)) (out[apiPath] ??= { rows: {} }).system = labels
            else if (/\{ column: "inspection_type" \}\s*\)$/.test(inner)) (out[apiPath] ??= { rows: {} }).type = labels
            i = j
        }
    }
    return out
}

function correspondence(mod, routeFiles) {
    const problems = []
    const want = routeChoices(routeFiles)
    const have = mod.BEKKI_CHOICE_ROWS
    for (const [api, { rows, system, type }] of Object.entries(want)) {
        // 点検種別: 画面の選ぶ欄は「機器点検」「総合点検」（保存は "機器" / "総合" を含む形）。紙の○の語と同じ 2 つであること
        if (type && type.join("|") !== "機器|総合") problems.push(`${api}: 点検種別の紙の○の語が「機器・総合」でない（${type.join("・")}）。画面の選ぶ欄と合わない`)
        for (const [rk, byRow] of Object.entries(rows)) {
            for (const [row, labels] of Object.entries(byRow)) {
                const got = have[api]?.[rk]?.[row]?.options.map((o) => o.value)
                if (!got) problems.push(`${api} ${rk}[${row}]: 紙は ${labels.join("・")} に○を付けるのに、画面に選択肢が無い（文字の欄のまま）`)
                else if (got.join("|") !== labels.join("|")) problems.push(`${api} ${rk}[${row}]: 画面の選択肢 ${got.join("・")} と紙の ${labels.join("・")} が違う`)
            }
        }
        if (system && mod.EQUIPMENT_SYSTEM_CHOICES.options.map((o) => o.value).join("|") !== system.join("|"))
            problems.push(`${api}: 設備方式の画面の選択肢と紙の ${system.join("・")} が違う`)
    }
    for (const [api, byKey] of Object.entries(have)) {
        for (const [rk, byRow] of Object.entries(byKey)) {
            for (const row of Object.keys(byRow)) {
                if (!want[api]?.rows[rk]?.[row]) problems.push(`${api} ${rk}[${row}]: 画面に選択肢があるのに、紙はその行に○を付けない（行がずれている）`)
            }
        }
    }
    return problems
}

function behaviour(mod) {
    const problems = []
    const eq = (got, want, label) => { if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`${label}: ${JSON.stringify(got)}（期待 ${JSON.stringify(want)}）`) }
    const senyou = mod.BEKKI_CHOICE_ROWS["/api/generate-shokasen-bekki2-pdf"].page2_rows[7]
    const meidou = mod.BEKKI_CHOICE_ROWS["/api/generate-emergency-alarm-bekki14-pdf"].page1_rows[23]
    eq(mod.toggleChoice("", senyou, "専用"), "専用", "専用を選ぶ")
    eq(mod.toggleChoice("専用", senyou, "兼用"), "兼用", "1 つだけ選ぶ欄で選び直すと前を外す")
    eq(mod.toggleChoice("専用", senyou, "専用"), "", "もう一度押すと外す")
    eq(mod.toggleChoice("区分", meidou, "再鳴動"), "区分 再鳴動", "複数の欄は足せる（選択肢の順）")
    eq(mod.toggleChoice("再鳴動", meidou, "一斉"), "一斉 再鳴動", "足すと選択肢の順に並べ直す")
    eq(mod.selectedChoices("一斉鳴動", meidou), ["一斉"], "以前の「一斉鳴動」も一斉に付いて見える（紙と同じ）")
    eq(mod.unmatchedChoiceText("40個", senyou), "40個", "どれにも合わない以前の文字は「合わない」と出す")
    eq(mod.unmatchedChoiceText("専用", senyou), "", "合う値は「合わない」と言わない")
    eq(mod.toggleChoice("40個", senyou, "専用"), "専用", "合わない以前の文字は選び直すと外れる")
    return problems
}

const TYPE_LIB = "src/lib/bekki-inspection-type.ts"
function typeBehaviour(t) {
    const problems = []
    const eq = (got, want, label) => { if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`点検種別: ${label}: ${JSON.stringify(got)}（期待 ${JSON.stringify(want)}）`) }
    eq(t.inspectionTypeFromParts({ kiki: true, sougou: false }), "機器点検", "機器だけ → 機器点検（総括表と同じ形）")
    eq(t.inspectionTypeFromParts({ kiki: false, sougou: true }), "総合点検", "総合だけ → 総合点検")
    eq(t.inspectionTypeFromParts({ kiki: true, sougou: true }), "機器・総合", "両方 → 機器・総合（ルートは両方に○）")
    eq(t.inspectionTypeFromParts({ kiki: false, sougou: false }), "", "どちらも外す → 空")
    eq(t.inspectionTypeParts("機器・総合点検"), { kiki: true, sougou: true }, "以前の「機器・総合点検」も両方に付いて見える")
    eq(t.inspectionTypeParts("機器点検"), { kiki: true, sougou: false }, "機器点検 → 機器だけ")
    return problems
}

function wiring(mod, formFiles) {
    const problems = []
    const base = formFiles[BASE] ?? ""
    if ((base.match(/choiceRowAt\(section\.key, idx\) \? \(/g) ?? []).length < 2) problems.push(`${BASE}: 共有ベースが表（机・スマホ）で選択肢の欄を出していない`)
    for (const api of Object.keys(mod.BEKKI_CHOICE_ROWS)) {
        const entry = Object.entries(formFiles).find(([f, s]) => f !== BASE && s.includes(`"${api}"`))
        if (!entry) { problems.push(`${api}: 入力画面のフォームが見つからない`); continue }
        const [f, s] = entry
        if (s.includes("BekkiResultFormBase")) continue // 共有ベース（apiPath で自動）
        if ((s.match(/choiceRows\?\.\[idx\] \? \(/g) ?? []).length < 2) problems.push(`${f}: 表（机・スマホ）の両方で選択肢の欄を出していない`)
        if (/choiceRowsOf\(API_PATH, rowsKey\)/.test(s)) continue
        for (const rk of Object.keys(mod.BEKKI_CHOICE_ROWS[api])) {
            if (!s.includes(`choiceRowsOf("${api}", "${rk}")`)) problems.push(`${f}: ${rk} の表に選択肢を渡していない`)
        }
    }
    for (const [f, s] of Object.entries(formFiles)) {
        if (/const \[inspectionType, setInspectionType\]/.test(s) && !/<BekkiInspectionTypeInput value=\{inspectionType\} onChange=\{setInspectionType\} \/>/.test(s)) problems.push(`${f}: 点検種別が選ぶ欄になっていない（文字の欄のまま）`)
    }
    for (const f of ["inert-gas-bekki6", "halogen-bekki7", "powder-bekki8"].map((n) => `src/components/${n}-form.tsx`)) {
        if (!/row=\{EQUIPMENT_SYSTEM_CHOICES\}/.test(formFiles[f] ?? "")) problems.push(`${f}: 設備方式（全域・局所・移動）が選ぶ欄になっていない`)
    }
    return problems
}

function routes() {
    const out = {}
    for (const d of fs.readdirSync(path.join(ROOT, API))) {
        const f = `${API}/${d}/route.ts`
        if (fs.existsSync(path.join(ROOT, f))) out[f] = read(f)
    }
    return out
}
function forms() {
    const out = {}
    for (const f of fs.readdirSync(path.join(ROOT, "src/components"))) {
        if (/bekki.*-form\.tsx$/.test(f) || f === "bekki-result-form-base.tsx") out[`src/components/${f}`] = read(`src/components/${f}`)
    }
    return out
}

const lib = read(LIB)
const routeFiles = routes()
const formFiles = forms()
const typeLib = read(TYPE_LIB)
const run = async (libSrc, r = routeFiles, fm = formFiles, tl = typeLib) => {
    const mod = await load(libSrc)
    return [...correspondence(mod, r), ...behaviour(mod), ...wiring(mod, fm), ...typeBehaviour(await load(tl))]
}

if (SELF_TEST) {
    const neg = await run(lib)
    if (neg.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of neg) console.log("   ", p)
        process.exit(1)
    }
    const mutants = [
        ["画面の行をずらす（不活性ガス 17→18）", { lib: (s) => s.replace('"/api/generate-inert-gas-bekki6-pdf": { page2_rows: { 17: SENYOU_KENYOU } }', '"/api/generate-inert-gas-bekki6-pdf": { page2_rows: { 18: SENYOU_KENYOU } }') }, "画面に選択肢が無い"],
        ["画面の選択肢の語を変える", { lib: (s) => s.replace('const MEIDOU: ChoiceRow = { options: opts("一斉", "区分", "相互", "再鳴動") }', 'const MEIDOU: ChoiceRow = { options: opts("一斉", "区分", "相互") }') }, "が違う"],
        ["1 つだけ選ぶ欄で前を外さない", { lib: (s) => s.replace("        if (row.single) current.clear()\n", "") }, "選び直すと前を外す"],
        ["「含む」でなく完全一致で見る（紙と食い違う）", { lib: (s) => s.replace("row.options.filter((o) => content.includes(o.value))", "row.options.filter((o) => content.split(/\\s+/).includes(o.value))") }, "一斉鳴動"],
        ["紙の○の語を変える（ルート側）", { route: [`${API}/generate-powder-bekki8-pdf/route.ts`, (s) => s.replace('{ label: "専用", cx: 258, cy: 438.95', '{ label: "専用型", cx: 258, cy: 438.95')] }, "が違う"],
        ["第2 の（その3）に選択肢を渡さない", { form: ["src/components/shokasen-bekki2-form.tsx", (s) => s.replace('choiceRowsOf("/api/generate-shokasen-bekki2-pdf", "page3_rows"), HOSE_ROW_INDEXES)', "undefined, HOSE_ROW_INDEXES)")] }, "page3_rows の表に選択肢を渡していない"],
        ["スマホの表で選択肢を出さない", { form: ["src/components/powder-bekki8-form.tsx", (s) => { const k = s.lastIndexOf("choiceRows?.[idx] ? ("); return s.slice(0, k) + "false ? (" + s.slice(k + "choiceRows?.[idx] ? (".length) }] }, "両方で選択肢の欄を出していない"],
        ["設備方式を文字の欄に戻す", { form: ["src/components/halogen-bekki7-form.tsx", (s) => s.replace("row={EQUIPMENT_SYSTEM_CHOICES}", "row={undefined as never}")] }, "設備方式"],
        ["点検種別を文字の欄に戻す", { form: ["src/components/bekki-result-form-base.tsx", (s) => s.replace("<BekkiInspectionTypeInput value={inspectionType} onChange={setInspectionType} />", "<Input value={inspectionType} onChange={(e) => setInspectionType(e.target.value)} />")] }, "点検種別が選ぶ欄になっていない"],
        ["両方を選んだときの保存の形を変える", { typeLib: (s) => s.replace("    if (p.kiki && p.sougou) return BEKKI_INSPECTION_TYPE_FALLBACK\n", "    if (p.kiki && p.sougou) return \"機器点検・総合点検\"\n") }, "両方 → 機器・総合"],
    ]
    for (const [label, m, expect] of mutants) {
        let l = lib, r = routeFiles, fm = formFiles, tl = typeLib
        if (m.lib) { l = m.lib(lib); if (l === lib) { console.log(`自己診断: 書き換えられない: ${label}`); process.exit(1) } }
        if (m.typeLib) { tl = m.typeLib(typeLib); if (tl === typeLib) { console.log(`自己診断: 書き換えられない: ${label}`); process.exit(1) } }
        if (m.route) { const [f, fn] = m.route; const n = fn(r[f]); if (n === r[f]) { console.log(`自己診断: 書き換えられない: ${label}`); process.exit(1) } r = { ...r, [f]: n } }
        if (m.form) { const [f, fn] = m.form; const n = fn(fm[f]); if (n === fm[f]) { console.log(`自己診断: 書き換えられない: ${label}`); process.exit(1) } fm = { ...fm, [f]: n } }
        const got = await run(l, r, fm, tl)
        if (!got.some((p) => p.includes(expect))) { console.log(`自己診断: ${label} → 検出できない`); for (const p of got) console.log("   ", p); process.exit(1) }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    const mod = await load(lib)
    const n = Object.values(mod.BEKKI_CHOICE_ROWS).reduce((a, byKey) => a + Object.values(byKey).reduce((b, r) => b + Object.keys(r).length, 0), 0)
    console.log(`  陰性対照: 選択肢の行 ${n}・様式 ${Object.keys(mod.BEKKI_CHOICE_ROWS).length}・動き 9 通り・設備方式 3 様式`)
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const problems = await run(lib)
const mod = await load(lib)
const n = Object.values(mod.BEKKI_CHOICE_ROWS).reduce((a, byKey) => a + Object.values(byKey).reduce((b, r) => b + Object.keys(r).length, 0), 0)
console.log(`選択肢の欄を検査: 行 ${n}・様式 ${Object.keys(mod.BEKKI_CHOICE_ROWS).length}・ルート ${Object.keys(routeFiles).length} 本と突き合わせ`)
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("CHOICE_ROWS_OK")
