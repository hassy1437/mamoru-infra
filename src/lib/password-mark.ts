import type { createClient } from "@/lib/supabase/client"

/**
 * 本人がパスワードを決めた印を付ける（マッチング側の public.mark_my_password_set・20261027090000・#1）。
 *
 * ■ なぜ要るか（2026-10-05 の通し確認）
 *   マッチング側のダッシュボードの「点検アプリのパスワードを設定してください」は、パスワードの有無で出し分ける。
 *   以前は auth.users の値の有無で判定していたが、マジックリンクで作った口座にも値が入るので全員「設定済み」になり、
 *   パスワードを決めていない業者が点検アプリに入れないまま気付けなかった。
 *   ＝ パスワードでログインできた（＝知っている）・再設定したときに、ここで印を付ける。
 *
 * ★public スキーマの口なので .schema("public") で呼ぶ（この client の既定は NEXT_PUBLIC_SUPABASE_SCHEMA）。
 * ★失敗してもログイン・再設定は続ける（印が無いと、マッチング側に案内が出続けるだけ）。
 */
export async function markMyPasswordSet(
    supabase: ReturnType<typeof createClient>,
    via: "app-login" | "app-reset",
): Promise<void> {
    try {
        const { error } = await supabase.schema("public").rpc("mark_my_password_set", { p_via: via })
        if (error) console.warn("[markMyPasswordSet]", error.code ?? "-", error.message)
    } catch (e) {
        console.warn("[markMyPasswordSet]", e)
    }
}
