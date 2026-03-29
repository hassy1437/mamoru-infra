import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import SprinklerBekki3Form from "@/components/sprinkler-bekki3-form"
import {
    buildItiranInputHref,
    getItiranInputBackLabel,
    getItiranInputNextLabel,
    getItiranInputPageTitle,
    getNextItiranInputStep,
    getPrevItiranInputStep,
    hasItiranInputStep,
    type ItiranInputStepId,
} from "@/lib/itiran-input-flow"


const CURRENT_STEP_ID: ItiranInputStepId = "sprinkler"

export default async function SprinklerBekki3Page({
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
            .select("equipment_types")
            .eq("id", soukatsu.property_id)
            .single()
        : { data: null as { equipment_types: unknown } | null }

    if (!hasItiranInputStep(CURRENT_STEP_ID, property?.equipment_types)) {
        return notFound()
    }

    const prevStep = getPrevItiranInputStep(CURRENT_STEP_ID, property?.equipment_types)
    const nextStep = getNextItiranInputStep(CURRENT_STEP_ID, property?.equipment_types)

    const backHref = prevStep ? buildItiranInputHref(prevStep, id, itiranId) : `/inspection/${id}/itiran/${itiranId}`
    const backLabel = prevStep ? getItiranInputBackLabel(prevStep) : "\u70b9\u691c\u8005\u4e00\u89a7\u306b\u623b\u308b"
    const nextHref = nextStep ? buildItiranInputHref(nextStep, id, itiranId) : null
    const nextLabel = nextStep ? getItiranInputNextLabel(nextStep) : null

    const { data: saved } = await supabase
        .from("inspection_sprinkler_bekki3")
        .select("payload, updated_at")
        .eq("itiran_id", itiranId)
        .maybeSingle()

    const inspector1 = (itiran?.inspector1 as { name?: string } | null) ?? null

    return (
        <main className="min-h-screen bg-gray-100 py-8">
            <div className="max-w-6xl mx-auto px-4">
                <div className="mb-6">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <Link href={backHref} className="text-blue-600 hover:underline text-sm">
                            &larr; {backLabel}
                        </Link>
                        {nextHref && nextLabel ? (
                            <Link
                                href={nextHref}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
                            >
                                {nextLabel}
                                <ArrowRight className="w-4 h-4" />
                            </Link>
                        ) : (
                            <Link
                                href={`/inspection/${id}/itiran/${itiranId}/output`}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                            >
                                結果出力へ
                                <ArrowRight className="w-4 h-4" />
                            </Link>
                        )}
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900 mt-2">{getItiranInputPageTitle(CURRENT_STEP_ID)}</h1>
                </div>

                <SprinklerBekki3Form
                    initial={{
                        building_name: soukatsu.building_name,
                        building_address: soukatsu.building_address,
                        notifier_name: soukatsu.notifier_name,
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
