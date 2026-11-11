import { describe, expect, it } from "vitest"

import {
    companyErrorText,
    formatJstDate,
    inviteResultMessage,
    isFunctionMissing,
    peekMessage,
    splitDbError,
    type InvitationPeek,
} from "./company"

const openPeek: InvitationPeek = {
    status: "open",
    company_name: "マモル防災株式会社",
    invited_email: "staff@example.test",
    role: "member",
    expires_at: "2026-11-15T04:00:00Z",
    inviter_name: "橋本",
    blocked: null,
}

describe("DB の例外の文", () => {
    it("印と本文に分け、画面には本文だけ出す", () => {
        expect(splitDbError("COMPANY_LAST_ADMIN 管理者が 1 人だけのため、外せません。")).toEqual({
            code: "COMPANY_LAST_ADMIN",
            text: "管理者が 1 人だけのため、外せません。",
        })
        expect(companyErrorText({ message: "INVITE_HAS_DATA いまの会社に報告書などがあるため受けられません。" }))
            .toBe("いまの会社に報告書などがあるため受けられません。")
        expect(companyErrorText(new Error("COMPANY_CONTRACT_HOLDER 会社の契約（業者登録）の方は外せません。")))
            .toBe("会社の契約（業者登録）の方は外せません。")
    })

    it("印の無い英語の例外は friendlyError に任せる（中身をそのまま見せない）", () => {
        expect(companyErrorText({ message: "permission denied for table company_invitations" }))
            .toBe("この操作を行う権限がありません。ログインし直してください。")
    })

    it("関数がまだ無い（マイグレーションを当てる前）を見分ける", () => {
        expect(isFunctionMissing({ code: "PGRST202", message: "Could not find the function inspection.my_company" })).toBe(true)
        expect(isFunctionMissing({ message: "Could not find the function inspection.my_company without parameters" })).toBe(true)
        expect(isFunctionMissing({ code: "42501", message: "permission denied" })).toBe(false)
        expect(isFunctionMissing(null)).toBe(false)
    })
})

describe("招待のメールを送った結果", () => {
    it("送れた・招待はできたが送れなかった・DB が止めた・ログイン切れ", () => {
        expect(inviteResultMessage(200, { ok: true, emailed: true }).ok).toBe(true)
        const notSent = inviteResultMessage(502, { ok: true, emailed: false, email_status: "failed" })
        expect(notSent.ok).toBe(false)
        expect(notSent.message).toContain("送り直す")
        expect(inviteResultMessage(400, { error: "招待を送る前に、会社の名前を入れてください" }))
            .toEqual({ ok: false, message: "招待を送る前に、会社の名前を入れてください" })
        expect(inviteResultMessage(401, null).message).toContain("ログイン")
    })
})

describe("招待を受ける画面の文", () => {
    it("受けられるときだけ「参加する」を出す", () => {
        expect(peekMessage(openPeek).canAccept).toBe(true)
        expect(peekMessage(openPeek).title).toBe("マモル防災株式会社への招待")
    })

    it("期限切れ・取り消し・使用済み・見つからないは受けられない", () => {
        for (const status of ["expired", "revoked", "accepted", "not_found"] as const) {
            expect(peekMessage({ ...openPeek, status }).canAccept).toBe(false)
        }
        expect(peekMessage({ ...openPeek, status: "expired" }).body).toContain("7 日")
    })

    it("別のメールアドレス・報告書のある人・すでに入っている人は受けられない（理由を出す）", () => {
        const mismatch = peekMessage({ ...openPeek, blocked: "email_mismatch" })
        expect(mismatch.canAccept).toBe(false)
        expect(mismatch.body).toContain("staff@example.test")
        expect(peekMessage({ ...openPeek, blocked: "has_data" }).title).toContain("報告書など")
        expect(peekMessage({ ...openPeek, blocked: "already_member" }).canAccept).toBe(false)
        expect(peekMessage({ ...openPeek, blocked: "has_members" }).canAccept).toBe(false)
    })
})

describe("日付", () => {
    it("日本時間の年月日（日付をまたぐ）", () => {
        expect(formatJstDate("2026-11-15T16:30:00Z")).toBe("2026年11月16日")
        expect(formatJstDate(null)).toBe("")
    })
})
