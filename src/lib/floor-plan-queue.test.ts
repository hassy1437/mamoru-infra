import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { isOfflineError, pendingSnapshot, readPending, writePending, type PendingPin } from "./floor-plan-queue"

// ★テストは node で走るので、localStorage と window だけ作り物を置く
const store = new Map<string, string>()
const events: string[] = []
beforeEach(() => {
    store.clear()
    events.length = 0
    ;(globalThis as unknown as { window: unknown }).window = {
        localStorage: {
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => void store.set(k, v),
            removeItem: (k: string) => void store.delete(k),
        },
        dispatchEvent: (e: Event) => events.push(e.type),
    }
})
afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window
})

const pin = (tempId: string, planId = "p1"): PendingPin => ({ tempId, planId, kind: "extinguisher", x: 0.2, y: 0.3, defect: false })

describe("電波の無い所の印を覚えて送る（地図などの改善 6 の続き）", () => {
    it("見取り図ごとに覚えて読み出す・空にすると消える", () => {
        expect(writePending("p1", [pin("a"), pin("b")])).toBe(true)
        expect(readPending("p1").map((p) => p.tempId)).toEqual(["a", "b"])
        expect(readPending("p2")).toEqual([])
        writePending("p1", [])
        expect(store.size).toBe(0)
        expect(events).toContain("mamoru-floor-plan-pending")
    })
    it("★ほかの見取り図の印・壊れた中身は読まない", () => {
        store.set("mamoru:floor-plan-pending:p1", JSON.stringify([pin("a", "p2"), { tempId: "x" }, pin("b")]))
        expect(readPending("p1").map((p) => p.tempId)).toEqual(["b"])
        store.set("mamoru:floor-plan-pending:p1", "{壊れた")
        expect(readPending("p1")).toEqual([])
    })
    it("写しは中身が同じなら同じ文字列（描き直しが続かない）", () => {
        writePending("p1", [pin("a")])
        expect(pendingSnapshot(["p1", "p2"])).toBe(pendingSnapshot(["p1", "p2"]))
        const before = pendingSnapshot(["p1"])
        writePending("p1", [pin("a"), pin("b")])
        expect(pendingSnapshot(["p1"])).not.toBe(before)
    })
    it("電波の失敗だけを「あとで送る」にする", () => {
        expect(isOfflineError({ message: "TypeError: Failed to fetch" })).toBe(true)
        expect(isOfflineError({ message: "Load failed" })).toBe(true)
        expect(isOfflineError({ message: "new row violates row-level security policy" })).toBe(false)
        expect(isOfflineError(null)).toBe(false)
    })
})
