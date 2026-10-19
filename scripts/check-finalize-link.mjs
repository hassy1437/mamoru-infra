// 出力の画面で「確定」できるか（2026-10-19・本番の通しチェック D）。
//
// ■ なぜ要るか
//   出力の画面は「納品は、点検を確定してからになります」と言うのに、確定のボタンは総括表の画面にしか無く、
//   出力の画面からそこへ行く道も無かった（パンくずの「総括表」だけ）。業者は確定の場所を探して止まる。
//   ★総括表の画面の #finalize へのリンクも試したが、中身とプレビューが後から出て確定の欄が画面の外に押し出された（本番で確かめた）。
//
// ■ 検査すること
//   1. src/lib/finalization.ts の needsFinalizeOnOutput を実際に動かす:
//      確定できて未確定 → 出す／確定済み・状態が分からない・解約日を迎えた・契約が無い → 出さない
//   2. 配線: 出力の画面が needsFinalizeOnOutput のときに、確定のボタン（総括表の画面と同じ部品）を
//      総括表の id と空の必須を渡して、PDF・納品のボタンより上に出す
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
    if (typeof mod.needsFinalizeOnOutput !== "function") return ["needsFinalizeOnOutput が無い"]
    for (const [label, state, want] of CASES) {
        const got = mod.needsFinalizeOnOutput(state)
        if (got !== want) problems.push(`「${label}」で${want ? "出す" : "出さない"}はずが ${got}`)
    }
    return problems
}

function wiring(files) {
    const problems = []
    const out = files[OUTPUT]
    const block = out.match(/\{needsFinalizeOnOutput\(finalization\) && \(([\s\S]*?)\n\s*\)\}/)?.[1] ?? null
    if (block === null) problems.push(`${OUTPUT}: needsFinalizeOnOutput(finalization) のときに確定のボタンを出していない`)
    else {
        if (!block.includes("<FinalizeSoukatsuButton")) problems.push(`${OUTPUT}: 未確定の案内の中に確定のボタンが無い`)
        if (!block.includes("soukatsuId={id}")) problems.push(`${OUTPUT}: 確定のボタンに総括表の id（soukatsuId={id}）を渡していない`)
        // ★空の必須があれば押せない（総括表の画面と同じ）。渡し忘れると、出力の画面からは空のまま確定できてしまう
        if (!block.includes("missingRequired={readiness.missing.map((m) => m.label)}")) problems.push(`${OUTPUT}: 確定のボタンに空の必須（missingRequired）を渡していない`)
    }
    // ★案内は PDF・納品のボタンより上（押せないボタンの近くで、先に目に入る所）
    const at = out.indexOf("{needsFinalizeOnOutput(finalization) && (")
    if (at < 0 || at > out.indexOf("<CombinedPdfButton")) problems.push(`${OUTPUT}: 確定の案内が PDF のボタンより下にある`)
    return problems
}

const files = Object.fromEntries([OUTPUT].map((f) => [f, read(f)]))
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
        ["案内を外す（直す前）", "{needsFinalizeOnOutput(finalization) && (", "{false && (", "確定のボタンを出していない"],
        ["空の必須を渡し忘れる", "missingRequired={readiness.missing.map((m) => m.label)}", "missingRequired={[]}", "missingRequired"],
        ["別の id を渡す", "soukatsuId={id}", "soukatsuId={itiranId}", "soukatsuId={id}"],
        ["案内の中にボタンを置かない", "<FinalizeSoukatsuButton\n", "<div\n", "確定のボタンが無い"],
    ]
    for (const [label, from, to, expect] of wireMutants) {
        if (!files[OUTPUT].includes(from)) { console.log(`自己診断: 書き換える箇所が ${OUTPUT} に無い: ${from}`); process.exit(1) }
        const r = wiring({ ...files, [OUTPUT]: files[OUTPUT].replace(from, to) })
        if (!r.some((p) => p.includes(expect))) { console.log(`自己診断: ${label} → 検出できない`); for (const p of r) console.log("   ", p); process.exit(1) }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    console.log("  陰性対照: 確定できて未確定のときだけ、出力の画面に確定のボタン（総括表の id・空の必須つき）を PDF より上に出す")
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const problems = [...behaviour(await load(lib)), ...wiring(files)]
console.log(`出力の画面の確定のボタンを検査: 状態 ${CASES.length} 通り・配線 1 画面`)
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("FINALIZE_LINK_OK")
