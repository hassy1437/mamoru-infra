// 別記1（消火器）の「消火器の耐圧性能」の行で種別（A〜F）を付けられ、PDF にも描くか（2026-10-20）。
//
// ■ なぜ要るか
//   雛形のその2 では、種別（A〜F）の欄が無いのは簡易消火用具の 2 行（外形・水量等）だけで、
//   その上の「消火器の耐圧性能」の行には A〜F の欄がある。画面もルートも 18 行目（耐圧性能）から省いていて、
//   耐圧性能を点検した種別を書けなかった（2026-10-20 の記入漏れの総点検で見つけた）。
//
// ■ 検査すること
//   画面の PAGE2_ITEMS で 18 行目が「消火器の耐圧性能」・19 行目が「外形」で、画面とルートが 19 行目から省くこと
//
// 使い方: node scripts/check-bekki1-pressure-marks.mjs [--self-test]
import fs from "fs"
import path from "path"

const ROOT = process.cwd()
const SELF_TEST = process.argv.includes("--self-test")
const FORM = "src/components/shokaki-bekki1-form.tsx"
const ROUTE = "src/app/api/generate-shokaki-bekki1-pdf/route.ts"
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8")

function check(form, route) {
    const problems = []
    const items = form.match(/const PAGE2_ITEMS = \[([\s\S]*?)\] as const/)
    const labels = items ? [...items[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : []
    const pressure = labels.indexOf("消火器の耐圧性能")
    const firstSimple = labels.indexOf("外形", pressure + 1)
    if (pressure < 0 || firstSimple !== pressure + 1) problems.push(`${FORM}: その2 の「消火器の耐圧性能」の次が簡易消火用具の「外形」になっていない（${pressure} / ${firstSimple}）`)
    // ★2026-10-20 から定数 P2_MARK_ROWS（種別をまとめて付ける処理と同じ値を使う）
    const konst = form.match(/\nconst P2_MARK_ROWS = (\d+)\n/)
    const ui = form.match(/renderItemTable\("（その2）点検結果", "p2", PAGE2_ITEMS, page2Rows, (\d+|P2_MARK_ROWS)\)/)
    const uiRows = ui ? (ui[1] === "P2_MARK_ROWS" ? konst?.[1] : ui[1]) : undefined
    if (!uiRows) problems.push(`${FORM}: その2 の表の種別を省く行が読めない`)
    else if (Number(uiRows) !== firstSimple) problems.push(`${FORM}: 画面が ${uiRows} 行目から種別を省いている（簡易消火用具の「外形」= ${firstSimple} 行目から）`)
    if (konst && !/const next2 = fill\(PAGE2_ITEMS, page2Rows, P2_MARK_ROWS\)/.test(form)) problems.push(`${FORM}: 種別をまとめて付ける処理が、その2 の種別の欄の無い行にも付ける`)
    const rt = route.match(/\n\s*if \(i >= (\d+)\) return\n/)
    if (!rt) problems.push(`${ROUTE}: その2 の種別を省く行が読めない`)
    else if (Number(rt[1]) !== firstSimple) problems.push(`${ROUTE}: PDF が ${rt[1]} 行目から種別を省いている（簡易消火用具の「外形」= ${firstSimple} 行目から）`)
    return problems
}

const form = read(FORM), route = read(ROUTE)

if (SELF_TEST) {
    const neg = check(form, route)
    if (neg.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of neg) console.log("   ", p)
        process.exit(1)
    }
    const mutants = [
        ["画面を 18 に戻す", form.replace("const P2_MARK_ROWS = 19", "const P2_MARK_ROWS = 18"), route, "画面が 18 行目から"],
        ["まとめて付けるときに行数を見ない", form.replace("fill(PAGE2_ITEMS, page2Rows, P2_MARK_ROWS)", "fill(PAGE2_ITEMS, page2Rows, PAGE2_ITEMS.length)"), route, "種別の欄の無い行にも付ける"],
        ["PDF を 18 に戻す", form, route.replace("if (i >= 19) return", "if (i >= 18) return"), "PDF が 18 行目から"],
    ]
    for (const [label, f, r, expect] of mutants) {
        if (f === form && r === route) { console.log(`自己診断: 書き換えられない: ${label}`); process.exit(1) }
        if (!check(f, r).some((x) => x.includes(expect))) { console.log(`自己診断: ${label} → 検出できない`); process.exit(1) }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    console.log("  陰性対照: 行の並び・画面・PDF")
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const problems = check(form, route)
console.log("別記1 の耐圧性能の行の種別を検査: 行の並び・画面・PDF")
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("BEKKI1_PRESSURE_MARKS_OK")
