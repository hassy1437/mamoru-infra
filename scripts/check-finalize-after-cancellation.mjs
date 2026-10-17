// 解約日を迎えた業者・第1編の契約が無い口座に、確定のボタンの代わりに理由を出すか（業務提携規約 第26条・第4条2項・第12条1項・2026-10-17）。
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
const EDIT_PAGE = "src/app/inspection/[id]/edit/page.tsx"
const EDIT_FORM = "src/components/soukatsu-edit-form.tsx"
const GATE = "src/lib/pdf-gate-client.ts"
const BEKKI_FORMS = ["bekki-result-form-base", "foam-bekki5-form", "halogen-bekki7-form", "inert-gas-bekki6-form", "powder-bekki8-form",
    "shokaki-bekki1-form", "shokasen-bekki2-form", "sprinkler-bekki3-form", "water-spray-bekki4-form"].map((n) => `src/components/${n}.tsx`)
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

/** 偽の DB。★rpc は名前で分ける（プレビュー・解約の読み口・契約の読み口で結果が違う） */
function fakeDb({ blocked, notContracted = { data: false, error: null }, rows = { data: [], error: null }, identityChanged = { data: false, error: null } }) {
    const chain = (result) => {
        const q = { select: () => q, eq: () => q, in: () => q, order: () => q, then: (res, rej) => Promise.resolve(result).then(res, rej) }
        return q
    }
    return {
        rpc: async (name) =>
            name === "finalize_blocked_since" ? blocked
            : name === "finalize_not_contracted" ? notContracted
            : name === "active_finalizations" ? rows
            : name === "finalization_identity_changed" ? identityChanged
            : { data: [PREVIEW], error: null },
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

const NC_CASES = [
    // [見出し, 契約の読み口の結果, 確定の記録, 期待する notContracted, 契約の案内を出すか]
    ["契約が無い・未確定", { data: true, error: null }, NONE, true, true],
    ["契約が無い・確定済み（以前の確定）", { data: true, error: null }, DONE, true, false],
    ["契約がある", { data: false, error: null }, NONE, false, false],
    ["関数が無い（未適用）", { data: null, error: { code: "PGRST202", message: "Could not find the function" } }, NONE, false, false],
    ["関数が失敗した", { data: null, error: { code: "57014", message: "timeout" } }, NONE, false, false],
    ["形が違う（配列）", { data: [PREVIEW], error: null }, NONE, false, false],
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
    console.error = () => {}
    try {
        for (const [label, nc, rows, want, ncMsg] of NC_CASES) {
            const got = await lib.loadFinalizationState(fakeDb({ blocked: { data: null, error: null }, notContracted: nc, rows }), "s1")
            if (!got.available) { problems.push(`判定が違う（契約）: ${label} → available:false`); continue }
            if (got.notContracted !== want) problems.push(`契約の判定が違う: ${label} → ${got.notContracted}（期待 ${want}）`)
            const gate = lib.finalizeBlockedGateMessage?.(got) ?? null
            if (ncMsg) {
                if (!gate || !/業者登録の承認を受けたあと/.test(gate)) problems.push(`契約が無いのに PDF・納品の案内が契約の文になっていない: ${label}`)
            } else if (gate !== null) {
                problems.push(`契約の案内を出す場面でないのに出している: ${label}`)
            }
        }
    } finally {
        console.error = quiet
    }
    // ---- K2: 確定のあとに建物名などを変えた ----
    console.error = () => {}
    try {
        const ic = await lib.loadFinalizationState(fakeDb({ blocked: { data: null, error: null }, identityChanged: { data: true, error: null } }), "s1")
        if (!ic.available || ic.identityChanged !== true) problems.push("K2: 「変わった」の判定が読み口の結果を使っていない")
        const icMissing = await lib.loadFinalizationState(fakeDb({ blocked: { data: null, error: null }, identityChanged: { data: null, error: { code: "PGRST202", message: "Could not find the function" } } }), "s1")
        if (!icMissing.available || icMissing.identityChanged !== false) problems.push("K2: 関数が無い（未適用）ときに「変わった」と読んでいる")
    } finally {
        console.error = quiet
    }
    if (!/別の点検として、もう一度確定が必要です/.test(lib.IDENTITY_CHANGED_MESSAGE ?? "")) problems.push("K2: 変わったときの案内（IDENTITY_CHANGED_MESSAGE）が無い")
    if (!/建物名・点検日・点検種別を変えると/.test(lib.EDIT_AFTER_FINALIZE_NOTICE ?? "")) problems.push("K2: 編集の前の注意（EDIT_AFTER_FINALIZE_NOTICE）が無い")
    if (!/supabase\.rpc\("active_finalizations"/.test(src(LIB))) problems.push("K2: 有効な確定を DB（active_finalizations）から読んでいない（取消・使い回しも確定ありと数える）")

    if (!/第4条2項・第12条1項/.test(lib.FINALIZE_NOT_CONTRACTED_MESSAGE ?? "") || !/プレビュー/.test(lib.FINALIZE_NOT_CONTRACTED_MESSAGE ?? "")) {
        problems.push("契約が無いときの案内に、根拠（第4条2項・第12条1項）か「プレビューは使える」が無い")
    }
    if (lib.finalizeBlockNotice?.("2026-11-30", true) !== lib.finalizeBlockedMessage?.("2026-11-30")) {
        problems.push("解約日を迎えた（契約もある）ときは解約の文を優先していない")
    }
    const m = lib.finalizeBlockedMessage?.("2026-11-30") ?? ""
    if (!/第26条/.test(m) || !/確定済みの報告書は、これまでどおり見る・PDF を出力できます/.test(m)) {
        problems.push("解約日の案内に、根拠（第26条）か「確定済みは見る・PDF を出力できる」が無い")
    }

    const button = src(BUTTON)
    if (!/blockedSince: string \| null/.test(button)) problems.push("確定のボタンが blockedSince を受けていない")
    if (!/if \(blockedNotice\) return blockedNotice/.test(button)) problems.push("確定のボタンが、解約日を迎えたときに案内に替えていない（押すとエラーになるボタンのまま）")
    if (!/finalizeBlockNotice\(blockedSince, notContracted\)/.test(button)) problems.push("確定のボタンの案内が finalizeBlockNotice（解約・契約）を使っていない")
    if (!button.includes("/^(VENDOR_CANCELLED|VENDOR_NOT_CONTRACTED)/.test(e.message)")) problems.push("確定のボタンが 'VENDOR_CANCELLED' / 'VENDOR_NOT_CONTRACTED'（画面を開いたあとで変わった）を見分けていない")

    if (!/blockedSince=\{finalization\.blockedSince\}/.test(src(PAGE))) problems.push("総括表の確認画面が blockedSince を渡していない")
    if (!/notContracted=\{finalization\.notContracted\}/.test(src(PAGE))) problems.push("総括表の確認画面が notContracted を渡していない")
    if (!/identityChanged=\{finalization\.identityChanged\}/.test(src(PAGE))) problems.push("K2: 総括表の確認画面が identityChanged を渡していない")
    if (!/\{identityChanged && \(/.test(button) || !/IDENTITY_CHANGED_MESSAGE/.test(button)) problems.push("K2: 確定のボタンが「変わった」の案内を出していない")
    const editPage = src(EDIT_PAGE)
    if (!/supabase\.rpc\("is_finalized"/.test(editPage) || !/isFinalized=\{isFinalized\}/.test(editPage)) problems.push("K2: 編集の画面が確定済みかを渡していない")
    if (!/\{isFinalized && \(/.test(src(EDIT_FORM)) || !/EDIT_AFTER_FINALIZE_NOTICE/.test(src(EDIT_FORM))) problems.push("K2: 編集のフォームが確定済みの注意を出していない")
    // ★点検票の PDF も確定してから（9 か所すべて・ダウンロードの中で・プレビューは止めない）
    for (const f of BEKKI_FORMS) {
        const body = src(f)
        const dl = body.slice(body.indexOf("const handleDownload = useCallback("), body.indexOf("const handleDownload = useCallback(") + 900)
        if (!/const gate = await soukatsuPdfGate\(soukatsuId\)/.test(dl)) problems.push(`K2: ${f} の点検票の PDF が確定を見ていない`)
    }
    const gateSrc = src(GATE)
    if (!/rpc\("is_finalized"/.test(gateSrc) || !/if \(error\) \{[\s\S]*?return null/.test(gateSrc)) problems.push("K2: 点検票の門が is_finalized を見ていない（か、読めないときに止めている＝fail-open でない）")
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
        ["契約の読み口の結果を捨てる", (p) => p === LIB ? read(p).replace('supabase.rpc("finalize_not_contracted")', 'supabase.rpc("x_finalize_not_contracted")') : read(p), "契約の判定が違う: 契約が無い・未確定"],
        ["画面が notContracted を渡さない", (p) => p === PAGE ? read(p).replace("notContracted={finalization.notContracted}", "") : read(p), "notContracted を渡していない"],
        ["K2: 確定の記録を表から直に読む（直す前）", (p) => p === LIB ? read(p).replace('supabase.rpc("active_finalizations"', 'supabase.rpc("x_active_finalizations"') : read(p), "K2: 有効な確定を DB"],
        ["K2: 点検票の 1 つが確定を見ない", (p) => p === BEKKI_FORMS[5] ? read(p).replace("const gate = await soukatsuPdfGate(soukatsuId)", "const gate = null") : read(p), "shokaki-bekki1-form.tsx の点検票の PDF が確定を見ていない"],
        ["K2: 編集の画面が確定済みを渡さない", (p) => p === EDIT_PAGE ? read(p).replace("isFinalized={isFinalized}", "") : read(p), "K2: 編集の画面が確定済みかを渡していない"],
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
console.log(`解約日を迎えた業者・契約の無い口座の確定の扱いを検査: 判定 ${CASES.length}＋${NC_CASES.length} 通り・PDF と納品の案内・ボタンと画面`)
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("FINALIZE_AFTER_CANCELLATION_OK")
