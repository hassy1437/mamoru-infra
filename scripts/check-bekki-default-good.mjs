// 判定の初期値「良」（src/lib/bekki-default-good.ts）の配線を検査する（2026-10-20・打合せ録音 102）。
//
// ■ なぜ要るか
//   ・録音 102「最初から良が入っていて、問題のある所だけ否に変えればよい」で、まだ保存していない様式を開いたら
//     「この様式の空欄をすべて良にする」と同じ処理を 1 回だけ自動でかけるようにした。
//   ・★見ていない行が「良」のまま消防署への報告書に出るおそれがあるので、初期値を入れた様式に印
//     （payload.judgments_defaulted）を付け、「確かめました」を押すまで出力前の確認に出す（止めない）。
//   ・様式は 23（共通ベース 15 様式＋専用フォーム 8 本）。1 本でも配線が切れると、その様式だけ黙って
//     ①初期値が入らない ②印が保存されず「初期値のまま」が知らされない ③確かめても印が消えない、になる。
//   ・★既に保存してある様式（今までの入力・前回の複製）に入れ直すと、入力済みの空欄（していない点検）に○が付く。
//     「新しい様式だけ」（savedPayload が無い）を見張る。
//
// ■ 検査すること
//   1. 印の読み方: true のときだけ「初期値のまま」（文字の "true"・空・無しは違う）
//   2. 配線: 23 様式すべてが 印を読む・印を保存する・新しい様式だけ・印を渡す・確かめを受ける
//   3. ボタンの部品: 1 回だけ（開発時の二重の effect でも）・確かめの窓を出さずに入れる・入れたら印を立てる・
//      「確かめました」で印を下ろす・押す所は 44px
//   4. 出力前の確認: 印のある様式を「初期値のまま」と知らせる
//
// 使い方: node scripts/check-bekki-default-good.mjs [--self-test]
import fs from "fs"
import path from "path"
import { pathToFileURL } from "url"
import ts from "typescript"

const ROOT = process.cwd()
const SELF_TEST = process.argv.includes("--self-test")
// ★自己診断と本番で出力先を分ける（check-pdf-all は並列に走らせる）
const OUT = path.join(ROOT, "tmp", SELF_TEST ? "bekki-default-good-selftest" : "bekki-default-good")
const LIB = "src/lib/bekki-default-good.ts"
const BASE = "src/components/bekki-result-form-base.tsx"
const BUTTON = "src/components/bekki-bulk-good-button.tsx"
const READINESS = "src/lib/report-readiness.ts"
// ★Windows の取り出しは CRLF。改行をそろえて読む
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n")

