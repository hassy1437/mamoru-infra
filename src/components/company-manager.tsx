"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { FunctionsHttpError } from "@supabase/supabase-js"
import { Loader2, Mail, RotateCw, ShieldCheck, UserMinus, UserPlus, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ACTION_BUTTON } from "@/lib/action-button"
import { createClient } from "@/lib/supabase/client"
import {
    ROLE_LABEL,
    ROLE_NOTE,
    companyErrorText,
    formatJstDate,
    inviteResultMessage,
    type CompanyInvitation,
    type CompanyMember,
    type CompanyRole,
    type MyCompany,
} from "@/lib/company"

type Props = {
    company: MyCompany | null
    members: CompanyMember[]
    invitations: CompanyInvitation[]
}

type Notice = { ok: boolean; text: string } | null

/**
 * 会社の画面の中身（2026-11-08）。
 *   ★押せるかどうかは役割で出し分けるが、決めるのは DB（止められたら DB の文をそのまま出す）。
 *   ★招待を送る・送り直すは Edge Function send-company-invite（鍵を作ってメールを送る）。ほかは DB の関数を直に呼ぶ。
 */
export default function CompanyManager({ company, members, invitations }: Props) {
    const router = useRouter()
    const isAdmin = !company || company.my_role === "admin"
    const [busy, setBusy] = useState<string | null>(null)
    const [notice, setNotice] = useState<Notice>(null)
    const [name, setName] = useState(company?.name ?? "")
    const [email, setEmail] = useState("")
    const [role, setRole] = useState<CompanyRole>("member")

    async function run(key: string, action: () => Promise<Notice>) {
        setBusy(key)
        setNotice(null)
        try {
            const result = await action()
            if (result) setNotice(result)
            router.refresh()
        } catch (e) {
            setNotice({ ok: false, text: companyErrorText(e) })
        } finally {
            setBusy(null)
        }
    }

    async function rpc(fn: string, args: Record<string, unknown>, okText: string): Promise<Notice> {
        const { error } = await createClient().rpc(fn, args)
        if (error) return { ok: false, text: companyErrorText(error) }
        return { ok: true, text: okText }
    }

    async function sendInvite(body: Record<string, unknown>): Promise<Notice> {
        const { data, error } = await createClient().functions.invoke("send-company-invite", { body })
        let status = 200
        let payload = data as Parameters<typeof inviteResultMessage>[1]
        if (error) {
            if (error instanceof FunctionsHttpError) {
                status = error.context.status
                payload = await error.context.json().catch(() => null)
            } else {
                status = 0
                payload = null
            }
        }
        const r = inviteResultMessage(status, payload)
        return { ok: r.ok, text: r.message }
    }

    const adminCount = members.filter((m) => m.role === "admin").length

    return (
        <div className="space-y-6">
            {notice && (
                <p
                    role={notice.ok ? "status" : "alert"}
                    className={`rounded-lg border px-4 py-3 text-sm ${notice.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}
                >
                    {notice.text}
                </p>
            )}

            {/* 会社の名前 */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
                <h2 className="font-bold text-slate-900">会社の名前</h2>
                {!company && (
                    <p className="text-sm text-slate-500">
                        まだ会社はありません。名前を入れると、あなたが管理者の会社ができます（報告書などを初めて保存したときにも自動でできます）。
                    </p>
                )}
                {isAdmin ? (
                    <form
                        className="flex flex-col gap-3 sm:flex-row sm:items-end"
                        onSubmit={(e) => {
                            e.preventDefault()
                            run("rename", () => rpc("company_rename", { p_name: name }, "会社の名前を保存しました。"))
                        }}
                    >
                        <div className="flex-1 space-y-1">
                            <Label htmlFor="company-name">会社の名前（招待のメールに載ります）</Label>
                            <Input
                                id="company-name"
                                value={name}
                                maxLength={100}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="例: マモル防災株式会社"
                                className="text-base"
                            />
                        </div>
                        <Button type="submit" disabled={busy !== null || !name.trim()} aria-busy={busy === "rename"} className="min-h-11">
                            {busy === "rename" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            名前を保存する
                        </Button>
                    </form>
                ) : (
                    <p className="text-lg text-slate-900">{company?.name || "（名前なし）"}</p>
                )}
                {company && (
                    <p className="text-sm text-slate-600">
                        会社の契約（業者登録）: {company.contract_company_name ?? "まだありません"}
                        <span className="block text-xs text-slate-500 mt-1">
                            {company.contract_company_name
                                ? "報告書の確定と利用料は、この業者登録で見ます。"
                                : "報告書を確定するには、会社を作った方がマモルマッチで業者登録の承認を受けてください。"}
                        </span>
                    </p>
                )}
            </section>

            {/* 会社の人 */}
            {company && (
                <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
                    <h2 className="font-bold text-slate-900">会社の人（{members.length} 人）</h2>
                    {!isAdmin && <p className="text-sm text-slate-500">人の出し入れ・役割・会社の名前は、管理者が扱います。</p>}
                    <ul className="divide-y divide-slate-100">
                        {members.map((m) => (
                            <li key={m.profile_id} className="py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                    <p className="font-medium text-slate-900 break-all">
                                        {m.display_name || m.email || "（名前なし）"}
                                        {m.is_me && <span className="ml-2 text-xs text-slate-500">（あなた）</span>}
                                    </p>
                                    {m.display_name && m.email && <p className="text-xs text-slate-500 break-all">{m.email}</p>}
                                    <p className="mt-1 flex flex-wrap gap-1 text-xs">
                                        <span className={`rounded px-2 py-0.5 ${m.role === "admin" ? "bg-brand-100 text-brand-800" : "bg-slate-100 text-slate-700"}`}>
                                            {ROLE_LABEL[m.role]}
                                        </span>
                                        {m.is_contract_holder && (
                                            <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-800 inline-flex items-center gap-1">
                                                <ShieldCheck className="h-3 w-3" />契約の方
                                            </span>
                                        )}
                                    </p>
                                </div>
                                {isAdmin && (
                                    <div className="flex flex-wrap gap-2 shrink-0">
                                        {(m.role === "member" || adminCount > 1) && (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="min-h-11"
                                                disabled={busy !== null}
                                                aria-busy={busy === `role:${m.profile_id}`}
                                                onClick={() => {
                                                    const next: CompanyRole = m.role === "admin" ? "member" : "admin"
                                                    run(`role:${m.profile_id}`, () =>
                                                        rpc("company_set_role", { p_profile: m.profile_id, p_role: next }, `${ROLE_LABEL[next]}にしました。`))
                                                }}
                                            >
                                                {busy === `role:${m.profile_id}` && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                                                {m.role === "admin" ? "一般にする" : "管理者にする"}
                                            </Button>
                                        )}
                                        {!m.is_contract_holder && (m.role === "member" || adminCount > 1) && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="min-h-11 text-red-700 hover:bg-red-50"
                                                disabled={busy !== null}
                                                aria-busy={busy === `remove:${m.profile_id}`}
                                                onClick={() => {
                                                    const who = m.display_name || m.email || "この方"
                                                    if (!window.confirm(`${who}を会社から外しますか？\n作った報告書などは会社に残ります。外された方は会社のデータを見られなくなります。`)) return
                                                    run(`remove:${m.profile_id}`, () =>
                                                        rpc("company_remove_member", { p_profile: m.profile_id }, "会社から外しました。"))
                                                }}
                                            >
                                                {busy === `remove:${m.profile_id}` ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <UserMinus className="mr-1 h-4 w-4" />}
                                                外す
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                    {isAdmin && (
                        <p className="text-xs text-slate-500">
                            管理者が 1 人だけのときは、その方を一般に下げたり外したりできません。契約の方は外せません（運営に連絡してください）。
                        </p>
                    )}
                </section>
            )}

            {/* 招待 */}
            {isAdmin && (
                <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                    <h2 className="font-bold text-slate-900 flex items-center gap-2">
                        <UserPlus className="h-5 w-5 text-brand-600" />
                        人を招待する
                    </h2>
                    <form
                        className="space-y-3"
                        onSubmit={(e) => {
                            e.preventDefault()
                            run("invite", async () => {
                                const r = await sendInvite({ action: "invite", email, role })
                                if (r?.ok) setEmail("")
                                return r
                            })
                        }}
                    >
                        <div className="space-y-1">
                            <Label htmlFor="invite-email">招待する方のメールアドレス</Label>
                            <Input
                                id="invite-email"
                                type="email"
                                inputMode="email"
                                autoComplete="off"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="name@example.com"
                                className="text-base"
                            />
                        </div>
                        <fieldset className="space-y-2">
                            <legend className="text-sm font-medium text-slate-700">役割</legend>
                            {(["member", "admin"] as const).map((r) => (
                                <label key={r} className="flex min-h-11 items-center gap-2 text-sm text-slate-700">
                                    <input type="radio" name="invite-role" value={r} checked={role === r} onChange={() => setRole(r)} />
                                    <span className="font-medium">{ROLE_LABEL[r]}</span>
                                    <span className="text-slate-500">— {ROLE_NOTE[r]}</span>
                                </label>
                            ))}
                        </fieldset>
                        <Button
                            type="submit"
                            disabled={busy !== null || !email.trim() || !(company?.name ?? "").trim()}
                            aria-busy={busy === "invite"}
                            className={`${ACTION_BUTTON} bg-brand-600 hover:bg-brand-700 text-white`}
                        >
                            {busy === "invite" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mail className="h-5 w-5" />}
                            招待のメールを送る
                        </Button>
                        {!(company?.name ?? "").trim() && (
                            <p className="text-sm text-amber-700">先に会社の名前を保存してください（招待のメールに載ります）。</p>
                        )}
                        <p className="text-xs text-slate-500">
                            招待のリンクの期限は 7 日です。受けた・取り消した・期限が切れた招待は、7 日たつと一覧から消えます。
                        </p>
                    </form>

                    {invitations.length > 0 && (
                        <div className="space-y-2">
                            <h3 className="text-sm font-bold text-slate-700">招待中（{invitations.length} 件）</h3>
                            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                                {invitations.map((inv) => (
                                    <li key={inv.invitation_id} className="p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="min-w-0">
                                            <p className="font-medium text-slate-900 break-all">{inv.email}</p>
                                            <p className="text-xs text-slate-500">
                                                {ROLE_LABEL[inv.role]}・{formatJstDate(inv.last_sent_at)}に送信・
                                                {inv.status === "expired"
                                                    ? <span className="text-amber-700">期限切れ</span>
                                                    : `${formatJstDate(inv.expires_at)}まで`}
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap gap-2 shrink-0">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="min-h-11"
                                                disabled={busy !== null}
                                                aria-busy={busy === `resend:${inv.invitation_id}`}
                                                onClick={() => run(`resend:${inv.invitation_id}`, () => sendInvite({ action: "resend", invitation_id: inv.invitation_id }))}
                                            >
                                                {busy === `resend:${inv.invitation_id}` ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RotateCw className="mr-1 h-4 w-4" />}
                                                送り直す
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="min-h-11 text-red-700 hover:bg-red-50"
                                                disabled={busy !== null}
                                                aria-busy={busy === `revoke:${inv.invitation_id}`}
                                                onClick={() => {
                                                    if (!window.confirm(`${inv.email} への招待を取り消しますか？\n送ったメールのリンクは使えなくなります。`)) return
                                                    run(`revoke:${inv.invitation_id}`, () =>
                                                        rpc("company_invitation_revoke", { p_invitation_id: inv.invitation_id }, "招待を取り消しました。"))
                                                }}
                                            >
                                                {busy === `revoke:${inv.invitation_id}` ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <X className="mr-1 h-4 w-4" />}
                                                取り消す
                                            </Button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                            <p className="text-xs text-slate-500">送り直すと新しいリンクになり、前のメールのリンクは使えなくなります。</p>
                        </div>
                    )}
                </section>
            )}
        </div>
    )
}
