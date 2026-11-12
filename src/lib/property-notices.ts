/**
 * 物件の画面に出す「まだ入っていません」の知らせ（2026-11-12 の 3 つの立場のデモで見つかった 2 件）。
 *
 * - 延べ面積: 報告書の確定に要るのは★総括表の延べ面積（src/lib/report-readiness.ts）。
 *   以前は物件の延べ面積だけを見ていたので、総括表に入れても物件の画面の知らせが消えなかった。
 *   → 物件にも、いちばん新しい総括表にも無いときだけ出す
 * - 届出者: マッチングの成約から作った物件は届出者（名前・住所）が空で入る（DB のトリガが埋めない）。
 *   以前は人のアイコンだけの空の行が出ていた。物件に入れておけば、次の総括表に自動で入る
 *   （src/components/soukatsu-form.tsx が物件から写す）
 */

/** 物件の画面で見る列 */
export type PropertyNoticeFields = {
    total_floor_area?: number | string | null
    notifier_name?: string | null
    notifier_address?: string | null
}

/** いちばん新しい総括表の延べ面積（★総括表が無いときは null） */
export type LatestSoukatsuArea = { total_floor_area?: number | string | null } | null

export const FLOOR_AREA_MISSING_TITLE = "延べ面積がまだ入っていません。"
export const FLOOR_AREA_MISSING_NOTE = "報告書の確定に必要です。"
export const NOTIFIER_MISSING_TITLE = "届出者がまだ入っていません。"
export const NOTIFIER_MISSING_NOTE = "物件に入れておくと、総括表に自動で入ります。"

/** ★report-readiness と同じ決まり（0 も空とみなす。「0㎡」と刷られた報告書は出せない） */
function hasArea(v: number | string | null | undefined): boolean {
    if (v === null || v === undefined || v === "") return false
    const n = typeof v === "number" ? v : Number(v)
    return Number.isFinite(n) && n > 0
}

function hasText(v: string | null | undefined): boolean {
    return (v ?? "").trim() !== ""
}

/** 延べ面積の知らせを出すか: 物件にも、いちばん新しい総括表にも無いときだけ */
export function needsFloorAreaNotice(property: PropertyNoticeFields, latest: LatestSoukatsuArea): boolean {
    if (hasArea(property.total_floor_area)) return false
    if (latest && hasArea(latest.total_floor_area)) return false
    return true
}

/** 届出者の知らせを出すか: 物件の届出者の名前か住所が空のとき（★どちらも総括表の確定に要る） */
export function needsNotifierNotice(property: PropertyNoticeFields): boolean {
    return !hasText(property.notifier_name) || !hasText(property.notifier_address)
}

/** 物件の見出しの下に届出者の行を出すか（★空なら行ごと出さない＝アイコンだけの行を作らない） */
export function hasNotifierName(property: PropertyNoticeFields): boolean {
    return hasText(property.notifier_name)
}
