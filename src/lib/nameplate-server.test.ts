import { describe, expect, it } from "vitest"
import { readNameplateWithAll, type NameplateCallers } from "./nameplate-server.ts"
import { NAMEPLATE_FIELDS } from "./nameplate-reading.ts"
import type { NameplateLiveModel } from "./nameplate-ai-config.ts"

const IMG = { base64: "AAAA", mediaType: "image/jpeg" as const }
const SECRET = "sk-test-0123456789abcdef"
const models: NameplateLiveModel[] = [
    { provider: "anthropic", id: "claude-haiku-5-5", apiKey: SECRET, usdIn: 0.1, usdOut: 0.5 },
    { provider: "google", id: "gemini-x", apiKey: "g-key-0123456789", usdIn: 0.25, usdOut: 1.5 },
    { provider: "openai", id: "gpt-x", apiKey: "o-key-0123456789", usdIn: 0.2, usdOut: 1.25 },
]
const okText = JSON.stringify({
    device_kind: "受信機",
    fields: Object.fromEntries(NAMEPLATE_FIELDS.map((f) => [f.key, { value: f.key === "maker" ? "能美防災" : null, legibility: f.key === "maker" ? "clear" : "absent", certainty: "high" }])),
})

describe("3 社に同時に読ませる", () => {
    it("答えた会社は ok・投げた会社と形の違う会社は失敗として続ける・費用を出す", async () => {
        const callers: NameplateCallers = {
            anthropic: async () => ({ finished: true, stopReason: "end_turn", text: okText, inputTokens: 2000, outputTokens: 300, error: null }),
            google: async () => {
                throw new Error("boom")
            },
            openai: async () => ({ finished: true, stopReason: "completed", text: "{not json", inputTokens: 10, outputTokens: 5, error: null }),
        }
        const rs = await readNameplateWithAll(models, IMG, callers, 5_000)
        expect(rs.map((r) => [r.provider, r.ok])).toEqual([["anthropic", true], ["google", false], ["openai", false]])
        expect(rs[0].reading?.fields.maker.value).toBe("能美防災")
        expect(rs[0].costUsd).toBeCloseTo((2000 * 0.1 + 300 * 0.5) / 1e6, 10)
        expect(rs[1].error).toBe("boom")
        expect(rs[2].error).toBe("決まった形でない答え")
    })

    it("★エラーの文にキーが入っていたら伏せる", async () => {
        const callers: NameplateCallers = {
            anthropic: async () => ({ finished: false, stopReason: null, text: null, inputTokens: 0, outputTokens: 0, error: `401 bad key ${SECRET}` }),
            google: async () => ({ finished: false, stopReason: "SAFETY", text: null, inputTokens: 0, outputTokens: 0, error: null }),
            openai: async () => ({ finished: true, stopReason: "completed", text: okText, inputTokens: 1, outputTokens: 1, error: null }),
        }
        const rs = await readNameplateWithAll(models, IMG, callers, 5_000)
        expect(rs[0].error).toBe("401 bad key ***")
        expect(JSON.stringify(rs)).not.toContain(SECRET)
        expect(rs[1].error).toBe("最後まで答えなかった（SAFETY）")
    })

    it("返事の無い会社は時間切れにして、ほかの会社の答えで続ける", async () => {
        const callers: NameplateCallers = {
            anthropic: () => new Promise(() => {}),
            google: async () => ({ finished: true, stopReason: "STOP", text: okText, inputTokens: 1, outputTokens: 1, error: null }),
            openai: async () => ({ finished: true, stopReason: "completed", text: okText, inputTokens: 1, outputTokens: 1, error: null }),
        }
        const rs = await readNameplateWithAll(models, IMG, callers, 10)
        expect(rs[0]).toMatchObject({ ok: false, error: "時間切れ" })
        expect(rs.filter((r) => r.ok)).toHaveLength(2)
    }, 10_000)
})

describe("ヒント（確かめ済みの製造者名）", () => {
    it("3 社に同じヒントを渡す", async () => {
        const seen: (string[] | undefined)[] = []
        const caller = async (_m: unknown, _i: unknown, _t: number, hint?: { makers?: readonly string[] }) => {
            seen.push(hint?.makers ? [...hint.makers] : undefined)
            return { finished: true, stopReason: "end_turn", text: okText, inputTokens: 1, outputTokens: 1, error: null }
        }
        const callers: NameplateCallers = { anthropic: caller, google: caller, openai: caller }
        await readNameplateWithAll(models, IMG, callers, 5_000, { makers: ["能美防災", "ホーチキ"] })
        expect(seen).toEqual([["能美防災", "ホーチキ"], ["能美防災", "ホーチキ"], ["能美防災", "ホーチキ"]])
        seen.length = 0
        await readNameplateWithAll(models, IMG, callers, 5_000)
        expect(seen).toEqual([undefined, undefined, undefined])
    })
})
