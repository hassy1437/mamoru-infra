// 結合PDFの綴じ順を検査する。
//
// ■ なぜ要るか
//   結合PDFの順序は入力フローの並び（STEPS）で決まっており、
//   1→12→13…22→2→3…11の2 とバラバラだった（実機で指摘）。
//   ★指標には出ない: 罫線も越えず切り詰めも起きないので、全検査が緑のまま
//   「綴じたときに目的の様式を探せない」という実用上の不良になっていた。
//
// ■ 検査すること
//   1. PDF_MERGE_CONFIG の全エントリに formNo があり、重複していない
//      （様式を足したときに書き忘れると、その様式だけ順序が不定になる）
//   2. formNo が apiRoute の様式番号と一致している（写経ミスの排除）
//   3. buildTasks の出力が「報告書 → 総括表 → 点検者一覧 → 別記様式（番号順）」
//
// 使い方: node scripts/check-merge-order.mjs [--self-test]
import fs from "fs"
import path from "path"

const ROOT = process.cwd()
const CONFIG = path.join(ROOT, "src", "lib", "pdf-merge-config.ts")
const MERGE = path.join(ROOT, "src", "lib", "build-merged-report.ts")

const problems = []
const check = (ok, message) => {
    if (!ok) problems.push(message)
}

const src = fs.readFileSync(CONFIG, "utf8")
const entries = [...src.matchAll(
    /^\s*"?([\w-]+)"?:\s*\{\s*apiRoute:\s*"([^"]+)"\s*,\s*formNo:\s*([\d.]+)\s*,/gm,
)].map((m) => ({ id: m[1], route: m[2], formNo: Number(m[3]) }))

// 1. 書き忘れが無いか（エントリ総数と突き合わせる）
const total = (src.match(/^\s*"?[\w-]+"?:\s*\{\s*apiRoute:/gm) ?? []).length
check(entries.length === total, `formNo の無いエントリがある（${total - entries.length} 件）`)
check(total >= 20, `PDF_MERGE_CONFIG のエントリが ${total} 件しか読めない（解析が壊れている可能性）`)

// 2. formNo が apiRoute の様式番号と一致するか
for (const e of entries) {
    const m = e.route.match(/bekki(\d+)(?:-(\d))?-pdf/)
    if (!m) {
        problems.push(`${e.id}: apiRoute から様式番号を読めない（${e.route}）`)
        continue
    }
    const expected = Number(m[1]) + (m[2] ? Number(m[2]) / 10 : 0)
    check(Math.abs(e.formNo - expected) < 1e-9,
        `${e.id}: formNo ${e.formNo} が apiRoute の様式番号 ${expected} と一致しない`)
}

// 3. 重複が無いか
const seen = new Map()
for (const e of entries) {
    if (seen.has(e.formNo)) problems.push(`formNo ${e.formNo} が重複（${seen.get(e.formNo)} と ${e.id}）`)
    seen.set(e.formNo, e.id)
}

// 4. 結合側が formNo で並べ替えているか（並べ替えを消すと落ちる）
const merge = fs.readFileSync(MERGE, "utf8")
check(/\.sort\(\(a, b\) => a\.formNo - b\.formNo\)/.test(merge),
    "build-merged-report が formNo で並べ替えていない（入力フローの並びのまま綴じられる）")
// 先頭3つの順序
const head = [...merge.matchAll(/\{\s*label:\s*"([^"]+)"\s*,\s*route:/g)].map((m) => m[1])
check(JSON.stringify(head.slice(0, 3)) === JSON.stringify(["報告書", "総括表", "点検者一覧"]),
    `綴じ順の先頭が「報告書 → 総括表 → 点検者一覧」でない: ${JSON.stringify(head.slice(0, 3))}`)

if (process.argv.includes("--self-test")) {
    if (problems.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of problems) console.log("   ", p)
        process.exit(1)
    }
    // 陽性対照: formNo を1つ書き換えたら検出できるか
    const mutated = src.replace("formNo: 3,", "formNo: 30,")
    const e2 = [...mutated.matchAll(
        /^\s*"?([\w-]+)"?:\s*\{\s*apiRoute:\s*"([^"]+)"\s*,\s*formNo:\s*([\d.]+)\s*,/gm,
    )].map((m) => ({ route: m[2], formNo: Number(m[3]) }))
    const bad = e2.some((e) => {
        const m = e.route.match(/bekki(\d+)(?:-(\d))?-pdf/)
        return m && Math.abs(e.formNo - (Number(m[1]) + (m[2] ? Number(m[2]) / 10 : 0))) > 1e-9
    })
    if (!bad) {
        console.log("自己診断: formNo を書き換えても不一致を検出できない")
        process.exit(1)
    }
    console.log(`  陰性対照: ${entries.length} 様式すべて formNo が apiRoute と一致・重複なし`)
    console.log("  陽性対照: formNo を 3 → 30 に変える → 不一致を検出")
    console.log("SELF_TEST_OK")
    process.exit(0)
}

console.log(`綴じ順を検査: ${entries.length} 様式`)
console.log(`  順序: 報告書 → 総括表 → 点検者一覧 → ${entries.slice().sort((a, b) => a.formNo - b.formNo).map((e) => e.formNo).join(" → ")}`)
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("MERGE_ORDER_OK")
