/**
 * 保存していない入力があるとき、画面の中のリンクで離れる前に確かめる（2026-10-09・総点検 B13）。
 *
 * ■ なぜ要るか
 *   beforeunload はタブを閉じる・再読み込み・別のサイトへ移るときにしか出ない。
 *   Next の <Link>（「← 物件一覧に戻る」・ヘッダー）はページを読み直さずに移るので、
 *   総括表・物件・点検者一覧・点検者の入力が黙って消えていた。
 *   ★別記は離れるとき（アンマウント）に自動で保存するので対象外（bekki-result-form-base.tsx）。
 *
 * ■ 聞かないもの
 *   ・新しいタブで開く（修飾キー・中クリック・target="_blank"）・ダウンロード … 入力は残る
 *   ・別のサイトへのリンク … ページを読み直すので beforeunload が出る（二重に聞かない）
 *   ・同じページの中の移動（#…だけ違う）… 入力は残る
 *
 * ★ブラウザの「戻る」ボタンはここでは止めない（Next の履歴の扱いに手を入れることになるため）。
 */
export const LEAVE_CONFIRM_MESSAGE =
    "保存していない入力があります。このページを離れると入力は消えます。離れますか？"

export type LeaveClick = {
    button: number
    metaKey: boolean
    ctrlKey: boolean
    shiftKey: boolean
    altKey: boolean
    defaultPrevented: boolean
}

export type LeaveLink = {
    href: string
    target: string
    download: boolean
}

/** このクリックでページを離れて入力が消えるなら true（＝確かめる）。 */
export function linkLeavesPage(click: LeaveClick, link: LeaveLink, current: string): boolean {
    if (click.defaultPrevented) return false
    if (click.button !== 0) return false
    if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return false
    if (link.download) return false
    if (link.target && link.target !== "_self") return false
    let to: URL
    let from: URL
    try {
        from = new URL(current)
        to = new URL(link.href, from)
    } catch {
        return false
    }
    if (to.origin !== from.origin) return false
    if (to.pathname === from.pathname && to.search === from.search) return false
    return true
}
