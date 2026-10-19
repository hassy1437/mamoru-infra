/**
 * 表紙（報告書・様式第１）の「報告年月日」と「宛名」（2026-10-19・録音 101「表紙の自動生成」）。
 *
 * ■ ★報告年月日は点検日ではない（消防署へ出す日）。以前は表紙に点検日を印字していた。
 *   空なら空欄で印字する（手書きできるよう）。点検日から自動で埋めない。
 * ■ ★宛名は表紙の PDF に描く処理（api/generate-pdf の fire_department_name）があったのに、
 *   入れる欄が無くいつも空欄だった。
 * ■ 列は inspection.inspection_soukatsu.report_date / fire_department_name
 *   （mamoruinfra-web supabase/migrations/20261120090000_soukatsu_cover_fields.sql）。
 * ■ ★宛名の上限は画面で 30 文字。表紙の 1 行（日付の手前まで・約 300pt）に全角 30 字でも 10pt で収まる
 *   （api/generate-pdf の FIRE_DEPARTMENT_RIGHT_X・scripts/check-houkoku-layout.mjs が実際に描いて測る）。
 *   DB の制約（soukatsu_fire_department_name_len）は 60 文字で、それより外側の歯止め。
 */

export const FIRE_DEPARTMENT_NAME_MAX = 30

export const COVER_REPORT_DATE_NOTE =
    "消防署へ出す日です（点検日ではありません）。空欄のままなら、表紙の日付は空けて印字します（手書き用）。"

export const COVER_FIRE_DEPARTMENT_NOTE =
    "表紙の宛名（消防長・消防署長）です。空欄のままなら空けて印字します。"

export const COVER_FIRE_DEPARTMENT_PLACEHOLDER = "例：大阪市消防局 北消防署長"

/** 保存する値にそろえる（前後の空白を落とし、空は null） */
export function coverFieldsForSave(reportDate: string, fireDepartmentName: string) {
    const name = fireDepartmentName.trim()
    return {
        report_date: reportDate.trim() || null,
        fire_department_name: name || null,
    }
}
