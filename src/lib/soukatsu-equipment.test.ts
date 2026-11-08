import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { DETAIL_FIELD_LABELS, DETAIL_FIELDS, equipmentFieldLabel } from "@/lib/soukatsu-equipment"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/**
 * 総括表の「消防用設備等の点検結果」の欄の名前（2026-11-08・定期テスト 27）。
 * 設備ごとの「立会者」「不良内容」「措置内容」と「立会者（全設備に同じ人を入れる）」の見出しが欄と結びついておらず、
 * 読み上げで何の欄か分からなかった。
 */
describe("equipmentFieldLabel（読み上げの欄の名前）", () => {
    it("設備名と見出しを入れる（見えている見出しの字をそのまま含める）", () => {
        expect(equipmentFieldLabel("消火器", "bad_detail")).toBe("消火器 の不良内容")
        expect(equipmentFieldLabel("自動火災報知設備", "action")).toBe("自動火災報知設備 の措置内容")
        expect(equipmentFieldLabel(" 避難器具 ", "witness")).toBe("避難器具 の立会者")
        for (const f of DETAIL_FIELDS) expect(equipmentFieldLabel("消火器", f)).toContain(DETAIL_FIELD_LABELS[f])
    })

    it("設備名が無いときは見出しだけ", () => {
        expect(equipmentFieldLabel("", "witness")).toBe("立会者")
        expect(equipmentFieldLabel(null, "bad_detail")).toBe("不良内容")
    })
})

describe("見出しと欄を結んでいる（作成・編集の画面で共有する部品）", () => {
    const src = read("src/components/soukatsu-equipment-details.tsx")

    it("不良内容・措置内容・立会者: 見出しの htmlFor と欄の id が同じで、欄の名前に設備名が入る", () => {
        for (const f of DETAIL_FIELDS) {
            expect(src).toContain(`<Label htmlFor={fieldId("${f}")}`)
            expect(src).toContain(`id={fieldId("${f}")}`)
            expect(src).toContain(`aria-label={equipmentFieldLabel(item.name, "${f}")}`)
        }
    })

    it("立会者（全設備に同じ人を入れる）: 見出しと欄を結ぶ", () => {
        expect(src).toMatch(/<Label htmlFor=\{inputId\}[^>]*>立会者（全設備に同じ人を入れる）<\/Label>/)
        expect(src).toMatch(/<Input id=\{inputId\} value=\{name\}/)
    })

    it("作成・編集の画面がこの部品を使っている", () => {
        for (const p of ["src/components/soukatsu-form.tsx", "src/components/soukatsu-edit-form.tsx"]) {
            const form = read(p)
            expect(form).toContain("<WitnessFillAll ")
            expect(form).toContain("<EquipmentDetailInputs ")
        }
    })
})
