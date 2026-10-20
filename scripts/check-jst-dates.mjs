// 画面に出す日付が日本時間か（2026-10-20・本番の通しチェック 2 回目）。
//
// ■ なぜ要るか
//   `iso.slice(0, 10)` や `new Date().toISOString().split("T")[0]` は世界標準時の日付になる。
//   日本時間の 0〜9 時は前日になり、
//   ・納品済みの日付（deliver-report-button）… 10/20 朝の納品が「2026-10-19」と出た
//   ・総括表を新しく作るときの点検年月日の初期値（soukatsu-form）… 朝に作ると前日が入る（報告書に載る）
//   ★画面には何も出ず、朝に使ったときだけずれる種類。
//
// ■ 検査すること
//   1. src/lib/date-utils.ts の formatJstYmd・jstTodayYmd を実際に動かす（日本時間の 0 時・9 時の境目）
//   2. 配線: 上の 2 か所が使っている／src の画面のコードに UTC の日付の切り出しが残っていない
//
// 使い方: node scripts/check-jst-dates.mjs [--self-test]
import fs from "fs"
import path from "path"
import { pathToFileURL } from "url"
import ts from "typescript"

const ROOT = process.cwd()
const SELF_TEST = process.argv.includes("--self-test")
// ★自己診断と本番で出力先を分ける（check-pdf-all は並列に走らせる）
const OUT = path.join(ROOT, "tmp", SELF_TEST ? "jst-dates-selftest" : "jst-dates")
const LIB = "src/lib/date-utils.ts"
const DELIVER = "src/components/deliver-report-button.tsx"
const SOUKATSU = "src/components/soukatsu-form.tsx"
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8")

async function load(src) {
    fs.mkdirSync(OUT, { recursive: true })
    const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
    const p = path.join(OUT, `date-utils.${Date.now()}${Math.random().toString(36).slice(2, 6)}.mjs`)
    fs.writeFileSync(p, js, "utf8")
    return import(pathToFileURL(p).href)
}

// [日時, 日本時間の日付]
const CASES = [
    ["2026-10-19T23:29:42.670Z", "2026-10-20"], // 本番で前日に見えた納品（日本時間 10/20 08:29）
    ["2026-10-19T14:59:59.999Z", "2026-10-19"], // 日本時間 23:59:59
    ["2026-10-19T15:00:00.000Z", "2026-10-20"], // 日本時間 0:00
    ["2026-12-31T15:00:00+00:00", "2027-01-01"], // 年をまたぐ
    ["2026-10-20T08:00:00+09:00", "2026-10-20"],
]

function behaviour(mod) {
    const problems = []
    if (typeof mod.formatJstYmd !== "function" || typeof mod.jstTodayYmd !== "function") return ["formatJstYmd・jstTodayYmd が無い"]
    for (const [at, want] of CASES) {
        const got = mod.formatJstYmd(at)
        if (got !== want) problems.push(`formatJstYmd("${at}") が ${got}（日本時間は ${want}）`)
    }
    if (mod.formatJstYmd("not a date") !== "") problems.push("読めない日時で空にならない")
    const today = mod.jstTodayYmd(new Date("2026-10-19T23:29:42Z"))
    if (today !== "2026-10-20") problems.push(`jstTodayYmd（日本時間 10/20 08:29）が ${today}`)
    return problems
}

