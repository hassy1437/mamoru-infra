import { PDF_MERGE_CONFIG } from "@/lib/pdf-merge-config"
import { BEKKI_INSPECTION_TYPE_FALLBACK } from "@/lib/bekki-inspection-type"
import type { ItiranInputStepId } from "@/lib/itiran-input-flow"

/**
 * 総括表と別記で、点検種別の○が食い違っていないか（2026-10-08・総点検 A2 の残り）。
 *
 * ■ なぜ要るか
 *   別記の点検種別の既定は総括表の値になった（src/lib/bekki-inspection-type.ts・9/23）。ただし次の 2 つで食い違う:
 *   ・別記を一度開くと、離れるときの自動保存で値が固まる。あとで総括表の種別を変えても別記には伝わらない
 *   ・前回の報告書を複製すると、別記の中身が種別ごと写る（機器点検と総合点検は交互に来るので起きやすい）
 *   ＝ 同じ提出物の中で、総括表は「機器点検」・別記は「総合」に○、のような書類ができる。
 *   本番では、修正より前（〜7/25）の別記 27 行で実際に食い違っている（2026-10-08 実測）。
 *
 * ■ 決めたこと
 *   ・紙に出る○で比べる。別記の route は「値が "機器" を含めば機器に○、"総合" を含めば総合に○」で、
 *     値が空なら「機器・総合」（両方に○）に倒す（drawChoiceCircle）。総括表の値（機器点検／総合点検）も同じ規則で読む
 *   ・雛形に点検種別の選択肢がある 16 様式だけを見る（無い様式は紙に出ないので食い違いにならない）
 *   ・総括表の種別が空なら比べない（どちらが正しいか言えない）
 *   ★止めない。出力画面と納品の確認で知らせ、直すのは業者（別記の入力画面の「点検種別」）
 */

/**
 * 雛形に「機器・総合」の選択肢がある別記（scripts/check-inspection-type-circle.py が雛形から導く 16 様式と同じ）。
 * ★増減したら scripts/check-inspection-type-consistency.mjs が落ちる。
 */
export const BEKKI_STEPS_WITH_TYPE_CHOICE: readonly string[] = [
    "shokasen", "sprinkler", "water-spray", "foam", "inert-gas", "halogen", "powder", "okugai-shokasen",
    "doryoku-pump", "jidou-kasai-houchi", "gas-leak-fire-alarm", "leakage-fire-alarm", "emergency-alarm",
    "evacuation-equipment", "smoke-control", "standpipe",
]

/** その値で○が付く選択肢（"機器" / "総合" / "機器・総合" / ""） */
export function inspectionTypeMarks(value: unknown): string {
    const v = String(value ?? "")
    return [v.includes("機器") ? "機器" : null, v.includes("総合") ? "総合" : null].filter(Boolean).join("・")
}

export type InspectionTypeMismatch = {
    stepId: string
    form: string
    /** 別記で○が付く選択肢 */
    bekki: string
    /** 総括表で○が付く選択肢 */
    soukatsu: string
}

export function findInspectionTypeMismatches(
    soukatsuInspectionType: unknown,
    bekkiPayloads: Record<string, Record<string, unknown>>,
    stepIds: readonly string[],
): InspectionTypeMismatch[] {
    const soukatsu = inspectionTypeMarks(soukatsuInspectionType)
    if (!soukatsu) return []
    const found: InspectionTypeMismatch[] = []
    for (const id of stepIds) {
        if (!BEKKI_STEPS_WITH_TYPE_CHOICE.includes(id)) continue
        const payload = bekkiPayloads[id]
        const config = PDF_MERGE_CONFIG[id as ItiranInputStepId]
        if (!payload || !config) continue
        // route と同じく、空なら「機器・総合」に倒す
        const raw = String(payload.inspection_type ?? "").replace(/\s+/g, " ").trim() || BEKKI_INSPECTION_TYPE_FALLBACK
        const bekki = inspectionTypeMarks(raw)
        if (bekki === soukatsu) continue
        found.push({
            stepId: id,
            form: `別記様式第${String(config.formNo).replace(".", "の")}`,
            bekki: bekki || `（○なし: ${raw}）`,
            soukatsu,
        })
    }
    return found
}
