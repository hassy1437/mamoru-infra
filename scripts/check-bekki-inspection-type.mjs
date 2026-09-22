// =============================================================
// scripts/check-bekki-inspection-type.mjs — 別記様式の「点検種別」の既定が総括表の値から来ていること
//
// ■ ★なぜ要るか（2026-09-03 実測・9/4 の総点検で記録・2026-09-23 に直した＝総点検 A2）
//   総括表の既定は「機器点検」、別記の既定は「機器・総合」で、別記ページは総括表の値を渡していなかった。
//   業者が別記を開いてそのまま保存すると、同じ提出物の中で総括表は「機器点検」・別記は両方に○になる。
//   直し方は「総括表の値を 22 ページ → 22 フォーム → 既定 に流す」で、★どこか 1 本で配線が切れると
//   その様式だけ黙って元に戻る。＝ 配線を全本数ぶん機械で見張る。
//
// ■ 見るもの
//   ①挙動: 既定を決めるヘルパ（src/lib/bekki-inspection-type.ts）
//          "機器点検"→"機器点検" / "総合点検"→"総合点検" / 空・null→"機器・総合"（従来の既定）
//          PDF は「値が "機器" を含めば機器に○、"総合" を含めば総合に○」なので、"機器点検" は機器だけに○
//   ②静的: 別記ページ（edit / output / shokaki を除く 22 枚）が総括表の inspection_type を select し、initial に渡す
//   ③静的: 別記フォーム（shokaki を除く 22 本）の Props.initial に inspection_type がある
//   ④静的: 点検種別の state を持つフォームは、既定をヘルパから取る（"機器・総合" を直書きしない・defaultInspectionType を使わない）
//   ⑤静的: shokaki（別記様式1）は点検種別の欄を持たない。★持つようになったら配線を足すまで落とす
//
// 使い方: node scripts/check-bekki-inspection-type.mjs [--self-test]
// =============================================================
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import ts from "typescript"

const ROOT = process.cwd()
const HELPER = path.join(ROOT, "src", "lib", "bekki-inspection-type.ts")
const COMPONENTS = path.join(ROOT, "src", "components")
const PAGES_DIR = path.join(ROOT, "src", "app", "inspection", "[id]", "itiran", "[itiranId]")
const BASE = "bekki-result-form-base.tsx"
/** 別記ページではないディレクトリ（理由つき） */
const NOT_BEKKI_PAGES = new Map([
    ["edit", "点検者一覧の編集ページ（別記ではない）"],
    ["output", "PDF 出力ページ（別記ではない）"],
    ["shokaki", "別記様式1（消火器）は点検種別の欄を持たない（⑤で見張る）"],
])
const FALLBACK = "機器・総合"

const rel = (p) => path.relative(ROOT, p).replace(/\\/g, "/")
const read = (p) => fs.readFileSync(p, "utf8")

async function importHelperFrom(sourceText, tag) {
    const outDir = path.join(ROOT, "tmp", "bekki-inspection-type")
    fs.mkdirSync(outDir, { recursive: true })
    const js = ts.transpileModule(sourceText, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
        fileName: HELPER,
    }).outputText
    const out = path.join(outDir, `helper.${tag}.${Date.now()}.mjs`)
    fs.writeFileSync(out, js, "utf8")
    return import(pathToFileURL(out).href)
}

function behaviour(helper) {
    const problems = []
    const f = helper.bekkiInspectionTypeDefault
    if (typeof f !== "function") return ["bekkiInspectionTypeDefault が無い"]
    if (helper.BEKKI_INSPECTION_TYPE_FALLBACK !== FALLBACK) problems.push(`従来の既定と違う: ${helper.BEKKI_INSPECTION_TYPE_FALLBACK}`)
    if (f("機器点検") !== "機器点検") problems.push(`"機器点検" がそのまま返らない: ${f("機器点検")}`)
    if (f("総合点検") !== "総合点検") problems.push(`"総合点検" がそのまま返らない: ${f("総合点検")}`)
    for (const v of [null, undefined, "", "  "]) {
        if (f(v) !== FALLBACK) problems.push(`総括表に値が無いとき（${JSON.stringify(v)}）従来の既定に倒れない: ${f(v)}`)
    }
    // PDF の○の決まり（drawChoiceCircle は includes で見る）: 機器点検 → 機器だけ
    if ("機器点検".includes("総合")) problems.push("前提が崩れた: \"機器点検\" が \"総合\" を含む")
    return problems
}

