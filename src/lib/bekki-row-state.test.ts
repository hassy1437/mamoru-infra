import { describe, expect, it } from "vitest"

import { EXPECTED_AUTO_TEST_ROW_COUNT, isRowActive } from "@/lib/auto-test-rows"
import { hydrateRows } from "@/lib/bekki-row-state"

/**
 * 「値は残して表示だけ畳む」を実測する（以前は scripts/check-bekki-row-state.ts。どこからも走っていなかった）。
 *
 * ■ なぜ要るか
 *   ※印の一括非表示は「labels を絞らない」ことに全面的に依存している。
 *   絞ると hydrateRows(labels.length) で末尾が切り捨てられ、idx がずれて
 *   choiceRows / 注記も別の行に付く。静的に「絞っていない」を確認するだけでは
 *   「入れた値が取り出せる」ことの証明にならないので、実際に往復させる。
 */

// bekki11-1 の実ラベル（フォームと同じ並び。※行を含む）
const PAGE1 = [
    "予備電源・非常電源（内蔵型） / 外形",
    "予備電源・非常電源（内蔵型） / 表示",
    "予備電源・非常電源（内蔵型） / ※端子電圧（Ｖ）",
    "予備電源・非常電源（内蔵型） / ※切替装置",
    "予備電源・非常電源（内蔵型） / ※充電装置",
    "予備電源・非常電源（内蔵型） / ※結線接続",
    "受信機・中継器 / 周囲の状況",
]
// 5/9/11 に choiceRows が付く PAGE2 を模した並び（添字の一致だけを見る）
const PAGE2 = Array.from({ length: 25 }, (_, i) =>
    [5, 9, 11].includes(i) ? `感知器 / ※行${i}` : `感知器 / 行${i}`,
)

// 全行に「値そのもの」を入れた保存済み payload
const saved1 = PAGE1.map((label, i) => ({
    content: `C${i}`,
    judgment: label.includes("※") ? "良" : "否",
    bad_content: `B${i}`,
    action_content: `A${i}`,
}))

describe("往復（あり → なし → あり）で値が残る", () => {
    // ★labels は絞らないので、畳んでも count は同じ
    const s4 = hydrateRows(PAGE1.length, hydrateRows(PAGE1.length, hydrateRows(PAGE1.length, hydrateRows(PAGE1.length, saved1))))

    it("行数が保たれる", () => {
        expect(s4).toHaveLength(PAGE1.length)
    })

    it("★往復後も ※行の content / bad_content / action_content が入れた値のまま", () => {
        const hidden = PAGE1.map((l, i) => ({ l, i })).filter((x) => !isRowActive(x.l, true))
        expect(hidden.length, "★この並びに ※行が無い（見る対象が空）").toBeGreaterThan(0)
        for (const { i } of hidden) {
            expect(s4[i]).toMatchObject({ content: `C${i}`, bad_content: `B${i}`, action_content: `A${i}` })
        }
    })

    it("★往復後も全行の値が添字ごと一致（ずれていない）", () => {
        expect(s4.map((r) => r.content)).toEqual(PAGE1.map((_, i) => `C${i}`))
    })
})

describe("対照: labels を絞るとずれる（★上の検査が空振りしていない証拠）", () => {
    const filtered = PAGE1.filter((l) => isRowActive(l, true))
    const bad = hydrateRows(filtered.length, saved1)

    it("絞ると行数が縮む（末尾が消える）", () => {
        expect(bad.length).toBeLessThan(PAGE1.length)
    })

    it("絞るとラベルと値がずれる", () => {
        // 絞った配列の位置2は元の別の行のラベルを描くが、値は saved1[2]（=端子電圧の値）を読む
        const shownLabel = filtered[2]
        expect(bad[2]?.content).not.toBe(saved1[PAGE1.indexOf(shownLabel)].content)
    })
})

describe("choiceRows / 注記の添字が動かない", () => {
    it("★choiceRows の添字 5/9/11 の値が往復で動かない", () => {
        const p2a = hydrateRows(PAGE2.length, PAGE2.map((_, i) => ({ content: `X${i}` })))
        const p2b = hydrateRows(PAGE2.length, p2a)
        expect(p2b).toHaveLength(PAGE2.length)
        for (const i of [5, 9, 11]) expect(p2b[i].content).toBe(`X${i}`)
    })
})

it("※行の数の宣言が 23", () => {
    expect(EXPECTED_AUTO_TEST_ROW_COUNT).toBe(23)
})
