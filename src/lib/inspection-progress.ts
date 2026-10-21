import { PDF_MERGE_CONFIG } from "./pdf-merge-config"
import { selectedSteps } from "./itiran-input-flow"
import type { ItiranInputStepId } from "./itiran-input-flow"
// 型のみの import なので、next/headers への実行時依存は持ち込まない
import type { AppSupabaseClient } from "./supabase/server"

export type EquipmentProgress = {
    stepId: string
    title: string
    ready: boolean
    /** 複製後まだ開いて保存(=確認)していない様式。deliver_report ゲートと同じ判定を1箇所(RPC)から取る。 */
    unconfirmed: boolean
    /**
     * 判定が初期値の「良」のまま（「確かめました」を押していない・lib/bekki-default-good.ts）。
     * ★様式は開くだけで初期値つきで自動保存されるので、行があるだけでは「入れ終えた」と言えない（2026-10-21）
     */
    defaulted: boolean
    href: string
}

export async function getEquipmentProgress(
    supabase: AppSupabaseClient,
    itiranId: string,
    soukatsuId: string,
    equipmentTypes: unknown,
    // 複製由来なら soukatsu.cloned_at を渡す。null（通常作成）なら未確認判定はしない。
    clonedAt: string | null = null
): Promise<{ steps: EquipmentProgress[]; completedCount: number; totalCount: number }> {
    const steps = selectedSteps(equipmentTypes)

    // ★未確認の定義は unconfirmed_cloned_forms RPC 1箇所に集約（ハブ・output・deliver_report ゲートで一致）。
    let unconfirmedTables = new Set<string>()
    if (clonedAt) {
        const { data } = await supabase.rpc("unconfirmed_cloned_forms", {
            p_itiran_id: itiranId,
            p_cloned_at: clonedAt,
        })
        unconfirmedTables = new Set((data as string[] | null) ?? [])
    }

    const results = await Promise.allSettled(
        steps.map(async (step) => {
            const config = PDF_MERGE_CONFIG[step.id as ItiranInputStepId]
            const { data } = await supabase
                .from(config.dbTable)
                .select("id, defaulted:payload->judgments_defaulted")
                .eq("itiran_id", itiranId)
                .maybeSingle()
            const row = data as { id: string; defaulted?: unknown } | null
            // ★isJudgmentsDefaulted と同じく true（真偽値）だけを「初期値のまま」と読む
            return { ready: !!row, defaulted: row?.defaulted === true }
        })
    )

    const progressSteps: EquipmentProgress[] = steps.map((step, i) => {
        const config = PDF_MERGE_CONFIG[step.id as ItiranInputStepId]
        return {
            stepId: step.id,
            title: step.title,
            ready: results[i].status === "fulfilled" ? results[i].value.ready : false,
            unconfirmed: unconfirmedTables.has(config.dbTable),
            defaulted: results[i].status === "fulfilled" ? results[i].value.defaulted : false,
            href: `/inspection/${soukatsuId}/itiran/${itiranId}/${step.routeSegment}`,
        }
    })

    // ★「完了」は入れ終えたもの（行があり・初期値のままでなく・複製の未確認でない）
    const completedCount = progressSteps.filter((s) => s.ready && !s.defaulted && !s.unconfirmed).length
    return { steps: progressSteps, completedCount, totalCount: progressSteps.length }
}
