import { NextResponse, type NextRequest } from 'next/server'

import { isPdfApiPath, PDF_API_UNAUTHORIZED_BODY } from '@/lib/pdf-api-guard'

export async function middleware(request: NextRequest) {
    try {
        const { updateSession } = await import('@/lib/supabase/middleware')
        return await updateSession(request)
    } catch {
        // If middleware fails for any reason, allow the request through
        // ★ただし PDF 生成の口は通さない（fail-closed・src/lib/pdf-api-guard.ts）
        if (isPdfApiPath(request.nextUrl.pathname)) {
            return NextResponse.json(PDF_API_UNAUTHORIZED_BODY, { status: 401 })
        }
        return NextResponse.next()
    }
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|pdf|woff|woff2|ttf)$).*)',
    ],
}
