// 総括表（点検）の削除ボタンが、消してよいときだけ出て、消えたことを確かめるか（2026-10-20）。
//
// ■ なぜ要るか
//   間違えて始めた点検を消す手段が画面に無く、物件を消しても総括表・点検者一覧・別記はひもづけが外れて残った。
//   ボタンを足したので、次を見張る:
//   ・確定・納品した点検ではボタンを出さず理由を出す（利用料・納品の記録が外部キーで止める＝押せば落ちるボタンを作らない）
//   ・確認の窓で「点検者一覧表と別記も消える・物件は消えない・取り消せない」を先に言う
//   ・消えた件数を確かめる（RLS で弾かれると error なしで 0 件＝黙って成功にしない）・外部キーの失敗（23503）を言い換える
//
// ■ 検査すること
//   1. src/lib/soukatsu-delete.ts を実際に動かす（消せない理由・確認の文・失敗の文）
//   2. 配線: 総括表の画面が確定の件数と納品の有無から理由を決めて渡す／ボタンが確認・件数の確認・失敗の言い換えをする
//
// 使い方: node scripts/check-soukatsu-delete.mjs [--self-test]
import fs from "fs"
import path from "path"
import { pathToFileURL } from "url"
import ts from "typescript"

const ROOT = process.cwd()
const SELF_TEST = process.argv.includes("--self-test")
// ★自己診断と本番で出力先を分ける（check-pdf-all は並列に走らせる）
const OUT = path.join(ROOT, "tmp", SELF_TEST ? "soukatsu-delete-selftest" : "soukatsu-delete")
const LIB = "src/lib/soukatsu-delete.ts"
const PAGE = "src/app/inspection/[id]/page.tsx"
const BUTTON = "src/components/delete-soukatsu-button.tsx"
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8")

async function load(src) {
    fs.mkdirSync(OUT, { recursive: true })
    const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
    const p = path.join(OUT, `soukatsu-delete.${Date.now()}${Math.random().toString(36).slice(2, 6)}.mjs`)
    fs.writeFileSync(p, js, "utf8")
    return import(pathToFileURL(p).href)
}

function behaviour(mod) {
    const problems = []
    const eq = (got, want, label) => { if (got !== want) problems.push(`${label}: ${JSON.stringify(got)}（期待 ${JSON.stringify(want)}）`) }
    eq(mod.soukatsuDeleteBlock({ finalizedCount: 0, delivered: false }), null, "確定も納品もない → 消せる")
    eq(mod.soukatsuDeleteBlock({ finalizedCount: 1, delivered: false }), "finalized", "確定した → 消せない")
    eq(mod.soukatsuDeleteBlock({ finalizedCount: 0, delivered: true }), "delivered", "納品した → 消せない")
    eq(mod.soukatsuDeleteBlock({ finalizedCount: 2, delivered: true }), "delivered", "確定と納品の両方 → 納品を言う")
    const text = mod.soukatsuDeleteConfirmText("テストビル")
    for (const w of ["テストビル", "点検者一覧表", "別記", "物件は消えません", "取り消せません"]) if (!text.includes(w)) problems.push(`確認の文に「${w}」が無い`)
    if (!mod.soukatsuDeleteConfirmText("").includes("この点検")) problems.push("建物名が空のとき確認の文が「この点検」にならない")
    eq(mod.soukatsuDeleteErrorText(null, 1), null, "1 件消えた → 成功")
    if (!mod.soukatsuDeleteErrorText(null, 0)) problems.push("0 件しか消えないのに成功にしている（RLS で弾かれた）")
    if (!/確定または納品/.test(mod.soukatsuDeleteErrorText({ code: "23503", message: "violates foreign key" }, 0) ?? "")) problems.push("外部キーの失敗（23503）を確定・納品の文に言い換えていない")
    if (!/削除できませんでした/.test(mod.soukatsuDeleteErrorText({ code: "XX000", message: "x" }, 0) ?? "")) problems.push("そのほかの失敗を伝えていない")
    for (const k of ["finalized", "delivered"]) if (!mod.SOUKATSU_DELETE_BLOCK_NOTE[k]) problems.push(`消せない理由（${k}）の文が無い`)
    return problems
}

