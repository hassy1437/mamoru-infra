// 別記様式第11の1（自動火災報知設備）で「自動試験機能あり」のとき、※の付いた行（点検対象外）だけが PDF から消えるか（2026-10-23）。
//
// ■ なぜ要るか（docs/BACKLOG.md「※行の専用検査」）
//   2026-08-03 には「現実値セットに bekki11_1_test__autotest があり、ベースライン照合が捕まえる」として作らなかった。
//   ★2026-10-23 に確かめると、そのケースはどこにも無く（hasAutoTestFunction を立てるものが 0 件）、
//   ベースライン照合は CI では走らない。＝ ★※行の一括非表示（ルートの autoTestSkip）を壊しても、どこにも引っかからなかった。
//
// ■ 検査すること（BACKLOG の不変条件 3 つ。★件数では書かない）
//   全行の欄（内容・不良内容・措置内容）に行ごとの印（P1-00c など）を入れ、「なし」と「あり」で PDF を作って文字を突き合わせる。
//   1. 消えた行 ＝「なし」で描かれていた※行（集合として一致）
//   2. ※以外の行は 1 つも消えない
//   3. 「あり」に残った※行は 0
//   ★「23 行消える」とは書かない。※行のうち 3 行（その2 の 5・9・11）は「なし」でも内容を描かない（刷り込みの選択肢に○を打つ行）。
//   ★※行かどうかは、ルートと同じ源（src/lib/bekki-row-labels.ts の行ラベルと src/lib/auto-test-rows.ts）から導く。行番号を書き写さない。
//
// 使い方: node --experimental-strip-types scripts/check-autotest-rows.mjs [--self-test]
import { spawnSync } from "child_process"
import fs from "fs"
import path from "path"
import { runRoutePdf } from "./run-route-pdf.mjs"
import { AUTO_TEST_ATTR, isAutoTestRow } from "../src/lib/auto-test-rows.ts"
import { BEKKI_ROW_LABELS } from "../src/lib/bekki-row-labels.ts"

const PY = process.platform === "win32" ? "python" : "python3"
const SELF_TEST = process.argv.includes("--self-test")
// ★自己診断と本番で出力先を分ける（check-pdf-all は並列に走らせる）
const OUT = path.join("tmp", SELF_TEST ? "autotest-rows-selftest" : "autotest-rows")
const ROUTE = "src/app/api/generate-jidou-kasai-houchi-bekki11-1-pdf/route.ts"
const REAL = "tmp/pdf-realistic/bekki11_1_test.payload.json"
const LABELS = BEKKI_ROW_LABELS["別記様式第11の1"]
const PAGES = [["page1_rows", "P1"], ["page2_rows", "P2"], ["page3_rows", "P3"]]
const read = (f) => fs.readFileSync(f, "utf8")

const rowId = (prefix, i) => `${prefix}-${String(i).padStart(2, "0")}`

/** 全行の 3 つの欄に行ごとの印を入れる。on なら自動試験機能ありにする（★入力画面と同じ extra_fields の "1"） */
const payloadOf = (base, on) => {
    const p = structuredClone(base)
    for (const [key, prefix] of PAGES) {
        p[key] = (LABELS[key] ?? []).map((_, i) => {
            const id = rowId(prefix, i)
            return { ...(p[key]?.[i] ?? {}), content: `${id}c`, judgment: "", bad_content: `${id}b`, action_content: `${id}a` }
        })
    }
    p.extra_fields = { ...(p.extra_fields ?? {}) }
    if (on) p.extra_fields[AUTO_TEST_ATTR] = "1"
    else delete p.extra_fields[AUTO_TEST_ATTR]
    return p
}

// 印（P1-00c など）を拾い、行（P1-00）の集合にする
const WORDS = String.raw`
import fitz, json, re, sys
d = fitz.open(sys.argv[1]); out = set()
for p in d:
    for w in p.get_text("words"):
        for m in re.findall(r"P[123]-\d\d[cba]", w[4]):
            out.add(m[:-1])
print(json.dumps(sorted(out)))
`
const drawnRows = (pdf) => {
    const r = spawnSync(PY, ["-c", WORDS, pdf], { encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } })
    if (r.status !== 0) throw new Error(r.stderr)
    // ★PyMuPDF の版によっては import fitz の警告が標準出力に出る。最後の行だけ読む
    return new Set(JSON.parse(r.stdout.trim().split("\n").pop()))
}

const AUTO = new Set(PAGES.flatMap(([key, prefix]) =>
    (LABELS[key] ?? []).flatMap((label, i) => (isAutoTestRow(label) ? [rowId(prefix, i)] : []))))

