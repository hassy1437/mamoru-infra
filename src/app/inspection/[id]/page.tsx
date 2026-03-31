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
                    <SoukatsuPdfButton data={report} />
                    <Link
                        href={`/inspection/${id}/itiran`}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                        次へ: 点検者一覧表を入力
                        <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
            </div>

            <div className="max-w-[210mm] mx-auto">
                <SoukatsuPdfPreview data={report} />
            </div>
        </div>
    )
}
