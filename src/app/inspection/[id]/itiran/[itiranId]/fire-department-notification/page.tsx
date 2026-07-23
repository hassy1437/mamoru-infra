import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import FireDepartmentNotificationBekki13Form from "@/components/fire-department-notification-bekki13-form"
import { hasItiranInputStep, type ItiranInputStepId } from "@/lib/itiran-input-flow"
import ItiranFormNav from "@/components/itiran-form-nav"


const CURRENT_STEP_ID: ItiranInputStepId = "fire-department-notification"

export default async function FireDepartmentNotificationBekki13Page({
    params,
}: {
    params: Promise<{ id: string; itiranId: string }>
}) {
    const { id, itiranId } = await params
    const supabase = await createClient()

    const { data: soukatsu } = await supabase
        .from("inspection_soukatsu")
        .select("id, property_id, building_name, building_address, notifier_name, inspection_date")
        .eq("id", id)
        .single()

    if (!soukatsu) return notFound()

    const { data: itiran } = await supabase
        .from("inspection_itiran")
        .select("inspector1")
        .eq("id", itiranId)
        .single()

    const { data: property } = soukatsu.property_id
        ? await supabase
            .from("properties")
            .select("equipment_types, fire_manager_name")
            .eq("id", soukatsu.property_id)
            .single()
        : { data: null as { equipment_types: unknown; fire_manager_name: string | null } | null }

    if (!hasItiranInputStep(CURRENT_STEP_ID, property?.equipment_types)) {
        return notFound()
    }


    const { data: saved } = await supabase
        .from("inspection_fire_department_notification_bekki13")
        .select("payload, updated_at")
        .eq("itiran_id", itiranId)
        .maybeSingle()

    const inspector1 = (itiran?.inspector1 as { name?: string } | null) ?? null

    return (
        <main className="min-h-screen bg-gray-100 py-8">
            <div className="max-w-6xl mx-auto px-4">
                <ItiranFormNav
                    soukatsuId={id}
                    itiranId={itiranId}
                    currentStepId={CURRENT_STEP_ID}
                    equipmentTypes={property?.equipment_types}
                />

                <FireDepartmentNotificationBekki13Form
                    initial={{
                        building_name: soukatsu.building_name,
                        building_address: soukatsu.building_address,
                        notifier_name: soukatsu.notifier_name,
                        fire_manager_name: property?.fire_manager_name ?? null,
                        inspector_name: inspector1?.name ?? "",
                        inspection_date: soukatsu.inspection_date,
                    }}
                    soukatsuId={id}
                    itiranId={itiranId}
                    propertyId={soukatsu.property_id}
                    savedPayload={(saved?.payload as Record<string, unknown> | null) ?? null}
                    savedUpdatedAt={saved?.updated_at ?? null}
                />
            </div>
        </main>
    )
}
