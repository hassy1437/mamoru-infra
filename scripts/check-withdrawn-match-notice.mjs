// 成約が取り消された物件を、点検アプリの画面で知らせるか（2026-10-09・総点検 B3）。
//
// ■ なぜ要るか
//   成約が取り消されると、マッチング側のトリガが物件に withdrawn_at を立てる（凍結）。点検アプリは
//   この列をどこでも読んでおらず、業者は点検を全部入力したあと、納品で初めて
//   「INT3b: 取消済みの成約には納品できません」で止まっていた。★本番に取り消しの物件は今 0 件なので、
//   画面を開いても確かめられない ―― 部品を実際に描いて確かめる。
//
// ■ 検査すること
//   1. withdrawnAtOf を実際に動かす（成約由来＋取り消し＝日時／成約由来でない・取り消されていない＝null）
//   2. 知らせの部品を実際に描く（文言と日本時間の日付が出る・取り消されていなければ何も出さない）
//   3. 物件・新しい総括表・総括表の確認・別記入力のまとめ・出力の 5 画面が知らせを出し、withdrawn_at を読んでいる
//   4. 出力画面が取り消された成約で納品ボタンを出さない（★納品ボタンを出す画面が増えたら落とす）
//   5. 物件一覧が名前の下に印を出す（物件の一覧・点検を始める物件の選択の両方）
//
// 使い方: node scripts/check-withdrawn-match-notice.mjs [--self-test]
import fs from "fs"
import path from "path"
import { createRequire } from "module"
import { pathToFileURL } from "url"
import ts from "typescript"

const ROOT = process.cwd()
const require = createRequire(path.join(ROOT, "package.json"))
const SELF_TEST = process.argv.includes("--self-test")
// ★自己診断と本番で出力先を分ける（check-pdf-all は並列に走らせる）
const OUT = path.join(ROOT, "tmp", SELF_TEST ? "withdrawn-match-notice-selftest" : "withdrawn-match-notice")
const LIB = "src/lib/match-withdrawn.ts"
const NOTICE = "src/components/withdrawn-match-notice.tsx"
const OUTPUT = "src/app/inspection/[id]/itiran/[itiranId]/output/page.tsx"
const SEARCH = "src/components/property-search.tsx"
const PAGES = [
    "src/app/properties/[id]/page.tsx",
    "src/app/inspection/new/page.tsx",
    "src/app/inspection/[id]/page.tsx",
    "src/app/inspection/[id]/itiran/[itiranId]/page.tsx",
    OUTPUT,
]
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8")

function srcFiles(dir) {
    const out = []
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) out.push(...srcFiles(p))
        else if (/\.(ts|tsx)$/.test(e.name)) out.push(p.replace(/\\/g, "/"))
    }
    return out
}

async function load(src) {
    fs.mkdirSync(OUT, { recursive: true })
    const tag = Date.now() + Math.random().toString(36).slice(2, 6)
    const opts = { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.ReactJSX } }
    const libFile = path.join(OUT, `match-withdrawn.${tag}.mjs`)
    fs.writeFileSync(libFile, ts.transpileModule(src(LIB), opts).outputText, "utf8")
    // ★部品の import を実ファイルへ向け直す（node_modules は絶対パスの file URL で解決する）
    const resolve = (m) => pathToFileURL(require.resolve(m)).href
    let notice = ts.transpileModule(src(NOTICE), opts).outputText
    notice = notice
        .replace(/from\s+"@\/lib\/match-withdrawn"/g, `from "${pathToFileURL(libFile).href}"`)
        .replace(/from\s+"lucide-react"/g, `from "${resolve("lucide-react")}"`)
        .replace(/from\s+"react\/jsx-runtime"/g, `from "${resolve("react/jsx-runtime")}"`)
    const noticeFile = path.join(OUT, `withdrawn-match-notice.${tag}.mjs`)
    fs.writeFileSync(noticeFile, notice, "utf8")
    const lib = await import(pathToFileURL(libFile).href)
    const { default: Notice } = await import(pathToFileURL(noticeFile).href)
    return { lib, Notice }
}

