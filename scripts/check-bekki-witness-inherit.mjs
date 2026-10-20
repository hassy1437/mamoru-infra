// 点検票（別記）の立会者が総括表から引き継がれ、畳んだ基本情報の外からも見えるか（2026-10-20・本番の通しチェック）。
//
// ■ なぜ要るか
//   総括表で設備ごとに立会者を入れても、点検票の立会者は空で始まり、欄は畳んだ「基本情報」の中にあった。
//   本番の通しで 23 様式すべての点検票が立会者の空欄で出た（総括表には入っていた）。
//   ★PDF は正しく出る（空欄を空欄として描く）ので、画像の検査やベースラインでは出ない種類。
//
// ■ 検査すること
//   1. src/lib/bekki-witness.ts を実際に動かす（その設備の行・1 人だけのときの代わり・保存した値が優先）
//   2. 配線: 23 様式の画面（page.tsx）が総括表の equipment_results を読んで立会者を渡す／
//      立会者の欄を持つフォーム 9 本が初期値に使う／畳んだ基本情報の 1 行に立会者が出る
//
// 使い方: node scripts/check-bekki-witness-inherit.mjs [--self-test]
import fs from "fs"
import path from "path"
import { pathToFileURL } from "url"
import ts from "typescript"

const ROOT = process.cwd()
const SELF_TEST = process.argv.includes("--self-test")
// ★自己診断と本番で出力先を分ける（check-pdf-all は並列に走らせる）
const OUT = path.join(ROOT, "tmp", SELF_TEST ? "bekki-witness-selftest" : "bekki-witness")
const LIB = "src/lib/bekki-witness.ts"
const FLOW = "src/lib/itiran-input-flow.ts"
const BASE = "src/components/bekki-result-form-base.tsx"
const PAGES_DIR = "src/app/inspection/[id]/itiran/[itiranId]"
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8")
const js = (src) => ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText

async function load(libSrc) {
    const dir = path.join(OUT, `${Date.now()}${Math.random().toString(36).slice(2, 6)}`)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, "itiran-input-flow.mjs"), js(read(FLOW)), "utf8")
    fs.writeFileSync(path.join(dir, "bekki-witness.mjs"), js(libSrc).replace(/from "@\/lib\/itiran-input-flow"/, 'from "./itiran-input-flow.mjs"'), "utf8")
    return import(pathToFileURL(path.join(dir, "bekki-witness.mjs")).href)
}

function behaviour(mod) {
    const problems = []
    const eq = (got, want, label) => { if (got !== want) problems.push(`${label}: 「${got}」（期待「${want}」）`) }
    const rows = [
        { name: "消火器", result: "要改善", witness: "防火 管理子" },
        { name: "漏電火災警報器", result: "指摘なし", witness: "設備 担当" },
        { name: "誘導灯及び誘導標識", result: "指摘なし" },
    ]
    eq(mod.bekkiWitnessFromSoukatsu(rows, "leakage-fire-alarm"), "設備 担当", "その設備の行の立会者")
    eq(mod.bekkiWitnessFromSoukatsu(rows, "shokaki"), "防火 管理子", "消火器の行の立会者")
    eq(mod.bekkiWitnessFromSoukatsu(rows, "guidance-lights-signs"), "", "行に無く、立会者が 2 人いる（決めない）")
    eq(mod.bekkiWitnessFromSoukatsu([{ name: "消火器", witness: "防火 管理子" }, { name: "誘導灯及び誘導標識" }], "guidance-lights-signs"), "防火 管理子", "行に無く、立会者が 1 人だけ")
    eq(mod.bekkiWitnessFromSoukatsu(null, "shokaki"), "", "総括表の点検結果が無い")
    eq(mod.bekkiWitnessInitial("点検票で入れた人", "総括表の人"), "点検票で入れた人", "点検票に保存した立会者が優先")
    eq(mod.bekkiWitnessInitial("", "総括表の人"), "総括表の人", "点検票の立会者が空なら引き継ぐ")
    eq(mod.bekkiWitnessInitial(undefined, null), "", "どちらも無い")
    return problems
}

function pages() {
    const out = {}
    for (const d of fs.readdirSync(path.join(ROOT, PAGES_DIR))) {
        const f = `${PAGES_DIR}/${d}/page.tsx`
        if (fs.existsSync(path.join(ROOT, f)) && read(f).includes("CURRENT_STEP_ID")) out[f] = read(f)
    }
    return out
}
function forms() {
    const out = {}
    for (const f of fs.readdirSync(path.join(ROOT, "src/components"))) {
        if (!/bekki.*-form\.tsx$/.test(f) && f !== "bekki-result-form-base.tsx") continue
        const s = read(`src/components/${f}`)
        if (/const \[witness, setWitness\]/.test(s)) out[`src/components/${f}`] = s
    }
    return out
}

