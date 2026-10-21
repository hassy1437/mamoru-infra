import { getAuthenticatedClient } from "@/lib/supabase/auth-server"
import { notFound } from "next/navigation"
import Link from "next/link"
import { AlertTriangle, ArrowRight, Pencil } from "lucide-react"
import SoukatsuPdfButton from "@/components/soukatsu-pdf-button"
import SoukatsuPdfPreview from "@/components/soukatsu-pdf-preview"
import StepIndicator from "@/components/step-indicator"
import { INSPECTION_STEPS } from "@/lib/inspection-steps"
import Breadcrumb from "@/components/breadcrumb"
import FinalizeSoukatsuButton from "@/components/finalize-soukatsu-button"
import { canDownloadPdf, finalizeBlockNotice, FINALIZATION_ERROR_MESSAGE, loadFinalizationState, pdfGateMessage } from "@/lib/finalization"
import WithdrawnMatchNotice from "@/components/withdrawn-match-notice"
import { withdrawnAtOf } from "@/lib/match-withdrawn"
import { checkReportReadiness } from "@/lib/report-readiness"
import ReportReadinessBox from "@/components/report-readiness-box"
import DeleteSoukatsuButton from "@/components/delete-soukatsu-button"
import { soukatsuDeleteBlock } from "@/lib/soukatsu-delete"
import { pickMainItiranId } from "@/lib/report-resume"
import type { ReportSummary } from "@/components/report-list"

