// 確定の状態を読めなかったとき、確定のボタンを黙って消さずに理由を出すか（2026-10-09・総点検 B5）。
//
// ■ なぜ要るか
//   preview_finalization が失敗すると、総括表の確認画面から確定の導線が丸ごと消え、業者には
//   「確定ボタンが無い」としか見えなかった（理由はサーバのログだけ）。
//   さらに、確定の記録（soukatsu_finalizations）を読めなかったときは「確定 0 件」として返していたので、
//   確定済みなのに PDF が止まり、確定ボタンがもう一度出た。
//
// ■ 検査すること（★loadFinalizationState を偽の DB で実際に動かす）
//   1. 関数が無い → missing ／ 関数が失敗 → error ／ ★記録が読めない → error（0 件にしない）／ 読めた → available
//   2. canDownloadPdf: missing・error は通す（fail-open）・確定 0 件は止める・確定ありは通す
//   3. 総括表の確認画面が error のときに案内を出し、missing のときは出さない
//
// 使い方: node scripts/check-finalization-error-notice.mjs [--self-test]
import fs from "fs"
import path from "path"
import { pathToFileURL } from "url"
import ts from "typescript"

const ROOT = process.cwd()
const SELF_TEST = process.argv.includes("--self-test")
// ★自己診断と本番で出力先を分ける（check-pdf-all は並列に走らせる）
const OUT = path.join(ROOT, "tmp", SELF_TEST ? "finalization-error-notice-selftest" : "finalization-error-notice")
const LIB = "src/lib/finalization.ts"
const PAGE = "src/app/inspection/[id]/page.tsx"
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8")

async function loadLib(src) {
    fs.mkdirSync(OUT, { recursive: true })
    const tag = Date.now() + Math.random().toString(36).slice(2, 6)
    const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
    const file = path.join(OUT, `finalization.${tag}.mjs`)
    fs.writeFileSync(file, js, "utf8")
    return import(pathToFileURL(file).href)
}

const PREVIEW = { equipment_codes: ["a"], billable_codes: ["a"], unit_price_yen: 0, amount_yen: 0, duplicate_of: null, needs_duplicate_confirm: false }
const ROW = { id: "f1", acted_at: "2026-10-01T00:00:00Z", actor_id: "u", equipment_codes: ["a"], billable_codes: ["a"], unit_price_yen: 0, duplicate_confirmed: false }

/** 偽の DB。rpc の結果と、確定の記録の select の結果を差し替えられる */
function fakeDb({ rpc, rows }) {
    const chain = (result) => {
        const q = { select: () => q, eq: () => q, in: () => q, order: () => q, then: (res, rej) => Promise.resolve(result).then(res, rej) }
        return q
    }
    return { rpc: async () => rpc, from: () => chain(rows) }
}

const CASES = [
    ["関数が無い（未適用）", { rpc: { data: null, error: { code: "PGRST202", message: "Could not find the function" } }, rows: { data: [], error: null } }, { available: false, reason: "missing" }, true],
    ["関数が失敗した", { rpc: { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } }, rows: { data: [], error: null } }, { available: false, reason: "error" }, true],
    ["★確定の記録が読めない", { rpc: { data: [PREVIEW], error: null }, rows: { data: null, error: { code: "42501", message: "permission denied" } } }, { available: false, reason: "error" }, true],
    ["読めた・確定 0 件", { rpc: { data: [PREVIEW], error: null }, rows: { data: [], error: null } }, { available: true, finalized: 0 }, false],
    ["読めた・確定あり", { rpc: { data: [PREVIEW], error: null }, rows: { data: [ROW], error: null } }, { available: true, finalized: 1 }, true],
]

async function inspect(src) {
    const problems = []
    let lib
    try {
        lib = await loadLib(src(LIB))
    } catch (e) {
        return [`${LIB} を読み込めない: ${e.message}`]
    }
    const quiet = console.error
    console.error = () => {} // ★偽の失敗のログで出力を埋めない
    try {
        for (const [label, db, want, pdf] of CASES) {
            const got = await lib.loadFinalizationState(fakeDb(db), "s1")
            const ok = got.available === want.available
                && (want.available ? got.finalized.length === want.finalized : got.reason === want.reason)
            if (!ok) problems.push(`判定が違う: ${label} → ${JSON.stringify({ available: got.available, reason: got.reason, finalized: got.finalized?.length })}`)
            if (lib.canDownloadPdf(got) !== pdf) problems.push(`PDF の許可が違う: ${label} → ${lib.canDownloadPdf(got)}（期待 ${pdf}）`)
        }
    } finally {
        console.error = quiet
    }
    if (!/読み込み直して/.test(lib.FINALIZATION_ERROR_MESSAGE ?? "")) problems.push("読めなかったときの案内（FINALIZATION_ERROR_MESSAGE）が無い")

    const page = src(PAGE)
    if (!/\{!finalization\.available && finalization\.reason === "error" && \([\s\S]*?\{FINALIZATION_ERROR_MESSAGE\}/.test(page)) problems.push("総括表の確認画面が、読めなかったときに案内を出していない（確定ボタンが黙って消える）")
    if (/finalization\.reason === "missing"[\s\S]{0,200}FINALIZATION_ERROR_MESSAGE/.test(page)) problems.push("未適用（missing）でも案内を出している")
    return problems
}

if (SELF_TEST) {
    const neg = await inspect(read)
    if (neg.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of neg) console.log("   ", p)
        process.exit(1)
    }
    const mutants = [
        // ★改行（CRLF）をまたがない置き換えにする。直後の return を else に入れて飛ばす＝直す前と同じ「0 件で続ける」
        ["記録が読めないと 0 件にする（直す前）", (p) => p === LIB ? read(p).replace('finalizations select failed:", rErr)', 'finalizations select failed:", rErr); if (true) {} else') : read(p), "確定の記録が読めない"],
        ["失敗を未適用と取り違える", (p) => p === LIB ? read(p).replace('preview_finalization failed:", error)', 'preview_finalization failed:", error); return { available: false, reason: "missing" }') : read(p), "関数が失敗した"],
        ["画面が案内を出さない", (p) => p === PAGE ? read(p).replace('{!finalization.available && finalization.reason === "error" && (', '{false && (') : read(p), "黙って消える"],
    ]
    for (const [label, src, expect] of mutants) {
        if (!(await inspect(src)).some((p) => p.includes(expect))) {
            console.log(`自己診断: ${label} → 検出できない`)
            process.exit(1)
        }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    console.log(`  陰性対照: 現状（判定 ${CASES.length} 通り・PDF の許可・画面の案内）→ 0 件`)
    fs.rmSync(OUT, { recursive: true, force: true })
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const problems = await inspect(read)
fs.rmSync(OUT, { recursive: true, force: true })
console.log(`確定の状態を読めなかったときの扱いを検査: 判定 ${CASES.length} 通り・PDF の許可・画面の案内`)
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("FINALIZATION_ERROR_NOTICE_OK")
