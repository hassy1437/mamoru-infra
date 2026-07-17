import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
    return createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
        // 未設定なら 'public' = 従来どおり。統合時は Vercel の env を
        // URL / ANON_KEY / SCHEMA の3本まとめて切り替える（1デプロイでアトミック）。
        { db: { schema: process.env.NEXT_PUBLIC_SUPABASE_SCHEMA ?? 'public' } }
    )
}
