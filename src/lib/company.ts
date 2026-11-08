/**
 * 点検アプリの会社（招待と役割）の画面で使う型と文言（2026-11-08）。
 *
 * ■ DB（mamoruinfra-web の 20261231130000_inspection_invites.sql）
 *   ・読む: inspection.my_company / company_members_list / company_invitations_list（管理者だけ）/ company_invitation_peek
 *   ・書く: company_rename / company_set_role / company_remove_member / company_invitation_revoke / company_invitation_accept
 *   ・招待を送る・送り直す: Edge Function send-company-invite（鍵を作ってメールを送り、送った記録を残す）
 *   ★「管理者だけ」「最後の管理者」「会社の契約の人は外せない」などの決まりは、全部 DB が持つ。画面は決めない
 *
 * ■ DB の例外の文は「印 本文」の形（例: COMPANY_LAST_ADMIN 管理者が 1 人だけのため…）。画面には本文だけ出す。
 */
import { friendlyError } from "@/lib/error-messages"
import { formatJstYmd } from "@/lib/date-utils"

export type CompanyRole = "admin" | "member"

export type MyCompany = {
    company_id: string
    name: string
    my_role: CompanyRole
    member_count: number
    contract_company_name: string | null
    i_am_contract_holder: boolean
}

export type CompanyMember = {
    profile_id: string
    display_name: string
    email: string | null
    role: CompanyRole
    joined_at: string
    is_me: boolean
    is_contract_holder: boolean
}

export type CompanyInvitation = {
    invitation_id: string
    email: string
    role: CompanyRole
    invited_by_name: string
    created_at: string
    last_sent_at: string
    expires_at: string
    status: "open" | "expired"
}

export type InvitationPeek = {
    status: "open" | "expired" | "revoked" | "accepted" | "not_found"
    company_name: string | null
    invited_email: string | null
    role: CompanyRole | null
    expires_at: string | null
    inviter_name: string | null
    blocked: null | "email_mismatch" | "already_member" | "has_data" | "has_members"
}

export const ROLE_LABEL: Record<CompanyRole, string> = { admin: "管理者", member: "一般" }

export const ROLE_NOTE: Record<CompanyRole, string> = {
    admin: "人の出し入れ・役割・会社の名前も扱えます",
    member: "報告書の入力・確定ができます",
}

/** DB の例外の文を「印」と「本文」に分ける（印が無ければ null） */
export function splitDbError(message: string): { code: string | null; text: string } {
    const m = /^([A-Z][A-Z0-9_]+)\s+([\s\S]*)$/.exec((message ?? "").trim())
    if (!m) return { code: null, text: (message ?? "").trim() }
    return { code: m[1], text: m[2] }
}

/** 画面に出す文。DB が決めた日本語の本文はそのまま、それ以外は friendlyError に任せる */
export function companyErrorText(error: unknown): string {
    const raw = error instanceof Error ? error.message
        : typeof error === "object" && error !== null && "message" in error ? String((error as { message: unknown }).message)
        : String(error ?? "")
    const { code, text } = splitDbError(raw)
    if (code && text) return text
    return friendlyError(raw)
}

/**
 * DB に関数がまだ無い（招待と役割のマイグレーションを当てる前）か。
 *   PostgREST は関数が無いと PGRST202（Could not find the function）を返す。
 */
export function isFunctionMissing(error: { code?: string; message?: string } | null | undefined): boolean {
    if (!error) return false
    return error.code === "PGRST202" || /Could not find the function/i.test(error.message ?? "")
}

/** 「2026年11月15日」（日本時間） */
export function formatJstDate(iso: string | null | undefined): string {
    if (!iso) return ""
    const ymd = formatJstYmd(iso)
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
    return m ? `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日` : ymd
}

/**
 * Edge Function send-company-invite の返事を、画面に出す文にする。
 *   ・200 { ok, emailed: true } … 送った
 *   ・200 { ok, emailed: false, email_status: "skipped" } … 招待はできたがメールを送る設定が無い
 *   ・502 { ok, emailed: false, email_status: "failed" } … 招待はできたがメールが送れなかった（送り直せる）
 *   ・400 { error, code } … DB が止めた（管理者だけ・会社の名前・メールアドレスの形など）
 */
export function inviteResultMessage(
    status: number,
    body: { ok?: boolean; emailed?: boolean; email_status?: string; error?: string } | null,
): { ok: boolean; message: string } {
    if (body?.ok && body.emailed) {
        return { ok: true, message: "招待のメールを送りました。相手がリンクを開いて参加すると、会社の人に加わります。" }
    }
    if (body?.ok) {
        return {
            ok: false,
            message: "招待は作りましたが、メールを送れませんでした。少し待ってから、下の一覧の「送り直す」を押してください。",
        }
    }
    if (body?.error) return { ok: false, message: body.error }
    if (status === 401) return { ok: false, message: "ログインの期限が切れました。ログインし直してください。" }
    return { ok: false, message: "招待を送れませんでした。しばらく待ってからもう一度お試しください。" }
}

/** 招待を受ける画面の文（受けられないときの理由・受けられるか） */
export function peekMessage(peek: InvitationPeek): { title: string; body: string; canAccept: boolean } {
    const company = peek.company_name?.trim() || "会社"
    switch (peek.status) {
        case "not_found":
            return {
                title: "招待が見つかりません",
                body: "リンクが正しいかお確かめください。送り直された招待は、新しいメールのリンクを開いてください。",
                canAccept: false,
            }
        case "revoked":
            return { title: "この招待は取り消されています", body: `${company}の管理者にお問い合わせください。`, canAccept: false }
        case "expired":
            return {
                title: "招待の期限が切れています",
                body: `招待の期限は 7 日です。${company}の管理者に送り直してもらってください。`,
                canAccept: false,
            }
        case "accepted":
            return { title: "この招待はすでに使われています", body: "会社の画面からご確認ください。", canAccept: false }
    }
    switch (peek.blocked) {
        case "email_mismatch":
            return {
                title: "招待されたメールアドレスでログインしてください",
                body: `この招待は ${peek.invited_email ?? "別のメールアドレス"} あてです。いったんログアウトし、そのメールアドレスでログイン（口座が無ければ新規登録）してから、もう一度このリンクを開いてください。`,
                canAccept: false,
            }
        case "already_member":
            return { title: `すでに${company}に入っています`, body: "会社の画面からご確認ください。", canAccept: false }
        case "has_data":
            return {
                title: "いまの会社に報告書などがあるため受けられません",
                body: "データが混ざらないよう、報告書などがある口座は別の会社に移れません。運営に連絡してください。",
                canAccept: false,
            }
        case "has_members":
            return {
                title: "いまの会社にほかの人がいるため受けられません",
                body: "運営に連絡してください。",
                canAccept: false,
            }
    }
    return {
        title: `${company}への招待`,
        body: `参加すると、${company}の報告書・物件・点検者・測定機器を一緒に見て直せます。`,
        canAccept: true,
    }
}
