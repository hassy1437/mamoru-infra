import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { NAMEPLATE_PROMPT_VERSION, nameplateAiEnabledFor, nameplateLiveModels } from "@/lib/nameplate-ai-config"
import { NAMEPLATE_PROVIDER_LABEL, buildNameplateConsensus } from "@/lib/nameplate-consensus"
import { readNameplateWithAll } from "@/lib/nameplate-server"
import { NAMEPLATE_UPLOAD_MAX_BYTES, type NameplatePurpose, type NameplateReadResponse } from "@/lib/nameplate-api"

/**
 * 銘板を撮って読む（2026-11-03・docs/銘板の読み取り_使いながら学ぶ_設計_20261103.md）。
 *   1. ログイン・スイッチ・写真の形を確かめる
 *   2. 読み取りの行を作る（★DB が月の上限を見る）→ 写真を置く → 3 社に同時に送る → 多数決 → 行に答えを書く
 * ★キーはサーバの環境変数だけ。返すのは多数決の結果と、どの会社が答えたかだけ（各社の生の答え・費用は返さない）。
 */
export const maxDuration = 60

const fail = (status: number, error: Extract<NameplateReadResponse, { ok: false }>["error"], message: string) =>
    NextResponse.json({ ok: false, error, message } satisfies NameplateReadResponse, { status })

export async function POST(req: Request) {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return fail(401, "unauthorized", "ログインし直してください。")
    if (!nameplateAiEnabledFor(process.env, user.id)) return fail(403, "disabled", "銘板の読み取りはいま使えません。")

    let form: FormData
    try {
        form = await req.formData()
    } catch {
        return fail(400, "bad_request", "写真を受け取れませんでした。")
    }
    const purpose = form.get("purpose")
    const photo = form.get("photo")
    if (purpose !== "instrument" && purpose !== "device") return fail(400, "bad_request", "使う所が分かりません。")
    if (!(photo instanceof Blob) || photo.type !== "image/jpeg" || photo.size === 0 || photo.size > NAMEPLATE_UPLOAD_MAX_BYTES) {
        return fail(400, "bad_request", "写真の形が違います。撮り直してください。")
    }

    // 2. 行を作る（★月の上限は DB が止める）
    const { data: created, error: createError } = await supabase
        .from("nameplate_readings")
        .insert({ purpose: purpose as NameplatePurpose, prompt_version: NAMEPLATE_PROMPT_VERSION })
        .select("id")
        .single()
    if (createError || !created) {
        if (createError?.message?.includes("NAMEPLATE_QUOTA")) return fail(429, "quota", "今月の読み取りは上限に達しました。手で入れてください。")
        console.error("[nameplate/read] 行を作れない:", createError?.message)
        return fail(500, "failed", "読み取りを始められませんでした。手で入れてください。")
    }
    const id = created.id as string

    const bytes = new Uint8Array(await photo.arrayBuffer())
    const path = `${user.id}/${id}.jpg`
    const { error: uploadError } = await supabase.storage.from("nameplate-photos").upload(path, bytes, { contentType: "image/jpeg", upsert: false })
    if (uploadError) {
        // ★写真が残らなくても読み取りは続ける（答え合わせの記録は残る）
        console.error("[nameplate/read] 写真を置けない:", uploadError.message)
    } else {
        await supabase.from("nameplate_readings").update({ photo_path: path }).eq("id", id)
    }

    const models = nameplateLiveModels(process.env)
    const results = await readNameplateWithAll(models, { base64: Buffer.from(bytes).toString("base64"), mediaType: "image/jpeg" })

    // ヒント（確かめ済みの製造者名）は形の確かめに使う。読めなければ使わない
    const { data: makersRows } = await supabase.rpc("nameplate_known_makers", { p_limit: 200 })
    const makers = Array.isArray(makersRows) ? makersRows.map((r: { maker: string }) => r.maker).filter(Boolean) : []
    const consensus = buildNameplateConsensus(results, { makers: makers.length >= 20 ? makers : undefined })

    const { error: saveError } = await supabase
        .from("nameplate_readings")
        .update({ ai_results: results, consensus })
        .eq("id", id)
    if (saveError) console.error("[nameplate/read] 答えを残せない:", saveError.message)

    const { data: quota } = await supabase.rpc("nameplate_quota")
    const q = Array.isArray(quota) ? quota[0] : quota
    const res: NameplateReadResponse = {
        ok: true,
        id,
        consensus,
        providers: results.map((r) => ({ provider: r.provider, label: NAMEPLATE_PROVIDER_LABEL[r.provider], ok: r.ok })),
        used: Number(q?.used) || 0,
        cap: Number(q?.cap) || 0,
    }
    if (consensus.voters === 0) {
        return fail(502, "failed", "読み取れませんでした。明るい所で銘板だけを写して、もう一度試すか、手で入れてください。")
    }
    return NextResponse.json(res)
}
