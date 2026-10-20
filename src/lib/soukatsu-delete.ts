/**
 * 総括表（点検）の削除（2026-10-20）。
 *
 * ■ なぜ要るか
 *   間違えて始めた点検を消す手段が画面に無かった。物件は「削除」で消せるが、物件を消しても
 *   総括表・点検者一覧・別記は物件とのひもづけが外れて残る（ON DELETE SET NULL）。
 *
 * ■ 約束
 *   ・消すと点検者一覧・別記（23 様式）・作業の記録も消える（外部キーの ON DELETE CASCADE）。物件は消えない
 *   ・確定した点検・納品した点検は消せない。利用料の記録（soukatsu_finalizations）と納品の記録（report_deliveries）が
 *     外部キー（ON DELETE RESTRICT）で止める。画面は先にボタンを出さずに理由を出し、すり抜けたときは DB のエラー（23503）を言い換える
 *   ・権限は RLS（本人の総括表だけ）。消えた件数が 0 なら「消せなかった」と出す（黙って成功にしない）
 */

export type SoukatsuDeleteBlock = "finalized" | "delivered" | null

/** 消せない理由（無ければ null）。確定と納品の両方なら納品を言う（オーナーに届いている方が重い） */
export function soukatsuDeleteBlock(a: { finalizedCount: number; delivered: boolean }): SoukatsuDeleteBlock {
    if (a.delivered) return "delivered"
    if (a.finalizedCount > 0) return "finalized"
    return null
}

export const SOUKATSU_DELETE_BLOCK_NOTE: Record<Exclude<SoukatsuDeleteBlock, null>, string> = {
    finalized: "確定した点検は削除できません（利用料の記録と結び付いているため）。内容は「編集」から直せます。",
    delivered: "オーナーへ納品した点検は削除できません（納品の記録と結び付いているため）。内容は「編集」から直し、納品し直せます。",
}

/** 確認の窓の文 */
export function soukatsuDeleteConfirmText(buildingName: string | null | undefined): string {
    const name = (buildingName ?? "").trim() || "この点検"
    return `「${name}」の総括表を削除しますか？\n点検者一覧表と、入力した点検票（別記）もすべて消えます。物件は消えません。\nこの操作は取り消せません。`
}

/** 削除の失敗を業者向けの文に。外部キー（23503）は確定・納品の記録があるとき */
export function soukatsuDeleteErrorText(err: { code?: string; message?: string } | null, deletedCount: number): string | null {
    if (err?.code === "23503") return "確定または納品の記録がある点検は削除できません。"
    if (err) return `削除できませんでした: ${err.message ?? "不明なエラー"}`
    if (deletedCount === 0) return "削除できませんでした（この点検が見つからないか、削除の権限がありません）。"
    return null
}
