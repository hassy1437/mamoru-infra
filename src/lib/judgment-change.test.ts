import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { changeRowField } from "./judgment-change"

const row = { judgment: "否", bad_count: "1", bad_content: "安全栓の封が外れていた", action_content: "その場で封を付けた" }

describe("点検票の行の判定を替える（定期テスト第11回の 79）", () => {
    it("否 → 良 で不良内容と不良個数を消す・措置内容は残す", () => {
        expect(changeRowField(row, "judgment", "良")).toEqual({
            judgment: "良", bad_count: "", bad_content: "", action_content: "その場で封を付けた",
        })
    })
    it("否 → 未入力（もう一度押した）では消さない", () => {
        expect(changeRowField(row, "judgment", "")).toEqual({ ...row, judgment: "" })
    })
    it("良 → 否・ほかの欄の書き換えはそのまま", () => {
        const good = { ...row, judgment: "良", bad_content: "", bad_count: "" }
        expect(changeRowField(good, "judgment", "否")).toEqual({ ...good, judgment: "否" })
        expect(changeRowField(row, "bad_content", "直した字")).toEqual({ ...row, bad_content: "直した字" })
    })
    it("不良個数の欄が無い行（消火器以外）に欄を足さない", () => {
        const r = { judgment: "否", bad_content: "x", action_content: "" }
        expect(changeRowField(r, "judgment", "良")).toEqual({ judgment: "良", bad_content: "", action_content: "" })
    })
    it("点検票 9 つの行の書き換えがこの関数を通る", () => {
        const files = ["bekki-result-form-base", "shokaki-bekki1-form", "shokasen-bekki2-form", "sprinkler-bekki3-form", "water-spray-bekki4-form",
            "foam-bekki5-form", "inert-gas-bekki6-form", "halogen-bekki7-form", "powder-bekki8-form"]
        for (const f of files) {
            const src = readFileSync(path.join(process.cwd(), "src", "components", `${f}.tsx`), "utf8")
            // ★updateRowField の中だけを見る（すぐ下の容器の行など、判定の無い書き換えは対象外）
            const start = src.indexOf("const updateRowField")
            const body = src.slice(start, src.indexOf("\n    }\n", start))
            expect(body, f).toContain("changeRowField(row, field, value)")
            expect(body, f).not.toContain("{ ...row, [field]: value }")
        }
    })
})
