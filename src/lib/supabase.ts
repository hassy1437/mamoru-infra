import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
    // In development, we might want to just log a warning so the app doesn't crash immediately 
    // if the user hasn't set up credentials yet, but for actual usage, this is critical.
    console.warn('Missing Supabase environment variables. Please check .env.local')
}

export const supabase = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder-key'
)
