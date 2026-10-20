/**
 * 容器ごとの点検結果（別記6・7・8 の その5）の「点検年月日」（別記6 は「容器表面温度」も）を、
 * 測定の列の見出しに 1 回だけ書く（2026-10-20）。
 *
 * ■ なぜ要るか
 *   様式は、点検年月日（と容器表面温度）を測定の列の見出しに書く作り（列ごとに 1 回）。
 *   アプリは行ごとに日付・温度を描いていて、見出しは空欄のまま、入力でも容器の数だけ同じ日付を打つ必要があった
 *   （2026-10-20 の本番の通しチェック）。
 *
 * ■ 約束
 *   ・見出しは payload.measure_headers（測定の数だけ { date, temp }。温度を使うのは別記6 だけ）
 *   ・行の日付・温度は、見出しと同じなら行には描かない（見出しにある）。★違うときだけ行に描く
 *     ＝ 以前に行ごとに入れた保存（本番に各様式 1 件ずつある）を落とさない
 *   ・行に描く日付・温度が無ければ、値はセルいっぱい（中央）に描く
 *   ・画面: 保存に見出しが無く、行の日付（温度）が 1 通りにそろっている測定は、それを見出しの初期値にする
 */

export type MeasureHeader = { date: string; temp: string }

const text = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim())

/** 日付の書き方の違い（2026-10-14 / 2026/10/14 / 2026.10.4）を吸収して比べる。読めなければ文字のまま */
const dateKey = (v: unknown): string => {
    const s = text(v).normalize("NFKC")
    const m = s.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/)
    return m ? `${Number(m[1])}-${Number(m[2])}-${Number(m[3])}` : s
}

/** 温度の書き方の違い（20 / 20℃ / 20 ℃）を吸収する。★様式に「℃」が刷り込まれているので、描くときも数字だけにする */
export const normalizeTemp = (v: unknown): string => text(v).normalize("NFKC").replace(/\s|℃|°C|°/g, "")

export const emptyMeasureHeaders = (count: number): MeasureHeader[] => Array.from({ length: count }, () => ({ date: "", temp: "" }))

export const coerceMeasureHeaders = (value: unknown, count: number): MeasureHeader[] =>
    Array.from({ length: count }, (_, i) => {
        const h = (Array.isArray(value) ? value[i] : null) as Partial<MeasureHeader> | null
        return { date: text(h?.date), temp: text(h?.temp) }
    })

const hasAny = (headers: readonly MeasureHeader[]) => headers.some((h) => h.date || h.temp)

/** 行の測定 n（1 始まり）の日付・温度 */
const rowMeasure = (row: Record<string, unknown> | null | undefined, n: number) => ({
    date: text(row?.[`measure${n}_date`]),
    temp: text(row?.[`measure${n}_temp`]),
})

/** そろっていれば その 1 通り、ばらばら・空なら "" */
const uniform = (values: string[], key: (v: string) => string): string => {
    const filled = values.filter(Boolean)
    if (!filled.length) return ""
    return new Set(filled.map(key)).size === 1 ? filled[0] : ""
}

/** 画面の初期値: 保存の見出し。無ければ、行の日付・温度が 1 通りにそろっている測定はそれを見出しにする */
export function initialMeasureHeaders(saved: unknown, rows: readonly (Record<string, unknown> | null | undefined)[], count: number): MeasureHeader[] {
    const headers = coerceMeasureHeaders(saved, count)
    if (hasAny(headers)) return headers
    return headers.map((_, m) => {
        const each = rows.map((r) => rowMeasure(r, m + 1))
        return {
            date: uniform(each.map((e) => e.date), dateKey),
            temp: uniform(each.map((e) => e.temp), normalizeTemp),
        }
    })
}

/** 行に描く（行の入力欄に出す）日付・温度。見出しと同じなら ""（見出しにある） */
export function rowOwnMeasure(row: Record<string, unknown> | null | undefined, n: number, header: MeasureHeader | undefined): { date: string; temp: string } {
    const own = rowMeasure(row, n)
    return {
        date: own.date && dateKey(own.date) !== dateKey(header?.date) ? own.date : "",
        temp: own.temp && normalizeTemp(own.temp) !== normalizeTemp(header?.temp) ? own.temp : "",
    }
}

/** 見出しと同じ行の日付・温度を空にする（見出しに書くので行には要らない）。画面の初期化と保存の前に通す */
export function stripRowsCoveredByHeaders<T extends Record<string, unknown>>(rows: readonly T[], headers: readonly MeasureHeader[]): T[] {
    return rows.map((row) => {
        const next: Record<string, unknown> = { ...row }
        headers.forEach((h, m) => {
            const own = rowOwnMeasure(row, m + 1, h)
            if (`measure${m + 1}_date` in next) next[`measure${m + 1}_date`] = own.date
            if (`measure${m + 1}_temp` in next) next[`measure${m + 1}_temp`] = own.temp
        })
        return next as T
    })
}

/** 見出しの日付を様式の「年・月・日」の欄に分ける。読めなければ null（そのときは文字のまま描く） */
export function measureHeaderDateParts(v: unknown): { year: string; month: string; day: string } | null {
    const m = text(v).normalize("NFKC").match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/)
    return m ? { year: m[1], month: String(Number(m[2])), day: String(Number(m[3])) } : null
}

/** 見出しの日付を 1 行で書くとき（別記7・8 の小さな欄）: 2026/10/14 */
export function measureHeaderDateText(v: unknown): string {
    const p = measureHeaderDateParts(v)
    return p ? `${p.year}/${p.month}/${p.day}` : text(v)
}
