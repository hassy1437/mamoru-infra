import { describe, expect, it } from "vitest"

import { ALL_EQUIPMENT_TYPES } from "./equipment-config"
import { FLOOR_PLAN_KINDS, FLOOR_RE, clamp01, countByKind, floorOrder, floorPlanPath, floorsFor, kindsFor } from "./floor-plan-kinds"

describe("見取り図の印と階（地図などの改善 6）", () => {
    it("★種類の記号は DB の決まり（20261231170000）と同じ 12 種", () => {
        expect(FLOOR_PLAN_KINDS.map((k) => k.key)).toEqual([
            "extinguisher", "hydrant", "detector", "manual_station", "receiver", "bell",
            "exit_light", "escape", "sprinkler_valve", "siamese", "outlet", "other",
        ])
        // 印の字は 1〜2 字・名前は短く（ボタンに収まる）
        for (const k of FLOOR_PLAN_KINDS) {
            expect(Array.from(k.mark).length).toBeLessThanOrEqual(2)
            expect(Array.from(k.label).length).toBeLessThanOrEqual(5)
        }
    })
    it("★設備の名前は物件の設備の一覧（equipment-config）にあるものだけ", () => {
        const all = new Set<string>(ALL_EQUIPMENT_TYPES)
        for (const k of FLOOR_PLAN_KINDS) for (const e of k.equipment) expect(all.has(e), `${k.key}: ${e}`).toBe(true)
    })
    it("物件の設備に合うボタンを先に・その他はいつも・設備が無ければ全部", () => {
        const { main, more } = kindsFor(["消火器", "自動火災報知設備"])
        expect(main.map((k) => k.key)).toEqual(["extinguisher", "detector", "manual_station", "receiver", "other"])
        expect(more.length).toBe(FLOOR_PLAN_KINDS.length - main.length)
        expect(kindsFor([]).main.length).toBe(FLOOR_PLAN_KINDS.length)
        expect(kindsFor(null).more).toEqual([])
    })
    it("階のボタン: 地下 → 1F → … → R", () => {
        expect(floorsFor(3, 1)).toEqual(["B1", "1F", "2F", "3F", "R"])
        expect(floorsFor(null, null)).toEqual(["1F", "R"])
        // ★見取り図がある階は階数の外でも出す
        expect(floorsFor(2, 0, ["5F", "B2"])).toEqual(["B2", "1F", "2F", "5F", "R"])
        expect(floorsFor(1, 0, ["0F", "x"])).toEqual(["1F", "R"])
    })
    it("★階の書き方は DB と同じ", () => {
        for (const ok of ["B1", "B9", "1F", "12F", "120F", "R"]) expect(FLOOR_RE.test(ok), ok).toBe(true)
        for (const ng of ["B0", "B10", "0F", "1000F", "RF", "1"]) expect(FLOOR_RE.test(ng), ng).toBe(false)
        expect(floorOrder("B2")).toBeLessThan(floorOrder("B1"))
        expect(floorOrder("12F")).toBeLessThan(floorOrder("R"))
    })
    it("★写真の名前は <会社>/<物件>/…（DB と置き場の決まりがこの形で確かめる）", () => {
        expect(floorPlanPath("c1", "p1", "2F", "u1")).toBe("c1/p1/2F-u1.jpg")
    })
    it("位置は 0〜1・数を数える", () => {
        expect(clamp01(-0.2)).toBe(0)
        expect(clamp01(1.4)).toBe(1)
        expect(clamp01(Number.NaN)).toBe(0)
        expect(countByKind([{ kind: "extinguisher" }, { kind: "extinguisher" }, { kind: "detector" }, { kind: "tv" }])).toEqual({ extinguisher: 2, detector: 1 })
    })
})
