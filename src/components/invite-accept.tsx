"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2, LogOut, UserCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ACTION_BUTTON_FULL } from "@/lib/action-button"
import { ROLE_LABEL, companyErrorText, type CompanyRole } from "@/lib/company"
import { createClient } from "@/lib/supabase/client"

type Props = {
    token: string
    canAccept: boolean
    showLogout: boolean
    role: CompanyRole | null
}

/** 招待を受ける画面のボタン（参加する／別のメールアドレスでログインし直す） */
export default function InviteAccept({ token, canAccept, showLogout, role }: Props) {
    const router = useRouter()
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function accept() {
        setBusy(true)
        setError(null)
        const { error: e } = await createClient().rpc("company_invitation_accept", { p_token: token })
        if (e) {
            setError(companyErrorText(e))
            setBusy(false)
            return
        }
        router.push("/company")
        router.refresh()
    }

    async function logoutAndRetry() {
        setBusy(true)
        // ★この端末だけ（logout-button と同じ）。ログインし直したら、この招待の画面に戻る
        await createClient().auth.signOut({ scope: "local" })
        router.push(`/login?redirectTo=${encodeURIComponent(`/invite/${token}`)}`)
        router.refresh()
    }

    return (
        <div className="space-y-3">
            {error && (
                <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
            )}
            {canAccept && (
                <>
                    {role && <p className="text-sm text-slate-600">役割: {ROLE_LABEL[role]}</p>}
                    <Button
                        type="button"
                        onClick={accept}
                        disabled={busy}
                        aria-busy={busy}
                        className={`${ACTION_BUTTON_FULL} bg-brand-600 hover:bg-brand-700 text-white`}
                    >
                        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <UserCheck className="h-5 w-5" />}
                        参加する
                    </Button>
                </>
            )}
            {showLogout && (
                <Button
                    type="button"
                    variant="outline"
                    onClick={logoutAndRetry}
                    disabled={busy}
                    aria-busy={busy}
                    className={ACTION_BUTTON_FULL}
                >
                    {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />}
                    ログアウトして、招待されたメールアドレスでログインする
                </Button>
            )}
            <Link href="/tool" className="inline-flex min-h-11 items-center text-sm text-brand-600 hover:underline">
                点検アプリのトップへ
            </Link>
        </div>
    )
}
