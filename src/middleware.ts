import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
    try {
        const { updateSession } = await import('@/lib/supabase/middleware')
        return await updateSession(request)
    } catch {
        // If middleware fails for any reason, allow the request through
        return NextResponse.next()
    }
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|pdf|woff|woff2|ttf)$).*)',
    ],
}
