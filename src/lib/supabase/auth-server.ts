import { createClient } from './server'
import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function getAuthenticatedClient(): Promise<{
    supabase: SupabaseClient
    user: User
}> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')
    return { supabase, user }
}
