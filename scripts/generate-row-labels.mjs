// 入力画面の行ラベルを、サーバ側（エラー・警告の文言）から引ける形に生成する。
//
// ■ なぜ要るか
//   ⑧のエラーや選択肢の警告は「点検項目の内容」としか言えず、40行あるうちの
//   どれか分からない。業者が該当行を開けるようにするには行の識別子が要る。
//
// ■ どこから取るか — ★入力画面の表記そのもの
//   行ラベルは各フォーム component の PAGE{n}_ITEMS にある。これは**業者が
//   画面で見ている文字列**なので、そのまま出せば必ず辿れる。
//   消防庁の正典から取ると、画面と言い回しが違って「その行が見つからない」になる。
//
// ■ 生成物を手で編集しないこと
//   scripts/check-row-labels.mjs が「再生成して差分0」を検査する。
//   フォームの行を増減したらここを再生成する。
//
// 使い方: node scripts/generate-row-labels.mjs
import fs from "fs"
import path from "path"

const ROOT = process.cwd()
const COMPONENTS = path.join(ROOT, "src", "components")
const OUT = path.join(ROOT, "src", "lib", "bekki-row-labels.ts")

/** route.ts の buildFitError("別記様式第N") と、フォームの component を対応づける */
const formLabelOf = (dirName) => {
    const route = path.join(ROOT, "src", "app", "api", dirName, "route.ts")
    if (!fs.existsSync(route)) return null
    const s = fs.readFileSync(route, "utf8")
    return s.match(/buildFitError\(\s*"([^"]+)"/)?.[1] ?? null
}

/** components/xxx-form.tsx -> api/generate-xxx-pdf */
const routeDirOf = (formFile) => {
    const stem = formFile.replace(/-form\.tsx$/, "")
    const dir = `generate-${stem}-pdf`
    return fs.existsSync(path.join(ROOT, "src", "app", "api", dir)) ? dir : null
}

const table = {}
for (const f of fs.readdirSync(COMPONENTS).filter((x) => x.endsWith("-form.tsx")).sort()) {
    const dir = routeDirOf(f)
    if (!dir) continue
    const form = formLabelOf(dir)
    if (!form) continue
    const src = fs.readFileSync(path.join(COMPONENTS, f), "utf8")
    const pages = {}
    // ★命名は全23フォームで PAGE{n}_ITEMS に統一されていることを実測で確認済み。
    //   崩れたら下の検査（想定外の命名）で落とす。
    for (const m of src.matchAll(/const\s+(\w*ITEMS\w*)\s*=\s*\[([\s\S]*?)\n\]/g)) {
        const name = m[1]
        const pm = name.match(/^PAGE(\d)_ITEMS$/)
        if (!pm) {
            throw new Error(`${f}: 想定外の行ラベル配列名 ${name}（PAGE{n}_ITEMS のみ対応）`)
        }
        const items = [...m[2].matchAll(/^\s*"((?:[^"\\]|\\.)*)"\s*,?\s*$/gm)].map((x) => x[1])
        if (items.length) pages[`page${pm[1]}_rows`] = items
    }
    if (Object.keys(pages).length) table[form] = pages
}

const lines = [
    "// ★このファイルは scripts/generate-row-labels.mjs が生成する。手で編集しないこと。",
    "//   （scripts/check-row-labels.mjs が「再生成して差分0」を検査する）",
    "//",
    "// 入力画面の行ラベル。⑧のエラーや選択肢の警告で「どの行か」を業者に伝えるために使う。",
    "// 出典は各フォーム component の PAGE{n}_ITEMS ＝ 業者が画面で見ている文字列そのもの。",
    "",
    "export const BEKKI_ROW_LABELS: Record<string, Record<string, readonly string[]>> = {",
]
for (const [form, pages] of Object.entries(table)) {
    lines.push(`    ${JSON.stringify(form)}: {`)
    for (const [key, items] of Object.entries(pages)) {
        lines.push(`        ${key}: [`)
        for (const it of items) lines.push(`            ${JSON.stringify(it)},`)
        lines.push("        ],")
    }
    lines.push("    },")
}
lines.push("}", "")

fs.writeFileSync(OUT, lines.join("\n"), "utf8")
const n = Object.values(table).reduce((a, p) => a + Object.values(p).reduce((b, x) => b + x.length, 0), 0)
console.log(`  ${OUT.replace(ROOT + path.sep, "")}: ${Object.keys(table).length} 様式 / ${n} 行ラベル`)
