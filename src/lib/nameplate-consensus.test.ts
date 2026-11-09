import { describe, expect, it } from "vitest"
import {
    buildNameplateConsensus,
    deviceModelText,
    nameplateOutcomes,
    nameplateVoteKey,
    type NameplateProvider,
    type NameplateProviderResult,
} from "./nameplate-consensus.ts"
import { NAMEPLATE_FIELDS, type NameplateFieldKey, type NameplateReading } from "./nameplate-reading.ts"

type Partial = { [K in NameplateFieldKey]?: string | null | { value: string | null; legibility?: "clear" | "unreadable" | "absent"; certainty?: "high" | "low" } }

function reading(kind: NameplateReading["device_kind"], fields: Partial): NameplateReading {
    return {
        device_kind: kind,
        fields: Object.fromEntries(
            NAMEPLATE_FIELDS.map((f) => {
                const v = fields[f.key]
                if (v === undefined || v === null) return [f.key, { value: null, legibility: "absent", certainty: "high" }]
                if (typeof v === "string") return [f.key, { value: v, legibility: "clear", certainty: "high" }]
                return [f.key, { value: v.value, legibility: v.legibility ?? "clear", certainty: v.certainty ?? "high" }]
            }),
        ) as NameplateReading["fields"],
    }
}

function result(provider: NameplateProvider, r: NameplateReading | null, ok = true): NameplateProviderResult {
    return { provider, model: `${provider}-m`, ok, error: ok ? null : "失敗", ms: 100, inputTokens: 1000, outputTokens: 100, costUsd: 0.0001, reading: r }
}

describe("多数決", () => {
    it("3 社そろえば agreed（全角半角・空白・株式会社の違いは同じ）", () => {
        const c = buildNameplateConsensus([
            result("openai", reading("受信機", { maker: "能美防災株式会社", model: "ＲＰＱＡ－０１" })),
            result("anthropic", reading("受信機", { maker: "能美防災", model: "RPQA-01" })),
            result("google", reading("受信機", { maker: "能美防災 ", model: "RPQA‐01" })),
        ])
        expect(c.fields.maker.status).toBe("agreed")
        // ★並びが先の会社（Claude）の表記を入れる
        expect(c.fields.maker.value).toBe("能美防災")
        expect(c.fields.model.value).toBe("RPQA-01")
        expect(c.device_kind).toBe("受信機")
        expect(c.voters).toBe(3)
    })

    it("2 対 1 は split（多い方を入れて黄色・候補は 2 つ）", () => {
        const c = buildNameplateConsensus([
            result("anthropic", reading("消火器", { serial_number: "A123" })),
            result("google", reading("消火器", { serial_number: "A128" })),
            result("openai", reading("消火器", { serial_number: "A128" })),
        ])
        expect(c.fields.serial_number).toMatchObject({ status: "split", value: "A128", warning: true })
        expect(c.fields.serial_number.candidates.map((x) => x.value)).toEqual(["A128", "A123"])
        expect(c.fields.serial_number.candidates[0].providers).toEqual(["google", "openai"])
    })

    it("ばらばら・1 社だけは none（★推測で埋めない）", () => {
        const c = buildNameplateConsensus([
            result("anthropic", reading("ポンプ", { model: "X1", maker: "荏原製作所" })),
            result("google", reading("ポンプ", { model: "X2" })),
            result("openai", reading("ポンプ", { model: "X3" })),
        ])
        expect(c.fields.model).toMatchObject({ status: "none", value: null })
        expect(c.fields.model.candidates).toHaveLength(3)
        expect(c.fields.maker).toMatchObject({ status: "none", value: null })
    })

    it("読めない・銘板に無い・失敗した会社は票に数えない（2 社そろえば agreed）", () => {
        const c = buildNameplateConsensus([
            result("anthropic", reading("中継器", { maker: "ホーチキ" })),
            result("google", reading("中継器", { maker: { value: null, legibility: "unreadable" } })),
            result("openai", null, false),
        ])
        expect(c.voters).toBe(2)
        // google は読めない＝票なし。anthropic だけ＝1 票なので none
        expect(c.fields.maker.status).toBe("none")
        const c2 = buildNameplateConsensus([
            result("anthropic", reading("中継器", { maker: "ホーチキ" })),
            result("google", reading("中継器", { maker: "ホーチキ株式会社" })),
            result("openai", null, false),
        ])
        expect(c2.fields.maker).toMatchObject({ status: "agreed", value: "ホーチキ" })
    })

    it("製造年は年・校正年月日は年月日でそろえて比べる", () => {
        expect(nameplateVoteKey("manufactured", "2015年")).toBe(nameplateVoteKey("manufactured", "H27"))
        expect(nameplateVoteKey("calibrated_at", "2024.4.12")).toBe(nameplateVoteKey("calibrated_at", "2024/04/12"))
        expect(nameplateVoteKey("calibrated_at", "2024.4.12")).not.toBe(nameplateVoteKey("calibrated_at", "2024.4.13"))
        const c = buildNameplateConsensus([
            result("anthropic", reading("測定機器", { calibrated_at: "2024.4.12" })),
            result("google", reading("測定機器", { calibrated_at: "2024/04/12" })),
        ])
        expect(c.fields.calibrated_at).toMatchObject({ status: "agreed", value: "2024.4.12" })
    })

    it("自信が低いと答えた会社がいる欄・形の確かめに引っかかる欄は黄色", () => {
        const c = buildNameplateConsensus(
            [
                result("anthropic", reading("消火器", { maker: { value: "ヤマトプロテック", certainty: "low" }, approval_number: "受第2021~4号" })),
                result("google", reading("消火器", { maker: "ヤマトプロテック", approval_number: "受第2021~4号" })),
            ],
            { now: new Date("2026-11-03") },
        )
        expect(c.fields.maker).toMatchObject({ status: "agreed", warning: true })
        // 消火器なのに頭の字が「消」でない
        expect(c.fields.approval_number.warning).toBe(true)
        expect(c.warnings.some((w) => w.startsWith("型式番号:"))).toBe(true)
    })

    it("機器の種類がそろわなければ「その他」", () => {
        const c = buildNameplateConsensus([
            result("anthropic", reading("ポンプ", {})),
            result("google", reading("電動機", {})),
        ])
        expect(c.device_kind).toBe("その他")
    })
})

