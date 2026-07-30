// ベースラインPNGが「いつのソースから作られたか」を記録し、古くなったら止める。
//
// ■ ★なぜ文書でなく機構にするか
//   ベースライン照合は画素比較で、差分が出たら**人が目で見て承認する**検査なので
//   CI には載せられない（載せると赤いまま放置されるか無条件更新される）。
//   ＝ ローカル運用になるが、「運用を明文化する」は**検査12本すべてが孤立していた
//   ときに失敗した方法そのもの**。照合そのものは人がやるとしても、
//   **やり忘れは機構が止める**。
//
// ■ 何を見るか
//   PDF出力に影響するファイル（scripts/lib-pdf-sources.mjs が**導出**する）の
//   内容ハッシュ。登録時に記録し、push 前に照合する。
//   ★リテラルで列挙しない。列挙は書き忘れたら気づけない（実際、従来の
//     SOURCE_GLOBS は src/lib を /pdf-.*\.ts$/ で拾っており
//     bekki-row-labels.ts など3ファイルを取りこぼしていた）。
//
// 使い方:
//   node scripts/baseline-stamp.mjs --write   # baseline.py register が呼ぶ
//   node scripts/baseline-stamp.mjs --check   # pre-push フックが呼ぶ
import { createHash } from "crypto"
import fs from "fs"
import path from "path"

import { pdfSourceFiles } from "./lib-pdf-sources.mjs"

const ROOT = process.cwd()
const STAMP = path.join(ROOT, ".tmp", "baseline", ".sources.json")

const hashes = () => {
    const out = {}
    for (const f of pdfSourceFiles()) {
        out[f] = createHash("sha256").update(fs.readFileSync(path.join(ROOT, f))).digest("hex").slice(0, 16)
    }
    return out
}

if (process.argv.includes("--write")) {
    fs.mkdirSync(path.dirname(STAMP), { recursive: true })
    const h = hashes()
    fs.writeFileSync(STAMP, JSON.stringify(h, null, 1), "utf8")
    console.log(`  ベースラインの由来を記録: ${Object.keys(h).length} ファイル`)
    process.exit(0)
}

if (!fs.existsSync(STAMP)) {
    console.log("★ベースラインの由来が記録されていない（.tmp/baseline/.sources.json が無い）")
    console.log("  → npm run check:pdf を通してから python scripts/baseline.py register all を実行してください")
    process.exit(1)
}

const now = hashes()
const then = JSON.parse(fs.readFileSync(STAMP, "utf8"))
const changed = Object.keys(now).filter((f) => now[f] !== then[f])
const added = Object.keys(now).filter((f) => !(f in then))
const removed = Object.keys(then).filter((f) => !(f in now))

if (changed.length === 0 && added.length === 0 && removed.length === 0) {
    console.log(`  ベースラインは最新（${Object.keys(now).length} ファイルと一致）`)
    console.log("BASELINE_STAMP_OK")
    process.exit(0)
}

console.log("★PDF出力に影響する変更があるのに、ベースラインが再登録されていません")
for (const f of [...changed, ...added].slice(0, 12)) console.log(`    ${f}`)
if (changed.length + added.length > 12) console.log(`    …他 ${changed.length + added.length - 12} 件`)
for (const f of removed.slice(0, 5)) console.log(`    （削除）${f}`)
console.log("")
console.log("  → npm run check:pdf -- --regen で作り直し、差分を**目で確認**してから")
console.log("     python scripts/baseline.py register all を実行してください。")
console.log("     ★照合の承認は人がやる検査です。差分を見ずに登録しないこと。")
process.exit(1)
