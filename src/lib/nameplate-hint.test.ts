import { describe, expect, it } from "vitest"
import {
    NAMEPLATE_HINT_MAX_MAKERS,
    NAMEPLATE_HINT_MIN_MAKERS,
    NAMEPLATE_USER_TEXT,
    buildNameplateRequest,
    nameplateUserText,
} from "./nameplate-reading.ts"
import { buildGeminiRequest, buildOpenAIRequest } from "./nameplate-providers.ts"

const makers = (n: number) => Array.from({ length: n }, (_, i) => `会社${i + 1}`)
const IMG = { base64: "AAAA", mediaType: "image/jpeg" as const }

describe("ヒントを頼む文に添える", () => {
    it("★20 社に満たなければ添えない（頼む文は今までどおり）", () => {
        expect(nameplateUserText()).toBe(NAMEPLATE_USER_TEXT)
        expect(nameplateUserText({ makers: makers(NAMEPLATE_HINT_MIN_MAKERS - 1) })).toBe(NAMEPLATE_USER_TEXT)
    })

    it("20 社からは添える・★書き換えない／補わないの念押しが入る・上限で切る・重複と空は除く", () => {
        const list = [...makers(NAMEPLATE_HINT_MAX_MAKERS + 10), "会社1", " ", ""]
        const t = nameplateUserText({ makers: list })
        expect(t.startsWith(NAMEPLATE_USER_TEXT)).toBe(true)
        expect(t).toContain("一覧に合わせて書き換えない")
        expect(t).toContain("読めない字を一覧から補わない")
        expect(t).toContain(`会社${NAMEPLATE_HINT_MAX_MAKERS}`)
        expect(t).not.toContain(`会社${NAMEPLATE_HINT_MAX_MAKERS + 1}、`)
        expect(t.split("会社1、").length).toBe(2)
    })

    it("★3 社とも同じ頼む文になる（比べられるように）", () => {
        const hint = { makers: makers(25) }
        const a = buildNameplateRequest({ model: "m", imageBase64: "AAAA", mediaType: "image/jpeg", hint })
        const aText = (a.messages[0].content[1] as { text: string }).text
        const o = buildOpenAIRequest("m", IMG, "low", hint) as { input: { content: { type: string; text?: string }[] }[] }
        const oText = o.input[0].content.find((c) => c.type === "input_text")?.text
        const g = buildGeminiRequest(IMG, "low", hint) as { contents: { parts: { text?: string }[] }[] }
        const gText = g.contents[0].parts.find((p) => typeof p.text === "string")?.text
        expect(aText).toBe(nameplateUserText(hint))
        expect(oText).toBe(aText)
        expect(gText).toBe(aText)
    })
})
