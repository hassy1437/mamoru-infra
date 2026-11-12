import { BEKKI_ROW_LABELS } from "@/lib/bekki-row-labels"
import { isBekkiHeadingLabel } from "@/lib/bekki-heading-row"
import { AUTO_TEST_ATTR, isRowActive } from "@/lib/auto-test-rows"
import { PDF_MERGE_CONFIG } from "@/lib/pdf-merge-config"
import { equipmentKeywordOf, type ItiranInputStepId } from "@/lib/itiran-input-flow"
import { isBadResult, isGoodResult } from "@/lib/soukatsu-equipment"

/**
 * 総括表の判定と、点検票（別記）の「否」が食い違っていないか（2026-11-08・定期テスト 21）。
 *
 * ■ なぜ要るか
 *   点検票のどこかの行が「否」（不良）でも、総括表でその設備を「指摘なし」にしていれば、総括表の PDF は「良」に○が付く。
 *   確定前の確認にも何も出なかった（点検種別の食い違いは src/lib/inspection-type-consistency.ts で見ていたが、判定は見ていなかった）。
 *
 * ■ 決めたこと
 *   ・紙に出るもので比べる。
 *     総括表 … PDF（generate-soukatu-pdf）と同じく「良」に○を打つかは isGoodResult（「該当なし」の行は描かず、isGoodResult も「良」にしない）
 *     点検票 … 「否」の行（isBadResult・総括表の判定と同じ言葉で見る＝「不良」も数える）。
 *              見出し行と、別記11の1 で自動試験機能ありのときの※行は紙に出ないので数えない
 *   ・設備と様式は設備名で突き合わせる（equipmentKeywordOf・点検票の立会者の引き継ぎ src/lib/bekki-witness.ts と同じ）
 *   ・逆向き（総括表は要改善なのに点検票は全部良）は findSoukatsuBadWithoutBekkiBad で別に見る（2026-11-12・定期テスト 第7回 61）。
 *     ★点検票に無い不良（総括表にだけ書く指摘）もありうるので、文は「入れ忘れていないか確かめて・それならこのままで構わない」
 *   ★止めない。確定前・出力前の確認（src/lib/report-readiness.ts）の注意にする
 */

export type SoukatsuJudgmentMismatch = {
    /** 総括表の設備名 */
    equipment: string
    stepId: ItiranInputStepId
    /** その点検票で「否」が紙に出る行の数 */
    badRows: number
}

const norm = (v: unknown): string => String(v ?? "").replace(/\s+/g, " ").trim()

/** 点検票で「否」が紙に出る行の数（見出し行・自動試験機能ありの※行は数えない） */
export function countPrintedBadRows(stepId: ItiranInputStepId, payload: Record<string, unknown> | null | undefined): number {
    const config = PDF_MERGE_CONFIG[stepId]
    if (!config || !payload) return 0
    const labelsByKey = BEKKI_ROW_LABELS[`別記様式第${String(config.formNo).replace(".", "の")}`] ?? {}
    // ★別記11の1 のルートと同じ読み方（extra_fields の "1"）
    const extra = payload.extra_fields && typeof payload.extra_fields === "object" ? (payload.extra_fields as Record<string, unknown>) : {}
    const autoTest = stepId === "jidou-kasai-houchi" && norm(extra[AUTO_TEST_ATTR]) === "1"
    let count = 0
    for (const key of Object.keys(payload)) {
        if (!/^page\d+_rows$/.test(key)) continue
        const rows = Array.isArray(payload[key]) ? (payload[key] as unknown[]) : []
        const labels = labelsByKey[key] ?? []
        rows.forEach((raw, i) => {
            const row = (raw && typeof raw === "object" ? raw : {}) as { judgment?: unknown }
            if (!isBadResult(row.judgment)) return
            const label = labels[i] ?? ""
            if (isBekkiHeadingLabel(label)) return
            if (autoTest && !isRowActive(label, true)) return
            count += 1
        })
    }
    return count
}

/** 総括表で「良」に○が付く設備のうち、その設備の点検票に「否」の行があるもの（★総括表の並びのまま） */
export function findSoukatsuJudgmentMismatches(
    equipmentResults: unknown,
    bekkiPayloads: Record<string, Record<string, unknown>> | null | undefined,
): SoukatsuJudgmentMismatch[] {
    if (!Array.isArray(equipmentResults) || !bekkiPayloads) return []
    const stepIds = (Object.keys(PDF_MERGE_CONFIG) as ItiranInputStepId[])
        .sort((a, b) => PDF_MERGE_CONFIG[a].formNo - PDF_MERGE_CONFIG[b].formNo)
    const found: SoukatsuJudgmentMismatch[] = []
    for (const raw of equipmentResults) {
        const item = (raw && typeof raw === "object" ? raw : {}) as { name?: unknown; result?: unknown }
        const name = norm(item.name)
        if (!name) continue
        // ★総括表の PDF と同じく「良」に○を打つかは isGoodResult で見る（「該当なし」は PDF に描かない行で、isGoodResult も「良」にしない）
        if (!isGoodResult(item.result)) continue
        for (const stepId of stepIds) {
            if (!name.includes(equipmentKeywordOf(stepId))) continue
            const badRows = countPrintedBadRows(stepId, bekkiPayloads[stepId])
            if (badRows > 0) found.push({ equipment: name, stepId, badRows })
        }
    }
    return found
}

export type SoukatsuBadWithoutBekkiBad = {
    /** 総括表の設備名 */
    equipment: string
    /** その設備の点検票（保存してあるもの） */
    stepIds: ItiranInputStepId[]
}

/**
 * 逆向き: 総括表で「要改善」（PDF は「不良」に○）なのに、その設備の点検票に「否」の行が 1 つも無いもの（★総括表の並びのまま）。
 *   2026-11-12・定期テスト 第7回 61。以前は「不良内容が空」の注意しか出ず、不良内容を入れると何も出なかった。
 *   ★点検票をまだ保存していない設備は見ない（未入力は別の注意で出る・総括表の確認画面は点検票の前に開くのが普通）
 *   ★「否」の数え方は countPrintedBadRows（見出し行・自動試験機能ありの※行は数えない＝紙に出る「否」だけ）
 */
export function findSoukatsuBadWithoutBekkiBad(
    equipmentResults: unknown,
    bekkiPayloads: Record<string, Record<string, unknown>> | null | undefined,
): SoukatsuBadWithoutBekkiBad[] {
    if (!Array.isArray(equipmentResults) || !bekkiPayloads) return []
    const stepIds = (Object.keys(PDF_MERGE_CONFIG) as ItiranInputStepId[])
        .sort((a, b) => PDF_MERGE_CONFIG[a].formNo - PDF_MERGE_CONFIG[b].formNo)
    const found: SoukatsuBadWithoutBekkiBad[] = []
    for (const raw of equipmentResults) {
        const item = (raw && typeof raw === "object" ? raw : {}) as { name?: unknown; result?: unknown }
        const name = norm(item.name)
        if (!name || !isBadResult(item.result)) continue
        const saved = stepIds.filter((stepId) => name.includes(equipmentKeywordOf(stepId)) && bekkiPayloads[stepId])
        if (saved.length === 0) continue
        if (saved.every((stepId) => countPrintedBadRows(stepId, bekkiPayloads[stepId]) === 0)) found.push({ equipment: name, stepIds: saved })
    }
    return found
}