function wiring(pageFiles, formFiles) {
    const problems = []
    for (const [f, s] of Object.entries(pageFiles)) {
        const sel = s.match(/\.from\("inspection_soukatsu"\)\s*\n\s*\.select\("([^"]*)"\)/)?.[1] ?? ""
        if (!/\bequipment_results\b/.test(sel)) problems.push(`${f}: 総括表の equipment_results を読んでいない（立会者を引き継げない）`)
        if (!/witness: bekkiWitnessFromSoukatsu\(soukatsu\.equipment_results, CURRENT_STEP_ID\)/.test(s)) problems.push(`${f}: 立会者の初期値を渡していない`)
    }
    for (const [f, s] of Object.entries(formFiles)) {
        if (!/useState\(normalizeBekkiWitnessForState\(bekkiWitnessInitial\(saved\.witness, initial\.witness\)\)\)/.test(s)) problems.push(`${f}: 立会者の初期値に総括表の立会者を使っていない`)
    }
    const base = formFiles[BASE] ?? ""
    if (!/／ 立会者 \{witness\.trim\(\) \|\| "未入力"\}/.test(base)) problems.push(`${BASE}: 畳んだ基本情報の 1 行に立会者が出ていない（空のまま気づけない）`)
    return problems
}

const lib = read(LIB)
const pageFiles = pages()
const formFiles = forms()
const MIN_PAGES = 23, MIN_FORMS = 9

if (SELF_TEST) {
    const neg = [...behaviour(await load(lib)), ...wiring(pageFiles, formFiles)]
    if (neg.length || Object.keys(pageFiles).length < MIN_PAGES || Object.keys(formFiles).length < MIN_FORMS) {
        console.log(`自己診断: 現状が既にNG（陰性対照が成立しない）・画面 ${Object.keys(pageFiles).length}・フォーム ${Object.keys(formFiles).length}`)
        for (const p of neg) console.log("   ", p)
        process.exit(1)
    }
    const libMutants = [
        ["その設備の行を見ない", "const own = rows.find((r) => text(r.name).includes(keyword) && text(r.witness))", "const own = undefined", "その設備の行の立会者"],
        ["立会者が 2 人いても最初の人にする", "return all.length === 1 ? all[0] : \"\"", "return all[0] ?? \"\"", "立会者が 2 人いる"],
        ["保存した空の立会者を優先する（引き継がない）", "return text(saved) ? String(saved) : (inherited ?? \"\")", "return typeof saved === \"string\" ? saved : (inherited ?? \"\")", "点検票の立会者が空なら引き継ぐ"],
    ]
    for (const [label, from, to, expect] of libMutants) {
        if (!lib.includes(from)) { console.log(`自己診断: 書き換える箇所が ${LIB} に無い: ${from}`); process.exit(1) }
        const r = behaviour(await load(lib.replace(from, to)))
        if (!r.some((p) => p.includes(expect))) { console.log(`自己診断: ${label} → 検出できない`); for (const p of r) console.log("   ", p); process.exit(1) }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    const P = `${PAGES_DIR}/fire-water/page.tsx`
    const F = "src/components/inert-gas-bekki6-form.tsx"
    const wireMutants = [
        ["画面が equipment_results を読まない", { [P]: (s) => s.replace(", equipment_results\")", "\")") }, {}, "equipment_results を読んでいない"],
        ["画面が立会者を渡さない", { [P]: (s) => s.replace(/\n\s*witness: bekkiWitnessFromSoukatsu\(soukatsu\.equipment_results, CURRENT_STEP_ID\),/, "") }, {}, "立会者の初期値を渡していない"],
        ["フォームが保存の立会者だけを見る（直す前）", {}, { [F]: (s) => s.replace("bekkiWitnessInitial(saved.witness, initial.witness)", "coerceString(saved.witness)") }, "総括表の立会者を使っていない"],
        ["畳んだ 1 行から立会者を外す", {}, { [BASE]: (s) => s.replace('／ 立会者 {witness.trim() || "未入力"}', "") }, "畳んだ基本情報の 1 行に立会者が出ていない"],
    ]
    for (const [label, pm, fm, expect] of wireMutants) {
        const p2 = { ...pageFiles }, f2 = { ...formFiles }
        for (const [k, fn] of Object.entries(pm)) { const n = fn(p2[k]); if (n === p2[k]) { console.log(`自己診断: 書き換えられない: ${label}`); process.exit(1) } p2[k] = n }
        for (const [k, fn] of Object.entries(fm)) { const n = fn(f2[k]); if (n === f2[k]) { console.log(`自己診断: 書き換えられない: ${label}`); process.exit(1) } f2[k] = n }
        if (!wiring(p2, f2).some((p) => p.includes(expect))) { console.log(`自己診断: ${label} → 検出できない`); process.exit(1) }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    console.log(`  陰性対照: 引き継ぎ 8 通り・画面 ${Object.keys(pageFiles).length} 本・フォーム ${Object.keys(formFiles).length} 本`)
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const problems = [...behaviour(await load(lib)), ...wiring(pageFiles, formFiles)]
if (Object.keys(pageFiles).length < MIN_PAGES) problems.push(`点検票の画面が ${Object.keys(pageFiles).length} 本しか見つからない（${MIN_PAGES} 本のはず）`)
if (Object.keys(formFiles).length < MIN_FORMS) problems.push(`立会者の欄を持つフォームが ${Object.keys(formFiles).length} 本しか見つからない（${MIN_FORMS} 本のはず）`)
console.log(`立会者の引き継ぎを検査: 引き継ぎ 8 通り・画面 ${Object.keys(pageFiles).length} 本・フォーム ${Object.keys(formFiles).length} 本`)
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("BEKKI_WITNESS_OK")
