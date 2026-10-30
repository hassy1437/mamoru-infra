import { describe, expect, it } from "vitest"

import {
    EXTINGUISHER_RULES,
    internalCheckDuty,
    pressureTestDuty,
    replacementGuide,
    summarizeLedger,
    validateExtinguisherInput,
    yearReached,
    type ExtinguisherGroup,
    type ExtinguisherGroupInput,
} from "@/lib/extinguisher-ledger"

const g = (extra: Partial<ExtinguisherGroup> = {}): ExtinguisherGroup => ({
    id: "g1",
    property_id: "p1",
    kind: "A",
    pressurization: "stored",
    maker: "",
    model: "",
    approval_number: "",
    manufactured_year: 2016,
    quantity: 1,
    location: "",
    last_pressure_test_year: null,
    note: "",
    ...extra,
})

const input = (extra: Partial<ExtinguisherGroupInput> = {}): ExtinguisherGroupInput => {
    const rest: Partial<ExtinguisherGroup> = g(extra)
    delete rest.id
    return rest as ExtinguisherGroupInput
}

describe("yearReached（「製造年から N 年を経過」の数え方・★要確認）", () => {
    it("reach（いまの既定）は製造年 ＋ N 年から", () => {
        expect(EXTINGUISHER_RULES.counting).toBe("reach")
        expect(yearReached(2016, 10)).toBe(2026)
    })
    it("exceed にすると 1 年遅れる（橋本さんの確かめで変えるとき）", () => {
        expect(yearReached(2016, 10, "exceed")).toBe(2027)
    })
})

describe("pressureTestDuty（耐圧性能点検）", () => {
    it("製造年から 10 年で対象・それより前は「何年から」", () => {
        expect(pressureTestDuty(g({ manufactured_year: 2016 }), 2026).state).toBe("due")
        expect(pressureTestDuty(g({ manufactured_year: 2017 }), 2026)).toMatchObject({ state: "later", fromYear: 2027 })
    })
    it("前回の年があれば 3 年ごと", () => {
        expect(pressureTestDuty(g({ manufactured_year: 2010, last_pressure_test_year: 2024 }), 2026)).toMatchObject({ state: "later", fromYear: 2027 })
        expect(pressureTestDuty(g({ manufactured_year: 2010, last_pressure_test_year: 2023 }), 2026).state).toBe("due")
    })
    it("★腐食などで早めに行っても、製造年から 10 年より前には対象にしない", () => {
        expect(pressureTestDuty(g({ manufactured_year: 2018, last_pressure_test_year: 2020 }), 2025)).toMatchObject({ state: "later", fromYear: 2028 })
    })
    it("二酸化炭素・ハロゲン化物は年数では求めない・製造年が無ければ分からない", () => {
        expect(pressureTestDuty(g({ kind: "D", manufactured_year: 2000 }), 2026).state).toBe("exempt")
        expect(pressureTestDuty(g({ kind: "E", manufactured_year: 2000 }), 2026).state).toBe("exempt")
        expect(pressureTestDuty(g({ manufactured_year: null }), 2026).state).toBe("unknown")
    })
})

describe("internalCheckDuty（内部・機能の点検）", () => {
    it("加圧式は 3 年・蓄圧式は 5 年", () => {
        expect(internalCheckDuty(g({ pressurization: "pressurized", manufactured_year: 2023 }), 2026).state).toBe("due")
        expect(internalCheckDuty(g({ pressurization: "pressurized", manufactured_year: 2024 }), 2026)).toMatchObject({ state: "later", fromYear: 2027 })
        expect(internalCheckDuty(g({ pressurization: "stored", manufactured_year: 2021 }), 2026).state).toBe("due")
        expect(internalCheckDuty(g({ pressurization: "stored", manufactured_year: 2022 }), 2026)).toMatchObject({ state: "later", fromYear: 2027 })
    })
    it("化学泡は 1 年（設置年が無いので製造年で数える）", () => {
        const d = internalCheckDuty(g({ kind: "B", pressurization: "chemical", manufactured_year: 2025 }), 2026)
        expect(d.state).toBe("due")
        expect(d.reason).toContain("製造年で数えています")
    })
    it("★方式が分からなくても、どちらでも同じ答えになる年は言い切る", () => {
        expect(internalCheckDuty(g({ pressurization: "unknown", manufactured_year: 2020 }), 2026).state).toBe("due")
        expect(internalCheckDuty(g({ pressurization: "unknown", manufactured_year: 2025 }), 2026)).toMatchObject({ state: "later", fromYear: 2028 })
        // 3〜4 年目は加圧式なら対象・蓄圧式ならまだ
        expect(internalCheckDuty(g({ pressurization: "unknown", manufactured_year: 2022 }), 2026).state).toBe("unknown")
    })
    it("二酸化炭素・ハロゲン化物は年数では求めない（★要確認）", () => {
        expect(internalCheckDuty(g({ kind: "D", pressurization: "stored", manufactured_year: 2000 }), 2026).state).toBe("exempt")
    })
})

