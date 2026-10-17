// 解約日を迎えた業者に、確定のボタンの代わりに理由を出すか（業務提携規約 第26条・2026-10-17）。
//
// ■ なぜ要るか
//   点検アプリはマッチングサイトの業者の状態を見ておらず、解約後も報告書を確定でき、利用料が立った。
//   止めるのは DB（マッチング側 20261105090000 の finalize_soukatsu が 'VENDOR_CANCELLED ' で弾く）。
//   画面が知らないままだと「押すとエラーになるボタン」になり、PDF・納品は「確定してから」と★できないことを求める。
//
// ■ 検査すること（★loadFinalizationState を偽の DB で実際に動かす）
//   1. 読み口（finalize_blocked_since）が日付を返す → blockedSince に入る／null・関数が無い・失敗・形が違う → null
//   2. 案内: 確定していない＋解約日を迎えた → PDF・納品の案内が解約日の文になる／確定済みなら PDF は出せる
//   3. 確定のボタンが blockedSince を受け、案内を出す・'VENDOR_CANCELLED' を見分ける／画面が渡している
//
// 使い方: node scripts/check-finalize-after-cancellation.mjs [--self-test]
import fs from "fs"
import path from "path"
import { pathToFileURL } from "url"
import ts from "typescript"

const ROOT = process.cwd()
const SELF_TEST = process.argv.includes("--self-test")
// ★自己診断と本番で出力先を分ける（check-pdf-all は並列に走らせる）
const OUT = path.join(ROOT, "tmp", SELF_TEST ? "finalize-after-cancellation-selftest" : "finalize-after-cancellation")
const LIB = "src/lib/finalization.ts"
const BUTTON = "src/components/finalize-soukatsu-button.tsx"
const PAGE = "src/app/inspection/[id]/page.tsx"
const ITIRAN_PAGE = "src/app/inspection/[id]/itiran/[itiranId]/page.tsx"
const OUTPUT_PAGE = "src/app/inspection/[id]/itiran/[itiranId]/output/page.tsx"
const PDF_BUTTONS = ["src/components/soukatsu-pdf-button.tsx", "src/components/itiran-pdf-button.tsx", "src/components/combined-pdf-button.tsx"]
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

/** 偽の DB。★rpc は名前で分ける（プレビューと読み口で結果が違う） */
function fakeDb({ blocked, rows = { data: [], error: null } }) {
    const chain = (result) => {
        const q = { select: () => q, eq: () => q, in: () => q, order: () => q, then: (res, rej) => Promise.resolve(result).then(res, rej) }
        return q
    }
    return {
        rpc: async (name) => (name === "finalize_blocked_since" ? blocked : { data: [PREVIEW], error: null }),
        from: () => chain(rows),
    }
}