function wiring(page, button) {
    const problems = []
    if (!/finalizedCount: finalization\.available \? finalization\.finalized\.length : 0/.test(page)) problems.push(`${PAGE}: 確定の件数から消せない理由を決めていない`)
    if (!/supabase\.rpc\("get_report_summaries"\)/.test(page) || !/delivered_at/.test(page)) problems.push(`${PAGE}: 納品の有無を読んでいない（納品した点検にボタンが出る）`)
    if (!/<DeleteSoukatsuButton soukatsuId=\{id\} buildingName=\{[^}]+\} block=\{deleteBlock\} \/>/.test(page)) problems.push(`${PAGE}: 削除のボタンを置いていない`)
    if (!/window\.confirm\(soukatsuDeleteConfirmText\(buildingName\)\)/.test(button)) problems.push(`${BUTTON}: 確認の窓を出していない`)
    if (!/\.delete\(\)\s*\n\s*\.eq\("id", soukatsuId\)\s*\n\s*\.select\("id"\)/.test(button)) problems.push(`${BUTTON}: 消えた件数を確かめていない（.select("id") が無い）`)
    if (!/soukatsuDeleteErrorText\(err, data\?\.length \?\? 0\)/.test(button)) problems.push(`${BUTTON}: 失敗を言い換えていない`)
    if (!/\{block \? \(/.test(button)) problems.push(`${BUTTON}: 消せない点検でもボタンを出している`)
    return problems
}

const lib = read(LIB), page = read(PAGE), button = read(BUTTON)

if (SELF_TEST) {
    const neg = [...behaviour(await load(lib)), ...wiring(page, button)]
    if (neg.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of neg) console.log("   ", p)
        process.exit(1)
    }
    const libMutants = [
        ["確定しても消せる", "    if (a.finalizedCount > 0) return \"finalized\"\n", "", "確定した → 消せない"],
        ["0 件でも成功にする", "    if (deletedCount === 0) return", "    if (deletedCount < 0) return", "0 件しか消えない"],
        ["確認の文で別記が消えると言わない", "点検者一覧表と、入力した点検票（別記）もすべて消えます。", "", "点検者一覧表"],
    ]
    for (const [label, from, to, expect] of libMutants) {
        if (!lib.includes(from)) { console.log(`自己診断: 書き換える箇所が ${LIB} に無い: ${JSON.stringify(from)}`); process.exit(1) }
        const r = behaviour(await load(lib.replace(from, to)))
        if (!r.some((p) => p.includes(expect))) { console.log(`自己診断: ${label} → 検出できない`); process.exit(1) }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    const wireMutants = [
        ["納品を見ない", page.replace('supabase.rpc("get_report_summaries")', 'supabase.rpc("noop")'), button, "納品の有無を読んでいない"],
        ["確認の窓を出さない", page, button.replace("if (!window.confirm(soukatsuDeleteConfirmText(buildingName))) return", ""), "確認の窓を出していない"],
        ["消えた件数を確かめない", page, button.replace('            .select("id")\n', ""), "消えた件数を確かめていない"],
    ]
    for (const [label, p, b, expect] of wireMutants) {
        if (p === page && b === button) { console.log(`自己診断: 書き換えられない: ${label}`); process.exit(1) }
        if (!wiring(p, b).some((x) => x.includes(expect))) { console.log(`自己診断: ${label} → 検出できない`); process.exit(1) }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    console.log("  陰性対照: 消せない理由 4 通り・確認の文・失敗の文 4 通り・配線")
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const problems = [...behaviour(await load(lib)), ...wiring(page, button)]
console.log("総括表の削除を検査: 消せない理由・確認の文・失敗の文・配線")
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("SOUKATSU_DELETE_OK")
