// 別記の入力画面が「見出し行」に入力欄を出さないかを検査する（2026-10-07）。
//
// ■ なぜ要るか（2026-10-07 のフル印字テスト）
//   行ラベルに「見出し行」とある行は紙では全幅の見出しで、route は描かない（blankPrintedRows）。
//   ところが画面は普通の行として 判定・内容・不良内容・措置内容 の欄を出していた
//   ＝ 「否」と不良内容を入れても紙には出ず、黙って消える。「すべて良にする」もこの行に「良」を入れていた。
//   ★入れた値が消えるだけで画面も PDF も正常に見えるので、どの検査にも出ない種類。
//
// ■ 検査すること（★行を描く画面は一覧を持たず、ファイルから拾う）
//   行ラベルの配列を map して行を描く画面（共通ベースと、独自に描く別記）は全部:
//   1. 表（デスクトップ）とカード（スマホ）の両方で、isBekkiHeadingLabel(label) の行を見出しとして描く
//   2. 「すべて良にする」が見出し行を飛ばす
//
// 使い方: node scripts/check-heading-row-inputs.mjs [--self-test]
import fs from "fs"
import path from "path"

const DIR = "src/components"
const read = (p) => fs.readFileSync(p, "utf8")

/** 行ラベルを map して判定の select を描く画面 */
function collect() {
    const files = {}
    for (const f of fs.readdirSync(DIR)) {
        if (!/bekki.*\.tsx$/.test(f)) continue
        const p = path.join(DIR, f)
        const src = read(p)
        if (/labels\.map\(\(label, idx\)/.test(src) && /<option value="否">/.test(src)) files[p] = src
    }
    return files
}

function judge(files) {
    const problems = []
    const names = Object.keys(files)
    if (names.length < 4) problems.push(`行を描く画面が ${names.length} 本しか見つからない（共通ベースと別記4・5・6 の 4 本はあるはず・拾い方が壊れている）`)
    for (const [name, src] of Object.entries(files)) {
        const maps = (src.match(/labels\.map\(\(label, idx\) =>/g) ?? []).length
        const tableHeads = (src.match(/isBekkiHeadingLabel\(label\) \? \(\s*<BekkiHeadingTableRow/g) ?? []).length
        // ★式で返す形（… ? (<見出し>) : (…)）と、ブロックの先頭で返す形（if (…) return <見出し>）の両方
        const cardHeads = (src.match(/isBekkiHeadingLabel\(label\)( \? \(|\) return)\s*<BekkiHeadingCard/g) ?? []).length
        if (maps < 2) problems.push(`${name}: 行の描き方が想定（表とカードの 2 か所）と違う（${maps} か所）`)
        if (tableHeads < 1) problems.push(`${name}: 表で見出し行を見出しとして描いていない（入力欄が出る）`)
        if (cardHeads < 1) problems.push(`${name}: カード（スマホ）で見出し行を見出しとして描いていない（入力欄が出る）`)
        const allGood = src.match(/judgment === "" (&& !isBekkiHeadingLabel\([^)]*\) )?\? \{ \.\.\.row, judgment: "良" \}/g) ?? []
        if (allGood.length === 0) problems.push(`${name}: 「すべて良にする」が見つからない`)
        for (const a of allGood) {
            if (!a.includes("isBekkiHeadingLabel")) problems.push(`${name}: 「すべて良にする」が見出し行にも「良」を入れる`)
        }
    }
    return { problems, n: names.length }
}

function inject(files, file, from, to) {
    if (!files[file]?.includes(from)) throw new Error(`注入先が ${file} に無い: ${from}`)
    return { ...files, [file]: files[file].replace(from, to) }
}

const files = collect()

if (process.argv.includes("--self-test")) {
    const ok = judge(files)
    if (ok.problems.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of ok.problems) console.log("   ", p)
        process.exit(1)
    }
    const base = path.join(DIR, "bekki-result-form-base.tsx")
    const b6 = path.join(DIR, "inert-gas-bekki6-form.tsx")
    const cases = [
        ["共通ベースの表で見出し扱いを外す", base, "isBekkiHeadingLabel(label) ? (", "false ? (", (p) => p.startsWith(base) && p.includes("表で見出し行")],
        ["別記6 のカードで見出し扱いを外す", b6, /isBekkiHeadingLabel\(label\) \? \(\s*<BekkiHeadingCard/, "false ? (<BekkiHeadingCard", (p) => p.startsWith(b6) && p.includes("カード")],
        ["共通ベースの「すべて良にする」を見出し行にも入れる形に戻す", base, ' && !isBekkiHeadingLabel(labels[i] ?? "")', "", (p) => p.startsWith(base) && p.includes("見出し行にも「良」")],
    ]
    for (const [label, file, from, to, hit] of cases) {
        let mutated
        try {
            mutated = typeof from === "string" ? inject(files, file, from, to) : { ...files, [file]: files[file].replace(from, to) }
            if (mutated[file] === files[file]) throw new Error("注入が入っていない")
        } catch (e) {
            console.log(`自己診断: ${label} ―― ${e.message}`)
            process.exit(1)
        }
        const r = judge(mutated)
        if (!r.problems.some(hit)) {
            console.log(`自己診断: ${label} → 検出できない`)
            for (const p of r.problems) console.log("   ", p)
            process.exit(1)
        }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    console.log(`  陰性対照: 行を描く画面 ${ok.n} 本で問題なし`)
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const r = judge(files)
console.log(`見出し行の入力欄を検査: 行を描く画面 ${r.n} 本`)
if (r.problems.length) {
    console.log("★NG:")
    for (const p of r.problems) console.log("   ", p)
    process.exit(1)
}
console.log("HEADING_ROW_INPUTS_OK")
