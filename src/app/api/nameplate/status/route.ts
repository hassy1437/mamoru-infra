import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { nameplateAiEnabledFor } from "@/lib/nameplate-ai-config"
import type { NameplateStatusResponse } from "@/lib/nameplate-api"

/**
 * 「銘板を撮って読む」を出すか（スイッチ・テストの人・キー・今月の残り）。
 * ★出さないときは理由を返さない（スイッチやテストの人の一覧を外に見せない）。
 */
export async function GET() {
    const off: NameplateStatusResponse = { enabled: false }
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user || !nameplateAiEnabledFor(process.env, user.id)) return NextResponse.json(off)
    const { data, error } = await supabase.rpc("nameplate_quota")
    // ★表がまだ無い（DB を当てる前）・読めないときは出さない
    const row = Array.isArray(data) ? data[0] : data
    if (error || !row) return NextResponse.json(off)
    const res: NameplateStatusResponse = { enabled: true, used: Number(row.used) || 0, cap: Number(row.cap) || 0 }
    return NextResponse.json(res)
}
