import { PDF_MERGE_CONFIG } from "./pdf-merge-config"
import { selectedSteps } from "./itiran-input-flow"
import type { ItiranInputStepId } from "./itiran-input-flow"
import type { SupabaseClient } from "@supabase/supabase-js"

export type EquipmentProgress = {
    stepId: string
    title: string
    ready: boolean
    href: string
}

export async function getEquipmentProgress(
    supabase: SupabaseClient,
    itiranId: string,
    soukatsuId: string,
    equipmentTypes: unknown
): Promise<{ steps: EquipmentProgress[]; completedCount: number; totalCount: number }> {
    const steps = selectedSteps(equipmentTypes)

    const results = await Promise.allSettled(
        steps.map(async (step) => {
            const config = PDF_MERGE_CONFIG[step.id as ItiranInputStepId]
            const { data } = await supabase
                .from(config.dbTable)
                .select("id")
                .eq("itiran_id", itiranId)
                .maybeSingle()
            return !!data
        })
    )

    const progressSteps: EquipmentProgress[] = steps.map((step, i) => ({
        stepId: step.id,
        title: step.title,
        ready: results[i].status === "fulfilled" ? results[i].value : false,
        href: `/inspection/${soukatsuId}/itiran/${itiranId}/${step.routeSegment}`,
    }))

    const completedCount = progressSteps.filter((s) => s.ready).length
    return { steps: progressSteps, completedCount, totalCount: progressSteps.length }
}
