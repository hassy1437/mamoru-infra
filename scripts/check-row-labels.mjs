// 行ラベル表（src/lib/bekki-row-labels.ts）が入力画面と一致しているかを検査する。
//
// ■ なぜ要るか
//   ⑧のエラーや選択肢の警告に「どの行か」を出すため、入力画面の行ラベルを
//   サーバ側から引ける表にコピーしている。コピーは必ず古くなる。
//   フォームの行を1つ増やしただけで、以降のラベルが全部1つずつズレる
//   ＝ 業者が**間違った行**を開くことになる（何も出ないより悪い）。
//
// ■ 検査すること
//   再生成して差分0。生成物を手で編集していても、フォームだけ直していても落ちる。
//
// 使い方: node scripts/check-row-labels.mjs [--self-test]
import { spawnSync } from "child_process"
import fs from "fs"
import path from "path"

const ROOT = process.cwd()
const OUT = path.join(ROOT, "src", "lib", "bekki-row-labels.ts")

const regenerate = () => {
    const before = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : null
    const r = spawnSync("node", ["scripts/generate-row-labels.mjs"], { encoding: "utf8" })
    if (r.status !== 0) {
        console.log("★NG: 生成に失敗した")
        console.log(r.stdout, r.stderr)
        process.exit(1)
    }
    const after = fs.readFileSync(OUT, "utf8")
    return { before, after }
}

if (process.argv.includes("--self-test")) {
    const { before } = regenerate()
    const after0 = fs.readFileSync(OUT, "utf8")
    if (before !== after0) {
        console.log("自己診断: 現状が既に不一致（陰性対照が成立しない）")
        process.exit(1)
    }
    // 陽性対照: 生成物を1行削ると検出できるか
    try {
        const lines = after0.split("\n")
        const i = lines.findIndex((l) => /^\s{12}"/.test(l))
        if (i < 0) {
            console.log("自己診断: 変異を当てる行が見つからない（生成物の書式が変わった）")
            process.exit(1)
        }
        fs.writeFileSync(OUT, [...lines.slice(0, i), ...lines.slice(i + 1)].join("\n"), "utf8")
        const mutated = fs.readFileSync(OUT, "utf8")
        const { after } = regenerate()
        if (mutated === after) {
            console.log("自己診断: 生成物を1行削っても再生成で戻らない（検出できない）")
            process.exit(1)
        }
    } finally {
        fs.writeFileSync(OUT, after0, "utf8")
    }
    console.log("  陰性対照: 再生成して差分0")
    console.log("  陽性対照: 生成物から1行削る → 再生成で戻る＝不一致を検出")
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const { before, after } = regenerate()
const n = (after.match(/^\s{12}"/gm) ?? []).length
console.log(`行ラベル ${n} 件 / ${(after.match(/^\s{4}"/gm) ?? []).length} 様式`)
if (before !== after) {
    // ★戻さない。生成物が正で、差分が出た事実を残す
    console.log("★NG: 行ラベル表が入力画面と一致していない（再生成で内容が変わった）")
    console.log("   → フォームの行を増減したら scripts/generate-row-labels.mjs を実行し、")
    console.log("     生成物をコミットすること。ズレたまま出すと業者が別の行を開く")
    process.exit(1)
}
console.log("ROW_LABELS_OK")
