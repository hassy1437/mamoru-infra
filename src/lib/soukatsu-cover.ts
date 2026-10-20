/**
 * 表紙（報告書・様式第１）の「報告年月日」と「宛名」（2026-10-19・録音 101「表紙の自動生成」）。
 *
 * ■ ★報告年月日は点検日ではない（消防署へ出す日）。以前は表紙に点検日を印字していた。
 *   ★2026-10-20（録音 102・橋本さんの決定）: 総括表を作るときに今日の日付（日本時間）を最初から入れる。変えられる。
 *   消して保存すれば、今までどおり空欄で印字する（手書き用）。点検日から自動で埋めない。
 * ■ ★宛名は 2026-10-20（録音 102）から「消防本部・消防署の名前（自由）＋敬称（選ぶ: 消防署長・消防長・市町村長）」。
 *   表紙の刷り込み「消防長（消防署長）（市町村長）　殿」のうち選ばなかった分を白で消し、その行に
 *   「〇〇消防署長　殿」の形で描く（api/generate-pdf）。以前は表題の下の別の行に名前だけを描き、刷り込みが全部残っていた。
 *   宛名が空なら刷り込みのまま（手書き用）。
 *   ★末尾に敬称の無い宛名（10/20 より前の自由入力・敬称を選ばなかった）は刷り込みを消さず、以前と同じ上の行に名前だけを描く。
 * ■ 列は inspection.inspection_soukatsu.report_date / fire_department_name（名前と敬称をつないだ 1 つの文字列）
 *   （mamoruinfra-web supabase/migrations/20261120090000_soukatsu_cover_fields.sql）。
 * ■ ★宛名の上限は名前と敬称を合わせて全角 27 字。宛名の行（左端 70.4 から「殿」の手前 264 まで・約 194pt）に
 *   7pt 以上で収まる長さ（scripts/check-houkoku-layout.mjs が実際に描いて測る）。DB の制約は 60 文字で、それより外側の歯止め。
 */

export const FIRE_DEPARTMENT_NAME_MAX = 27

/** 敬称（★表紙の刷り込みの並び）。並びは画面の選択肢の並び（いちばん多い消防署長を先に） */
export const FIRE_DEPARTMENT_TITLES = ["消防署長", "消防長", "市町村長"] as const
export type FireDepartmentTitle = (typeof FIRE_DEPARTMENT_TITLES)[number]

export const COVER_REPORT_DATE_NOTE =
    "消防署へ出す日です（点検日ではありません）。最初は今日の日付です。空欄にすると、表紙の日付は空けて印字します（手書き用）。"

export const COVER_FIRE_DEPARTMENT_NOTE =
    "表紙に「〇〇消防署長　殿」の形で印字し、選ばなかった敬称は消します。敬称を選ばないときは名前だけを上の行に印字し、敬称の刷り込みは残します。名前も敬称も空なら、刷り込みのまま印字します（手書き用）。"

export const COVER_FIRE_DEPARTMENT_PLACEHOLDER = "例：大阪市北"

/**
 * 保存してある宛名を、名前と敬称に分ける（★敬称は末尾が一致するもの・長いものから見る）。
 *   以前の自由入力（例「大阪市消防局 北消防署長」）も、末尾が敬称なら分けて読める。
 */
export function splitFireDepartment(value: string | null | undefined): { name: string; title: FireDepartmentTitle | "" } {
    const v = (value ?? "").trim()
    for (const t of FIRE_DEPARTMENT_TITLES) {
        if (v.endsWith(t)) return { name: v.slice(0, -t.length).trim(), title: t }
    }
    return { name: v, title: "" }
}

/** 名前と敬称をつなぐ（★間に空白を入れない。表紙では「大阪市北消防署長」と続けて書く） */
export function joinFireDepartment(name: string, title: FireDepartmentTitle | ""): string {
    return `${name.trim()}${title}`
}

/** 名前の欄の上限（★敬称を含めて FIRE_DEPARTMENT_NAME_MAX に収まる長さ） */
export function fireDepartmentNameInputMax(title: FireDepartmentTitle | ""): number {
    return FIRE_DEPARTMENT_NAME_MAX - title.length
}

/** 保存する値にそろえる（前後の空白を落とし、空は null） */
export function coverFieldsForSave(reportDate: string, fireDepartmentName: string) {
    const name = fireDepartmentName.trim()
    return {
        report_date: reportDate.trim() || null,
        fire_department_name: name || null,
    }
}
