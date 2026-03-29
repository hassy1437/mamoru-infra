import { createClient } from "@supabase/supabase-js"
import { notFound } from "next/navigation"
import Link from "next/link"
import { CheckCircle2, MinusCircle } from "lucide-react"
import CombinedPdfButton from "@/components/combined-pdf-button"
import { PDF_MERGE_CONFIG } from "@/lib/pdf-merge-config"
import { selectedSteps } from "@/lib/itiran-input-flow"
import type { ItiranInputStepId } from "@/lib/itiran-input-flow"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

export default async function OutputPage({
    params,
}: {
    params: Promise<{ id: string; itiranId: string }>
}) {
    const { id, itiranId } = await params

    const { data: soukatsu } = await supabase
        .from("inspection_soukatsu")
        .select("*")
        .eq("id", id)
        .single()
    if (!soukatsu) return notFound()

    const { data: itiran } = await supabase
        .from("inspection_itiran")
        .select("*")
        .eq("id", itiranId)
        .single()
    if (!itiran) return notFound()

    const { data: property } = soukatsu.property_id
        ? await supabase.from("properties").select("equipment_types").eq("id", soukatsu.property_id).single()
        : { data: null as { equipment_types: unknown } | null }

    const applicableSteps = selectedSteps(property?.equipment_types)
    const applicableStepIds = applicableSteps.map((s) => s.id)

    // Fetch all bekki payloads in parallel
    const bekkiPayloads: Record<string, Record<string, unknown>> = {}
    const bekkiResults = await Promise.allSettled(
        applicableSteps.map(async (step) => {
            const config = PDF_MERGE_CONFIG[step.id as ItiranInputStepId]
            const { data } = await supabase
                .from(config.dbTable)
                .select("payload")
                .eq("itiran_id", itiranId)
                .single()
            return { stepId: step.id, payload: data?.payload }
        })
    )
    for (const result of bekkiResults) {
        if (result.status === "fulfilled" && result.value.payload) {
            bekkiPayloads[result.value.stepId] = result.value.payload as Record<string, unknown>
        }
    }

    const pdfList = [
        { label: "報告書（様式第１）", ready: true },
        { label: "総括表", ready: true },
        { label: "点検者一覧表", ready: true },
        ...applicableSteps.map((step) => ({
            label: step.title,
            ready: !!bekkiPayloads[step.id],
        })),
    ]

    const notReady = pdfList.filter((p) => !p.ready)

    // Sanitize data to avoid structured clone issues with server→client serialization
    const sanitizedSoukatsu = JSON.parse(JSON.stringify(soukatsu))
    const sanitizedItiran = JSON.parse(JSON.stringify(itiran))
    const sanitizedBekkiPayloads = JSON.parse(JSON.stringify(bekkiPayloads))

    return (
        <div className="min-h-screen bg-gray-100 p-4 md:p-8">
            <div className="max-w-3xl mx-auto space-y-6">
                <div className="flex justify-between items-center">
                    <Link href={`/inspection/${id}/itiran/${itiranId}`} className="text-blue-600 hover:underline">
                        &larr; 点検者一覧に戻る
                    </Link>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                    <h1 className="text-xl font-bold">結果出力</h1>
                    <p className="text-sm text-slate-600">
                        以下のPDFを結合して一括ダウンロードします。
                    </p>

                    <div className="space-y-2">
                        {pdfList.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-sm">
                                {item.ready ? (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                ) : (
                                    <MinusCircle className="w-4 h-4 text-slate-400 shrink-0" />
                                )}
                                <span className={item.ready ? "" : "text-slate-400"}>{item.label}</span>
                            </div>
                        ))}
                    </div>

                    {notReady.length > 0 && (
                        <p className="text-sm text-amber-600">
                            ※ 未入力の様式があります。入力済みの様式のみPDFに含まれます。
                        </p>
                    )}

                    <div className="pt-2">
                        <CombinedPdfButton
                            soukatsuData={sanitizedSoukatsu}
                            itiranData={sanitizedItiran}
                            bekkiPayloads={sanitizedBekkiPayloads}
                            applicableStepIds={applicableStepIds}
                            buildingName={soukatsu.building_name}
                            equipmentTypes={property?.equipment_types as string[] | undefined}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}