async function loadLib(mutate = (s) => s) {
    fs.mkdirSync(OUT, { recursive: true })
    const tag = Date.now() + Math.random().toString(36).slice(2, 6)
    const js = ts.transpileModule(mutate(read(LIB)), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
    const file = path.join(OUT, `bekki-default-good.${tag}.mjs`)
    fs.writeFileSync(file, js, "utf8")
    return import(pathToFileURL(file).href)
}

function loadSources() {
    const dir = path.join(ROOT, "src", "components")
    const forms = fs.readdirSync(dir).filter((f) => f.endsWith("-form.tsx")).map((f) => [`src/components/${f}`, read(`src/components/${f}`)])
    return {
        base: read(BASE),
        button: read(BUTTON),
        readiness: read(READINESS),
        custom: forms.filter(([, s]) => s.includes("<BekkiBulkGoodButton")),
        baseUsers: forms.filter(([, s]) => /<BekkiResultFormBase\b/.test(s)).length,
    }
}

function behaviour(lib) {
    const problems = []
    if (typeof lib.isJudgmentsDefaulted !== "function") return ["isJudgmentsDefaulted が無い"]
    if (lib.JUDGMENTS_DEFAULTED_KEY !== "judgments_defaulted") problems.push(`印の名前が judgments_defaulted でない（${lib.JUDGMENTS_DEFAULTED_KEY}）`)
    const cases = [
        [{ judgments_defaulted: true }, true],
        [{ judgments_defaulted: false }, false],
        [{ judgments_defaulted: "true" }, false],
        [{ judgments_defaulted: 1 }, false],
        [{}, false],
        [null, false],
        [undefined, false],
    ]
    for (const [payload, want] of cases) {
        if (lib.isJudgmentsDefaulted(payload) !== want) problems.push(`印 ${JSON.stringify(payload)} を「初期値のまま」と${want ? "読まない" : "読む"}`)
    }
    return problems
}

const FORM_WIRES = [
    ["印を読む", /const \[judgmentsDefaulted, setJudgmentsDefaulted\] = useState\(\(\) => isJudgmentsDefaulted\(saved\)\)/],
    ["印を保存する", /\n        judgments_defaulted: judgmentsDefaulted,\n/],
    ["新しい様式だけ", /\n                fresh=\{savedPayload == null\}\n/],
    ["印を渡す", /\n                defaulted=\{judgmentsDefaulted\}\n/],
    ["確かめを受ける", /\n                onDefaultedChange=\{setJudgmentsDefaulted\}\n/],
]

function wiring(src) {
    const problems = []
    for (const [name, s] of [["共通ベース", src.base], ...src.custom]) {
        for (const [label, re] of FORM_WIRES) if (!re.test(s)) problems.push(`${name}: ${label} が無い`)
    }
    if (src.custom.length !== 8) problems.push(`専用フォームが ${src.custom.length} 本（8 本のはず）`)
    if (src.baseUsers !== 15) problems.push(`共通ベースを使う様式が ${src.baseUsers}（15 のはず）`)

    // ボタンの部品: 1 回だけ・確かめの窓を出さない・入れたら印を立てる
    const b = src.button
    const effect = b.slice(b.indexOf("useEffect(() => {"), b.indexOf("}, [])"))
    if (!b.includes("const autoApplied = useRef(false)")) problems.push("ボタン: 1 回だけの見張り（useRef）が無い")
    if (!effect.includes("if (!fresh || autoApplied.current) return")) problems.push("ボタン: 新しい様式だけ・1 回だけになっていない")
    if (!effect.includes("autoApplied.current = true")) problems.push("ボタン: 入れたことを覚えていない（開発時の二重の effect で 2 回入る）")
    if (!effect.includes("onApply(plan.targets)")) problems.push("ボタン: 開いたときに入れていない")
    if (!effect.includes("onDefaultedChange?.(true)")) problems.push("ボタン: 入れたのに印を立てていない（「初期値のまま」が知らされない）")
    if (effect.includes("window.confirm")) problems.push("ボタン: 開いたときに確かめの窓を出している（自動で入れる約束）")
    if (!b.includes("onClick={() => onDefaultedChange?.(false)}") || !b.includes("{DEFAULT_GOOD_CONFIRM_LABEL}")) problems.push("ボタン: 「確かめました」で印を下ろしていない")
    const confirmBtn = b.slice(b.indexOf("onDefaultedChange?.(false)") - 400, b.indexOf("{DEFAULT_GOOD_CONFIRM_LABEL}"))
    if (!/\bmin-h-11\b/.test(confirmBtn)) problems.push("ボタン: 「確かめました」の押す所が 44px 未満")

    // 出力前の確認
    if (!src.readiness.includes("isJudgmentsDefaulted(payload)") || !src.readiness.includes("`bekki_defaulted:${stepId}`")) {
        problems.push("出力前の確認: 印のある様式を「初期値のまま」と知らせていない")
    }
    return problems
}

const sources = loadSources()

if (SELF_TEST) {
    const neg = [...behaviour(await loadLib()), ...wiring(sources)]
    if (neg.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of neg) console.log("   ", p)
        process.exit(1)
    }
    // 印の読み方
    {
        const r = behaviour(await loadLib((s) => s.replace("=== true", "== true || payload?.[JUDGMENTS_DEFAULTED_KEY] === \"true\"")))
        if (!r.some((p) => p.includes('"true"'))) { console.log("自己診断: 文字の \"true\" を印と読んでも検出できない"); process.exit(1) }
        console.log("  陽性対照: 文字の \"true\" を印と読む → 検出")
    }
    // 配線
    const halogen = "src/components/halogen-bekki7-form.tsx"
    const mut = [
        ["専用フォーム（別記7）が保存した様式にも入れる", "custom", "                fresh={savedPayload == null}\n", "                fresh={true}\n", `${halogen}: 新しい様式だけ が無い`],
        ["専用フォーム（別記7）が印を保存しない", "custom", "        judgments_defaulted: judgmentsDefaulted,\n", "", `${halogen}: 印を保存する が無い`],
        ["共通ベースが確かめを受けない", "base", "                onDefaultedChange={setJudgmentsDefaulted}\n", "", "共通ベース: 確かめを受ける が無い"],
        ["ボタンが毎回入れる（1 回だけでない）", "button", "if (!fresh || autoApplied.current) return", "if (!fresh) return", "ボタン: 新しい様式だけ・1 回だけ"],
        ["ボタンが入れても印を立てない", "button", "        onDefaultedChange?.(true)\n", "", "ボタン: 入れたのに印を立てていない"],
        ["出力前の確認が知らせない", "readiness", "isJudgmentsDefaulted(payload)", "false", "出力前の確認"],
    ]
    for (const [label, where, from, to, expect] of mut) {
        let mutated
        if (where === "custom") {
            const s = sources.custom.find(([n]) => n === halogen)?.[1]
            if (!s || !s.includes(from)) { console.log(`自己診断: 注入先が無い（${label}）`); process.exit(1) }
            mutated = { ...sources, custom: sources.custom.map(([n, x]) => [n, n === halogen ? x.replace(from, to) : x]) }
        } else {
            if (!sources[where].includes(from)) { console.log(`自己診断: 注入先が無い（${label}）`); process.exit(1) }
            mutated = { ...sources, [where]: sources[where].replace(from, to) }
        }
        if (!wiring(mutated).some((p) => p.startsWith(expect))) { console.log(`自己診断: ${label} → 検出できない`); process.exit(1) }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    console.log("  陰性対照: 23 様式の配線・ボタンの部品・出力前の確認とも問題なし")
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const problems = [...behaviour(await loadLib()), ...wiring(sources)]
console.log(`判定の初期値「良」を検査: 23 様式（共通ベース ${sources.baseUsers}・専用 ${sources.custom.length}）の配線・ボタンの部品・出力前の確認`)
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("BEKKI_DEFAULT_GOOD_OK")
