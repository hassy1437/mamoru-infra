import { PDF_MERGE_CONFIG } from "./pdf-merge-config"
import type { ItiranInputStepId } from "./itiran-input-flow"
// 型のみの import なので、next/headers への実行時依存は持ち込まない
import type { AppSupabaseClient } from "./supabase/server"

/**
 * 点検票（別記）の保存内容を、様式ごとに読む（stepId → payload）。
 * ★まだ入れていない様式・読めなかった様式は入れない（呼ぶ側は「無い」を未入力として扱う）。
 * ★結果出力の画面と総括表の確認の画面（判定の食い違いを見るため・2026-11-08 定期テスト 21）で同じ読み方にする。
 */
export async function loadBekkiPayloads(
    supabase: AppSupabaseClient,
    itiranId: string,
    stepIds: readonly ItiranInputStepId[],
): Promise<Record<string, Record<string, unknown>>> {
    const results = await Promise.allSettled(
        stepIds.map(async (stepId) => {
            const { data } = await supabase
                .from(PDF_MERGE_CONFIG[stepId].dbTable)
                .select("payload")
                .eq("itiran_id", itiranId)
                .maybeSingle()
            return { stepId, payload: (data as { payload?: unknown } | null)?.payload }
        }),
    )
    const out: Record<string, Record<string, unknown>> = {}
    for (const r of results) {
        if (r.status === "fulfilled" && r.value.payload && typeof r.value.payload === "object") {
            out[r.value.stepId] = r.value.payload as Record<string, unknown>
        }
    }
    return out
}
