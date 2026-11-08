import { describe, expect, it } from "vitest"

import { BEKKI_ROW_LABELS } from "@/lib/bekki-row-labels"
import { isAutoTestRow } from "@/lib/auto-test-rows"
import { checkReportReadiness, SOUKATSU_JUDGMENT_MISMATCH_MESSAGE } from "@/lib/report-readiness"
import { isBadResult } from "@/lib/soukatsu-equipment"
import { countPrintedBadRows, findSoukatsuJudgmentMismatches } from "@/lib/soukatsu-judgment-consistency"

/**
 * 総括表の判定と点検票の「否」の食い違い（2026-11-08・定期テスト 21）。
 * 点検票のどこかの行が「否」でも、総括表で「指摘なし」なら総括表の PDF は「良」に○が付き、確定前の確認にも何も出なかった。
 */
const rows = (n: number, bad: number[] = [], judgment = "否") =>
    Array.from({ length: n }, (_, i) => ({ judgment: bad.includes(i) ? judgment : "良" }))

const SHOKAKI = BEKKI_ROW_LABELS["別記様式第1"]
const JIDOU = BEKKI_ROW_LABELS["別記様式第11の1"]
const shokaki = (bad: number[] = []) => ({ page1_rows: rows(SHOKAKI.page1_rows.length, bad), page2_rows: rows(SHOKAKI.page2_rows.length) })

describe("isBadResult（点検票の「否」の数え方・総括表の判定と同じ言葉）", () => {
    it("否・不良は悪いほう、良・空は悪くない", () => {
        expect(["否", "不良", " 否 ", "要改善"].map(isBadResult)).toEqual([true, true, true, true])
        expect(["良", "", "  ", null, undefined, "指摘なし"].map(isBadResult)).toEqual([false, false, false, false, false, false])
    })
})

describe("countPrintedBadRows", () => {
    it("「否」の行を数える（「良」・空は数えない）", () => {
        expect(countPrintedBadRows("shokaki", shokaki([0, 2]))).toBe(2)
        expect(countPrintedBadRows("shokaki", shokaki())).toBe(0)
        expect(countPrintedBadRows("shokaki", { page1_rows: [{ judgment: "" }, {}, null] })).toBe(0)
    })

    it("見出し行（紙に出ない）の「否」は数えない", () => {
        const heading = JIDOU.page3_rows.findIndex((l) => l.includes("見出し行"))
        expect(heading).toBeGreaterThanOrEqual(0)
        expect(countPrintedBadRows("jidou-kasai-houchi", { page3_rows: rows(JIDOU.page3_rows.length, [heading]) })).toBe(0)
    })

    it("自動試験機能ありのとき、※行（紙に出ない）の「否」は数えない。なしなら数える", () => {
        const star = JIDOU.page1_rows.findIndex(isAutoTestRow)
        const plain = JIDOU.page1_rows.findIndex((l) => !isAutoTestRow(l))
        const payload = (on: boolean) => ({
            page1_rows: rows(JIDOU.page1_rows.length, [star, plain]),
            extra_fields: on ? { hasAutoTestFunction: "1" } : {},
        })
        expect(countPrintedBadRows("jidou-kasai-houchi", payload(false))).toBe(2)
        expect(countPrintedBadRows("jidou-kasai-houchi", payload(true))).toBe(1)
    })
})

describe("findSoukatsuJudgmentMismatches", () => {
    it("総括表で「指摘なし」（PDF は「良」に○）なのに点検票に「否」がある設備だけを返す", () => {
        const found = findSoukatsuJudgmentMismatches(
            [{ name: "消火器", result: "指摘なし" }, { name: "避難器具", result: "指摘なし" }],
            { shokaki: shokaki([1]), "evacuation-equipment": { page1_rows: rows(3) } },
        )
        expect(found).toEqual([{ equipment: "消火器", stepId: "shokaki", badRows: 1 }])
    })

    it("総括表が「要改善」・「該当なし」なら比べない／逆向き（総括表は要改善・点検票は全部良）も知らせない", () => {
        const payloads = { shokaki: shokaki([1]), "evacuation-equipment": { page1_rows: rows(3) } }
        expect(findSoukatsuJudgmentMismatches([{ name: "消火器", result: "要改善" }], payloads)).toEqual([])
        expect(findSoukatsuJudgmentMismatches([{ name: "消火器", result: "該当なし" }], payloads)).toEqual([])
        expect(findSoukatsuJudgmentMismatches([{ name: "避難器具", result: "要改善" }], payloads)).toEqual([])
    })

    it("点検票がまだ無い・総括表の点検結果が配列でないときは何も返さない", () => {
        expect(findSoukatsuJudgmentMismatches([{ name: "消火器", result: "指摘なし" }], {})).toEqual([])
        expect(findSoukatsuJudgmentMismatches([{ name: "消火器", result: "指摘なし" }], undefined)).toEqual([])
        expect(findSoukatsuJudgmentMismatches("消火器", { shokaki: shokaki([1]) })).toEqual([])
    })

    it("設備名で様式と突き合わせる（「非常警報器具・設備」→ 別記14）", () => {
        const found = findSoukatsuJudgmentMismatches([{ name: "非常警報器具・設備", result: "指摘なし" }], { "emergency-alarm": { page1_rows: [{ judgment: "否" }] } })
        expect(found.map((m) => m.stepId)).toEqual(["emergency-alarm"])
    })
})

describe("確定前の確認（checkReportReadiness）の注意", () => {
    const soukatsu = {
        notifier_name: "山田太郎", notifier_address: "東京都千代田区1-1", building_name: "テストビル", building_address: "東京都千代田区2-2",
        building_usage: "（15）項", total_floor_area: 1200, floor_above: 5, inspection_date: "2026-11-08", report_date: "2026-11-08",
        equipment_results: [{ name: "消火器", result: "指摘なし" }],
    }

    it("食い違いは注意（確定は止めない）・設備名つき・直す画面のリンクは出さない", () => {
        const r = checkReportReadiness({ soukatsu, bekkiPayloads: { shokaki: shokaki([0]) } })
        expect(r.canFinalize).toBe(true)
        expect(r.warnings).toEqual([
            expect.objectContaining({ id: "soukatsu_judgment", label: "総括表の判定", message: SOUKATSU_JUDGMENT_MISMATCH_MESSAGE, details: ["消火器"], fix: null }),
        ])
    })

    it("別記の中身を渡さないとき（確定の前の総括表だけ）は見ない", () => {
        expect(checkReportReadiness({ soukatsu }).warnings).toEqual([])
    })
})