/** ★2026-11-09: 当面は 2 社（Claude・Gemini）で使う（ChatGPT のキーは入れていない）。2 社のときの決まりを縛る */
describe("2 社（Claude・Gemini）のとき", () => {
    it("2 社が同じなら agreed（緑）・違えば none（空にして両方を候補に・★割れた（黄色）にはならない）", () => {
        const c = buildNameplateConsensus([
            result("anthropic", reading("ポンプ", { maker: "株式会社サンプル製作所", model: "SP-65A", serial_number: "19A-0412" })),
            result("google", reading("ポンプ", { maker: "サンプル製作所", model: "SP-65A", serial_number: "19A-04I2" })),
        ])
        expect(c.voters).toBe(2)
        expect(c.device_kind).toBe("ポンプ")
        expect(c.fields.maker).toMatchObject({ status: "agreed", value: "株式会社サンプル製作所" })
        expect(c.fields.model).toMatchObject({ status: "agreed", value: "SP-65A" })
        expect(c.fields.serial_number.status).toBe("none")
        expect(c.fields.serial_number.value).toBeNull()
        expect(c.fields.serial_number.candidates.map((x) => [x.value, x.providers])).toEqual([
            ["19A-0412", ["anthropic"]],
            ["19A-04I2", ["google"]],
        ])
    })

    it("1 社が失敗・読めないときは、もう 1 社の値も入れない（★1 票では埋めない・候補には出す）", () => {
        const failed = buildNameplateConsensus([
            result("anthropic", reading("測定機器", { maker: "みほん計器株式会社" })),
            result("google", null, false),
        ])
        expect(failed.voters).toBe(1)
        expect(failed.fields.maker).toMatchObject({ status: "none", value: null })
        expect(failed.fields.maker.candidates).toEqual([{ value: "みほん計器株式会社", providers: ["anthropic"] }])
        expect(failed.device_kind).toBe("その他")

        const unreadable = buildNameplateConsensus([
            result("anthropic", reading("測定機器", { model: "IR-4052" })),
            result("google", reading("測定機器", { model: { value: null, legibility: "unreadable" } })),
        ])
        expect(unreadable.fields.model).toMatchObject({ status: "none", value: null })
        expect(unreadable.device_kind).toBe("測定機器")
    })
})

describe("答え合わせ", () => {
    it("会社ごと・欄ごとに judgeNameplateField（失敗した会社は入れない）", () => {
        const out = nameplateOutcomes(
            [
                result("anthropic", reading("受信機", { maker: "能美防災", model: "R-1", serial_number: "999" })),
                result("google", reading("受信機", { maker: "能美防災株式会社", model: "R-2" })),
                result("openai", null, false),
            ],
            { maker: "能美防災", model: "R-1", serial_number: null },
        )
        expect(out.openai).toBeUndefined()
        expect(out.anthropic).toEqual({ maker: "correct", model: "correct", serial_number: "fabricated" })
        expect(out.google).toEqual({ maker: "variant", model: "wrong", serial_number: "both_empty" })
    })

    it("★画面に出していない欄（finalValues に無い欄）は採点しない", () => {
        const out = nameplateOutcomes(
            [result("anthropic", reading("受信機", { maker: "能美防災", serial_number: "999", manufactured: "2015年" }))],
            { maker: "能美防災" },
        )
        expect(out.anthropic).toEqual({ maker: "correct" })
    })

    it("★製造年・校正年月日は、書き方が違っても同じ年・同じ日なら variant（wrong にしない）", () => {
        const out = nameplateOutcomes(
            [
                result("anthropic", reading("測定機器", { calibrated_at: "2024/04/12", manufactured: "H27" })),
                result("google", reading("測定機器", { calibrated_at: "2024.4.13", manufactured: "2016年" })),
            ],
            { calibrated_at: "2024.4.12", manufactured: "2015年" },
        )
        expect(out.anthropic).toEqual({ calibrated_at: "variant", manufactured: "variant" })
        expect(out.google).toEqual({ calibrated_at: "wrong", manufactured: "wrong" })
    })

    it("読めないと答えた値は空として採点する（入れた値があれば missed）", () => {
        const out = nameplateOutcomes(
            [result("anthropic", reading("受信機", { maker: { value: "能美", legibility: "unreadable" } }))],
            { maker: "能美防災" },
        )
        expect(out.anthropic?.maker).toBe("missed")
    })
})

describe("型式等の欄", () => {
    it("型式（型式番号）・片方だけならそのまま", () => {
        expect(deviceModelText("P-1A", "受第2~1号")).toBe("P-1A（受第2~1号）")
        expect(deviceModelText("P-1A", null)).toBe("P-1A")
        expect(deviceModelText(" ", "受第2~1号")).toBe("受第2~1号")
        expect(deviceModelText(null, null)).toBe("")
    })
})