async function inspect(src) {
    const problems = []
    let lib, Notice
    try {
        ;({ lib, Notice } = await load(src))
    } catch (e) {
        return [`部品を読み込めない: ${e.message}`]
    }
    const at = "2026-10-08T21:30:00Z" // 日本時間では 10 月 9 日
    const cases = [
        ["成約由来＋取り消し", { source_match_id: "m1", withdrawn_at: at }, at],
        ["成約由来・取り消しなし", { source_match_id: "m1", withdrawn_at: null }, null],
        ["成約由来でない（取り消しの列だけある）", { source_match_id: null, withdrawn_at: at }, null],
        ["物件が無い", null, null],
    ]
    for (const [label, prop, want] of cases) {
        const got = lib.withdrawnAtOf(prop)
        if (got !== want) problems.push(`withdrawnAtOf が違う: ${label} → ${got}（期待 ${want}）`)
    }

    const { renderToStaticMarkup } = await import(pathToFileURL(require.resolve("react-dom/server")).href)
    const { createElement } = await import(pathToFileURL(require.resolve("react")).href)
    const html = renderToStaticMarkup(createElement(Notice, { withdrawnAt: at }))
    if (!html.includes("成約が取り消されています")) problems.push("知らせに「成約が取り消されています」が出ない")
    if (!html.includes("2026年10月9日")) problems.push(`知らせの日付が日本時間でない（${html.match(/（[^）]*）/)?.[0] ?? "日付なし"}）`)
    if (!html.includes("納品できません")) problems.push("知らせに「納品できません」が出ない")
    if (renderToStaticMarkup(createElement(Notice, { withdrawnAt: null })) !== "") problems.push("取り消されていないのに知らせが出る")

    for (const p of PAGES) {
        const s = src(p)
        if (!/<WithdrawnMatchNotice withdrawnAt=\{/.test(s)) problems.push(`${p} が知らせを出していない`)
        if (!/withdrawn_at/.test(s) && !/\.from\("properties"\)\s*\.select\("\*"\)/.test(s)) problems.push(`${p} が withdrawn_at を読んでいない`)
    }
    const out = src(OUTPUT)
    if (!/\{sourceMatchId && !withdrawnAt && \(\s*<DeliverReportButton/.test(out)) problems.push("出力画面が取り消された成約でも納品ボタンを出す（押すと INT3b で落ちる）")
    const deliverers = srcFiles("src").filter((f) => f !== "src/components/deliver-report-button.tsx" && /<DeliverReportButton\b/.test(src(f)))
    if (deliverers.length !== 1 || deliverers[0] !== OUTPUT) problems.push(`納品ボタンを出す画面が出力画面だけでない: ${deliverers.join(", ") || "（0 か所）"}`)

    const search = src(SEARCH)
    if ((search.match(/<WithdrawnBadge property=\{property\} \/>/g) ?? []).length !== 2) problems.push("物件一覧の両方の表示（物件の一覧・点検を始める物件の選択）に取り消しの印が無い")
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
        ["成約由来かを見ない", (p) => p === LIB ? read(p).replace("if (!property?.source_match_id) return null", "if (!property) return null") : read(p), "成約由来でない"],
        ["日付を日本時間にしない", (p) => p === LIB ? read(p).replace('timeZone: "Asia/Tokyo", ', 'timeZone: "UTC", ') : read(p), "日本時間"],
        ["取り消しでも納品ボタンを出す", (p) => p === OUTPUT ? read(p).replace("{sourceMatchId && !withdrawnAt && (", "{sourceMatchId && (") : read(p), "納品ボタンを出す"],
        ["別記入力のまとめに知らせが無い", (p) => p === PAGES[3] ? read(p).replace(/\s*<WithdrawnMatchNotice withdrawnAt=\{withdrawnAt\} className="mt-4" \/>/, "") : read(p), "知らせを出していない"],
        ["物件一覧の印が片方だけ", (p) => p === SEARCH ? read(p).replace("<WithdrawnBadge property={property} />", "") : read(p), "取り消しの印"],
    ]
    for (const [label, src, expect] of mutants) {
        if (!(await inspect(src)).some((p) => p.includes(expect))) {
            console.log(`自己診断: ${label} → 検出できない`)
            process.exit(1)
        }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    console.log(`  陰性対照: 現状（判定 4 通り・部品を描く・${PAGES.length} 画面・納品ボタン・一覧の印）→ 0 件`)
    fs.rmSync(OUT, { recursive: true, force: true })
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const problems = await inspect(read)
fs.rmSync(OUT, { recursive: true, force: true })
console.log(`成約の取り消しの知らせを検査: 判定・部品を描く・${PAGES.length} 画面・納品ボタン・一覧の印`)
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("WITHDRAWN_MATCH_NOTICE_OK")
