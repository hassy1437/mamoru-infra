/**
 * 点検票（別記）の立会者の初期値を、総括表の「点検を行った消防用設備等」の立会者から引き継ぐ（2026-10-20）。
 *
 * ■ なぜ要るか
 *   総括表で設備ごとに立会者を入れても、点検票の立会者は空のまま始まり、しかも欄が畳んだ「基本情報」の中にあった。
 *   本番の通しチェックで、23 様式すべての点検票が立会者の空欄で出た（総括表には入っていた）。
 *
 * ■ 約束
 *   ・その様式の設備の行（設備名に様式の設備名を含む行）の立会者を使う
 *   ・その行に無ければ、総括表の立会者が 1 人だけのときに限りその人（設備ごとに違う人がいるなら決めない）
 *   ・点検票に保存した立会者があればそれが優先（空のときだけ引き継ぐ）
 */
import { equipmentKeywordOf, type ItiranInputStepId } from "@/lib/itiran-input-flow"

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "")

/** 総括表の点検結果（equipment_results）から、この様式の立会者の初期値を決める。決まらなければ "" */
export function bekkiWitnessFromSoukatsu(equipmentResults: unknown, stepId: ItiranInputStepId): string {
    if (!Array.isArray(equipmentResults)) return ""
    const rows = equipmentResults.map((r) => (r ?? {}) as Record<string, unknown>)
    const keyword = equipmentKeywordOf(stepId)
    const own = rows.find((r) => text(r.name).includes(keyword) && text(r.witness))
    if (own) return text(own.witness)
    const all = [...new Set(rows.map((r) => text(r.witness)).filter(Boolean))]
    return all.length === 1 ? all[0] : ""
}

/** 画面の初期値: 点検票に保存した立会者（空でなければ）→ 総括表から引き継いだ立会者 */
export function bekkiWitnessInitial(saved: unknown, inherited: string | null | undefined): string {
    return text(saved) ? String(saved) : (inherited ?? "")
}
