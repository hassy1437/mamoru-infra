import { Building2 } from "lucide-react"

import InviteAccept from "@/components/invite-accept"
import { getAuthenticatedClient } from "@/lib/supabase/auth-server"
import { isFunctionMissing, peekMessage, type InvitationPeek } from "@/lib/company"

/**
 * 招待を受ける画面（2026-11-08）。招待のメールのリンク /invite/<鍵> で開く。
 *   ★ログインしていなければ、ログインの画面へ（戻り先にこの画面を付ける・src/lib/supabase/middleware.ts）。
 *   ★受けられるか（招待されたメールアドレスか・報告書などのある会社にいないか・期限）は DB が決める（company_invitation_peek）。
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params
    const { supabase, user } = await getAuthenticatedClient()

    const res = await supabase.rpc("company_invitation_peek", { p_token: token })
    const peek = ((res.data ?? []) as InvitationPeek[])[0] ?? null
    const unavailable = !!res.error && isFunctionMissing(res.error)
    const msg = peek
        ? peekMessage(peek)
        : {
            title: unavailable ? "招待は準備中です" : "招待を読み込めませんでした",
            body: unavailable ? "もうしばらくお待ちください。" : "時間をおいて、もう一度このリンクを開いてください。",
            canAccept: false,
        }

    return (
        <main className="min-h-screen bg-gray-50 py-10">
            <div className="max-w-lg mx-auto px-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
                    <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <Building2 className="w-6 h-6 text-blue-600 shrink-0" />
                        {msg.title}
                    </h1>
                    <p className="text-slate-700 leading-relaxed">{msg.body}</p>
                    {peek?.inviter_name && msg.canAccept && (
                        <p className="text-sm text-slate-500">招待した方: {peek.inviter_name}</p>
                    )}
                    <p className="text-sm text-slate-500 break-all">ログイン中: {user.email}</p>
                    <InviteAccept
                        token={token}
                        canAccept={msg.canAccept}
                        showLogout={peek?.blocked === "email_mismatch"}
                        role={peek?.role ?? null}
                    />
                </div>
            </div>
        </main>
    )
}
