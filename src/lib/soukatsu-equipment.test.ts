import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
    cleanEquipmentItem,
    DETAIL_FIELD_LABELS,
    DETAIL_FIELDS,
    EDITABLE_EQUIPMENT_RESULTS,
    equipmentFieldLabel,
    isEditableEquipmentResult,
    mergeEquipmentDetails,
} from "@/lib/soukatsu-equipment"

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

/**
 * 総括表の編集で判定（指摘なし⇄要改善）を変えられる（2026-11-09・定期テスト 21・橋本さんの決定 A）。
 * 以前は「編集では設備名と判定を変えない」（#28）で、点検票に「否」があるのに総括表が「指摘なし」のとき直す方法が無かった。
 * ★設備名は今までどおり変えない。不良内容・措置内容の扱いは作成の画面と同じ（cleanEquipmentItem）。
 */
describe("mergeEquipmentDetails（編集の保存）", () => {
    it("判定は「指摘なし」⇄「要改善」だけ画面の値にする", () => {
        const merged = mergeEquipmentDetails(
            [{ name: "消火器", result: "指摘なし" }, { name: "誘導灯", result: "要改善", bad_detail: "球切れ" }],
            [{ name: "消火器", result: "要改善", bad_detail: "圧力不足" }, { name: "誘導灯", result: "指摘なし", bad_detail: "球切れ", witness: "山田" }],
        )
        expect(merged).toEqual([
            { name: "消火器", result: "要改善", bad_detail: "圧力不足" },
            // ★要改善 → 指摘なし: 不良内容・措置内容は外す（作成の画面の保存と同じ）。立会者は残す
            { name: "誘導灯", result: "指摘なし", witness: "山田" },
        ])
    })

    it("「該当なし」・古い値の行と、画面の値が 2 つの外のときは DB の判定のまま", () => {
        const merged = mergeEquipmentDetails(
            [{ name: "連結送水管", result: "該当なし" }, { name: "排煙設備", result: "不良" }, { name: "避難器具", result: "指摘なし" }],
            [
                { name: "連結送水管", result: "要改善", bad_detail: "x" },
                { name: "排煙設備", result: "指摘なし" },
                { name: "避難器具", result: "該当なし" },
            ],
        )
        expect(merged?.map((r) => r.result)).toEqual(["該当なし", "不良", "指摘なし"])
    })

    it("設備名・行の数・順番は DB のまま（画面に無い設備は足さない）", () => {
        const merged = mergeEquipmentDetails(
            [{ name: "消火器", result: "指摘なし" }, { name: "避難器具", result: "指摘なし" }],
            [{ name: "避難器具", result: "要改善" }, { name: "画面に無い設備", result: "要改善" }],
        )
        expect(merged).toEqual([{ name: "消火器", result: "指摘なし" }, { name: "避難器具", result: "要改善" }])
        expect(mergeEquipmentDetails(null, [])).toBeNull()
    })

    it("判定を変えた行は、作成の画面の保存（cleanEquipmentItem）と同じ形になる", () => {
        const edited = { name: "消火器", result: "指摘なし" as const, bad_detail: "残り", action: " ", witness: " 立会 " }
        expect(mergeEquipmentDetails([{ name: "消火器", result: "要改善", bad_detail: "前" }], [edited])).toEqual([cleanEquipmentItem(edited)])
    })

    it("編集で変えられる判定は「指摘なし」と「要改善」だけ", () => {
        expect(EDITABLE_EQUIPMENT_RESULTS).toEqual(["指摘なし", "要改善"])
        expect(["指摘なし", "要改善", "該当なし", "不良", "", undefined].map(isEditableEquipmentResult)).toEqual([true, true, false, false, false, false])
    })
})

describe("総括表の編集の画面", () => {
    const edit = read("src/components/soukatsu-edit-form.tsx")
    const page = read("src/app/inspection/[id]/edit/page.tsx")

    it("判定を作成の画面と同じボタンで変えられる（「指摘なし」「要改善」だけ・「該当なし」の行は表示だけ）", () => {
        expect(edit).toMatch(/\{isEditableEquipmentResult\(item\.result\) \? \(\n\s*<EquipmentResultButtons\n/)
        expect(edit).toContain("options={EDITABLE_EQUIPMENT_RESULTS}")
        expect(read("src/components/soukatsu-form.tsx")).toContain("<EquipmentResultButtons\n")
    })

    it("「変えられません」の文を実態に合わせた（設備名は変えられない・点検結果は変えられる）", () => {
        expect(edit).not.toContain("設備名と点検結果（指摘なし／要改善）はここでは変えられません")
        expect(edit).toContain("点検結果（指摘なし／要改善）を変えられます。設備名は変えられません。")
        expect(page).not.toContain("各設備の点検結果は別記様式で編集します")
        expect(page).toContain("設備ごとの点検結果（指摘なし／要改善）")
    })

    it("★確定・納品のあとも編集できる（注意を出すだけ・止め方は変えていない）", () => {
        expect(edit).toMatch(/\{isFinalized && \(/)
        expect(edit).toMatch(/\{isDelivered && \(/)
        expect(edit).toMatch(/<Button type="submit" size="lg" disabled=\{loading\}/)
    })
})
