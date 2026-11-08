/**
 * 総括表の「点検を行った消防用設備等」の1行（#28・2026-10-06）。
 *
 * ■ なぜ要るか
 *   総括表の様式は 設備名｜判定｜不良内容｜措置内容｜立会者 の5欄で、ルート（generate-soukatu-pdf）は
 *   bad_detail / action / witness を描けるのに、画面は設備名と判定しか入れられなかった＝様式の備考2
 *   「不良の場合は…不良内容欄にその内容を記入」を満たせなかった（2026-10-05 の通し確認で実測）。
 *
 * ■ 約束
 *   ・不良内容・措置内容は「要改善」の行だけに残す（指摘なしに切り替えた行に残った値は保存のときに外す。
 *     ルートは値があれば判定に関係なく描くため）
 *   ・空の欄はキーごと持たない（JSON を汚さない・ルートの `if (item.bad_detail)` と揃える）
 *   ・★編集画面は設備名と判定に触らない。保存の直前に DB の最新を読み、設備名で突き合わせて
 *     この3つだけを書き換える（mergeEquipmentDetails）。突き合わせられない行は元のまま。
 */

export type SoukatsuEquipmentResult = "指摘なし" | "要改善" | "該当なし"

export type SoukatsuEquipmentItem = {
    name: string
    result: SoukatsuEquipmentResult
    bad_detail?: string
    action?: string
    witness?: string
}

export const DETAIL_FIELDS = ["bad_detail", "action", "witness"] as const
export type DetailField = (typeof DETAIL_FIELDS)[number]

/** 画面の欄の見出し（総括表の作成・編集の画面の「消防用設備等の点検結果」） */
export const DETAIL_FIELD_LABELS: Record<DetailField, string> = {
    bad_detail: "不良内容",
    action: "措置内容",
    witness: "立会者",
}

/**
 * 読み上げで使う欄の名前（★設備名を入れる・2026-11-08 定期テスト 27）。
 *   設備の数だけ同じ見出し（不良内容・措置内容・立会者）の欄が並ぶので、見出しだけでは何の設備の欄か分からない。
 *   ★見出しの字をそのまま含める（見えている見出しと読み上げの名前をそろえる）
 */
export function equipmentFieldLabel(equipmentName: string | null | undefined, field: DetailField): string {
    const name = String(equipmentName ?? "").trim()
    return name ? `${name} の${DETAIL_FIELD_LABELS[field]}` : DETAIL_FIELD_LABELS[field]
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "")

/** 保存する形に整える（空の欄を外す・要改善でない行の不良内容／措置内容を外す） */
export function cleanEquipmentItem(item: SoukatsuEquipmentItem): SoukatsuEquipmentItem {
    const out: SoukatsuEquipmentItem = { name: item.name, result: item.result }
    for (const f of DETAIL_FIELDS) {
        if (f !== "witness" && item.result !== "要改善") continue
        const v = text(item[f])
        if (v) out[f] = v
    }
    return out
}

/**
 * 編集画面の保存: DB の最新の点検結果に、画面で直した3つの欄だけを重ねる。
 * ★設備名・判定・行の数・順番は DB のまま。DB が配列でなければ null（書かない）。
 */
export function mergeEquipmentDetails(
    dbValue: unknown,
    edited: readonly SoukatsuEquipmentItem[],
): SoukatsuEquipmentItem[] | null {
    if (!Array.isArray(dbValue)) return null
    const used = new Set<number>()
    return dbValue.map((raw) => {
        const db = (raw ?? {}) as Record<string, unknown>
        const idx = edited.findIndex((e, i) => !used.has(i) && e.name === db.name)
        if (idx < 0) return db as SoukatsuEquipmentItem
        used.add(idx)
        const merged = { ...db } as Record<string, unknown>
        for (const f of DETAIL_FIELDS) delete merged[f]
        const cleaned = cleanEquipmentItem({ ...edited[idx], name: String(db.name), result: db.result as SoukatsuEquipmentResult })
        for (const f of DETAIL_FIELDS) if (cleaned[f]) merged[f] = cleaned[f]
        return merged as SoukatsuEquipmentItem
    })
}

/*
 * 総括表 PDF の判定欄で「良」に○を打つか（generate-soukatu-pdf）。空は「良」。
 * ★「不良」も「良」の字を含むので、先に悪いほうの言葉を見る（2026-10-21・録音 102 の洗い出し）。
 *   以前は includes("良") だけで、古いデータや自由入力の「不良」「不良あり」が「良」に○を打っていた。
 *   いまの画面の値は 指摘なし／要改善／該当なし（該当なしの行はルートが描かない）
 */
const BAD_RESULT_WORDS = ["不良", "要改善", "指摘あり", "否"]

export function isGoodResult(value: unknown): boolean {
    const t = String(value ?? "").replace(/\s+/g, " ").trim()
    if (!t) return true
    if (BAD_RESULT_WORDS.some((w) => t.includes(w))) return false
    return t.includes("指摘なし") || t.includes("良") || t.toLowerCase() === "good"
}

/**
 * 悪いほうの判定か（★isGoodResult と同じ言葉で見る・空は悪くない）。
 *   点検票（別記）の「否」を数えるのに使う（2026-11-08・src/lib/soukatsu-judgment-consistency.ts）。
 *   「良」でも「否」でもない値（空・未入力）は悪いほうに数えない
 */
export function isBadResult(value: unknown): boolean {
    const t = String(value ?? "").replace(/\s+/g, " ").trim()
    return t !== "" && BAD_RESULT_WORDS.some((w) => t.includes(w))
}
