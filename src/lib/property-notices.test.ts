import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
    FLOOR_AREA_MISSING_NOTE,
    FLOOR_AREA_MISSING_TITLE,
    NOTIFIER_MISSING_NOTE,
    NOTIFIER_MISSING_TITLE,
    hasNotifierName,
    needsFloorAreaNotice,
    needsNotifierNotice,
} from "@/lib/property-notices"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

describe("延べ面積の知らせ（物件の画面）", () => {
    it("物件にも総括表にも無いときだけ出す", () => {
        expect(needsFloorAreaNotice({ total_floor_area: null }, null)).toBe(true)
        expect(needsFloorAreaNotice({ total_floor_area: null }, { total_floor_area: null })).toBe(true)
    })

    it("★総括表に入れたら消える（2026-11-12 のデモ: 入れても消えなかった）", () => {
        expect(needsFloorAreaNotice({ total_floor_area: null }, { total_floor_area: 420.5 })).toBe(false)
        expect(needsFloorAreaNotice({ total_floor_area: null }, { total_floor_area: "420.5" })).toBe(false)
    })

    it("物件に入っていれば出さない", () => {
        expect(needsFloorAreaNotice({ total_floor_area: 300 }, null)).toBe(false)
        expect(needsFloorAreaNotice({ total_floor_area: 300 }, { total_floor_area: null })).toBe(false)
    })

    it("★0 は空とみなす（確定の決まりと同じ）", () => {
        expect(needsFloorAreaNotice({ total_floor_area: 0 }, { total_floor_area: 0 })).toBe(true)
        expect(needsFloorAreaNotice({ total_floor_area: "" }, { total_floor_area: "0" })).toBe(true)
    })
})

describe("届出者の知らせ（物件の画面）", () => {
    it("名前か住所が空なら出す（★成約から作った物件は両方空で入る）", () => {
        expect(needsNotifierNotice({ notifier_name: null, notifier_address: null })).toBe(true)
        expect(needsNotifierNotice({ notifier_name: "山田 花子", notifier_address: "" })).toBe(true)
        expect(needsNotifierNotice({ notifier_name: "  ", notifier_address: "大阪市" })).toBe(true)
    })

    it("両方あれば出さない", () => {
        expect(needsNotifierNotice({ notifier_name: "山田 花子", notifier_address: "大阪市" })).toBe(false)
    })

    it("見出しの下の届出者の行は、名前があるときだけ", () => {
        expect(hasNotifierName({ notifier_name: null })).toBe(false)
        expect(hasNotifierName({ notifier_name: " " })).toBe(false)
        expect(hasNotifierName({ notifier_name: "山田 花子" })).toBe(true)
    })

    it("要点は短い（40 字以内）", () => {
        for (const s of [FLOOR_AREA_MISSING_TITLE + FLOOR_AREA_MISSING_NOTE, NOTIFIER_MISSING_TITLE + NOTIFIER_MISSING_NOTE]) {
            expect(s.length).toBeLessThanOrEqual(40)
        }
    })
})

describe("★配線（物件の画面と物件一覧）", () => {
    const page = read("src/app/properties/[id]/page.tsx")
    const list = read("src/components/property-search.tsx")

    it("物件の画面は 2 つの知らせをこの関数で決め、総括表の延べ面積を読む", () => {
        expect(page).toContain("needsFloorAreaNotice(p, latestArea)")
        expect(page).toContain("needsNotifierNotice(p)")
        expect(page).toMatch(/inspection_soukatsu[\s\S]*total_floor_area/)
        // 物件の延べ面積だけで決める古い形に戻っていない
        expect(page).not.toContain("{!p.total_floor_area && (")
    })

    it("届出者の行は名前があるときだけ（物件の画面・物件一覧）", () => {
        expect(page).toContain("hasNotifierName(p) && (")
        expect(list).toContain("hasNotifierName(property) && (")
    })
})
