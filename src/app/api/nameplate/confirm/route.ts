import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { nameplateOutcomes, type NameplateProviderResult } from "@/lib/nameplate-consensus"
import { NAMEPLATE_FIELDS, type NameplateFieldKey } from "@/lib/nameplate-reading"
import type { NameplateConfirmResponse } from "@/lib/nameplate-api"

/**
 * 点検者が確かめて入れた値を記録する（＝答え合わせ）。当たり外れはサーバで計算する（judgeNameplateField）。
 * ★本人の行だけ（RLS）・1 回だけ（DB の決まり）。2 回目以降は黙って ok を返す（画面は止めない）。
 */
const MAX = 120

export async function POST(req: Request) {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, message: "ログインし直してください。" } satisfies NameplateConfirmResponse, { status: 401 })

    let body: { id?: unknown; values?: unknown }
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ ok: false, message: "形が違います。" } satisfies NameplateConfirmResponse, { status: 400 })
    }
    const id = typeof body.id === "string" && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : null
    if (!id || !body.values || typeof body.values !== "object") {
        return NextResponse.json({ ok: false, message: "形が違います。" } satisfies NameplateConfirmResponse, { status: 400 })
    }
    // ★画面に出した欄（送られてきた欄）だけを答えにする。出していない欄は採点しない（nameplateOutcomes）
    const raw = body.values as Record<string, unknown>
    const values: Partial<Record<NameplateFieldKey, string | null>> = {}
    for (const f of NAMEPLATE_FIELDS) {
        if (!Object.hasOwn(raw, f.key)) continue
        const v = raw[f.key]
        values[f.key] = typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, MAX) : null
    }
    if (Object.keys(values).length === 0) {
        return NextResponse.json({ ok: false, message: "形が違います。" } satisfies NameplateConfirmResponse, { status: 400 })
    }

    const { data: row } = await supabase.from("nameplate_readings").select("ai_results, final_values").eq("id", id).maybeSingle()
    if (!row || !Array.isArray(row.ai_results)) return NextResponse.json({ ok: true } satisfies NameplateConfirmResponse)
    if (row.final_values) return NextResponse.json({ ok: true } satisfies NameplateConfirmResponse)

    const outcomes = nameplateOutcomes(row.ai_results as NameplateProviderResult[], values)
    const { error } = await supabase.from("nameplate_readings").update({ final_values: values, outcomes }).eq("id", id)
    if (error) console.error("[nameplate/confirm] 記録できない:", error.message)
    return NextResponse.json({ ok: true } satisfies NameplateConfirmResponse)
}
