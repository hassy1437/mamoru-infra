import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { safeNextPath } from '@/lib/safe-next'

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    // ★戻り先はこのアプリの中の相対パスだけ。origin に next を文字でつないでいて、next に「@evil.example」を入れると、よそへ飛ばせた（src/lib/safe-next.ts）
    const next = safeNextPath(searchParams.get('next'))

    if (code) {
        const supabase = await createClient()
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
            return NextResponse.redirect(new URL(next, origin))
        }
    }

    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