describe("replacementGuide（交換の目安・法令ではない）", () => {
    it("製造年 ＋ 10 年の年まで・今年・過ぎた", () => {
        expect(replacementGuide(g({ manufactured_year: 2017 }), 2026)).toEqual({ state: "ok", year: 2027 })
        expect(replacementGuide(g({ manufactured_year: 2016 }), 2026)).toEqual({ state: "this_year", year: 2026 })
        expect(replacementGuide(g({ manufactured_year: 2015 }), 2026)).toEqual({ state: "past", year: 2025 })
        expect(replacementGuide(g({ manufactured_year: null }), 2026)).toEqual({ state: "unknown" })
    })
})

describe("summarizeLedger", () => {
    it("本数で数える（器種ごとの本数は第1 の「設置数」の候補）", () => {
        const s = summarizeLedger(
            [
                g({ kind: "A", pressurization: "stored", manufactured_year: 2014, quantity: 4 }), // 耐圧・内部・交換の目安を過ぎた
                g({ kind: "A", pressurization: "unknown", manufactured_year: 2022, quantity: 2 }), // 内部は方式しだい
                g({ kind: "C", pressurization: "stored", manufactured_year: 2025, quantity: 3 }), // まだ何も
                g({ kind: "D", pressurization: "stored", manufactured_year: 2010, quantity: 1 }), // 耐圧・内部は求めない・交換の目安は過ぎた
                g({ kind: "A", manufactured_year: null, quantity: 5 }), // 製造年なし
            ],
            2026,
        )
        expect(s).toEqual({
            total: 15,
            byKind: { A: 11, B: 0, C: 3, D: 1, E: 0, F: 0 },
            pressureTestDue: 4,
            internalCheckDue: 4,
            internalCheckUnknown: 2,
            replacementPast: 5,
            noYear: 5,
        })
    })
})

describe("validateExtinguisherInput（DB の制約と同じ＋今年より後の年は止める）", () => {
    it("ふつうの値は通る", () => {
        expect(validateExtinguisherInput(input({ manufactured_year: 2016, last_pressure_test_year: 2026, quantity: 12 }), 2026)).toEqual([])
    })
    it("化学泡は泡だけ・本数・年の範囲・耐圧の年が製造年より前", () => {
        expect(validateExtinguisherInput(input({ kind: "A", pressurization: "chemical" }), 2026)).toContain("化学泡は器種が「泡」のときだけ選べます")
        expect(validateExtinguisherInput(input({ kind: "B", pressurization: "chemical" }), 2026)).toEqual([])
        expect(validateExtinguisherInput(input({ quantity: 0 }), 2026)).toHaveLength(1)
        expect(validateExtinguisherInput(input({ quantity: 1.5 }), 2026)).toHaveLength(1)
        expect(validateExtinguisherInput(input({ manufactured_year: 2027 }), 2026)).toEqual(["製造年は 1950〜2026 の西暦で入れてください"])
        expect(validateExtinguisherInput(input({ manufactured_year: 1949 }), 2026)).toHaveLength(1)
        expect(validateExtinguisherInput(input({ manufactured_year: 2016, last_pressure_test_year: 2015 }), 2026)).toEqual(["前回の耐圧性能点検の年が製造年より前です"])
    })
    it("文字数", () => {
        expect(validateExtinguisherInput(input({ model: "x".repeat(61) }), 2026)).toEqual(["型式は 60 字までです"])
        expect(validateExtinguisherInput(input({ location: "x".repeat(201) }), 2026)).toEqual(["設置場所は 200 字までです"])
    })
})
