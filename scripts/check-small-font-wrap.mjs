// 狭い欄の社名・製造者名が 5pt 未満まで縮まないこと（#22・2026-10-06）。
//
// ■ なぜ要るか（2026-10-05 の通し確認）
//   1 行のまま縮めていて、別記5 の製造者名（7 文字）が 3.86pt、別記13/21 の社名（18 文字）が 4.67/4.08pt。
//   欄の高さには 2 行入る。枠内収容の優先順位は 折り返し → 縮小。
//   ★小さい文字は正常な見た目なので、目で見る照合では「小さいな」で流れる種類。
//
// ■ 検査すること（実際に PDF を作り、描かれた文字のサイズを測る）
//   1. 長い値: 描かれた文字がすべて 5pt 以上・切り詰めずに全文が出ている
//   2. 短い値: 1 行のまま・設計サイズのまま（★収まっている値の見た目を変えない）
//   陽性対照: 直していない欄（別記7 の措置内容 13 文字・行の高さに 2 行入らない）は 5pt 未満と測れる
//             ＝ 測り方が小さい文字を捉えている。
//
// 使い方: node scripts/check-small-font-wrap.mjs [--self-test]
import fs from "fs"
import path from "path"
import { spawnSync } from "child_process"
import { runRouteOutput } from "./run-route-pdf.mjs"

// ★自己診断と本番の検査で出力先を分ける（check-pdf-all は両方を並列に走らせる。同じ名前だと書きかけを読む）
const OUT = path.join("tmp", "small-font-wrap", process.argv.includes("--self-test") ? "self-test" : "check")
fs.mkdirSync(OUT, { recursive: true })
const MIN_PT = 5.0

const ROUTES = {
    bekki5: "src/app/api/generate-foam-bekki5-pdf/route.ts",
    bekki7: "src/app/api/generate-halogen-bekki7-pdf/route.ts",
    bekki13: "src/app/api/generate-fire-department-notification-bekki13-pdf/route.ts",
    bekki21: "src/app/api/generate-emergency-power-outlet-bekki21-pdf/route.ts",
}
const basePayload = (form) => JSON.parse(fs.readFileSync(`tmp/pdf-realistic/${form}_test.payload.json`, "utf8"))

/** 値を含むスパン（オーバーレイの字形）を拾い、サイズと文字を返す */
const MEASURE_PY = `
import sys, json, fitz
pdf, value = sys.argv[1], sys.argv[2]
hints = ("NotoSansJP", "Helvetica", "Arial")
out = []
for page in fitz.open(pdf):
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                t = s["text"].strip()
                if t and any(h in s["font"] for h in hints) and t in value and len(t) >= 1:
                    out.append({"size": round(s["size"], 2), "text": t, "top": round(s["bbox"][1], 1), "x": round(s["bbox"][0], 1)})
print(json.dumps(out, ensure_ascii=False))
`

function measure(pdf, value) {
    const r = spawnSync("python", ["-c", MEASURE_PY, pdf, value], { encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } })
    if (r.status !== 0) throw new Error(`測れない: ${r.stderr}`)
    return JSON.parse(r.stdout.trim().split("\n").pop())
}

/**
 * 値のスパンだけに絞る（同じ文字が別の欄にあるかもしれないので、値の連結で照合する）。
 * ★折り返した行は同じ x（セル左端＋余白）から始まる。同じ段の別の欄と混ざらないよう、x ごとに分けて上から連結する。
 */
function spansOf(spans, value) {
    const byX = new Map()
    for (const s of spans) {
        const k = Math.round(s.x)
        byX.set(k, [...(byX.get(k) ?? []), s])
    }
    for (const group of byX.values()) {
        const sorted = group.sort((a, b) => a.top - b.top)
        for (let i = 0; i < sorted.length; i++) {
            let acc = ""
            const picked = []
            for (let j = i; j < sorted.length && acc.length < value.length; j++) {
                if (!value.startsWith(acc + sorted[j].text)) break
                acc += sorted[j].text
                picked.push(sorted[j])
            }
            if (acc === value) return picked
        }
    }
    return null
}

