import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import Link from "next/link"
import ItiranPdfButton from "@/components/itiran-pdf-button"
import ItiranPdfPreview from "@/components/itiran-pdf-preview"
import { ArrowRight, FileDown } from "lucide-react"
import { buildItiranInputHref, getItiranInputNextLabel, getNextItiranInputStep } from "@/lib/itiran-input-flow"

export default async function ItiranDetailPage({
    params,
}: {
    params: Promise<{ id: string; itiranId: string }>
}) {
    const supabase = await createClient()
    const { id, itiranId } = await params

    const { data: record } = await supabase.from("inspection_itiran").select("*").eq("id", itiranId).single()
    if (!record) return notFound()

    const { data: soukatsu } = await supabase
        .from("inspection_soukatsu")
        .select("building_name, property_id")
        .eq("id", id)
        .single()

    const { data: property } = soukatsu?.property_id
        ? await supabase.from("properties").select("equipment_types").eq("id", soukatsu.property_id).single()
        : { data: null as { equipment_types: unknown } | null }

    const nextStep = getNextItiranInputStep(null, property?.equipment_types)
    const nextHref = nextStep ? buildItiranInputHref(nextStep, id, itiranId) : null
    const nextLabel = nextStep ? getItiranInputNextLabel(nextStep) : null

    return (
        <div className="min-h-screen bg-gray-100 p-4 md:p-8">
            <div className="max-w-[210mm] mx-auto mb-6 flex justify-between items-center gap-3 flex-wrap">
                <Link href={`/inspection/${id}`} className="text-blue-600 hover:underline">
                    &larr; 総括表に戻る
                </Link>
                <div className="flex gap-2 flex-wrap">
                    <ItiranPdfButton data={record} buildingName={soukatsu?.building_name} />
                    <Link
                        href={`/inspection/${id}/itiran/${itiranId}/output`}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                        <FileDown className="w-4 h-4" />
                        結果出力
                    </Link>
                    {nextHref && nextLabel && (
                        <Link
                            href={nextHref}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                            {nextLabel}
                            <ArrowRight className="w-4 h-4" />
                        </Link>
                    )}
                </div>
            </div>

            <div className="max-w-[210mm] mx-auto">
                <ItiranPdfPreview data={record} />
            </div>
        </div>
    )
}
