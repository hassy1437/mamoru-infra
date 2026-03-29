// Backward-compatible shim — use @/lib/supabase/client or @/lib/supabase/server instead
import { createClient } from '@/lib/supabase/client'

export const supabase = createClient()
