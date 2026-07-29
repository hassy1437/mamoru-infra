// buildMergedReport が返す情報を、UI が取りこぼしていないかを検査する。
//
// ■ なぜ要るか（★同じ事故が3回起きている）
//   サーバは正しく返しているのに UI が捨てる、が繰り返されている:
//     1. マージ側が 422 の本文を捨て、`${label}: ${status}` にしていた
//        → せっかく様式・項目・超過文字数を返しても業者に届かなかった
//     2. 個別フォーム14ファイルが同じ形で捨てていた
//     3. 納品ボタンが shrinkWarnings / choiceWarnings を受け取っていなかった
//        → **納品はオーナーに届く経路**なので取りこぼしの影響が最大
//   ＝ 「返り値に足したら UI も直す」を人の注意力に任せない。
//
// ■ 検査すること
//   BuildResult のフィールドは全部、各利用側で分割代入されていること。
//   ★フィールドを足したときに自動で対象になる（型定義から読むので、
//     検査を書き換えなくても新しいフィールドが守られる）。
//
// 使い方: node scripts/check-warning-consumers.mjs
import fs from "fs"
import path from "path"

const ROOT = process.cwd()
const SRC = path.join(ROOT, "src", "lib", "build-merged-report.ts")

const problems = []
const check = (ok, message) => {
    if (!ok) problems.push(message)
}

// --- BuildResult のフィールドを型定義から読む ---
const lib = fs.readFileSync(SRC, "utf8")
const m = lib.match(/export type BuildResult = \{([\s\S]*?)\n\}/)
if (!m) {
    console.log("★NG: BuildResult の型定義が見つからない（検査の前提が崩れている）")
    process.exit(1)
}
const fields = [...m[1].matchAll(/^\s{4}(\w+)\s*:/gm)].map((x) => x[1])
check(fields.length >= 4, `BuildResult のフィールドが少なすぎる（${fields.length}）。型定義の読み取りが壊れている可能性`)

// --- 利用側を探す ---
const consumers = []
const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else if (/\.tsx?$/.test(e.name)) {
            const s = fs.readFileSync(p, "utf8")
            if (/\bawait buildMergedReport\(/.test(s)) consumers.push([p, s])
        }
    }
}
walk(path.join(ROOT, "src"))
check(consumers.length >= 2, `buildMergedReport の利用側が ${consumers.length} 件しか無い（探索が壊れている可能性）`)

for (const [p, s] of consumers) {
    const rel = path.relative(ROOT, p)
    // const { ... } = await buildMergedReport(  の分割代入を読む
    const d = s.match(/const\s*\{([^}]*)\}\s*=\s*await\s+buildMergedReport\(/)
    if (!d) {
        problems.push(`${rel}: buildMergedReport の返り値を分割代入していない`)
        continue
    }
    const got = new Set(d[1].split(",").map((x) => x.trim().split(":")[0].trim()).filter(Boolean))
    for (const f of fields) {
        if (!got.has(f)) {
            problems.push(
                `${rel}: BuildResult.${f} を受け取っていない`
                + "（サーバが返した情報が UI に届かない。3回起きている事故）",
            )
        }
    }
}

// --- ★取りこぼした場合に落ちることの対照 ---
if (process.argv.includes("--self-test")) {
    const fake = "const { blob, failedLabels } = await buildMergedReport(input)"
    const d = fake.match(/const\s*\{([^}]*)\}\s*=\s*await\s+buildMergedReport\(/)
    const got = new Set(d[1].split(",").map((x) => x.trim()))
    const missed = fields.filter((f) => !got.has(f))
    if (missed.length === 0) {
        console.log("自己診断: 一部だけ受け取る書き方を検出できない")
        process.exit(1)
    }
    if (problems.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of problems) console.log("   ", p)
        process.exit(1)
    }
    console.log(`  陰性対照: 利用側 ${consumers.length} 件 → 全 ${fields.length} フィールドを受け取っている`)
    console.log(`  陽性対照: 2つだけ受け取る書き方 → 不足 ${missed.join(", ")} を検出`)
    console.log("SELF_TEST_OK")
    process.exit(0)
}

console.log(`BuildResult ${fields.length} フィールド × 利用側 ${consumers.length} 件を検査`)
console.log(`  フィールド: ${fields.join(", ")}`)
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("WARNING_CONSUMERS_OK")
