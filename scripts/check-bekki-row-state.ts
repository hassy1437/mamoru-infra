// 「値は残して表示だけ畳む」を★実測する。
//
// ■ なぜ要るか
//   ※印の一括非表示は「labels を絞らない」ことに全面的に依存している。
//   絞ると hydrateRows(labels.length) で末尾が切り捨てられ、idx がずれて
//   choiceRows / 注記も別の行に付く。静的に「絞っていない」を確認するだけでは
//   「入れた値が取り出せる」ことの証明にならないので、実際に往復させる。
//
// 実行: node --experimental-strip-types scripts/check-bekki-row-state.ts
//   （このリポジトリにはテストランナーが無い。docs/BACKLOG.md の記録を参照）
import { hydrateRows } from "../src/lib/bekki-row-state.ts"
import { isRowActive, EXPECTED_AUTO_TEST_ROW_COUNT } from "../src/lib/auto-test-rows.ts"

let failed = 0
const ok = (cond: boolean, msg: string) => {
    if (cond) console.log(`  OK   ${msg}`)
    else {
        console.log(`  ★NG  ${msg}`)
        failed++
    }
}

// ── bekki11-1 の実ラベル（フォームと同じ並び。※行を含む） ──────────────
const PAGE1 = [
    "予備電源・非常電源（内蔵型） / 外形",
    "予備電源・非常電源（内蔵型） / 表示",
    "予備電源・非常電源（内蔵型） / ※端子電圧（Ｖ）",
    "予備電源・非常電源（内蔵型） / ※切替装置",
    "予備電源・非常電源（内蔵型） / ※充電装置",
    "予備電源・非常電源（内蔵型） / ※結線接続",
    "受信機・中継器 / 周囲の状況",
]
// 5/9/11/22 に choiceRows が付く PAGE2 を模した並び（添字の一致だけを見る）
const PAGE2 = Array.from({ length: 25 }, (_, i) =>
    [5, 9, 11].includes(i) ? `感知器 / ※行${i}` : `感知器 / 行${i}`,
)

console.log("=== 1. 往復（あり → なし → あり）で値が残るか ===")

// 全行に「値そのもの」を入れた保存済み payload を作る
const saved1 = PAGE1.map((label, i) => ({
    content: `C${i}`,
    judgment: label.includes("※") ? "良" : "否",
    bad_content: `B${i}`,
    action_content: `A${i}`,
}))

// hasAutoTest = false（従来どおり全行）
const s1 = hydrateRows(PAGE1.length, saved1)
// hasAutoTest = true（※行を隠す）★labels は絞らないので count は同じ
const s2 = hydrateRows(PAGE1.length, s1)
// hasAutoTest = false に戻す
const s3 = hydrateRows(PAGE1.length, s2)
// もう一度 true
const s4 = hydrateRows(PAGE1.length, s3)

ok(s4.length === PAGE1.length, `行数が保たれる (${s4.length} / ${PAGE1.length})`)

// ★「入れた値が取り出せる」ところまで見る
const hidden = PAGE1.map((l, i) => ({ l, i })).filter((x) => !isRowActive(x.l, true))
ok(hidden.length > 0, `※行が ${hidden.length} 件ある（この並びでの対象）`)
let valuesKept = true
for (const { i } of hidden) {
    if (s4[i].content !== `C${i}` || s4[i].bad_content !== `B${i}` || s4[i].action_content !== `A${i}`) {
        valuesKept = false
        console.log(`    ★行${i} の値が失われた: ${JSON.stringify(s4[i])}`)
    }
}
ok(valuesKept, "★往復後も ※行の content / bad_content / action_content が入れた値のまま")
console.log(`    例: 行2 content=${s4[2].content} bad=${s4[2].bad_content} action=${s4[2].action_content}`)

// 全行（※以外も）
const allKept = s4.every((r, i) => r.content === `C${i}`)
ok(allKept, "★往復後も全行の値が添字ごと一致（ずれていない）")

console.log("\n=== 2. labels を絞ったらどうなるか（対照実験） ===")
const filtered = PAGE1.filter((l) => isRowActive(l, true))
const bad = hydrateRows(filtered.length, saved1)
ok(
    bad.length < PAGE1.length,
    `絞ると行数が縮む: ${PAGE1.length} → ${bad.length}（末尾 ${PAGE1.length - bad.length} 行が消える）`,
)
// ★ずれは「値そのもの」ではなくラベルと値の対応に出る。
//   絞った配列の位置2は元の PAGE1[6] のラベルを描くが、値は saved1[2]（=端子電圧の値）を読む。
const shownLabel = filtered[2]
const shownValue = bad[2]?.content
const correctValueForThatLabel = saved1[PAGE1.indexOf(shownLabel)].content
ok(
    shownValue !== correctValueForThatLabel,
    `絞るとラベルと値がずれる: 「${shownLabel}」の行に ${shownValue} が出る（正しくは ${correctValueForThatLabel}）`,
)

console.log("\n=== 3. choiceRows / 注記の添字が動かないか ===")
const CHOICE_IDX = [5, 9, 11]
const p2a = hydrateRows(PAGE2.length, PAGE2.map((_, i) => ({ content: `X${i}` })))
const p2b = hydrateRows(PAGE2.length, p2a) // 畳んだ状態を往復
ok(p2b.length === PAGE2.length, `PAGE2 の行数が保たれる (${p2b.length} / ${PAGE2.length})`)
const choiceOk = CHOICE_IDX.every((i) => p2b[i].content === `X${i}`)
ok(choiceOk, `★choiceRows の添字 ${CHOICE_IDX.join("/")} の値が動かない`)
console.log(
    `    ${CHOICE_IDX.map((i) => `[${i}]=${p2b[i].content}`).join(" ")}`,
)

console.log("\n=== 4. 宣言との整合 ===")
ok(
    EXPECTED_AUTO_TEST_ROW_COUNT === 23,
    `EXPECTED_AUTO_TEST_ROW_COUNT = ${EXPECTED_AUTO_TEST_ROW_COUNT}`,
)

console.log(failed === 0 ? "\nBEKKI_ROW_STATE_OK" : `\n★FAILED: ${failed} 件`)
process.exit(failed === 0 ? 0 : 1)
