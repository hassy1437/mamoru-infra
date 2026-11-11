import { describe, expect, it } from "vitest"

import { addMonthsYmd, daysBetween, dueSortKey, formatYmdJa, nextInspection, nextInspectionByProperty } from "./next-inspection"

const TODAY = "2026-11-11"

describe("次の点検の日（地図などの改善 7）", () => {
    it("月を足す: 月末は詰める", () => {
        expect(addMonthsYmd("2026-04-01", 6)).toBe("2026-10-01")
        expect(addMonthsYmd("2026-08-31", 6)).toBe("2027-02-28")
        expect(addMonthsYmd("2027-08-31", 6)).toBe("2028-02-29")
        expect(addMonthsYmd("2026-11-30", 12)).toBe("2027-11-30")
        expect(addMonthsYmd("x", 6)).toBe("")
    })
    it("日数の差", () => {
        expect(daysBetween("2026-11-11", "2026-11-12")).toBe(1)
        expect(daysBetween("2026-11-11", "2026-10-31")).toBe(-11)
        expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1)
    })
    it("記録が無ければ null", () => {
        expect(nextInspection([], TODAY)).toBeNull()
        expect(nextInspection([{ inspection_date: null, inspection_type: "機器点検" }], TODAY)).toBeNull()
        expect(nextInspection([{ inspection_date: "2026/5/1", inspection_type: "機器点検" }], TODAY)).toBeNull()
    })
    it("前回が総合 → 6 か月後に機器", () => {
        const n = nextInspection([{ inspection_date: "2026-06-01", inspection_type: "総合点検" }], TODAY)
        expect(n).toMatchObject({ date: "2026-12-01", kind: "機器", daysLeft: 20, level: "soon" })
    })
    it("前回が機器・その前が総合 → 総合の 1 年後（同じ日なら総合）", () => {
        const n = nextInspection([
            { inspection_date: "2026-04-01", inspection_type: "機器点検" },
            { inspection_date: "2025-10-01", inspection_type: "総合点検" },
        ], TODAY)
        expect(n).toMatchObject({ date: "2026-10-01", kind: "総合", daysLeft: -41, level: "over" })
    })
    it("総合の記録が無ければ機器の 6 か月ごと", () => {
        const n = nextInspection([{ inspection_date: "2026-09-15", inspection_type: "機器点検" }], TODAY)
        expect(n).toMatchObject({ date: "2027-03-15", kind: "機器", level: "ok" })
    })
    it("30 日以内は黄・31 日は灰・当日は 0", () => {
        expect(nextInspection([{ inspection_date: "2026-06-11", inspection_type: "総合点検" }], "2026-11-11")?.level).toBe("soon")
        expect(nextInspection([{ inspection_date: "2026-06-11", inspection_type: "総合点検" }], "2026-11-12")).toMatchObject({ daysLeft: 29, level: "soon" })
        expect(nextInspection([{ inspection_date: "2026-06-12", inspection_type: "総合点検" }], "2026-11-11")).toMatchObject({ daysLeft: 31, level: "ok" })
        expect(nextInspection([{ inspection_date: "2026-05-11", inspection_type: "総合点検" }], "2026-11-11")).toMatchObject({ daysLeft: 0, level: "soon" })
    })
    it("★点検日が今日より後の総括表は「予定」（いちばん近いもの）", () => {
        const n = nextInspection([
            { inspection_date: "2026-05-01", inspection_type: "総合点検" },
            { inspection_date: "2026-12-20", inspection_type: "機器点検" },
            { inspection_date: "2026-11-16", inspection_type: "総合点検" },
        ], TODAY)
        expect(n).toMatchObject({ date: "2026-11-16", kind: "総合", daysLeft: 5, level: "planned" })
    })
    it("物件ごとにまとめる・物件の無い総括表は数えない", () => {
        const m = nextInspectionByProperty([
            { property_id: "a", inspection_date: "2026-06-01", inspection_type: "総合点検" },
            { property_id: "b", inspection_date: "2026-09-15", inspection_type: "機器点検" },
            { property_id: null, inspection_date: "2026-01-01", inspection_type: "総合点検" },
        ], TODAY)
        expect([...m.keys()].sort()).toEqual(["a", "b"])
        expect(m.get("a")?.date).toBe("2026-12-01")
    })
    it("近い順: 過ぎた → 近い → 遠い → 記録なし", () => {
        const over = nextInspection([{ inspection_date: "2026-04-01", inspection_type: "総合点検" }], TODAY)!
        const soon = nextInspection([{ inspection_date: "2026-06-01", inspection_type: "総合点検" }], TODAY)!
        const far = nextInspection([{ inspection_date: "2026-10-01", inspection_type: "総合点検" }], TODAY)!
        const keys = [far, undefined, soon, over].map(dueSortKey)
        expect([...keys].sort((a, b) => (a === b ? 0 : a < b ? -1 : 1))).toEqual([over, soon, far, undefined].map(dueSortKey))
    })
    it("日付の書き方は「2027年4月1日」", () => {
        expect(formatYmdJa("2027-04-01")).toBe("2027年4月1日")
    })
})
