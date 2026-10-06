// 「判定が 1 つも入っていない表」の知らせ（src/lib/blank-judgment-sections.ts）が、入れ忘れらしいものだけを出すかを検査する（2026-10-07）。
//
// ■ なぜ要るか（2026-10-06 の納品物）
//   「すべて良にする」は表ごとのボタンで、その1 でだけ押すと その2 以降の判定が空のまま納品された（別記2〜11 で 306 行）。
//   ★空欄は正常な見た目なので PDF の検査では出ない。知らせる仕組みも無かった。
//
// ■ 検査すること（★関数を実際に動かす。ソースの写しは検査しない）
//   1. その1 に判定があり、その2 の機器点検の行が全部空 → 「その2」を出す
//   2. 総合点検の行（見出し「総合点検」より下）だけが空 → 出さない（機器点検だけの点検では空欄が正しい）
//   3. 様式まるごと判定が無い → 出さない（未入力の様式は出力画面が別に案内する）
//   4. 全部入っている → 出さない
//   ・機器点検が空で総合点検だけ判定がある表 → 出す／総合点検の行だけの表（別記5 その4）が空 → 出さない
//   5. 呼び出し側: 出力画面と納品ボタンの両方が使っている
//
// 使い方: node scripts/check-blank-judgment-sections.mjs [--self-test]
import fs from "fs"
import path from "path"
import { pathToFileURL } from "url"
import ts from "typescript"

const ROOT = process.cwd()
const MODULES = ["blank-judgment-sections", "bekki-row-labels", "bekki-heading-row", "pdf-merge-config", "itiran-input-flow"]
const OUT = path.join(ROOT, "tmp", process.argv.includes("--self-test") ? "blank-judgment-selftest" : "blank-judgment")

/** src/lib の TS を JS にして、@/lib の import を同じフォルダの .mjs に向け直す（mutate で中身を差し替えられる） */
async function load(mutate = (name, src) => src) {
    fs.mkdirSync(OUT, { recursive: true })
    const tag = Date.now() + Math.random().toString(36).slice(2, 6)
    for (const name of MODULES) {
        const src = mutate(name, fs.readFileSync(path.join(ROOT, "src", "lib", `${name}.ts`), "utf8"))
        let js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
        js = js.replace(/from\s+"@\/lib\/([\w-]+)"/g, (_, m) => `from "./${m}.${tag}.mjs"`).replace(/from\s+"\.\/([\w-]+)"/g, (_, m) => `from "./${m}.${tag}.mjs"`)
        fs.writeFileSync(path.join(OUT, `${name}.${tag}.mjs`), js, "utf8")
    }
    return import(pathToFileURL(path.join(OUT, `blank-judgment-sections.${tag}.mjs`)).href)
}

function behaviour(mod) {
    const problems = []
    const f = mod.findBlankJudgmentSections
    if (typeof f !== "function") return ["findBlankJudgmentSections が無い"]
    const rows = (n, judged) => Array.from({ length: n }, (_, i) => ({ judgment: judged(i) ? "良" : "" }))
    // 別記15: その1 26 行・その2 27 行（0〜22 機器 / 23 見出し「総合点検」/ 24〜26 総合）
    const id = "evacuation-equipment"
    const cases = [
        ["その2 の機器点検が全部空", { page1_rows: rows(26, () => true), page2_rows: rows(27, () => false) }, ["その2"]],
        ["総合点検の行だけ空", { page1_rows: rows(26, () => true), page2_rows: rows(27, (i) => i < 23) }, []],
        ["様式まるごと判定なし", { page1_rows: rows(26, () => false), page2_rows: rows(27, () => false) }, []],
        ["全部入っている", { page1_rows: rows(26, () => true), page2_rows: rows(27, () => true) }, []],
        ["その2 の機器点検に 1 つだけ判定", { page1_rows: rows(26, () => true), page2_rows: rows(27, (i) => i === 5) }, []],
        ["その2 の機器点検は空・総合点検だけ判定", { page1_rows: rows(26, () => true), page2_rows: rows(27, (i) => i > 23) }, ["その2"]],
    ].map((c) => [id, "別記様式第15", ...c])
    // 別記5: その4 は見出し「総合点検」と総合点検の行だけ（機器点検だけの点検では表まるごと空が正しい）
    cases.push(["foam", "別記様式第5", "総合点検だけの表（別記5 その4）が空", { page1_rows: rows(19, () => true), page2_rows: rows(34, () => true), page3_rows: rows(27, () => true), page4_rows: rows(23, () => false) }, []])
    for (const [stepId, form, label, payload, want] of cases) {
        const got = f({ [stepId]: payload }, [stepId])
        const sections = got[0]?.sections ?? []
        if (JSON.stringify(sections) !== JSON.stringify(want)) problems.push(`${label}: ${JSON.stringify(want)} のはずが ${JSON.stringify(sections)}`)
        if (want.length && got[0]?.form !== form) problems.push(`${label}: 様式名が「${form}」でない（${got[0]?.form}）`)
    }
    return problems
}

function wiring() {
    const problems = []
    const out = fs.readFileSync(path.join(ROOT, "src/app/inspection/[id]/itiran/[itiranId]/output/page.tsx"), "utf8")
    const deliver = fs.readFileSync(path.join(ROOT, "src/components/deliver-report-button.tsx"), "utf8")
    if (!out.includes("findBlankJudgmentSections(bekkiPayloads, applicableStepIds)")) problems.push("出力画面が判定の無い表を知らせていない")
    if (!deliver.includes("findBlankJudgmentSections(bekkiPayloads, applicableStepIds)")) problems.push("納品ボタンが判定の無い表を知らせていない")
    if (!/blankSections\.length > 0/.test(deliver)) problems.push("納品ボタンが判定の無い表だけのときに確認を出さない")
    return problems
}

if (process.argv.includes("--self-test")) {
    const ok = [...behaviour(await load()), ...wiring()]
    if (ok.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of ok) console.log("   ", p)
        process.exit(1)
    }
    const mutants = [
        ["総合点検の行も数える", (n, s) => n === "blank-judgment-sections" ? s.replace("if (inSogo || label.startsWith(\"総合点検\")) return", "") : s, "総合点検だけの表"],
        ["別の表に判定があるかを見ない", (n, s) => n === "blank-judgment-sections" ? s.replace("if (!sections.some((s) => s.judged > 0)) continue", "") : s, "様式まるごと判定なし"],
    ]
    for (const [label, mutate, expect] of mutants) {
        const r = behaviour(await load(mutate))
        if (!r.some((p) => p.startsWith(expect))) {
            console.log(`自己診断: ${label} → 検出できない`)
            process.exit(1)
        }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    console.log("  陰性対照: 7 通りの入力で、入れ忘れらしい表だけを出す・出力画面と納品ボタンの両方が使う")
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const problems = [...behaviour(await load()), ...wiring()]
console.log("判定の無い表の知らせを検査: 7 通り＋呼び出し 2 か所")
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("BLANK_JUDGMENT_SECTIONS_OK")
