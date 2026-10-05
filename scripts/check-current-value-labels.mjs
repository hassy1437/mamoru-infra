// 1行に値を2つ入れる行（currentValueRowIndex）の入力欄の見出しが、その行の意味と合っているかを検査する。
//
// ■ なぜ要るか（#21・2026-10-05 の通し確認）
//   共通フォームの既定の見出しは「電圧(V)・電流(A)」。様式21 の行6「端子電圧（常用Ｖ・非常Ｖ）」は
//   見出しを差し替えておらず、画面は2つ目を「電流(A)」と案内するのに、PDF は「非常 ___ V」に描いていた
//   ＝案内どおり入れた電流が、提出書類の電圧の欄に載る。描かれるピクセルは正常なので、
//   ベースラインでも他の検査でも出ない。
//
// ■ 決まり（★これだけ）
//   既定の見出しのまま（currentValueFields を渡さない・様式2〜5 の直書き）の行は、行の名前に「電流」が入っていること。
//   それ以外の意味の行（様式12 の作動範囲・様式21 の端子電圧）は currentValueFields で見出しを差し替える。
//
// 使い方: node scripts/check-current-value-labels.mjs [--self-test]
import fs from "fs"
import path from "path"

const DIR = path.join(process.cwd(), "src", "components")

/** const NAME = [ "…", … ] を読む */
const itemsOf = (src, name) => {
    const m = src.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\]`))
    return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : null
}

/** 既定の見出しを使う行の一覧: { file, items, index, overridden } */
function collect(sources) {
    const rows = []
    for (const [file, src] of sources) {
        // 共通フォーム: { key: …, labels: PAGEn_ITEMS, …currentValueRowIndex: N, …currentValueFields? }
        for (const m of src.matchAll(/\{[^{}]*labels:\s*(PAGE\d+_ITEMS)[^{}]*currentValueRowIndex:\s*(\d+)[^{}]*?(currentValueFields:\s*\{[^{}]*\})?[^{}]*\}/g)) {
            rows.push({ file, items: m[1], index: Number(m[2]), overridden: !!m[3], labels: itemsOf(src, m[1]) })
        }
        // 様式2〜4: renderItemTable("…", PAGEn_ITEMS, …, N)（見出しは直書きの「電圧(V)・電流(A)」）
        for (const m of src.matchAll(/renderItemTable\([^,]+,\s*(PAGE\d+_ITEMS)\s*,[^,]+,[^,]+,\s*(\d+)\s*\)/g)) {
            rows.push({ file, items: m[1], index: Number(m[2]), overridden: false, labels: itemsOf(src, m[1]) })
        }
        // 様式5: renderItemTable("…", PAGEn_ITEMS, …, { currentValueRow: N })
        for (const m of src.matchAll(/renderItemTable\([^,]+,\s*(PAGE\d+_ITEMS)\s*,[^,]+,[^,]+,\s*\{\s*currentValueRow:\s*(\d+)\s*\}\s*\)/g)) {
            rows.push({ file, items: m[1], index: Number(m[2]), overridden: false, labels: itemsOf(src, m[1]) })
        }
    }
    return rows
}

function judge(sources) {
    const rows = collect(sources)
    const problems = []
    for (const r of rows) {
        const label = r.labels?.[r.index]
        if (label == null) {
            problems.push(`${r.file}: ${r.items}[${r.index}] の行の名前が読めない`)
            continue
        }
        if (!r.overridden && !label.includes("電流")) {
            problems.push(`${r.file}: ${r.items}[${r.index}]「${label}」が既定の見出し「電圧(V)・電流(A)」のまま（currentValueFields で差し替えること）`)
        }
    }
    return { rows, problems }
}

const sources = fs.readdirSync(DIR).filter((f) => /bekki.*-form\.tsx$/.test(f)).sort()
    .map((f) => [f, fs.readFileSync(path.join(DIR, f), "utf8")])

if (process.argv.includes("--self-test")) {
    const ok = judge(sources)
    if (ok.problems.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of ok.problems) console.log("   ", p)
        process.exit(1)
    }
    // 陽性対照: 様式21 の差し替えを外したら検出できるか（★#21 を元に戻した形）
    const mutated = sources.map(([f, s]) => [f, f === "emergency-power-outlet-bekki21-form.tsx"
        ? s.replace(/currentValueFields:\s*\{[^{}]*\},?/, "")
        : s])
    const bad = judge(mutated)
    if (!bad.problems.some((p) => p.includes("emergency-power-outlet-bekki21"))) {
        console.log("自己診断: 様式21 の見出しの差し替えを外しても検出できない")
        process.exit(1)
    }
    console.log(`  陰性対照: ${ok.rows.length} 行すべて見出しが行の意味と合う`)
    console.log("  陽性対照: 様式21 の差し替えを外す → 「端子電圧」が既定の見出しのまま、を検出")
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const { rows, problems } = judge(sources)
console.log(`1行2値の行を検査: ${rows.length} 行（${[...new Set(rows.map((r) => r.file))].length} 様式）`)
// ★空振りで緑にしない（読み取りの正規表現が壊れたら 0 行で通ってしまう）
if (rows.length < 9) problems.push(`読めた行が ${rows.length} 行しかない（様式2・3・4・5・9・12・18・20・21 の 9 行あるはず）`)
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("CURRENT_VALUE_LABELS_OK")
