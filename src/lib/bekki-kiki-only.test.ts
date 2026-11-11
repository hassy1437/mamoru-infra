import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { BEKKI_KIKI_ONLY_INSPECTION_TYPE } from "@/lib/bekki-inspection-type"
import { BEKKI_STEPS_WITH_TYPE_CHOICE, inspectionTypeMarks } from "@/lib/inspection-type-consistency"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/**
 * 点検種別に「機器」しか刷られていない様式（2026-11-12・定期テスト 第7回 60）。
 * 以前は総括表の値（総合点検）が写り、PDF の「機器」に丸が付かなかった（52 の丸は機器点検の報告書のときだけ）。
 * ★部品を描かずにソースで見る（このリポジトリのテストは node で回す）。
 */
const KIKI_ONLY: readonly [step: string, form: string][] = [
    ["fire-department-notification", "bekki13"],
    ["guidance-lights-signs", "bekki16"],
    ["fire-water", "bekki17"],
    ["connected-sprinkler", "bekki19"],
    ["emergency-power-outlet", "bekki21"],
    ["radio-communication-support", "bekki22"],
]

describe("「機器」だけの様式の点検種別", () => {
    it("固める値は「機器点検」（PDF の決まりで機器だけに○）", () => {
        expect(BEKKI_KIKI_ONLY_INSPECTION_TYPE).toBe("機器点検")
        expect(inspectionTypeMarks(BEKKI_KIKI_ONLY_INSPECTION_TYPE)).toBe("機器")
    })

    it("選択肢のある 16 様式とは重ならない", () => {
        for (const [step] of KIKI_ONLY) expect(BEKKI_STEPS_WITH_TYPE_CHOICE).not.toContain(step)
    })

    it.each(KIKI_ONLY)("%s: 画面は選ぶ欄を出さず（kikiOnly）、PDF はいつも「機器」に丸", (step, form) => {
        expect(read(`src/components/${step}-${form}-form.tsx`)).toMatch(/\n\s*kikiOnly\n/)
        const route = read(`src/app/api/generate-${step}-${form}-pdf/route.ts`)
        expect(route).toContain("for (const choice of TYPE_CHOICES) {")
        expect(route).not.toContain("inspectionType.includes(choice.label)")
    })

    it("共通の部品: kikiOnly のときは保存も見出しも「機器点検」・選ぶ欄を出さない", () => {
        const base = read("src/components/bekki-result-form-base.tsx")
        expect(base).toContain("const shownInspectionType = kikiOnly ? BEKKI_KIKI_ONLY_INSPECTION_TYPE : inspectionType")
        expect(base).toContain("inspection_type: shownInspectionType,")
        expect(base).toMatch(/\{kikiOnly \? \([\s\S]*?機器点検（この様式は機器点検だけです）[\s\S]*?<BekkiInspectionTypeInput/)
    })
})
