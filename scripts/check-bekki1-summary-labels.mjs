// 別記様式第1（消火器）の集計の欄名が、様式（テンプレート PDF）の刷り込みと同じであること（#18・2026-10-06）。
//
// ■ なぜ要るか（2026-10-05 の通し確認）
//   画面の欄名が「撤去数」、様式の刷り込みは「廃棄数」だった。入力した数がどの欄に載るか、
//   画面と紙で言葉が違うと読み替えが要る。★PDF には正しく載るので、PDF の検査では捉えられない種類。
//
// ■ 検査すること
//   画面（デスクトップの表の見出し・スマホのカードの欄名）の集計の欄名が、どれもテンプレートの 2 ページ目に刷り込まれていること。
//   ★テンプレートの文字は縦書きで 1 字ずつ改行されているので、空白・改行を除いて探す。
//
// 使い方: node scripts/check-bekki1-summary-labels.mjs [--self-test]
import fs from "fs"
import { spawnSync } from "child_process"

const FORM = "src/components/shokaki-bekki1-form.tsx"
const TEMPLATE = "public/PDF/s50_kokuji14_bekki1.pdf"
const FIELDS = ["installed", "inspected", "passed", "repair_needed", "removed"]

function templateText() {
    const py = "import sys,fitz\nprint(fitz.open(sys.argv[1])[1].get_text('text'))"
    const r = spawnSync("python", ["-c", py, TEMPLATE], { encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } })
    if (r.status !== 0) throw new Error(`テンプレートを読めない: ${r.stderr}`)
    return r.stdout.replace(/\s+/g, "")
}

/** 画面の欄名: スマホのカード（["field", "欄名"]）と、デスクトップの表の見出し（<th>…数</th>） */
function screenLabels(src) {
    const card = Object.fromEntries(FIELDS.map((f) => [f, src.match(new RegExp(`\\["${f}", "([^"]+)"\\]`))?.[1] ?? null]))
    const heads = [...src.matchAll(/<th className="p-2 border">([^<]*数)<\/th>/g)].map((m) => m[1])
    return { card, heads }
}

function judge(src, tpl) {
    const problems = []
    const { card, heads } = screenLabels(src)
    for (const f of FIELDS) {
        if (!card[f]) problems.push(`スマホのカードに ${f} の欄名が見つからない`)
        else if (!tpl.includes(card[f])) problems.push(`スマホのカードの「${card[f]}」（${f}）が様式に無い`)
    }
    if (heads.length < FIELDS.length) problems.push(`表の見出し（…数）が ${heads.length} 個しか見つからない`)
    for (const h of heads) if (!tpl.includes(h)) problems.push(`表の見出し「${h}」が様式に無い`)
    return problems
}

const src = fs.readFileSync(FORM, "utf8")
const tpl = templateText()

if (process.argv.includes("--self-test")) {
    const ok = judge(src, tpl)
    if (ok.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of ok) console.log("   ", p)
        process.exit(1)
    }
    if (!tpl.includes("廃棄数") || tpl.includes("撤去数")) {
        console.log("自己診断: テンプレートの読み方が想定と違う（廃棄数が無い／撤去数がある）")
        process.exit(1)
    }
    const mutated = src.replace('["removed", "廃棄数"]', '["removed", "撤去数"]').replace(">廃棄数</th>", ">撤去数</th>")
    if (mutated === src) {
        console.log("自己診断: 注入が入らない")
        process.exit(1)
    }
    const bad = judge(mutated, tpl)
    if (bad.length < 2) {
        console.log(`自己診断: 「撤去数」に戻しても検出できない（${bad.length} 件）`)
        process.exit(1)
    }
    console.log("  陰性対照: 集計の欄名 5 つがすべて様式の刷り込みにある")
    console.log(`  陽性対照: 「撤去数」に戻す → カード・見出しの ${bad.length} 件を検出`)
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const problems = judge(src, tpl)
console.log("別記1 の集計の欄名を様式と突き合わせ")
if (problems.length) {
    for (const p of problems) console.log(`  NG  ${p}`)
    process.exit(1)
}
console.log("BEKKI1_SUMMARY_LABELS_OK")
