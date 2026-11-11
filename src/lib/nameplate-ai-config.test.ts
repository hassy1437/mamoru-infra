import { describe, expect, it } from "vitest"
import {
    NAMEPLATE_LIVE_MODELS,
    nameplateAiEnabledFor,
    nameplateAiMode,
    nameplateAiTesters,
    nameplateCostUsd,
    nameplateLiveModels,
} from "./nameplate-ai-config.ts"
import { MODELS } from "../../scripts/nameplate-eval/lib.mts"

const UID = "6e000000-0000-0000-0000-0000000000a1"
const KEYS = { ANTHROPIC_API_KEY: "k-a", GEMINI_API_KEY: "k-g", OPENAI_API_KEY: "k-o" }

describe("スイッチ", () => {
    it("既定は off（知らない値も off）", () => {
        expect(nameplateAiMode({})).toBe("off")
        expect(nameplateAiMode({ NAMEPLATE_AI: "yes" })).toBe("off")
        expect(nameplateAiMode({ NAMEPLATE_AI: " ON " })).toBe("on")
    })

    it("off では誰にも出さない・test ではテストの人だけ・on では全員", () => {
        expect(nameplateAiEnabledFor({ ...KEYS, NAMEPLATE_AI: "off" }, UID)).toBe(false)
        expect(nameplateAiEnabledFor({ ...KEYS, NAMEPLATE_AI: "test", NAMEPLATE_AI_TESTERS: "" }, UID)).toBe(false)
        expect(nameplateAiEnabledFor({ ...KEYS, NAMEPLATE_AI: "test", NAMEPLATE_AI_TESTERS: `x, ${UID.toUpperCase()}` }, UID)).toBe(true)
        expect(nameplateAiEnabledFor({ ...KEYS, NAMEPLATE_AI: "on" }, UID)).toBe(true)
        expect(nameplateAiEnabledFor({ ...KEYS, NAMEPLATE_AI: "on" }, null)).toBe(false)
    })

    it("キーが 1 つも無ければ on でも出さない", () => {
        expect(nameplateAiEnabledFor({ NAMEPLATE_AI: "on" }, UID)).toBe(false)
    })

    it("テストの人の書き方が違うものは捨てる", () => {
        expect(nameplateAiTesters({ NAMEPLATE_AI_TESTERS: "abc, " + UID })).toEqual([UID])
    })
})

describe("モデル", () => {
    it("キーのある会社だけ・モデル名は環境変数で替えられる", () => {
        const ms = nameplateLiveModels({ ANTHROPIC_API_KEY: "k-a", GOOGLE_API_KEY: "k-g2", NAMEPLATE_MODEL_GOOGLE: "gemini-9-lite" })
        expect(ms.map((m) => m.provider)).toEqual(["anthropic", "google"])
        expect(ms[1]).toMatchObject({ id: "gemini-9-lite", apiKey: "k-g2" })
    })

    it("★単価とモデル名は評価の道具（scripts/nameplate-eval/lib.mts）と同じ", () => {
        expect(NAMEPLATE_LIVE_MODELS.anthropic).toMatchObject({ id: MODELS.haiku.id, usdIn: MODELS.haiku.usdIn, usdOut: MODELS.haiku.usdOut })
        expect(NAMEPLATE_LIVE_MODELS.google).toMatchObject({
            id: MODELS["gemini-flash-lite"].id, usdIn: MODELS["gemini-flash-lite"].usdIn, usdOut: MODELS["gemini-flash-lite"].usdOut,
        })
        expect(NAMEPLATE_LIVE_MODELS.openai).toMatchObject({ id: MODELS["gpt-nano"].id, usdIn: MODELS["gpt-nano"].usdIn, usdOut: MODELS["gpt-nano"].usdOut })
    })

    it("費用（トークン数が無ければ null）", () => {
        expect(nameplateCostUsd({ usdIn: 0.1, usdOut: 0.5 }, 2000, 400)).toBeCloseTo(0.0004, 8)
        expect(nameplateCostUsd({ usdIn: 0.1, usdOut: 0.5 }, 0, 0)).toBeNull()
    })
})