async function problemsOf(routePath, tag) {
    const base = JSON.parse(read(REAL))
    fs.mkdirSync(OUT, { recursive: true })
    const off = await runRoutePdf({ routePath, payload: payloadOf(base, false), outPdfPath: path.join(OUT, `${tag}-off.pdf`) })
    const on = await runRoutePdf({ routePath, payload: payloadOf(base, true), outPdfPath: path.join(OUT, `${tag}-on.pdf`) })
    if (off.status !== 200 || on.status !== 200) return { problems: [`PDF が出ない（なし ${off.status}・あり ${on.status}）`] }
    const drawnOff = drawnRows(off.outPdfPath)
    const drawnOn = drawnRows(on.outPdfPath)
    const vanished = [...drawnOff].filter((id) => !drawnOn.has(id))
    const autoDrawnOff = [...drawnOff].filter((id) => AUTO.has(id))
    const problems = []
    // ★空振りの見張り: 「なし」で※行も※以外の行も描かれていること（印が拾えていない・行ラベルが読めていないと全部 0 で通ってしまう）
    if (autoDrawnOff.length === 0) problems.push("「なし」で※行が 1 つも描かれていない（印が拾えていない可能性）")
    if (drawnOff.size - autoDrawnOff.length < 20) problems.push(`「なし」で※以外の行が ${drawnOff.size - autoDrawnOff.length} 行しか描かれていない（印が拾えていない可能性）`)
    // 1. 消えた行 ＝「なし」で描かれていた※行
    const missingVanish = autoDrawnOff.filter((id) => !vanished.includes(id))
    if (missingVanish.length) problems.push(`★1. 「あり」でも消えない※行: ${missingVanish.join("・")}`)
    // 2. ※以外の行は消えない
    const wrongVanish = vanished.filter((id) => !AUTO.has(id))
    if (wrongVanish.length) problems.push(`★2. ※以外なのに「あり」で消えた行: ${wrongVanish.join("・")}`)
    // 3. 「あり」に残った※行は 0
    const leftover = [...drawnOn].filter((id) => AUTO.has(id))
    if (leftover.length) problems.push(`★3. 「あり」に残った※行: ${leftover.join("・")}`)
    return { problems, stats: { auto: AUTO.size, autoDrawnOff: autoDrawnOff.length, vanished: vanished.length, drawnOff: drawnOff.size } }
}

if (!fs.existsSync(REAL)) {
    console.log(`現実値セットが無い（${REAL}）。node scripts/check-pdf-all.mjs --regen で作ってから走らせてください`)
    process.exit(1)
}
if (!LABELS?.page1_rows?.length) {
    console.log("別記様式第11の1 の行ラベルが読めない（src/lib/bekki-row-labels.ts の形が変わった？）")
    process.exit(1)
}

if (SELF_TEST) {
    const neg = await problemsOf(ROUTE, "current")
    if (neg.problems.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of neg.problems) console.log("   ", p)
        process.exit(1)
    }
    const src = read(ROUTE)
    const mutants = [
        // ★BACKLOG の「autoTestSkip の戻りを undefined に固定したら落ちる」
        ["※行を消さない（autoTestSkip が常に undefined）", "if (!hasAutoTest) return undefined", "return undefined", "★1."],
        ["※以外の行（各ページの 1 行目）まで消す", "if (!isRowActive(label, true)) skip.add(i)", "if (!isRowActive(label, true) || i === 0) skip.add(i)", "★2."],
        ["自動試験機能の有無を読まない（入力画面と読み方がずれる）", 'getExtra(body, AUTO_TEST_ATTR) === "1"', 'getExtra(body, AUTO_TEST_ATTR) === "true"', "★1."],
    ]
    for (const [label, from, to, expect] of mutants) {
        if (!src.includes(from)) { console.log(`自己診断: 書き換える箇所がルートに無い: ${label}`); process.exit(1) }
        const mut = path.join(OUT, `route-mutant-${mutants.findIndex((m) => m[0] === label)}`, "route.ts")
        fs.mkdirSync(path.dirname(mut), { recursive: true })
        fs.writeFileSync(mut, src.replace(from, to), "utf8")
        const r = await problemsOf(mut, `mutant-${mutants.findIndex((m) => m[0] === label)}`)
        if (!r.problems.some((p) => p.startsWith(expect))) {
            console.log(`自己診断: ${label} → 検出できない`)
            for (const p of r.problems) console.log("   ", p)
            process.exit(1)
        }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    console.log(`  陰性対照: 現状は 3 つの不変条件を満たす（※行 ${neg.stats.auto} のうち「なし」で描かれた ${neg.stats.autoDrawnOff} 行が消える）`)
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const { problems, stats } = await problemsOf(ROUTE, "current")
console.log(`別記11の1 の※行を検査: ※行 ${stats?.auto ?? "?"}・「なし」で描かれた行 ${stats?.drawnOff ?? "?"}（うち※行 ${stats?.autoDrawnOff ?? "?"}）・「あり」で消えた行 ${stats?.vanished ?? "?"}`)
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("AUTOTEST_ROWS_OK")
