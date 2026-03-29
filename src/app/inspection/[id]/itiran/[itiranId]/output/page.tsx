import { createClient } from "@supabase/supabase-js"
import { notFound } from "next/navigation"
import Link from "next/link"
import CombinedPdfButton from "@/components/combined-pdf-button"
import { selectedSteps } from "@/lib/itiran-input-flow"
import { PDF_MERGE_CONFIG } from "@/lib/pdf-merge-config"
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

    const { data: record } = await supabase.from("inspection_itiran").select("*").eq("id", itiranId).single()
    if (!record) return notFound()

    const { data: soukatsu } = await supabase
        .from("inspection_soukatsu")
        .select("*")
        .eq("id", id)
        .single()

    const { data: property } = soukatsu?.property_id
        ? await supabase.from("properties").select("equipment_types").eq("id", soukatsu.property_id).single()
        : { data: null as { equipment_types: unknown } | null }

    const steps = selectedSteps(property?.equipment_types)
    const bekkiPayloads: Record<string, Record<string, unknown>> = {}
    const bekkiStatus: { id: string; title: string; ready: boolean }[] = []

    await Promise.all(
        steps.map(async (step) => {
            const config = PDF_MERGE_CONFIG[step.id]
            const { data } = await supabase
                .from(config.dbTable)
                .select("payload")
                .eq("itiran_id", itiranId)
                .maybeSingle()
            const ready = !!data?.payload
            if (ready) {
                bekkiPayloads[step.id] = data.payload as Record<string, unknown>
            }
            bekkiStatus.push({ id: step.id, title: step.title, ready })
        })
    )

    // Sort by original step order
    bekkiStatus.sort((a, b) => {
        const aIdx = steps.findIndex((s) => s.id === a.id)
        const bIdx = steps.findIndex((s) => s.id === b.id)
        return aIdx - bIdx
    })

    const readyCount = bekkiStatus.filter((s) => s.ready).length
    const totalCount = bekkiStatus.length

    return (
        <div className="min-h-screen bg-gray-100 p-4 md:p-8">
            <div className="max-w-3xl mx-auto">
                <div className="mb-6">
                    <Link href={`/inspection/${id}/itiran/${itiranId}`} className="text-blue-600 hover:underline text-sm">
                        &larr; 点検者一覧に戻る
                    </Link>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8">
                    <h1 className="text-2xl font-bold text-slate-900 mb-2">結果出力</h1>
                    <p className="text-slate-600 mb-6">
                        {soukatsu?.building_name && (
                            <span className="font-medium text-slate-800">{soukatsu.building_name}</span>
                        )}
                        {soukatsu?.building_name && " の"}
                        点検結果報告書PDFを一括出力します。
                    </p>

                    <div className="mb-6">
                        <h2 className="text-sm font-semibold text-slate-700 mb-3">出力対象PDF一覧</h2>
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-2 text-sm">
                                <span className="text-green-600">&#10003;</span>
                                <span className="text-slate-700">消防用設備等点検結果報告書</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                                <span className="text-green-600">&#10003;</span>
                                <span className="text-slate-700">総括表</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                                <span className="text-green-600">&#10003;</span>
                                <span className="text-slate-700">点検者一覧表</span>
                            </div>
                            {bekkiStatus.map((item) => (
                                <div key={item.id} className="flex items-center gap-2 text-sm">
                                    {item.ready ? (
                                        <span className="text-green-600">&#10003;</span>
                                    ) : (
                                        <span className="text-gray-400">&#8212;</span>
                                    )}
                                    <span className={item.ready ? "text-slate-700" : "text-slate-400"}>
                                        {item.title}
                                    </span>
                                    {!item.ready && (
                                        <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">未入力</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {totalCount > 0 && readyCount < totalCount && (
                        <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                            {totalCount - readyCount}件の別記様式が未入力です。入力済みのもののみPDFに含まれます。
                        </div>
                    )}

                    <div className="flex gap-3 flex-wrap">
                        <CombinedPdfButton
                            soukatsuData={soukatsu ?? {}}
                            itiranData={record}
                            bekkiPayloads={bekkiPayloads}
                            applicableStepIds={steps.map((s) => s.id)}
                            buildingName={soukatsu?.building_name}
                            equipmentTypes={Array.isArray(property?.equipment_types) ? property.equipment_types as string[] : undefined}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}
