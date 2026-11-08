import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { groupReadinessByFix, readinessBoxTitle } from "@/lib/report-readiness"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

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

/**
 * 結果出力の画面の一覧の注記（2026-11-08・定期テスト 25）。
 * 「総括表」の行の注記が「（下の「出力前の確認」を見てください）」だったが、確定前は箱の見出しが「確定前の確認」。
 * また 375px 幅で「総括表」が「総括／表」と 2 行に折れた。
 */
describe("確定前・出力前の確認の見出しと、一覧の注記", () => {
    it("確定前は「確定前の確認」、確定後は「出力前の確認」", () => {
        expect(readinessBoxTitle("finalize")).toBe("確定前の確認")
        expect(readinessBoxTitle("review")).toBe("出力前の確認")
    })

    it("箱の見出しと一覧の注記が同じ関数・同じ条件で言葉を決める", () => {
        const box = read("src/components/report-readiness-box.tsx")
        const out = read("src/app/inspection/[id]/itiran/[itiranId]/output/page.tsx")
        expect(box).toContain("{readinessBoxTitle(mode)}")
        expect(out).toContain('const readinessMode = needsFinalizeOnOutput(finalization) ? "finalize" : "review"')
        expect(out).toContain('mode={needsFinalizeOnOutput(finalization) ? "finalize" : "review"}')
        expect(out).toContain("下の「${readinessTitle}」を見てください")
        expect(out).not.toContain("下の「出力前の確認」を見てください")
    })

    it("一覧の書類の名前は途中で折らない（注記は名前のあとに続け、入らなければ次の行）", () => {
        const out = read("src/app/inspection/[id]/itiran/[itiranId]/output/page.tsx")
        expect(out).toMatch(/className=\{`break-keep [^`]*`\}>\{item\.label\}<\/span>/)
        expect(out).toMatch(/<span className=\{`ml-1 inline-block /)
    })
})
