// 報告書の「続き」の行き先（2026-10-21・次に進む方法が分かりにくい所の洗い出し）。
//
// ■ なぜ要るか
//   ホームの「最近の点検」・報告書一覧・物件の点検履歴は、どれも総括表の確認画面（/inspection/[id]）へ飛んでいた。
//   点検者一覧表まで作った報告書でも、そこから「次へ」を押してやっと点検票の一覧に着く（2 回押す）。
//   どこまで進んだ報告書なのかも一覧では分からなかった。
//
// ■ 決まり
//   ・点検者一覧表がまだ → 点検者一覧表の入力へ（総括表の確認画面の「次へ」と同じ行き先）
//   ・点検者一覧表がある → 点検票の一覧（別記の進み具合と「次の様式」がある画面）へ
// 型のみの import なので、next/headers への実行時依存は持ち込まない
import type { AppSupabaseClient } from "./supabase/server"

export type ResumeTarget = {
    href: string
    /** 一覧に出す、いまの段階（短く） */
    stage: string
    /** 押す所の言葉 */
    action: string
}

export function resumeTarget(soukatsuId: string, itiranId: string | null | undefined): ResumeTarget {
    // ★確定・納品の済んだ報告書もここへ来る（確定の有無は重い RPC なので一覧では引かない）。言葉は「続き」寄りにしすぎない
    if (!itiranId) {
        return { href: `/inspection/${soukatsuId}/itiran`, stage: "次: 点検者一覧表", action: "続きを開く" }
    }
    return { href: `/inspection/${soukatsuId}/itiran/${itiranId}`, stage: "次: 点検票・結果出力", action: "続きを開く" }
}

/** 総括表ごとの点検者一覧表（最初に作った 1 つ）。読めないときは空（行き先は点検者一覧表の入力になる） */
export async function loadItiranIds(supabase: AppSupabaseClient, soukatsuIds: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>()
    if (soukatsuIds.length === 0) return out
    const { data, error } = await supabase
        .from("inspection_itiran")
        .select("id, soukatsu_id, created_at")
        .in("soukatsu_id", soukatsuIds)
        .order("created_at", { ascending: true })
    if (error) {
        console.error("[loadItiranIds] inspection_itiran select failed:", error)
        return out
    }
    for (const r of (data ?? []) as { id: string; soukatsu_id: string }[]) {
        if (!out.has(r.soukatsu_id)) out.set(r.soukatsu_id, r.id)
    }
    return out
}

/**
 * 総括表の本命の点検者一覧表（総括表の確認画面の「次へ」・点検者一覧表の入力画面の行き先で同じものを使う）。
 * 1報告書＝点検者一覧表 1 本が正。複数ある（過去の二重生成）ときは様式行が最多のもの（inspection.itiran_form_count）。
 */
export async function pickMainItiranId(supabase: AppSupabaseClient, soukatsuId: string): Promise<string | null> {
    const { data: itirans } = await supabase
        .from("inspection_itiran")
        .select("id")
        .eq("soukatsu_id", soukatsuId)
    if (!itirans || itirans.length === 0) return null
    if (itirans.length === 1) return itirans[0].id as string
    const counts = await Promise.all(
        itirans.map(async (it) => {
            const { data } = await supabase.rpc("itiran_form_count", { p_itiran_id: it.id as string })
            return { id: it.id as string, count: (data as number) ?? 0 }
        }),
    )
    counts.sort((a, b) => b.count - a.count)
    return counts[0]?.id ?? (itirans[0].id as string)
}
