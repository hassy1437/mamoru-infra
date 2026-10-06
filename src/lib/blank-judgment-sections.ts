import { BEKKI_ROW_LABELS } from "@/lib/bekki-row-labels"
import { isBekkiHeadingLabel } from "@/lib/bekki-heading-row"
import { PDF_MERGE_CONFIG } from "@/lib/pdf-merge-config"
import type { ItiranInputStepId } from "@/lib/itiran-input-flow"

/**
 * 判定が 1 つも入っていない表（2026-10-07）。
 *
 * ■ なぜ要るか（2026-10-06 の納品物で実測）
 *   「すべて良にする」は表（セクション）ごとのボタンで、その1 でだけ押すと その2 以降の判定が空のまま納品された
 *   （別記2〜11 で機器点検の判定 306 行が空欄）。紙では「点検していない」と読め、差し戻しの対象になる。
 *   納品・出力の前に空欄を知らせる仕組みも無かった。
 *
 * ■ 決めたこと（★入れ忘れらしいものだけを出す。空欄そのものは正当なことがある）
 *   ・別記の表（pageN_rows）のうち、機器点検の行（見出し行と「総合点検」の下を除く）に判定が 1 つも無く、
 *     ★同じ様式の別の表には判定がある、ものを出す（＝入れ始めたのに続きが空）
 *   ・様式まるごと判定が無いものは出さない（未入力の様式は出力画面が別に案内している）
 *   ・総合点検の行は数えない（機器点検だけの点検では空欄が正しい）
 *   ★止めない。知らせるだけ（設備が無い等で空欄が正しいこともある）
 */
export type BlankJudgmentSection = { stepId: string; form: string; sections: string[] }

type Row = { judgment?: unknown }

/** その表の「機器点検の行」の添字（見出し行と、総合点検の見出しより下・「総合点検」で始まる行を除く） */
function kikiRowIndexes(labels: readonly string[]): number[] {
    const out: number[] = []
    let inSogo = false
    labels.forEach((label, i) => {
        if (isBekkiHeadingLabel(label)) {
            inSogo = label.startsWith("総合点検")
            return
        }
        if (inSogo || label.startsWith("総合点検")) return
        out.push(i)
    })
    return out
}

const sectionTitle = (key: string) => {
    const n = key.match(/\d+/)?.[0]
    return n ? `その${n}` : key
}

export function findBlankJudgmentSections(
    bekkiPayloads: Record<string, Record<string, unknown>>,
    stepIds: readonly string[],
): BlankJudgmentSection[] {
    const found: BlankJudgmentSection[] = []
    for (const id of stepIds) {
        const payload = bekkiPayloads[id]
        const config = PDF_MERGE_CONFIG[id as ItiranInputStepId]
        if (!payload || !config) continue
        const form = `別記様式第${String(config.formNo).replace(".", "の")}`
        const labelsByKey = BEKKI_ROW_LABELS[form]
        if (!labelsByKey) continue
        const sections = Object.entries(labelsByKey).map(([key, labels]) => {
            const rows = (Array.isArray(payload[key]) ? payload[key] : []) as Row[]
            const idx = kikiRowIndexes(labels)
            const judged = idx.filter((i) => typeof rows[i]?.judgment === "string" && rows[i]?.judgment !== "").length
            return { key, kiki: idx.length, judged }
        })
        if (!sections.some((s) => s.judged > 0)) continue
        const blank = sections.filter((s) => s.kiki > 0 && s.judged === 0).map((s) => sectionTitle(s.key))
        if (blank.length) found.push({ stepId: id, form, sections: blank })
    }
    return found
}
