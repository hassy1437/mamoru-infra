import type { ReactNode } from "react"
import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

/**
 * /inspection/[id]/itiran/[itiranId]/ 以下（一覧のまとめ・編集・別記 23 様式・出力）の共通の枠（総点検 C5・2026-10-09）。
 *
 * ★URL の点検者一覧（itiranId）が、URL の総括表（id）のものかを★ここで 1 回だけ確かめる。
 *   以前は編集画面だけが確かめていて、別記の画面と出力は一覧を ID だけで読んでいた。別の報告書の一覧の ID を
 *   URL に組むと、様式を保存したときに soukatsu_id が URL の報告書に書き換わり、出力では別の報告書の一覧が混ざった。
 *   ★RLS で他人のものは読めないので、起きるのは自分の報告書どうし（URL を手で組んだとき）。
 * ★組み合わせが違う・無い → 404。★読み込みそのものが失敗したときは止めない（ログを残して画面を出す。
 *   一時的な失敗で 404 にすると、正しい報告書まで「見つかりません」に見える）。
 * ★確かめ方は scripts/check-itiran-soukatsu-guard.mjs が見張る。
 */
export default async function ItiranLayout({
    children,
    params,
}: {
    children: ReactNode
    params: Promise<{ id: string; itiranId: string }>
}) {
    const { id, itiranId } = await params
    const supabase = await createClient()
    const { data, error } = await supabase
        .from("inspection_itiran")
        .select("id")
        .eq("id", itiranId)
        .eq("soukatsu_id", id)
        .maybeSingle()
    if (error) {
        console.error(`[ItiranLayout] inspection_itiran select failed: ${error.code ?? "-"} ${error.message}`)
    } else if (!data) {
        notFound()
    }
    return <>{children}</>
}
