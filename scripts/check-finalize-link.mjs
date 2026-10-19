// 出力の画面から「確定」へ行けるか（2026-10-19・本番の通しチェック D）。
//
// ■ なぜ要るか
//   出力の画面は「納品は、点検を確定してからになります」と言うのに、確定のボタンは総括表の画面にしか無く、
//   出力の画面からそこへ行くリンクも無かった（パンくずの「総括表」だけ）。業者は確定の場所を探して止まる。
//
// ■ 検査すること
//   1. src/lib/finalization.ts の needsFinalizeLink を実際に動かす:
//      確定できて未確定 → 出す／確定済み・状態が分からない・解約日を迎えた・契約が無い → 出さない
//   2. 配線: 出力の画面が needsFinalizeLink のときに総括表の画面の #finalize へリンクする／総括表の画面の確定の場所に id がある
//
// 使い方: node scripts/check-finalize-link.mjs [--self-test]
import fs from "fs"
import path from "path"
import { pathToFileURL } from "url"
import ts from "typescript"

const ROOT = process.cwd()
const SELF_TEST = process.argv.includes("--self-test")
// ★自己診断と本番で出力先を分ける（check-pdf-all は並列に走らせる）
const OUT = path.join(ROOT, "tmp", SELF_TEST ? "finalize-link-selftest" : "finalize-link")
const LIB = "src/lib/finalization.ts"
const OUTPUT = "src/app/inspection/[id]/itiran/[itiranId]/output/page.tsx"
const SOUKATSU = "src/app/inspection/[id]/page.tsx"
const SCROLL = "src/components/scroll-to-hash.tsx"
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8")

async function load(src) {
    fs.mkdirSync(OUT, { recursive: true })
    const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
    const p = path.join(OUT, `finalization.${Date.now()}${Math.random().toString(36).slice(2, 6)}.mjs`)
    fs.writeFileSync(p, js, "utf8")
    return import(pathToFileURL(p).href)
}

const ROW = { id: "f1", acted_at: "2026-10-01T00:00:00Z", actor_id: "u", equipment_codes: ["a"], billable_codes: ["a"], unit_price_yen: 500, duplicate_confirmed: false }
const ok = (over = {}) => ({ available: true, preview: null, finalized: [], duplicates: [], blockedSince: null, notContracted: false, identityChanged: false, ...over })
const CASES = [
    ["確定できて未確定", ok(), true],
    ["確定済み", ok({ finalized: [ROW] }), false],
    ["状態が分からない（未適用）", { available: false, reason: "missing" }, false],
    ["状態が分からない（失敗）", { available: false, reason: "error" }, false],
    ["解約日を迎えた", ok({ blockedSince: "2026-10-01" }), false],
    ["契約が無い（審査中）", ok({ notContracted: true }), false],
]

function behaviour(mod) {
    const problems = []
    if (typeof mod.needsFinalizeLink !== "function") return ["needsFinalizeLink が無い"]
    for (const [label, state, want] of CASES) {
        const got = mod.needsFinalizeLink(state)
        if (got !== want) problems.push(`「${label}」で${want ? "出す" : "出さない"}はずが ${got}`)
    }
    if (mod.FINALIZE_ANCHOR !== "finalize") problems.push(`FINALIZE_ANCHOR が "finalize" でない（${mod.FINALIZE_ANCHOR}）`)
    return problems
}