const NONE = { data: [], error: null }
const DONE = { data: [ROW], error: null }
const CASES = [
    // [見出し, 読み口の結果, 確定の記録, 期待する blockedSince, PDF を出せるか, 解約日の案内か]
    ["解約日を迎えた・未確定", { data: "2026-11-30", error: null }, NONE, "2026-11-30", false, true],
    ["解約日を迎えた・確定済み", { data: "2026-11-30", error: null }, DONE, "2026-11-30", true, false],
    ["迎えていない（null）", { data: null, error: null }, NONE, null, false, false],
    ["関数が無い（未適用）", { data: null, error: { code: "PGRST202", message: "Could not find the function" } }, NONE, null, false, false],
    ["関数が失敗した", { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } }, NONE, null, false, false],
    ["形が違う（配列）", { data: [PREVIEW], error: null }, NONE, null, false, false],
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
        for (const [label, blocked, rows, want, pdf, blockedMsg] of CASES) {
            const got = await lib.loadFinalizationState(fakeDb({ blocked, rows }), "s1")
            if (!got.available) {
                problems.push(`判定が違う: ${label} → available:false（読み口の失敗で確定の状態ごと読めなくしている）`)
                continue
            }
            if (got.blockedSince !== want) problems.push(`解約日の判定が違う: ${label} → ${JSON.stringify(got.blockedSince)}（期待 ${JSON.stringify(want)}）`)
            if (lib.canDownloadPdf(got) !== pdf) problems.push(`PDF の許可が違う: ${label} → ${lib.canDownloadPdf(got)}（期待 ${pdf}）`)
            const gate = lib.finalizeBlockedGateMessage?.(got) ?? null
            const msg = lib.pdfGateMessage?.(got) ?? ""
            if (blockedMsg) {
                if (!gate || !/2026年11月30日/.test(gate)) problems.push(`納品の案内が解約日の文になっていない: ${label}`)
                if (!/解約日（2026年11月30日）を迎えたため/.test(msg)) problems.push(`PDF の案内が解約日の文になっていない: ${label} → ${msg.slice(0, 40)}`)
                if (/確定してから/.test(msg)) problems.push(`解約日を迎えたのに「確定してから」と案内している: ${label}`)
            } else {
                if (gate !== null) problems.push(`解約日の案内を出す場面でないのに出している: ${label}`)
                if (msg !== lib.PDF_GATE_MESSAGE) problems.push(`PDF の案内がいつもの文でない: ${label}`)
            }
        }
    } finally {
        console.error = quiet
    }
    const m = lib.finalizeBlockedMessage?.("2026-11-30") ?? ""
    if (!/第26条/.test(m) || !/確定済みの報告書は、これまでどおり見る・PDF を出力できます/.test(m)) {
        problems.push("解約日の案内に、根拠（第26条）か「確定済みは見る・PDF を出力できる」が無い")
    }

    const button = src(BUTTON)
    if (!/blockedSince: string \| null/.test(button)) problems.push("確定のボタンが blockedSince を受けていない")
    if (!/if \(blockedNotice\) return blockedNotice/.test(button)) problems.push("確定のボタンが、解約日を迎えたときに案内に替えていない（押すとエラーになるボタンのまま）")
    if (!/finalizeBlockedMessage\(blockedSince\)/.test(button)) problems.push("確定のボタンの案内が finalizeBlockedMessage を使っていない")
    if (!/\/\^VENDOR_CANCELLED\/\.test\(e\.message\)/.test(button)) problems.push("確定のボタンが 'VENDOR_CANCELLED'（画面を開いたあとで解約日をまたいだ）を見分けていない")

    if (!/blockedSince=\{finalization\.blockedSince\}/.test(src(PAGE))) problems.push("総括表の確認画面が blockedSince を渡していない")
    for (const p of [PAGE, ITIRAN_PAGE, OUTPUT_PAGE]) {
        if (!/gateMessage=\{pdfGateMessage\(finalization\)\}/.test(src(p))) problems.push(`${p} が PDF のボタンに pdfGateMessage を渡していない`)
    }
    if (!/gateMessage=\{finalizeBlockedGateMessage\(finalization\)\}/.test(src(OUTPUT_PAGE))) problems.push("出力の画面が納品のボタンに解約日の案内を渡していない")
    for (const p of PDF_BUTTONS) {
        if (!/setGateMsg\(gateMessage\)/.test(src(p))) problems.push(`${p} が渡された案内を使っていない`)
    }
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
        ["読み口の結果を捨てる（直す前と同じ）", (p) => p === LIB ? read(p).replace('return typeof data === "string"', 'return null && typeof data === "string"') : read(p), "解約日の判定が違う: 解約日を迎えた・未確定"],
        ["読み口の失敗で確定の状態ごと落とす", (p) => p === LIB ? read(p).replace('console.error("[loadFinalizationState] finalize_blocked_since failed:", error)', 'console.error("[loadFinalizationState] finalize_blocked_since failed:", error); throw new Error("x")') : read(p), "読み込めない"],
        ["PDF の案内を「確定してから」のままにする", (p) => p === LIB ? read(p).replace("return finalizeBlockedGateMessage(state) ?? PDF_GATE_MESSAGE", "return PDF_GATE_MESSAGE") : read(p), "PDF の案内が解約日の文になっていない"],
        ["ボタンが案内に替えない", (p) => p === BUTTON ? read(p).replace("if (blockedNotice) return blockedNotice", "if (false) return blockedNotice") : read(p), "押すとエラーになるボタンのまま"],
        ["画面が blockedSince を渡さない", (p) => p === PAGE ? read(p).replace("blockedSince={finalization.blockedSince}", "blockedSince={null}") : read(p), "blockedSince を渡していない"],
    ]
    for (const [label, src, expect] of mutants) {
        let found
        try {
            found = (await inspect(src)).some((p) => p.includes(expect))
        } catch {
            found = expect === "読み込めない"
        }
        if (!found) {
            console.log(`自己診断: ${label} → 検出できない`)
            process.exit(1)
        }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    console.log(`  陰性対照: 現状（判定 ${CASES.length} 通り・PDF と納品の案内・ボタンと画面）→ 0 件`)
    fs.rmSync(OUT, { recursive: true, force: true })
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const problems = await inspect(read)
fs.rmSync(OUT, { recursive: true, force: true })
console.log(`解約日を迎えた業者の確定の扱いを検査: 判定 ${CASES.length} 通り・PDF と納品の案内・ボタンと画面`)
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("FINALIZE_AFTER_CANCELLATION_OK")
