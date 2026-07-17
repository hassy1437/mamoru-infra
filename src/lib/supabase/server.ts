import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * サーバ側 Supabase クライアントの型。
 * 素の `SupabaseClient` は schema generics が "public" に既定されるため、
 * env 駆動でスキーマを差し替える現構成（string 型になる）と型が合わない。
 * ファクトリから導出しておけば、スキーマ指定を変えても型が自動で追従する。
 */
export type AppSupabaseClient = Awaited<ReturnType<typeof createClient>>

export async function createClient() {
    const cookieStore = await cookies()

    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
        {
            // 未設定なら 'public' = 従来どおり。統合時は Vercel の env を
            // URL / ANON_KEY / SCHEMA の3本まとめて切り替える（1デプロイでアトミック）。
            db: { schema: process.env.NEXT_PUBLIC_SUPABASE_SCHEMA ?? 'public' },
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        )
                    } catch {
                        // setAll is called from Server Components where cookies
                        // cannot be set. This can be safely ignored when the
                        // middleware handles session refresh.
                    }
                },
            },
        }
    )
}