export default async function InspectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { supabase, user } = await getAuthenticatedClient()
    const { id } = await params

    const { data: report } = await supabase
        .from("inspection_soukatsu")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .single()

    if (!report) {
        return notFound()
    }

    // 総括表の防火管理者欄=物件の防火管理者名。点検実施責任者（点検者 1 の氏名）は点検者一覧表ができてから下で入れる。
    const { data: property } = report.property_id
        ? await supabase.from("properties").select("fire_manager_name, source_match_id, withdrawn_at").eq("id", report.property_id).single()
        : { data: null as { fire_manager_name: string | null; source_match_id: string | null; withdrawn_at: string | null } | null }
    // ★成約が取り消された物件（納品できない）。入力を始める前に分かるように出す（総点検 B3）
    const withdrawnAt = withdrawnAtOf(property)
    const soukatsuDataBase = { ...report, fire_manager: property?.fire_manager_name ?? "" }

    // ★確定の状態。マイグレーション（20260811090000）が未適用なら available:false が返り、
    //   確定の導線そのものを出さない（押せるのにエラーになるボタンを作らない）。
    const finalization = await loadFinalizationState(supabase, id)

    // 「次へ」の遷移先を決める。1報告書＝点検者一覧表(itiran)1本が正で、押すたび新規作成すると
    // itiran が二重生成される（過去のデータ破損の原因）。既存 itiran があればそのハブへ寄せ、
    // 無ければ従来どおり新規フォームへ。複数ある場合（過去の二重生成）は様式行が最多の本命へ
    // （複製の fallback と同じ inspection.itiran_form_count を使い、寄せ方を1箇所に統一）。
    const nextItiranId = await pickMainItiranId(supabase, id)
    const nextItiranHref = nextItiranId
        ? `/inspection/${id}/itiran/${nextItiranId}`
        : `/inspection/${id}/itiran`
    // ★点検実施責任者＝点検者一覧表の点検者 1 の氏名（出力の画面の総括表と同じ・録音 102）。
    //   以前はこの画面だけ常に空にしていて、点検者一覧表を入れたあとも、この画面の総括表 PDF（プレビュー・出力）では空欄だった
    const { data: itiranForName } = nextItiranId
        ? await supabase.from("inspection_itiran").select("inspector1").eq("id", nextItiranId).maybeSingle()
        : { data: null as { inspector1: unknown } | null }
    const soukatsuData = { ...soukatsuDataBase, inspector_responsible: (itiranForName?.inspector1 as { name?: string } | null)?.name ?? "" }

    // ★確定前の不備チェック（src/lib/report-readiness.ts・2026-10-19 打合せ #101）。
    //   見るのは総括表だけ（点検者一覧・別記は確定のあとに入れるのが普通なので、ここでは見ない・出力画面で見る）。
    //   ★空の必須があると確定のボタンを押せない。止めるのは画面だけで DB は止めない。
    const readiness = checkReportReadiness({ soukatsu: report })
    // ★削除できるか（src/lib/soukatsu-delete.ts）。確定・納品した点検は DB が止めるので、先にボタンを出さず理由を出す。
    //   納品の状態は報告書一覧と同じ get_report_summaries から読む（public.report_deliveries はこのクライアントから直接読めない）
    const { data: summaries } = await supabase.rpc("get_report_summaries")
    const delivered = !!((summaries ?? []) as ReportSummary[]).find((s) => s.id === id)?.delivered_at
    const deleteBlock = soukatsuDeleteBlock({
        finalizedCount: finalization.available ? finalization.finalized.length : 0,
        delivered,
    })
    // 確定のボタンが出る状態か（確定済み・解約・契約なしならボタンの代わりに別の表示になる）
    const finalizeButtonShown = finalization.available
        && finalization.finalized.length === 0
        && !!finalization.preview
        && !finalizeBlockNotice(finalization.blockedSince, finalization.notContracted)

    return (
        <div className="min-h-screen bg-gray-100 p-4 md:p-8">
            <div className="max-w-[210mm] mx-auto mb-6">
                <Breadcrumb items={[
                    { label: "点検", href: "/inspection" },
                    { label: report.building_name || "総括表", href: `/inspection/${id}` },
                    { label: "確認" },
                ]} />
                <StepIndicator steps={[...INSPECTION_STEPS]} currentStep={1} />
                <WithdrawnMatchNotice withdrawnAt={withdrawnAt} className="mt-4" />
            </div>
            <div className="max-w-[210mm] mx-auto mb-6 flex justify-between items-center gap-3 flex-wrap">
                {/* ★物件から始めた点検は物件へ戻る（2026-10-21）。以前は「物件選択に戻る」で、点検を始める画面（物件の一覧）へ戻っていた */}
                <Link href={report.property_id ? `/properties/${report.property_id}` : "/inspection"} className="text-blue-600 hover:underline inline-flex min-h-11 items-center">
                    &larr; {report.property_id ? "物件に戻る" : "物件選択に戻る"}
                </Link>
                <div className="flex gap-2 flex-wrap">
                    <Link
                        href={`/inspection/${id}/edit`}
                        className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-600 text-sm font-medium rounded-lg transition-colors"
                    >
                        <Pencil className="w-4 h-4" />
                        編集
                    </Link>
                    <SoukatsuPdfButton data={soukatsuData} canDownload={canDownloadPdf(finalization)} gateMessage={pdfGateMessage(finalization)} />
                    <Link
                        href={nextItiranHref}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                        {nextItiranId ? "次へ: 点検票の入力" : "次へ: 点検者一覧表を入力"}
                        <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
            </div>

            {/* ★プレビューを確定より先に出す（何を確定するかを見てから押す・2026-10-19 打合せ #101）。
                 以前は確定のボタンがプレビューの上にあり、内容を見る前に押せる並びだった */}
            <div className="max-w-[210mm] mx-auto mb-6">
                <SoukatsuPdfPreview data={soukatsuData} />
            </div>

            {/* ★確定前の確認（必須・注意）。確定のボタンのすぐ上に出す */}
            <div className="max-w-[210mm] mx-auto mb-6">
                <ReportReadinessBox
                    readiness={readiness}
                    ctx={{ soukatsuId: id, itiranId: nextItiranId, propertyId: report.property_id ?? null }}
                    mode={finalizeButtonShown ? "finalize" : "review"}
                />
            </div>

            {/* ★確定の導線。未適用（reason:"missing"）のときは何も出さない。 */}
            {/* ★読めなかった（reason:"error"）ときは黙って消さず、理由を出す（総点検 B5） */}
            {!finalization.available && finalization.reason === "error" && (
                <div className="max-w-[210mm] mx-auto mb-6">
                    <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
                        <p className="flex items-center gap-2 font-semibold">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            確定の状態を読み込めませんでした
                        </p>
                        <p className="mt-1 text-amber-700">{FINALIZATION_ERROR_MESSAGE}</p>
                    </div>
                </div>
            )}
            {finalization.available && (
                <div className="max-w-[210mm] mx-auto mb-6">
                    {/* ★いつ確定するか（2026-10-21・次に進む方法の洗い出し）。上の 1〜5 の段に確定が無く、ここで押すのか
                         最後に押すのかが分からなかった。確定はこの画面でも結果出力の画面でもできる（どちらでも同じ） */}
                    {finalization.finalized.length === 0 && finalizeBlockNotice(finalization.blockedSince, finalization.notContracted) === null && (
                        <p role="note" className="mb-3 rounded-lg border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-700">
                            <span className="font-semibold text-slate-900">確定はいつでも、ここか最後の「結果出力」の画面で行えます。</span>
                            確定すると PDF の出力と納品ができるようになります（押す前に金額を表示します）。
                            点検者一覧表と点検票（別記様式）は、確定の前でもあとでも入れられます。まだ入れていなければ、先に「次へ」で進めて構いません。
                        </p>
                    )}
                    <FinalizeSoukatsuButton
                        soukatsuId={id}
                        preview={finalization.preview}
                        finalized={finalization.finalized}
                        duplicates={finalization.duplicates}
                        blockedSince={finalization.blockedSince}
                        notContracted={finalization.notContracted}
                        identityChanged={finalization.identityChanged}
                        missingRequired={readiness.missing.map((m) => m.label)}
                    />
                </div>
            )}

            {/* ★下にも PDF と「次へ」（録音 102。上にしか無く、プレビューと確定を見たあと上へ戻っていた） */}
            <div className="max-w-[210mm] mx-auto mb-6 flex flex-wrap items-center justify-end gap-2">
                <SoukatsuPdfButton data={soukatsuData} canDownload={canDownloadPdf(finalization)} gateMessage={pdfGateMessage(finalization)} />
                <Link
                    href={nextItiranHref}
                    className="inline-flex min-h-11 items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                    {nextItiranId ? "次へ: 点検票の入力" : "次へ: 点検者一覧表を入力"}
                    <ArrowRight className="w-4 h-4" />
                </Link>
            </div>

            {/* ★間違えて始めた点検を消す（2026-10-20）。いちばん下に置く（確定・出力の導線と取り違えない） */}
            <div className="max-w-[210mm] mx-auto mb-6">
                <DeleteSoukatsuButton soukatsuId={id} buildingName={report.building_name ?? null} block={deleteBlock} />
            </div>
        </div>
    )
}
