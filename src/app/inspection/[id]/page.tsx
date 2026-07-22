import { getAuthenticatedClient } from "@/lib/supabase/auth-server"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import SoukatsuPdfButton from "@/components/soukatsu-pdf-button"
import SoukatsuPdfPreview from "@/components/soukatsu-pdf-preview"
import StepIndicator from "@/components/step-indicator"
import { INSPECTION_STEPS } from "@/lib/inspection-steps"
import Breadcrumb from "@/components/breadcrumb"

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

    // 総括表の防火管理者欄=物件の防火管理者名。点検実施責任者(点検者氏名)はこの確認段階では未入力のため空。
    const { data: property } = report.property_id
        ? await supabase.from("properties").select("fire_manager_name").eq("id", report.property_id).single()
        : { data: null as { fire_manager_name: string | null } | null }
    const soukatsuData = { ...report, fire_manager: property?.fire_manager_name ?? "", inspector_responsible: "" }

    // 「次へ」の遷移先を決める。1報告書＝点検者一覧表(itiran)1本が正で、押すたび新規作成すると
    // itiran が二重生成される（過去のデータ破損の原因）。既存 itiran があればそのハブへ寄せ、
    // 無ければ従来どおり新規フォームへ。複数ある場合（過去の二重生成）は様式行が最多の本命へ
    // （複製の fallback と同じ inspection.itiran_form_count を使い、寄せ方を1箇所に統一）。
    const { data: itirans } = await supabase
        .from("inspection_itiran")
        .select("id")
        .eq("soukatsu_id", id)
    let nextItiranId: string | null = null
    if (itirans && itirans.length === 1) {
        nextItiranId = itirans[0].id as string
    } else if (itirans && itirans.length > 1) {
        const counts = await Promise.all(
            itirans.map(async (it) => {
                const { data } = await supabase.rpc("itiran_form_count", { p_itiran_id: it.id as string })
                return { id: it.id as string, count: (data as number) ?? 0 }
            }),
        )
        counts.sort((a, b) => b.count - a.count)
        nextItiranId = counts[0]?.id ?? (itirans[0].id as string)
    }
    const nextItiranHref = nextItiranId
        ? `/inspection/${id}/itiran/${nextItiranId}`
        : `/inspection/${id}/itiran`

    return (
        <div className="min-h-screen bg-gray-100 p-4 md:p-8">
            <div className="max-w-[210mm] mx-auto mb-6">
                <Breadcrumb items={[
                    { label: "点検", href: "/inspection" },
                    { label: report.building_name || "総括表", href: `/inspection/${id}` },
                    { label: "確認" },
                ]} />
                <StepIndicator steps={[...INSPECTION_STEPS]} currentStep={1} />
            </div>
            <div className="max-w-[210mm] mx-auto mb-6 flex justify-between items-center gap-3 flex-wrap">
                <Link href="/inspection" className="text-blue-600 hover:underline">
                    &larr; 物件選択に戻る
                </Link>
                <div className="flex gap-2 flex-wrap">
                    <SoukatsuPdfButton data={soukatsuData} />
                    <Link
                        href={nextItiranHref}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                        {nextItiranId ? "次へ: 点検者一覧表を確認" : "次へ: 点検者一覧表を入力"}
                        <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
            </div>

            <div className="max-w-[210mm] mx-auto">
                <SoukatsuPdfPreview data={soukatsuData} />
            </div>
        </div>
    )
}
