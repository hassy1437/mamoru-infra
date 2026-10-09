// URL の点検者一覧が URL の総括表のものかを、一覧の階層の外枠で確かめているか（2026-10-09・総点検 C5）。
//
// ■ なぜ要るか
//   別記 23 様式・一覧のまとめ・出力の画面は、一覧（inspection_itiran）を ID だけで読んでいた（確かめていたのは編集画面だけ）。
//   別の報告書の一覧の ID を URL に組むと、様式を保存したときに soukatsu_id が URL の報告書に書き換わり、
//   出力では別の報告書の一覧が混ざった。★画面の見た目は正常なので、PDF の検査では出ない種類。
//
// ■ 検査すること（ソースを読む）
//   1. src/app/inspection/[id]/itiran/[itiranId]/layout.tsx があり、一覧を id と soukatsu_id の両方で絞って読み、
//      無ければ notFound() する（読み込みの失敗では止めない）
//   2. その階層の画面（page.tsx）が 20 以上ある（走査の空振り防止）＝ 全部が外枠の下にある
//
// 使い方: node scripts/check-itiran-soukatsu-guard.mjs [--self-test]
import fs from "fs"
import path from "path"

const ROOT = process.cwd()
const DIR = "src/app/inspection/[id]/itiran/[itiranId]"
const LAYOUT = `${DIR}/layout.tsx`
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8")

function pagesUnder(dir) {
    const out = []
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const p = `${dir}/${e.name}`
        if (e.isDirectory()) out.push(...pagesUnder(p))
        else if (e.name === "page.tsx") out.push(p)
    }
    return out
}

function inspect(src) {
    const problems = []
    let layout
    try {
        layout = src(LAYOUT)
    } catch {
        return [`${LAYOUT} が無い＝一覧と総括表の組み合わせをどこでも確かめていない`]
    }
    const query = layout.match(/\.from\("inspection_itiran"\)[\s\S]*?\.maybeSingle\(\)/)?.[0] ?? ""
    if (!query) problems.push("外枠が一覧（inspection_itiran）を読んでいない")
    if (!/\.eq\("id", itiranId\)/.test(query)) problems.push("外枠が一覧を URL の itiranId で絞っていない")
    if (!/\.eq\("soukatsu_id", id\)/.test(query)) problems.push("外枠が一覧を URL の総括表（soukatsu_id）で絞っていない＝組み合わせ違いを通す")
    if (!/else if \(!data\) \{\s*notFound\(\)/.test(layout)) problems.push("組み合わせが違うときに notFound() していない")
    if (/if \(error\) \{[^}]*notFound\(\)/.test(layout)) problems.push("読み込みの失敗でも 404 にしている（正しい報告書まで見つからなく見える）")
    const pages = pagesUnder(DIR)
    if (pages.length < 20) problems.push(`一覧の階層の画面が ${pages.length} 枚しか見つからない（走査の空振り）`)
    return problems
}

if (process.argv.includes("--self-test")) {
    const neg = inspect(read)
    if (neg.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of neg) console.log("   ", p)
        process.exit(1)
    }
    const mutants = [
        ["総括表で絞らない", (p) => p === LAYOUT ? read(p).replace('.eq("soukatsu_id", id)', "") : read(p), "soukatsu_id"],
        ["組み合わせ違いを通す", (p) => p === LAYOUT ? read(p).replace(/else if \(!data\) \{\s*notFound\(\)/, "else if (!data) {") : read(p), "notFound"],
        ["外枠が無い", (p) => { if (p === LAYOUT) throw new Error("無い"); return read(p) }, "が無い"],
    ]
    for (const [label, src, expect] of mutants) {
        if (!inspect(src).some((p) => p.includes(expect))) { console.log(`自己診断: ${label} → 検出できない`); process.exit(1) }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    console.log(`  陰性対照: 現状（外枠で id と soukatsu_id を確かめる・画面 ${pagesUnder(DIR).length} 枚）→ 0 件`)
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const problems = inspect(read)
console.log(`一覧と総括表の組み合わせの確かめを検査: 外枠・画面 ${pagesUnder(DIR).length} 枚`)
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("ITIRAN_SOUKATSU_GUARD_OK")