/** src の画面のコード（テスト以外）で、UTC の日付を切り出している所 */
function utcSlices(files) {
    const out = []
    for (const [f, s] of Object.entries(files)) {
        // ★コメントは見ない（行番号は保つ）。説明に「iso.slice(0, 10) は UTC」と書いてある
        const code0 = s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
        const lines = s.split("\n")
        code0.split("\n").forEach((codeLine, i) => {
            const line = lines[i]
            const code = codeLine.replace(/\/\/.*$/, "")
            if (/toISOString\(\)\.(split\(\s*['"]T['"]\s*\)|slice\(0,\s*10\)|substring\(0,\s*10\))/.test(code)
                || /\biso\.slice\(0,\s*10\)/.test(code)) out.push(`${f}:${i + 1}: ${line.trim()}`)
        })
    }
    return out
}

function wiring(files) {
    const problems = []
    if (!/return formatJstYmd\(iso\)/.test(files[DELIVER])) problems.push(`${DELIVER}: 納品済みの日付を formatJstYmd で出していない`)
    if (!/const initialInspectionDate = jstTodayYmd\(\)/.test(files[SOUKATSU])) problems.push(`${SOUKATSU}: 点検年月日の初期値が日本時間の今日（jstTodayYmd）でない`)
    for (const hit of utcSlices(files)) problems.push(`UTC の日付の切り出しが残っている（日本時間の朝に前日になる）: ${hit}`)
    return problems
}

function walk(dir) {
    const out = []
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) out.push(...walk(p))
        else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p)
    }
    return out
}

const files = Object.fromEntries(walk("src").map((f) => [f, read(f)]))
const lib = read(LIB)

if (SELF_TEST) {
    // ★「時間帯を外す」の陽性対照は、走らせる環境の時間帯が日本時間だと通ってしまう。UTC（サーバ・CI と同じ）に決めて見る
    process.env.TZ = "UTC"
    const neg = [...behaviour(await load(lib)), ...wiring(files)]
    if (neg.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of neg) console.log("   ", p)
        process.exit(1)
    }
    const libMutants = [
        ["時間帯を外す（サーバの時間帯＝UTC になる）", 'timeZone: "Asia/Tokyo", ', "", "2026-10-19T23:29:42.670Z"],
        ["UTC の切り出しに戻す", "return JST_YMD.format(d)", "return d.toISOString().slice(0, 10)", "2026-10-19T23:29:42.670Z"],
    ]
    for (const [label, from, to, expect] of libMutants) {
        if (!lib.includes(from)) { console.log(`自己診断: 書き換える箇所が ${LIB} に無い: ${from}`); process.exit(1) }
        const r = behaviour(await load(lib.replace(from, to)))
        if (!r.some((p) => p.includes(expect))) { console.log(`自己診断: ${label} → 検出できない（TZ=${process.env.TZ ?? "未設定"}）`); for (const p of r) console.log("   ", p); process.exit(1) }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    const wireMutants = [
        ["納品済みの日付を直す前に戻す", DELIVER, "return formatJstYmd(iso)", "return iso.slice(0, 10)", "formatJstYmd"],
        ["点検年月日の初期値を直す前に戻す", SOUKATSU, "const initialInspectionDate = jstTodayYmd()", "const initialInspectionDate = new Date().toISOString().split('T')[0]", "jstTodayYmd"],
        ["ほかの画面で UTC の切り出しを足す", "src/components/report-list.tsx", "\n", "\nconst _d = new Date().toISOString().slice(0, 10)\n", "UTC の日付の切り出しが残っている"],
    ]
    for (const [label, file, from, to, expect] of wireMutants) {
        if (!files[file]?.includes(from)) { console.log(`自己診断: 書き換える箇所が ${file} に無い: ${JSON.stringify(from)}`); process.exit(1) }
        const r = wiring({ ...files, [file]: files[file].replace(from, to) })
        if (!r.some((p) => p.includes(expect))) { console.log(`自己診断: ${label} → 検出できない`); process.exit(1) }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    console.log(`  陰性対照: 日本時間の境目 ${CASES.length} 通り・2 か所の配線・src ${Object.keys(files).length} ファイルに UTC の切り出し 0`)
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const problems = [...behaviour(await load(lib)), ...wiring(files)]
console.log(`画面の日付が日本時間かを検査: 境目 ${CASES.length} 通り・配線 2 か所・src ${Object.keys(files).length} ファイル`)
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("JST_DATES_OK")
