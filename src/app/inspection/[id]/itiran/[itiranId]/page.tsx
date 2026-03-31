import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import Link from "next/link"
import ItiranPdfButton from "@/components/itiran-pdf-button"
import ItiranPdfPreview from "@/components/itiran-pdf-preview"
import StepIndicator from "@/components/step-indicator"
import { INSPECTION_STEPS } from "@/lib/inspection-steps"
import { ArrowRight, CheckCircle2, Circle, FileDown } from "lucide-react"
import { buildItiranInputHref, getItiranInputNextLabel, getNextItiranInputStep } from "@/lib/itiran-input-flow"
import { getEquipmentProgress } from "@/lib/inspection-progress"

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

    const { steps: progressSteps, completedCount, totalCount } = await getEquipmentProgress(
        supabase, itiranId, id, property?.equipment_types
    )
    const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

    return (
        <div className="min-h-screen bg-gray-100 p-4 md:p-8">
            <div className="max-w-[210mm] mx-auto mb-6">
                <StepIndicator steps={[...INSPECTION_STEPS]} currentStep={3} />
            </div>
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

            {/* 設備入力の進捗ダッシュボード */}
            {totalCount > 0 && (
                <div className="max-w-[210mm] mx-auto mb-6 bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold text-slate-800">設備入力の進捗</h2>
                        <span className="text-sm font-medium text-slate-600">
                            {completedCount} / {totalCount} 完了
                        </span>
                    </div>

                    {/* プログレスバー */}
                    <div className="w-full bg-slate-100 rounded-full h-2.5">
                        <div
                            className="bg-emerald-500 h-2.5 rounded-full transition-all duration-300"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>

                    {/* 設備一覧 */}
                    <div className="space-y-1">
                        {progressSteps.map((step) => (
                            <Link
                                key={step.stepId}
                                href={step.href}
                                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors group"
                            >
                                {step.ready ? (
                                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                                ) : (
                                    <Circle className="w-5 h-5 text-slate-300 shrink-0" />
                                )}
                                <span className={`text-sm flex-1 ${step.ready ? "text-slate-700" : "text-slate-500"}`}>
                                    {step.title}
                                </span>
                                <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 shrink-0" />
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            <div className="max-w-[210mm] mx-auto">
                <ItiranPdfPreview data={record} />
            </div>
        </div>
    )
}