const JP = "株式会社サンプル消防設備保守センター防災"
const CASES = [
    { label: "別記5 製造者名（電動機・7 文字）", form: "bekki5", field: "motor_maker", value: JP.slice(0, 7), long: true },
    { label: "別記5 製造者名（泡消火薬剤・7 文字）", form: "bekki5", field: "foam_maker", value: "能美防災株式会", long: true },
    { label: "別記13 社名（18 文字）", form: "bekki13", field: "inspector_company", value: JP.slice(0, 18), long: true },
    { label: "別記21 社名（18 文字）", form: "bekki21", field: "inspector_company", value: JP.slice(0, 18), long: true },
    { label: "別記5 製造者名（4 文字）", form: "bekki5", field: "motor_maker", value: "能美防災", long: false },
    { label: "別記13 社名（10 文字）", form: "bekki13", field: "inspector_company", value: JP.slice(0, 10), long: false },
    { label: "別記21 社名（10 文字）", form: "bekki21", field: "inspector_company", value: JP.slice(0, 10), long: false },
]

async function render(form, mutate, name) {
    const payload = basePayload(form)
    mutate(payload)
    const out = path.join(OUT, `${name}.pdf`)
    await runRouteOutput({ routePath: ROUTES[form], payload, outPath: out })
    return out
}

async function judge(c) {
    const pdf = await render(c.form, (p) => { p[c.field] = c.value }, `${c.form}-${c.field}-${c.value.length}`)
    const spans = spansOf(measure(pdf, c.value), c.value)
    if (!spans) return `${c.label}: 全文が見つからない（切り詰め・欠落）`
    const min = Math.min(...spans.map((s) => s.size))
    if (c.long) {
        if (min < MIN_PT) return `${c.label}: ${min}pt（5pt 未満）`
        return null
    }
    // 短い値: 1 行のまま（★1 行で 5pt 以上なら折り返さない。見た目が従来どおりかはベースライン照合が見る）
    const lines = new Set(spans.map((s) => s.top)).size
    if (lines !== 1) return `${c.label}: ${lines} 行に割れた（1 行で 5pt 以上なら 1 行のまま）`
    if (min < MIN_PT) return `${c.label}: ${min}pt（5pt 未満）`
    return null
}

if (process.argv.includes("--self-test")) {
    // ★陽性対照: 直していない欄（別記7 の措置内容 13 文字）は 5pt 未満と測れる
    const v = "配管継手部を新品に交換済み"
    const pdf = await render("bekki7", (p) => {
        for (const k of Object.keys(p)) if (/rows$/.test(k)) for (const r of p[k] ?? []) if (r && r.action_content) r.action_content = v
    }, "bekki7-action-13")
    const spans = measure(pdf, v).filter((s) => s.text === v)
    const min = spans.length ? Math.min(...spans.map((s) => s.size)) : null
    if (min === null || min >= MIN_PT) {
        console.log(`自己診断: 5pt を割る欄を 5pt 未満と測れない（${min}）`)
        process.exit(1)
    }
    console.log(`  陽性対照: 別記7 の措置内容 13 文字（直していない欄）→ ${min}pt と測れる`)
    // ★陰性対照: いまの実装で全ケースが通る
    for (const c of CASES) {
        const p = await judge(c)
        if (p) {
            console.log(`自己診断: 現状が既にNG ―― ${p}`)
            process.exit(1)
        }
    }
    console.log(`  陰性対照: ${CASES.length} ケースすべて通る`)
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const problems = []
for (const c of CASES) {
    const p = await judge(c)
    console.log(`  ${p ? "NG" : "OK"}  ${c.label}${p ? ` ―― ${p}` : ""}`)
    if (p) problems.push(p)
}
if (problems.length) {
    console.log(`\n${problems.length} 件`)
    process.exit(1)
}
console.log("SMALL_FONT_WRAP_OK")
