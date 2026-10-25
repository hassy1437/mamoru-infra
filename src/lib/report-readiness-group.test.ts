import { describe, expect, it } from "vitest"

import { groupReadinessByFix } from "@/lib/report-readiness"

/**
 * 確定前の確認で、同じ画面で直す項目をまとめる（2026-10-25 のボタンの見直し）。
 * 以前は延べ面積・地上階数・報告年月日のそれぞれに「総括表を編集」が付き、同じボタンが 3 つ並んだ。
 */
describe("groupReadinessByFix", () => {
    it("行き先ごとに 1 つ・最初に出てきた順・飛び先は先頭の項目", () => {
        const g = groupReadinessByFix([
            { id: "floor", fix: { kind: "soukatsu", anchor: "floor-area" } },
            { id: "inspector", fix: { kind: "itiran" } },
            { id: "floors", fix: { kind: "soukatsu", anchor: "floors" } },
            { id: "shokaki", fix: { kind: "bekki", stepId: "shokaki" } },
            { id: "sprinkler", fix: { kind: "bekki", stepId: "sprinkler" } },
            { id: "phone", fix: { kind: "itiran" } },
        ])
        expect(g.map((x) => x.items.map((i) => i.id))).toEqual([["floor", "floors"], ["inspector", "phone"], ["shokaki"], ["sprinkler"]])
        expect(g[0].fix).toEqual({ kind: "soukatsu", anchor: "floor-area" })
    })

    it("直す画面が無い項目はまとめない", () => {
        const g = groupReadinessByFix([
            { id: "a", fix: null },
            { id: "b", fix: null },
        ])
        expect(g.map((x) => x.items.map((i) => i.id))).toEqual([["a"], ["b"]])
    })
})
