import { describe, expect, it } from "vitest"

import { joinFireDepartment, printedFireDepartment, splitFireDepartment } from "@/lib/soukatsu-cover"

/**
 * 表紙の宛名（2026-11-08・定期テスト 26）。
 * 宛名「大阪市北消防署」＋敬称「消防署長」で、PDF と画面の「表紙の印字：」が「大阪市北消防署消防署長 殿」と重なって出た。
 */
describe("printedFireDepartment（表紙に印字する宛名）", () => {
    it("名前の終わりと敬称の始まりが重なるときは重ねない", () => {
        expect(printedFireDepartment(joinFireDepartment("大阪市北消防署", "消防署長"))).toBe("大阪市北消防署長")
        expect(printedFireDepartment(joinFireDepartment("北消防", "消防署長"))).toBe("北消防署長")
        expect(printedFireDepartment(joinFireDepartment("堺市消防", "消防長"))).toBe("堺市消防長")
        expect(printedFireDepartment(joinFireDepartment("○○市町村", "市町村長"))).toBe("○○市町村長")
    })

    it("重ならないときは今までどおり続けて書く", () => {
        expect(printedFireDepartment(joinFireDepartment("大阪市北", "消防署長"))).toBe("大阪市北消防署長")
        expect(printedFireDepartment(joinFireDepartment("大阪市消防局", "消防長"))).toBe("大阪市消防局消防長")
        expect(printedFireDepartment("麻布消防署長")).toBe("麻布消防署長")
    })

    it("★1 字だけの重なりは重ねない（「大阪市」＋「市町村長」を「大阪市町村長」にしない）", () => {
        expect(printedFireDepartment(joinFireDepartment("大阪市", "市町村長"))).toBe("大阪市市町村長")
    })

    it("敬称の無い宛名・空はそのまま", () => {
        expect(printedFireDepartment("東京消防庁 麻布消防署")).toBe("東京消防庁 麻布消防署")
        expect(printedFireDepartment("")).toBe("")
        expect(printedFireDepartment(null)).toBe("")
        expect(printedFireDepartment(undefined)).toBe("")
    })
})

describe("保存する値と、名前・敬称への分け直し（往復）", () => {
    const cases: [string, "" | "消防署長" | "消防長" | "市町村長"][] = [
        ["大阪市北消防署", "消防署長"],
        ["大阪市北", "消防署長"],
        ["堺市消防", "消防長"],
        ["大阪市", "市町村長"],
        ["東京消防庁 麻布消防署", ""],
    ]

    it.each(cases)("「%s」＋「%s」: 保存の値から分け直すと、入れた名前と敬称に戻る（★欄が打っている途中で縮まない）", (name, title) => {
        const saved = joinFireDepartment(name, title)
        expect(splitFireDepartment(saved)).toEqual({ name, title })
        expect(joinFireDepartment(splitFireDepartment(saved).name, splitFireDepartment(saved).title)).toBe(saved)
    })

    it("印字の文字を保存し直しても印字は変わらない（同じ関数を 2 回通しても同じ）", () => {
        for (const [name, title] of cases) {
            const printed = printedFireDepartment(joinFireDepartment(name, title))
            expect(printedFireDepartment(printed)).toBe(printed)
        }
    })
})
