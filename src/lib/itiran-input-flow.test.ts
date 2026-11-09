import { describe, expect, it, vi } from "vitest"

// ★綴じる順を確かめるため、PDF を取りに行く口と結合だけ差し替える（呼ばれた順を記録する）
const fetched: string[] = []
vi.mock("@/lib/pdf-client", () => ({
    fetchPdf: async (route: string) => {
        fetched.push(route)
        return { blob: new Blob(["%PDF"]), warnings: null }
    },
}))
vi.mock("@/lib/merge-pdf-buffers", () => ({
    mergePdfBuffers: async () => ({ bytes: new Uint8Array([1]) }),
}))

import { ALL_EQUIPMENT_TYPES } from "@/lib/equipment-config"
import { buildMergedReport } from "@/lib/build-merged-report"
import { PDF_MERGE_CONFIG } from "@/lib/pdf-merge-config"
import { getItiranInputPageTitle, getNextItiranInputStep, getPrevItiranInputStep, selectedSteps, type ItiranInputStepId } from "@/lib/itiran-input-flow"

/**
 * 点検票の入力の順（2026-11-08・定期テスト 23）。
 * 以前は 1→12→13…22→2…10→11の1→11の2 で、点検票の一覧と「次へ」が様式の番号の順でなく、結果出力で綴じる順とも違った。
 */
const ALL = selectedSteps(ALL_EQUIPMENT_TYPES).map((s) => s.id)
const formNo = (id: ItiranInputStepId) => PDF_MERGE_CONFIG[id].formNo

describe("入力の順は様式の番号の順", () => {
    it("23 様式すべてが 1, 2, …, 10, 11の1, 11の2, 12, …, 22 の順", () => {
        expect(ALL).toHaveLength(Object.keys(PDF_MERGE_CONFIG).length)
        expect(ALL.map(formNo)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11.1, 11.2, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22])
        // 画面の名前の番号とも合う
        expect(getItiranInputPageTitle(ALL[0])).toContain("別記様式1）")
        expect(getItiranInputPageTitle(ALL[10])).toContain("別記様式11の1）")
        expect(getItiranInputPageTitle(ALL[12])).toContain("別記様式12）")
    })

    it("「次へ」「戻る」も番号の順にたどる（物件にある設備だけ）", () => {
        const types = ["誘導灯及び誘導標識", "消火器", "自動火災報知設備", "屋内消火栓設備", "漏電火災警報器"]
        const chain: ItiranInputStepId[] = []
        for (let id = getNextItiranInputStep(null, types); id; id = getNextItiranInputStep(id, types)) chain.push(id)
        expect(chain).toEqual(["shokaki", "shokasen", "jidou-kasai-houchi", "leakage-fire-alarm", "guidance-lights-signs"])
        expect(getPrevItiranInputStep("leakage-fire-alarm", types)).toBe("jidou-kasai-houchi")
        expect(getPrevItiranInputStep("shokaki", types)).toBeNull()
    })
})

describe("綴じる順（build-merged-report）と入力の順が同じ", () => {
    it("報告書 → 総括表 → 点検者一覧 → 別記（入力の順と同じ）。呼ぶ側の並びが崩れていても番号の順に綴じる", async () => {
        fetched.length = 0
        const bekkiPayloads = Object.fromEntries(ALL.map((id) => [id, { page1_rows: [] }]))
        const shuffled = [...ALL].reverse()
        await buildMergedReport({ soukatsuData: {}, itiranData: {}, bekkiPayloads, applicableStepIds: shuffled })
        expect(fetched.slice(0, 3)).toEqual(["/api/generate-pdf", "/api/generate-soukatu-pdf", "/api/generate-itiran-pdf"])
        expect(fetched.slice(3)).toEqual(ALL.map((id) => PDF_MERGE_CONFIG[id].apiRoute))
    })
})
