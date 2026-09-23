import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { isPdfApiPath, PDF_API_NOT_CONFIGURED_BODY, PDF_API_UNAUTHORIZED_BODY } from '@/lib/pdf-api-guard'

export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({ request })
    // ★PDF 生成の口はログインしている人だけ（src/lib/pdf-api-guard.ts）。★確かめられないときも通さない。
    const pdfApi = isPdfApiPath(request.nextUrl.pathname)

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
        // Supabase not configured — skip auth checks, allow request through
        // ★ただし PDF 生成の口は通さない（fail-closed）
        if (pdfApi) return NextResponse.json(PDF_API_NOT_CONFIGURED_BODY, { status: 503 })
        return supabaseResponse
    }

    const supabase = createServerClient(
        supabaseUrl,
        supabaseAnonKey,
        {
            // ここは auth.getUser() しか使わないので schema 指定は現状 no-op だが、
            // 将来 .from() が足されたときに public を向いたままにならないよう他2つと揃える。
            db: { schema: process.env.NEXT_PUBLIC_SUPABASE_SCHEMA ?? 'public' },
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    )
                    supabaseResponse = NextResponse.next({ request })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    try {
        const { data: { user } } = await supabase.auth.getUser()

        // ★PDF 生成の口: 未ログインは 401（画面のようにログインへ飛ばさない。fetch が HTML を受け取ってしまう）
        if (pdfApi && !user) {
            return NextResponse.json(PDF_API_UNAUTHORIZED_BODY, { status: 401 })
        }

        const protectedPaths = ['/tool', '/properties', '/inspection', '/reports']
        const isProtected = protectedPaths.some(p => request.nextUrl.pathname.startsWith(p))

        if (!user && isProtected) {
            const url = request.nextUrl.clone()
            url.pathname = '/login'
            url.searchParams.set('redirectTo', request.nextUrl.pathname)
            return NextResponse.redirect(url)
        }

        if (user && (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/signup')) {
            const url = request.nextUrl.clone()
            url.pathname = '/tool'
            return NextResponse.redirect(url)
        }
    } catch {
        // Auth check failed — allow request through without redirecting
        // ★ただし PDF 生成の口は通さない（fail-closed）
        if (pdfApi) return NextResponse.json(PDF_API_UNAUTHORIZED_BODY, { status: 401 })
    }

    return supabaseResponse
}
