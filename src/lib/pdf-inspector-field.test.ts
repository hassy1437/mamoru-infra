import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import type { PDFFont } from "pdf-lib"
import { describe, expect, it } from "vitest"

import type { ReportFonts } from "./pdf-form-helpers"
import { fitInspectorLine, splitInspectorText } from "./pdf-inspector-field"
import { wrapListItems } from "./pdf-list-wrap"

// 作り物の字: 日本語は 1 字 1em、ASCII は 0.5em
const fake = (em: number) => ({
    widthOfTextAtSize: (t: string, s: number) => Array.from(t).length * em * s,
    heightAtSize: (s: number) => s * 1.2,
}) as unknown as PDFFont
const fonts: ReportFonts = { jp: fake(1), latin: fake(0.5) }

describe("点検者の欄（全機能チェック 51）", () => {
    it("8pt で入れば 8pt・入らなければまず横を 85% まで縮める", () => {
        expect(fitInspectorLine(fonts, "鈴木一郎", 100)).toEqual({ size: 8, condense: 1 })
        // 10 字 × 8pt = 80pt を 72pt へ → 0.9
        expect(fitInspectorLine(fonts, "株式会社サンプル防災", 72)).toEqual({ size: 8, condense: 0.9 })
        // 85% でも入らない → 85% のまま小さくする
        const f = fitInspectorLine(fonts, "株式会社サンプル防災", 58)
        expect(f.condense).toBe(0.85)
        expect(f.size).toBeLessThan(7)
    })
    it("★2 行に分けるときは語の切れ目で（「株式会社サンプル防／災」にしない）", () => {
        expect(splitInspectorText(fonts, "株式会社サンプル防災")).toEqual(["株式会社", "サンプル防災"])
        expect(splitInspectorText(fonts, "サンプル防災株式会社")).toEqual(["サンプル防災", "株式会社"])
        expect(splitInspectorText(fonts, "東京都港区芝公園4-2-8")).toEqual(["東京都港区", "芝公園4-2-8"])
        // 1 字だけの行を作らない
        const [a, b] = splitInspectorText(fonts, "サンプル防災設備")!
        expect(Array.from(a).length).toBeGreaterThan(1)
        expect(Array.from(b).length).toBeGreaterThan(1)
    })
    it("★全 23 様式が共通の描き方を使う（欄ごとに上下の真ん中へ小さく描く作りに戻さない）", () => {
        const dir = join(__dirname, "..", "app", "api")
        const routes = readdirSync(dir).filter((d) => /^generate-.*bekki/.test(d))
        expect(routes.length).toBe(23)
        for (const r of routes) {
            const src = readFileSync(join(dir, r, "route.ts"), "utf8")
            expect(src, r).toContain("drawInspectorFields(")
            expect(src, r).not.toMatch(/draw(?!InspectorFields)\w*\([^)\n]*body\.inspector_(company|tel|address)\b/)
        }
    })
})

describe("表紙の設備名（全機能チェック 51）", () => {
    it("★設備名の途中で行を折らない", () => {
        const items = ["泡消火設備", "不活性ガス消火設備", "動力消防ポンプ設備"]
        // 1 行 12 字（12pt）まで
        const lines = wrapListItems(fonts, items, 1, 12)
        expect(lines).toEqual(["泡消火設備、", "不活性ガス消火設備、", "動力消防ポンプ設備"])
    })
    it("入るなら 1 行に詰める・1 つだけで行に入らない名前は字で折る", () => {
        expect(wrapListItems(fonts, ["消火器", "誘導灯"], 1, 20)).toEqual(["消火器、誘導灯"])
        expect(wrapListItems(fonts, ["消防機関へ通報する火災報知設備"], 1, 8)).toEqual(["消防機関へ通報す", "る火災報知設備"])
    })
})
