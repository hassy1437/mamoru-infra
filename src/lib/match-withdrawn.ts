/**
 * 成約が取り消された物件か（2026-10-09・総点検 B3）。
 *
 * ■ なぜ知らせるか
 *   成約が取り消されると、マッチング側のトリガ（inspection.generate_property_from_match）が物件に
 *   withdrawn_at を立てる（消さずに凍結＝入力済みの点検データを守る）。ところが点検アプリはこの列を
 *   どこでも読んでおらず、業者は点検を全部入力したあと、納品で初めて
 *   「INT3b: 取消済みの成約には納品できません」で止まっていた。
 *   ★成約が active に戻るとトリガが withdrawn_at を null に戻す（＝この知らせも消える）。
 *
 * ★Property の型（src/types/database.ts）には source_match_id / withdrawn_at が無い。読むときはこの 2 列を絞って読む。
 */
export const WITHDRAWN_MATCH_NOTE =
    "この物件の成約は取り消されました。この物件の報告書は依頼者へ納品できません（PDF は作れます）。心当たりが無いときは運営にお問い合わせください。"

export type MatchLink = { source_match_id?: string | null; withdrawn_at?: string | null } | null | undefined

/** 成約から作った物件で、その成約が取り消されていれば取り消された日時（ISO）。それ以外は null。 */
export function withdrawnAtOf(property: MatchLink): string | null {
    if (!property?.source_match_id) return null
    return property.withdrawn_at ?? null
}

/** 取り消された日（日本時間の年月日）。 */
export function formatWithdrawnDate(iso: string): string {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ""
    return d.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric" })
}
