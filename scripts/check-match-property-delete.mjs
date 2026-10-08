// 成約から作った物件を、業者が画面から消せないか（2026-10-08・総点検の見直しで見つけたもの）。
//
// ■ なぜ要るか
//   納品ボタンは物件に残る成約の結び付き（source_match_id）で出す（output/page.tsx）。物件を消すと総括表から
//   物件へのひもづけが外れて納品できなくなり、作り直しても結び付きは戻らない（成約したときにしか作られない）。
//   以前は確認文も「別記が表示できなくなる」としか言わず、納品できなくなることは伝えていなかった。
//
// ■ 検査すること（ソースを読む。★削除の入口が増えたら落とす）
//   1. 物件一覧が、成約から作った物件（取り消されていないもの）に fromActiveMatch を渡している
//   2. その判定が source_match_id と withdrawn_at の両方を見ている（取り消された成約の物件は消してよい）
//   3. PropertyActionButtons が fromActiveMatch のとき削除ボタンを出さない
//   4. 物件を消す入口（properties の delete）が PropertyActionButtons の 1 か所だけ
//
// 使い方: node scripts/check-match-property-delete.mjs [--self-test]
import fs from "fs"
import path from "path"

const ROOT = process.cwd()
const SEARCH = "src/components/property-search.tsx"
const BUTTONS = "src/components/property-action-buttons.tsx"
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8")

function srcFiles(dir) {
    const out = []
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) out.push(...srcFiles(p))
        else if (/\.(ts|tsx)$/.test(e.name)) out.push(p)
    }
    return out
}

function inspect(src) {
    const problems = []
    const search = src(SEARCH)
    const buttons = src(BUTTONS)
    if (!/fromActiveMatch=\{isFromActiveMatch\(property\)\}/.test(search)) problems.push("物件一覧が成約由来の物件を PropertyActionButtons に伝えていない")
    const fn = search.match(/const isFromActiveMatch = [\s\S]*?\n\}/)?.[0] ?? ""
    if (!fn.includes("source_match_id")) problems.push("成約由来の判定が source_match_id を見ていない")
    if (!/!p\.withdrawn_at/.test(fn)) problems.push("成約由来の判定が取り消し（withdrawn_at）を見ていない＝取り消された成約の物件まで消せない")
    if (!/\{fromActiveMatch \? \([\s\S]*?\) : \([\s\S]*?onClick=\{handleDelete\}/.test(buttons)) problems.push("PropertyActionButtons が fromActiveMatch のときも削除ボタンを出す")
    const deleters = srcFiles("src").filter((f) => /from\("properties"\)\s*\.delete\(\)/.test(src(f.replace(/\\/g, "/"))))
        .map((f) => f.replace(/\\/g, "/"))
    if (deleters.length !== 1 || deleters[0] !== BUTTONS) problems.push(`物件を消す入口が PropertyActionButtons だけでない: ${deleters.join(", ") || "（0 か所）"}`)
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
        ["物件一覧が成約由来を伝えない", (p) => p === SEARCH ? read(p).replace("fromActiveMatch={isFromActiveMatch(property)}", "") : read(p), "伝えていない"],
        ["取り消しを見ない", (p) => p === SEARCH ? read(p).replace("&& !p.withdrawn_at", "") : read(p), "取り消し"],
        ["成約由来でも削除ボタンを出す", (p) => p === BUTTONS ? read(p).replace("{fromActiveMatch ? (", "{false ? (") : read(p), "削除ボタンを出す"],
    ]
    for (const [label, src, expect] of mutants) {
        if (!inspect(src).some((p) => p.includes(expect))) { console.log(`自己診断: ${label} → 検出できない`); process.exit(1) }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    console.log("  陰性対照: 現状（成約由来は削除ボタンなし・取り消し済みは消せる・削除の入口は 1 か所）→ 0 件")
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const problems = inspect(read)
console.log("成約から作った物件の削除を検査: 一覧の受け渡し・取り消しの扱い・削除ボタン・削除の入口")
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("MATCH_PROPERTY_DELETE_OK")