/** ファイル群を受け取って静的に見る（自己診断で差し替えられるよう、中身は引数で渡す） */
function staticCheck({ pages, forms, base, shokakiForm }) {
    const problems = []
    // ② ページ
    for (const [name, text] of pages) {
        if (!/\.select\("[^"]*\binspection_type\b[^"]*"\)/.test(text)) problems.push(`${name}: 総括表の select に inspection_type が無い`)
        if (!text.includes("inspection_type: soukatsu.inspection_type,")) problems.push(`${name}: initial に inspection_type を渡していない`)
    }
    // ③ フォームの Props.initial
    for (const [name, text] of forms) {
        if (!text.includes("inspection_type?: string | null")) problems.push(`${name}: Props.initial に inspection_type が無い`)
    }
    // ④ 既定をヘルパから（base ＋ 自前で state を持つフォーム）
    for (const [name, text] of [["src/components/" + BASE, base], ...forms]) {
        if (/defaultInspectionType/.test(text)) problems.push(`${name}: defaultInspectionType（固定値の口）が残っている`)
        const hasState = /useState\(coerceString\(saved\.inspection_type,/.test(text)
        if (hasState) {
            if (!/useState\(coerceString\(saved\.inspection_type, bekkiInspectionTypeDefault\(initial\.inspection_type\)\)\)/.test(text)) {
                problems.push(`${name}: 点検種別の既定をヘルパから取っていない`)
            }
            if (new RegExp(`"${FALLBACK}"`).test(text)) problems.push(`${name}: "${FALLBACK}" を直書きしている（既定はヘルパにだけ書く）`)
        }
    }
    // ⑤ shokaki は点検種別を持たない
    if (/inspection_type/.test(shokakiForm)) problems.push("shokaki-bekki1-form.tsx: 点検種別を持つようになった。ページとフォームに配線を足し、NOT_BEKKI_PAGES から外すこと")
    return problems
}

function load() {
    const pages = []
    for (const d of fs.readdirSync(PAGES_DIR, { withFileTypes: true })) {
        if (!d.isDirectory() || NOT_BEKKI_PAGES.has(d.name)) continue
        const p = path.join(PAGES_DIR, d.name, "page.tsx")
        if (!fs.existsSync(p)) continue
        pages.push([rel(p), read(p)])
    }
    const forms = fs.readdirSync(COMPONENTS)
        .filter((f) => /bekki.*-form\.tsx$/.test(f) && f !== "shokaki-bekki1-form.tsx")
        .map((f) => ["src/components/" + f, read(path.join(COMPONENTS, f))])
    return {
        pages, forms,
        base: read(path.join(COMPONENTS, BASE)),
        shokakiForm: read(path.join(COMPONENTS, "shokaki-bekki1-form.tsx")),
    }
}

const helperText = read(HELPER)
const files = load()

if (process.argv.includes("--self-test")) {
    // ★陰性: いまの実装で問題なし
    const h0 = await importHelperFrom(helperText, "neg")
    const b0 = behaviour(h0); const s0 = staticCheck(files)
    if (b0.length || s0.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of [...b0, ...s0]) console.log("   ", p)
        process.exit(1)
    }
    if (files.pages.length !== 22 || files.forms.length !== 22) {
        console.log(`自己診断: 本数が想定と違う（ページ ${files.pages.length} / フォーム ${files.forms.length}、22 ずつのはず）`); process.exit(1)
    }
    // ★陽性①: ページ 1 枚が initial に渡さない（直す前の形）
    const [pName, pText] = files.pages[0]
    const pOld = pText.replace("                        inspection_type: soukatsu.inspection_type,\r\n", "").replace("                        inspection_type: soukatsu.inspection_type,\n", "")
    if (pOld === pText) { console.log("自己診断: 注入先（ページの initial）が無い"); process.exit(1) }
    const s1 = staticCheck({ ...files, pages: [[pName, pOld], ...files.pages.slice(1)] })
    if (!s1.some((p) => p.includes(pName) && p.includes("渡していない"))) { console.log("自己診断: ページが渡さなくても落ちない"); process.exit(1) }
    // ★陽性②: 自前で state を持つフォームが "機器・総合" を直書き（直す前の形）
    const idx = files.forms.findIndex(([, t]) => /useState\(coerceString\(saved\.inspection_type,/.test(t))
    const [fName, fText] = files.forms[idx]
    const fOld = fText.replace("bekkiInspectionTypeDefault(initial.inspection_type)))", `"${FALLBACK}"))`)
    if (fOld === fText) { console.log("自己診断: 注入先（フォームの useState）が無い"); process.exit(1) }
    const forms2 = files.forms.slice(); forms2[idx] = [fName, fOld]
    if (!staticCheck({ ...files, forms: forms2 }).some((p) => p.includes(fName))) { console.log("自己診断: フォームが直書きしても落ちない"); process.exit(1) }
    // ★陽性③: base が固定値の口（defaultInspectionType）を持つ
    const baseOld = files.base.replace("bekkiInspectionTypeDefault(initial.inspection_type)))", "defaultInspectionType))")
    if (baseOld === files.base) { console.log("自己診断: 注入先（base の useState）が無い"); process.exit(1) }
    if (!staticCheck({ ...files, base: baseOld }).some((p) => p.includes(BASE))) { console.log("自己診断: base が固定値の口を持っても落ちない"); process.exit(1) }
    // ★陽性④: ヘルパが空を返す（従来の既定に倒れない）
    const hBad = helperText.replace("return t || BEKKI_INSPECTION_TYPE_FALLBACK", "return t")
    if (hBad === helperText) { console.log("自己診断: 注入先（ヘルパの return）が無い"); process.exit(1) }
    const h1 = await importHelperFrom(hBad, "pos")
    if (!behaviour(h1).some((p) => p.includes("倒れない"))) { console.log("自己診断: ヘルパが空を返しても落ちない"); process.exit(1) }
    console.log(`  陰性対照: ページ ${files.pages.length} 枚・フォーム ${files.forms.length} 本・base・ヘルパとも問題なし`)
    console.log("  陽性対照①: ページが initial に渡さない → 検出")
    console.log("  陽性対照②: フォームが \"機器・総合\" を直書き → 検出")
    console.log("  陽性対照③: base が defaultInspectionType を持つ → 検出")
    console.log("  陽性対照④: ヘルパが従来の既定に倒れない → 検出")
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const helper = await importHelperFrom(helperText, "run")
const problems = [...behaviour(helper), ...staticCheck(files)]
console.log(`別記の点検種別を検査: ページ ${files.pages.length} 枚 / フォーム ${files.forms.length} 本`)
if (problems.length) { for (const p of problems) console.log(`  NG  ${p}`); console.log(`\n${problems.length} 件`); process.exit(1) }
console.log("BEKKI_INSPECTION_TYPE_OK")
