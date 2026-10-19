import { NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { safeNextPath } from '@/lib/safe-next'

/**
 * マッチング側（mamoruinfra.com）から「ログインした状態で」入る口（2026-10-19・録音 101「アカウント連携」）。
 *
 * ■ 流れ
 *   マッチング側の「点検アプリで開く」（業者だけ・POST）が、ログイン中の本人のメールで 1 回だけ使えるリンクを作り
 *   （auth.admin.generateLink・メールは送らない）、ここへ token_hash を付けて送る
 *   （mamoruinfra-web lib/inspection-handoff.ts）。同じ Supabase の口座なので、ここで verifyOtp すると
 *   このアプリにログインの Cookie ができる。
 *
 * ■ ★決めたこと
 *   ・受け付ける type は magiclink / email だけ（再設定・招待・メール変更はこの口で受けない）
 *   ・next はこのアプリの中の相対パスだけ（src/lib/safe-next.ts）
 *   ・応答を残さない・行き先に token_hash 入りの URL を渡さない（no-store・no-referrer）
 *   ・使えなかった（期限切れ・使用済み）ときはログイン画面へ。戻り先はそのまま、理由を出す
 *   ・ログアウトは今までどおり別々（この端末だけ・#4）
 */
const ALLOWED_TYPES: ReadonlySet<EmailOtpType> = new Set<EmailOtpType>(['magiclink', 'email'])
const NO_STORE = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } as const

function go(url: URL) {
    return NextResponse.redirect(url, { status: 303, headers: NO_STORE })
}

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const tokenHash = searchParams.get('token_hash')
    const type = searchParams.get('type') as EmailOtpType | null
    const next = safeNextPath(searchParams.get('next'))

    if (tokenHash && type && ALLOWED_TYPES.has(type)) {
        const supabase = await createClient()
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
        if (!error) return go(new URL(next, origin))
    }

    const login = new URL('/login', origin)
    login.searchParams.set('error', 'link_invalid')
    login.searchParams.set('redirectTo', next)
    return go(login)
}
