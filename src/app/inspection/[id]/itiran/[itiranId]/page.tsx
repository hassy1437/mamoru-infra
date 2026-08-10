import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import Link from "next/link"
import ItiranPdfButton from "@/components/itiran-pdf-button"
import { canDownloadPdf, loadFinalizationState } from "@/lib/finalization"
import ItiranPdfPreviewCollapsible from "@/components/itiran-pdf-preview-collapsible"
import StepIndicator from "@/components/step-indicator"
import { INSPECTION_STEPS } from "@/lib/inspection-steps"
import Breadcrumb from "@/components/breadcrumb"
import { ArrowRight, CheckCircle2, Circle, FileDown, Pencil } from "lucide-react"
import { getEquipmentProgress } from "@/lib/inspection-progress"

export default async function ItiranDetailPage({
    params,
}: {
    params: Promise<{ id: string; itiranId: string }>
}) {
    const supabase = await createClient()
    const { id, itiranId } = await params

    // ★PDFゲート。確定の仕組みが使えないとき（未適用・判定失敗）は素通りさせる
    //   ＝ canDownloadPdf が fail-open。ここで止めると本番のPDF出力が止まる。
    const finalization = await loadFinalizationState(supabase, id)

    const { data: record } = await supabase.from("inspection_itiran").select("*").eq("id", itiranId).single()
    if (!record) return notFound()

    const { data: soukatsu } = await supabase
        .from("inspection_soukatsu")
        .select("building_name, property_id, cloned_at")
        .eq("id", id)
        .single()

    const { data: property } = soukatsu?.property_id
        ? await supabase.from("properties").select("equipment_types").eq("id", soukatsu.property_id).single()
        : { data: null as { equipment_types: unknown } | null }

    const { steps: progressSteps, completedCount, totalCount } = await getEquipmentProgress(
        supabase, itiranId, id, property?.equipment_types,
        (soukatsu?.cloned_at as string | null) ?? null
    )
    const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0
    // 複製由来の判定は cloned_at に統一（ゲート/未確認判定と同列。cloned_from は FK が
    // ON DELETE SET NULL で複製元削除時に NULL 化するため由来記録専用にし、判定には使わない）。
    const isClone = !!soukatsu?.cloned_at
    const unconfirmedCount = progressSteps.filter((s) => s.unconfirmed).length

    // ★主CTAの状態機械: 次の作業＝「未入力 or 未確認」の最初の様式（通常=未入力/複製=未確認を1式で拾う。
    //   要確認バッジと同じ first-unconfirmed を指すので整合）。無ければ完了→結果出力を主に。
    //   getNextItiranInputStep(null,…) は進捗を見ず常に先頭を返すので主CTAには使わない。
    const outputHref = `/inspection/${id}/itiran/${itiranId}/output`
    const nextAction = progressSteps.find((s) => !s.ready || s.unconfirmed)
    const isComplete = !nextAction
    const primaryCta = nextAction
        ? {
            href: nextAction.href,
            label: nextAction.ready
                ? `次の様式を確認: ${nextAction.title}`   // ready かつ未確認（複製）
                : `次の様式を入力: ${nextAction.title}`,  // 未入力（通常）
        }
        : { href: outputHref, label: "結果出力へ" }

    return (
        <div className="min-h-screen bg-gray-100 p-4 md:p-8">
            <div className="max-w-[210mm] mx-auto mb-6">
                <Breadcrumb items={[
                    { label: "点検", href: "/inspection" },
                    { label: "総括表", href: `/inspection/${id}` },
                    { label: "点検者", href: `/inspection/${id}/itiran/${itiranId}` },
                    { label: "別記入力" },
                ]} />
                <StepIndicator steps={[...INSPECTION_STEPS]} currentStep={3} />
            </div>
            <div className="max-w-[210mm] mx-auto mb-6 flex justify-between items-center gap-3 flex-wrap">
                <Link href={`/inspection/${id}`} className="text-blue-600 hover:underline">
                    &larr; 総括表に戻る
                </Link>
                {/* 補助アクション（小・弱く）。主動作は下の進捗カード上の主CTA1つに集約。 */}
                <div className="flex gap-2 flex-wrap">
                    <Link
                        href={`/inspection/${id}/itiran/${itiranId}/edit`}
                        className="inline-flex items-center gap-2 px-3 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-600 text-sm font-medium rounded-lg transition-colors"
                    >
                        <Pencil className="w-4 h-4" />
                        点検者を編集
                    </Link>
                    <ItiranPdfButton data={record} buildingName={soukatsu?.building_name} canDownload={canDownloadPdf(finalization)} />
                </div>
            </div>

            {/* 複製バナー: 各様式を開いて確認するよう促す */}
            {isClone && (
                <div className="max-w-[210mm] mx-auto mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4">
                    <p className="text-sm font-semibold text-amber-800">前回の報告書から複製された報告書です。</p>
                    <p className="text-sm text-amber-700 mt-1">
                        {unconfirmedCount > 0
                            ? `各様式を開いて内容を確認・更新してください（未確認 ${unconfirmedCount} 件）。全て確認すると納品できます。`
                            : "全ての様式を確認しました。結果出力から最終確認のうえ納品できます。"}
                    </p>
                </div>
            )}

            {/* ★主CTA（大・1つだけ）: 未入力/未確認があれば次の様式へ、無ければ結果出力へ。 */}
            <div className="max-w-[210mm] mx-auto mb-6">
                <Link
                    href={primaryCta.href}
                    className={`flex items-center justify-center gap-2 w-full px-6 py-4 rounded-xl text-white font-bold text-base shadow-sm transition-colors ${
                        isComplete ? "bg-blue-600 hover:bg-blue-700" : "bg-emerald-600 hover:bg-emerald-700"
                    }`}
                >
                    {isComplete && <FileDown className="w-5 h-5" />}
                    {primaryCta.label}
                    <ArrowRight className="w-5 h-5" />
                </Link>
                {!isComplete && (
                    <div className="mt-2 text-center">
                        <Link href={outputHref} className="text-sm text-slate-500 hover:text-slate-700 hover:underline">
                            先に結果出力を確認する →
                        </Link>
                    </div>
                )}
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
                                {step.unconfirmed && (
                                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                                        要確認
                                    </span>
                                )}
                                <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 shrink-0" />
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            <div className="max-w-[210mm] mx-auto">
                <ItiranPdfPreviewCollapsible data={record} />
            </div>
        </div>
    )
}