function wiring(files) {
    const problems = []
    const out = files[OUTPUT], sou = files[SOUKATSU]
    if (!/\{needsFinalizeLink\(finalization\) && \(/.test(out)) problems.push(`${OUTPUT}: needsFinalizeLink(finalization) のときにリンクを出していない`)
    if (!/href=\{`\/inspection\/\$\{id\}#\$\{FINALIZE_ANCHOR\}`\}/.test(out)) problems.push(`${OUTPUT}: 総括表の画面の #finalize へリンクしていない`)
    // ★リンクは PDF・納品のボタンより上（押せないボタンの近くで、先に目に入る所）
    const link = out.indexOf("needsFinalizeLink(finalization) &&")
    if (link < 0 || link > out.indexOf("<CombinedPdfButton")) problems.push(`${OUTPUT}: 確定へのリンクが PDF のボタンより下にある`)
    // ★<div ...> の id で見る（<ScrollToHash id={FINALIZE_ANCHOR} /> にも同じ文字列があるので、id= だけだと外しても当たる）
    if (!/<div id=\{FINALIZE_ANCHOR\}/.test(sou)) problems.push(`${SOUKATSU}: 確定の場所に id={FINALIZE_ANCHOR} が無い（リンクの行き先が無い）`)
    else if (sou.indexOf("<div id={FINALIZE_ANCHOR}") > sou.indexOf("<FinalizeSoukatsuButton")) problems.push(`${SOUKATSU}: id が確定のボタンを囲んでいない`)
    // ★総括表の画面は中身を後から出す（loading.tsx）ので、ブラウザの #finalize への移動は効かない（本番で確かめた）。欄の中で動かす
    if (!/<ScrollToHash id=\{FINALIZE_ANCHOR\} \/>/.test(sou)) problems.push(`${SOUKATSU}: 確定の欄に <ScrollToHash id={FINALIZE_ANCHOR} /> が無い（移っても確定の欄まで下がらない）`)
    const sth = files[SCROLL]
    if (!/window\.location\.hash !== `#\$\{id\}`/.test(sth) || !/scrollIntoView\(/.test(sth)) problems.push(`${SCROLL}: #id のときに scrollIntoView していない`)
    return problems
}

const files = Object.fromEntries([OUTPUT, SOUKATSU, SCROLL].map((f) => [f, read(f)]))
const lib = read(LIB)

if (SELF_TEST) {
    const neg = [...behaviour(await load(lib)), ...wiring(files)]
    if (neg.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of neg) console.log("   ", p)
        process.exit(1)
    }
    const libMutants = [
        ["確定済みでも出す", "return state.finalized.length === 0 && ", "return ", "確定済み"],
        ["確定できないとき（解約・契約なし）も出す", " && finalizeBlockNotice(state.blockedSince, state.notContracted) === null", "", "解約日"],
        ["状態が分からないときも出す", "if (!state.available) return false", "if (!state.available) return true", "状態が分からない"],
    ]
    for (const [label, from, to, expect] of libMutants) {
        if (!lib.includes(from)) { console.log(`自己診断: 書き換える箇所が ${LIB} に無い: ${from}`); process.exit(1) }
        const r = behaviour(await load(lib.replace(from, to)))
        if (!r.some((p) => p.includes(expect))) { console.log(`自己診断: ${label} → 検出できない`); for (const p of r) console.log("   ", p); process.exit(1) }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    const wireMutants = [
        ["リンクを外す（直す前）", OUTPUT, "{needsFinalizeLink(finalization) && (", "{false && (", "リンクを出していない"],
        ["行き先を総括表の画面の上にする", OUTPUT, "href={`/inspection/${id}#${FINALIZE_ANCHOR}`}", "href={`/inspection/${id}`}", "#finalize"],
        ["総括表の画面の id を外す", SOUKATSU, "id={FINALIZE_ANCHOR} ", "", "id={FINALIZE_ANCHOR}"],
        ["欄の中で動かすのをやめる（ブラウザ任せに戻す）", SOUKATSU, "<ScrollToHash id={FINALIZE_ANCHOR} />", "", "ScrollToHash"],
        ["動かす部品が何もしない", SCROLL, "scrollIntoView(", "focus(", "scrollIntoView"],
    ]
    for (const [label, file, from, to, expect] of wireMutants) {
        if (!files[file].includes(from)) { console.log(`自己診断: 書き換える箇所が ${file} に無い: ${from}`); process.exit(1) }
        const r = wiring({ ...files, [file]: files[file].replace(from, to) })
        if (!r.some((p) => p.includes(expect))) { console.log(`自己診断: ${label} → 検出できない`); for (const p of r) console.log("   ", p); process.exit(1) }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    console.log("  陰性対照: 確定できて未確定のときだけ出す・出力の画面から #finalize へ・総括表の画面に行き先があり、欄が出たら動かす")
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const problems = [...behaviour(await load(lib)), ...wiring(files)]
console.log(`出力の画面から確定へのリンクを検査: 状態 ${CASES.length} 通り・配線 2 画面`)
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("FINALIZE_LINK_OK")
