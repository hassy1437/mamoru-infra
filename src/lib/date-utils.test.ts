import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { formatJstDateTime, formatJstYmd } from "./date-utils"

describe("日本時間に決め打ちした日付・日時（全機能チェック 53・59）", () => {
    it("世界標準時の夜は、日本時間の翌日になる", () => {
        expect(formatJstYmd("2026-11-10T16:05:09Z")).toBe("2026-11-11")
        expect(formatJstDateTime("2026-11-10T16:05:09Z")).toBe("2026/11/11 1:05:09")
        expect(formatJstDateTime("2026-11-11T07:00:00Z")).toBe("2026/11/11 16:00:00")
    })
    it("読めない値は空", () => {
        expect(formatJstDateTime("x")).toBe("")
    })
    it("★画面の部品は時間帯を書かずに日時を書かない（サーバとブラウザで変わり、組み直しのエラーになる）", () => {
        const dir = join(__dirname, "..", "components")
        const bad: string[] = []
        for (const f of readdirSync(dir).filter((n) => n.endsWith(".tsx"))) {
            const src = readFileSync(join(dir, f), "utf8")
            for (const m of src.matchAll(/\.toLocale(?:Date|Time)?String\(([^)]*)\)/g)) {
                // ★金額（数値）は時間帯に関係しない。日付のときは timeZone を書く
                const line = src.slice(src.lastIndexOf("\n", m.index) + 1, src.indexOf("\n", m.index))
                const isDate = /Date|date|_at\b|At\b/.test(line) && !/yen|amount|Yen|price|count/i.test(line)
                if (isDate && !m[1].includes("timeZone")) bad.push(`${f}: ${line.trim()}`)
            }
        }
        expect(bad).toEqual([])
    })
    it("報告書の一覧の日付は日本時間に固定（53）", () => {
        const src = readFileSync(join(__dirname, "..", "components", "report-list.tsx"), "utf8")
        expect(src).toContain('timeZone: "Asia/Tokyo"')
    })
})
