import { describe, expect, it } from "vitest"

import { addMonthsYmd, daysBetween, dueSortKey, formatYmdJa, manualRecordOf, nextInspection, nextInspectionByProperty, recentMonths } from "./next-inspection"

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

    it("★月だけ選んだ前回の点検でも出す（日は目安＝「○月ごろ」）", () => {
        const manual = manualRecordOf({ last_inspection_month: "2026-05-01", last_inspection_kind: "総合点検" })!
        const n = nextInspection([manual], TODAY)
        expect(n).toMatchObject({ date: "2026-11-01", kind: "機器", approx: true, level: "over" })
        expect(formatYmdJa(n!.date, n!.approx)).toBe("2026年11月ごろ")
        expect(manualRecordOf({ last_inspection_month: "2026-05-01", last_inspection_kind: null })).toBeNull()
    })
    it("★総括表のほうが新しければ、そちらが前回（目安ではなくなる）", () => {
        const manual = manualRecordOf({ last_inspection_month: "2026-03-01", last_inspection_kind: "総合点検" })!
        const n = nextInspection([manual, { inspection_date: "2026-09-10", inspection_type: "機器点検" }], TODAY)
        // 機器 9/10 + 6 か月 = 2027-03-10 ／ 総合 3/1 + 1 年 = 2027-03-01（早い）→ 総合は月だけの記録から＝目安
        expect(n).toMatchObject({ date: "2027-03-01", kind: "総合", approx: true })
        const n2 = nextInspection([manual, { inspection_date: "2026-09-10", inspection_type: "総合点検" }], TODAY)
        expect(n2).toMatchObject({ date: "2027-03-10", kind: "機器", approx: false })
    })
    it("先の月を選んだ記録は使わない・総括表がある物件にも足せる", () => {
        expect(nextInspection([manualRecordOf({ last_inspection_month: "2026-12-01", last_inspection_kind: "機器点検" })!], TODAY)).toBeNull()
        const m = nextInspectionByProperty([{ property_id: "a", inspection_date: "2026-06-01", inspection_type: "総合点検" }], TODAY, [
            { id: "b", last_inspection_month: "2026-08-01", last_inspection_kind: "機器点検" },
            { id: "c", last_inspection_month: null, last_inspection_kind: null },
        ])
        expect([...m.keys()].sort()).toEqual(["a", "b"])
        expect(m.get("b")).toMatchObject({ date: "2027-02-01", approx: true })
        expect(m.get("a")?.approx).toBe(false)
    })
    it("月のボタン: 今月から前へ・値は月の 1 日・年をまたぐ", () => {
        const ms = recentMonths("2026-02-15", 4)
        expect(ms).toEqual([
            { value: "2026-02-01", label: "2026年2月" },
            { value: "2026-01-01", label: "2026年1月" },
            { value: "2025-12-01", label: "2025年12月" },
            { value: "2025-11-01", label: "2025年11月" },
        ])
        expect(recentMonths("2026-02-15", 1, 12)).toEqual([{ value: "2025-02-01", label: "2025年2月" }])
    })
})
