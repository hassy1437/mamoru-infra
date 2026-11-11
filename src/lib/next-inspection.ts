/**
 * 物件ごとの「次の点検まであと○日」（地図などの改善 7・2026-11-11）。
 *
 * ■ なぜ要るか
 *   現場の職人さんが物件の一覧を開いたとき、どの物件の点検が近いか・過ぎているかを、字を読まずに一目で分かるように。
 * ■ 決まり（法定の点検の期間: 機器点検は 6 か月ごと・総合点検は 1 年ごと）
 *   - 前回 = この物件の総括表のうち、点検日が今日（日本時間）までで いちばん新しいもの
 *   - 次の機器点検 = 前回（種類を問わない）＋ 6 か月
 *   - 次の総合点検 = 前回の総合点検 ＋ 1 年（★総合点検の記録が無ければ考えない）
 *   - 早いほうを出す。★同じ日なら総合（総合点検の日は機器点検もする）
 *   - ★点検日が今日より後の総括表があれば、それを「予定」として出す（いちばん近いもの）
 *   - 総括表が 1 つも無ければ null（画面は「記録なし」）
 * ■ 色の段（帯の色）: 過ぎた＝赤 / 30 日以内＝黄 / それより先＝灰 / 予定＝青
 */
import { jstTodayYmd } from "@/lib/date-utils"
import type { AppSupabaseClient } from "@/lib/supabase/server"

export type InspectionRecord = {
    inspection_date: string | null
    inspection_type: string | null
}

export type InspectionKind = "機器" | "総合"
export type DueLevel = "over" | "soon" | "ok" | "planned"

export type NextInspection = {
    /** yyyy-MM-dd */
    date: string
    kind: InspectionKind
    /** 今日から何日後か（過ぎていれば負） */
    daysLeft: number
    level: DueLevel
}

/** 黄色にする残り日数（これ以下） */
export const DUE_SOON_DAYS = 30

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/

const parse = (ymd: string | null | undefined): { y: number; m: number; d: number } | null => {
    const m = YMD.exec(String(ymd ?? "").trim())
    if (!m) return null
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3])
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
    return { y, m: mo, d }
}

const fmt = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`

/** 月を足す（★月末は詰める: 8月31日＋6か月＝2月28日・うるう年は 29 日） */
export function addMonthsYmd(ymd: string, months: number): string {
    const p = parse(ymd)
    if (!p) return ""
    const total = p.y * 12 + (p.m - 1) + months
    const y = Math.floor(total / 12)
    const m = (total % 12) + 1
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
    return fmt(y, m, Math.min(p.d, last))
}

/** 2 つの日の差（b − a・日数） */
export function daysBetween(a: string, b: string): number {
    const pa = parse(a), pb = parse(b)
    if (!pa || !pb) return NaN
    return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000)
}

const isSogo = (type: string | null) => String(type ?? "").includes("総合")

const levelOf = (daysLeft: number): DueLevel => (daysLeft < 0 ? "over" : daysLeft <= DUE_SOON_DAYS ? "soon" : "ok")

export function nextInspection(records: readonly InspectionRecord[], today: string = jstTodayYmd()): NextInspection | null {
    const dated = records
        .map((r) => ({ date: parse(r.inspection_date) ? String(r.inspection_date).trim() : "", type: r.inspection_type }))
        .filter((r) => r.date)
    if (dated.length === 0) return null

    // ★今日より後の総括表＝予定（いちばん近いもの）
    const planned = dated.filter((r) => r.date > today).sort((a, b) => a.date.localeCompare(b.date))[0]
    if (planned) {
        return { date: planned.date, kind: isSogo(planned.type) ? "総合" : "機器", daysLeft: daysBetween(today, planned.date), level: "planned" }
    }

    const past = dated.sort((a, b) => b.date.localeCompare(a.date))
    const last = past[0]
    const lastSogo = past.find((r) => isSogo(r.type))
    const nextKiki = addMonthsYmd(last.date, 6)
    const nextSogo = lastSogo ? addMonthsYmd(lastSogo.date, 12) : null

    const pick: { date: string; kind: InspectionKind } =
        nextSogo && nextSogo <= nextKiki ? { date: nextSogo, kind: "総合" } : { date: nextKiki, kind: "機器" }
    const daysLeft = daysBetween(today, pick.date)
    return { ...pick, daysLeft, level: levelOf(daysLeft) }
}

/** 物件ごとにまとめる（総括表の行 → 物件 ID ごとの次の点検） */
export function nextInspectionByProperty(
    rows: readonly (InspectionRecord & { property_id: string | null })[],
    today: string = jstTodayYmd(),
): Map<string, NextInspection> {
    const byProperty = new Map<string, InspectionRecord[]>()
    for (const r of rows) {
        if (!r.property_id) continue
        const list = byProperty.get(r.property_id) ?? []
        list.push(r)
        byProperty.set(r.property_id, list)
    }
    const out = new Map<string, NextInspection>()
    for (const [id, list] of byProperty) {
        const n = nextInspection(list, today)
        if (n) out.set(id, n)
    }
    return out
}

/** 「2027年4月1日」 */
export function formatYmdJa(ymd: string): string {
    const p = parse(ymd)
    return p ? `${p.y}年${p.m}月${p.d}日` : ""
}

/** 近い順に並べるときの値（★過ぎたもの→近いもの→遠いもの→記録なし） */
export function dueSortKey(n: NextInspection | undefined): number {
    return n ? n.daysLeft : Number.POSITIVE_INFINITY
}

/**
 * 会社の物件の次の点検をまとめて読む（物件一覧・点検を始める画面）。
 * ★総括表は RLS（会社の人なら）で自社のものだけ。新しい点検日から読むので、行数の上限で切れても前回は残る。
 */
export async function loadNextInspections(
    supabase: AppSupabaseClient,
    today: string = jstTodayYmd(),
): Promise<Record<string, NextInspection>> {
    const { data, error } = await supabase
        .from("inspection_soukatsu")
        .select("property_id, inspection_date, inspection_type")
        .not("property_id", "is", null)
        .order("inspection_date", { ascending: false })
    if (error || !data) return {}
    return Object.fromEntries(nextInspectionByProperty(data, today))
}
