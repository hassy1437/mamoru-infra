import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import Link from "next/link"
import { CheckCircle2, MinusCircle, Copy } from "lucide-react"
import CombinedPdfButton from "@/components/combined-pdf-button"
import { canDownloadPdf, loadFinalizationState } from "@/lib/finalization"
import DeliverReportButton, { type DeliveryStatus } from "@/components/deliver-report-button"
import StepIndicator from "@/components/step-indicator"
import { INSPECTION_STEPS } from "@/lib/inspection-steps"
import Breadcrumb from "@/components/breadcrumb"
import { PDF_MERGE_CONFIG, formTableToStep } from "@/lib/pdf-merge-config"
import { selectedSteps, buildItiranInputHref, getItiranInputPageTitle } from "@/lib/itiran-input-flow"
import type { ItiranInputStepId } from "@/lib/itiran-input-flow"

export default async function OutputPage({
    params,
}: {
    params: Promise<{ id: string; itiranId: string }>
}) {
    const supabase = await createClient()
    const { id, itiranId } = await params

    // ★PDFゲート。確定の仕組みが使えないとき（未適用・判定失敗）は素通りさせる
    //   ＝ canDownloadPdf が fail-open。ここで止めると本番のPDF出力が止まる。
    const finalization = await loadFinalizationState(supabase, id)

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
        ? await supabase.from("properties").select("equipment_types, fire_manager_name, source_match_id").eq("id", soukatsu.property_id).single()
        : { data: null as { equipment_types: unknown; fire_manager_name: string | null; source_match_id: string | null } | null }

    // マッチング由来（納品先オーナーが居る）物件のみ納品可能。source_match_id で判定する。
    // 納品状態は inspection.get_match_deliveries RPC で取得する（点検クライアントは
    // schema=inspection 固定で public.report_deliveries を直接 select できないため）。
    const sourceMatchId =
        (property as { source_match_id?: string | null } | null)?.source_match_id ?? null
    let deliveryStatus: DeliveryStatus | null = null
    if (sourceMatchId) {
        const { data: ds } = await supabase.rpc("get_match_deliveries", { p_match_id: sourceMatchId })
        deliveryStatus = (ds as DeliveryStatus | null) ?? null
    }

    // 複製由来か・未確認様式（★判定は unconfirmed_cloned_forms RPC 1箇所に集約＝ハブ/ゲートと一致）。
    // 複製由来の判定は cloned_at に統一（deliver_report ゲートと同列）。cloned_from_soukatsu_id は
    // FK が ON DELETE SET NULL で複製元削除時に NULL 化する＝由来の記録専用にし、判定には使わない。
    const isCloneReport = !!(soukatsu as { cloned_at?: string | null }).cloned_at
    const clonedAt = (soukatsu as { cloned_at?: string | null }).cloned_at ?? null
    const cloneConfirmedAt = (soukatsu as { clone_confirmed_at?: string | null }).clone_confirmed_at ?? null
    const clonePropertyId = (soukatsu as { property_id?: string | null }).property_id ?? null
    let unconfirmedForms: { table: string; title: string; href: string }[] = []
    if (clonedAt) {
        const { data: uc } = await supabase.rpc("unconfirmed_cloned_forms", {
            p_itiran_id: itiranId,
            p_cloned_at: clonedAt,
        })
        unconfirmedForms = ((uc as string[] | null) ?? [])
            .map((table) => {
                const step = formTableToStep(table)
                return step
                    ? { table, title: getItiranInputPageTitle(step), href: buildItiranInputHref(step, id, itiranId) }
                    : null
            })
            .filter((x): x is { table: string; title: string; href: string } => x !== null)
    }

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
    // 総括表(別記様式第2)の右ヘッダ: 防火管理者欄=物件の防火管理者名、点検実施責任者欄=点検者1の氏名。
    sanitizedSoukatsu.fire_manager = property?.fire_manager_name ?? ""
    sanitizedSoukatsu.inspector_responsible = (itiran.inspector1 as { name?: string } | null)?.name ?? ""
    const sanitizedBekkiPayloads = JSON.parse(JSON.stringify(bekkiPayloads))

    return (
        <div className="min-h-screen bg-gray-100 p-4 md:p-8">
            <div className="max-w-3xl mx-auto space-y-6">
                <Breadcrumb items={[
                    { label: "点検", href: "/inspection" },
                    { label: "総括表", href: `/inspection/${id}` },
                    { label: "別記", href: `/inspection/${id}/itiran/${itiranId}` },
                    { label: "PDF出力" },
                ]} />
                <StepIndicator steps={[...INSPECTION_STEPS]} currentStep={4} />

                <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                    <h1 className="text-xl font-bold">結果出力</h1>
                    <p className="text-sm text-slate-600">
                        以下のPDFを結合して一括ダウンロードします。
                    </p>

                    {/* 複製バッジ＋未確認様式一覧（納品ゲートの案内。最終確認チェックは納品セクション内） */}
                    {isCloneReport && (
                        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-2">
                            <p className="text-sm font-semibold text-amber-800">この報告書は前回から複製されています</p>
                            {unconfirmedForms.length > 0 ? (
                                <div className="text-sm text-amber-700">
                                    <p>未確認の様式（開いて保存すると確認済みになります）:</p>
                                    <ul className="mt-1 list-disc pl-5 space-y-1">
                                        {unconfirmedForms.map((u) => (
                                            <li key={u.table}>
                                                <Link href={u.href} className="text-amber-800 underline hover:text-amber-900">
                                                    {u.title}
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : (
                                <p className="text-sm text-amber-700">全ての様式を確認しました。納品セクションで最終確認のうえ納品してください。</p>
                            )}
                        </div>
                    )}

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
                            canDownload={canDownloadPdf(finalization)}
                            soukatsuData={sanitizedSoukatsu}
                            itiranData={sanitizedItiran}
                            bekkiPayloads={sanitizedBekkiPayloads}
                            applicableStepIds={applicableStepIds}
                            buildingName={soukatsu.building_name}
                            equipmentTypes={property?.equipment_types as string[] | undefined}
                        />
                    </div>

                    {sourceMatchId && (
                        <DeliverReportButton
                            canDeliver={canDownloadPdf(finalization)}
                            soukatsuData={sanitizedSoukatsu}
                            itiranData={sanitizedItiran}
                            bekkiPayloads={sanitizedBekkiPayloads}
                            applicableStepIds={applicableStepIds}
                            buildingName={soukatsu.building_name}
                            equipmentTypes={property?.equipment_types as string[] | undefined}
                            matchId={sourceMatchId}
                            itiranId={itiranId}
                            inspectionType={soukatsu.inspection_type as string}
                            inspectionDate={soukatsu.inspection_date as string}
                            status={deliveryStatus}
                            cloneMeta={
                                clonedAt
                                    ? {
                                          soukatsuId: id,
                                          clonedAt,
                                          cloneConfirmedAt,
                                          unconfirmedCount: unconfirmedForms.length,
                                      }
                                    : null
                            }
                        />
                    )}

                    {/* この報告書を複製（itiran を明示的に渡す＝事故の2本目でなくこの報告書を確実に複製）。
                        property_id が null（物件未紐付け）の報告書では新規作成に propertyId が要るため出さない。 */}
                    {clonePropertyId && (
                        <div className="pt-2 border-t border-slate-100">
                            <Link
                                href={`/inspection/new?propertyId=${clonePropertyId}&copyFrom=${id}&sourceItiran=${itiranId}`}
                                className="inline-flex items-center gap-2 text-sm text-teal-700 hover:text-teal-900 hover:underline"
                            >
                                <Copy className="w-4 h-4" />
                                この報告書を複製して次回点検を作成
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
