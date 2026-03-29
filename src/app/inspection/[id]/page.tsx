import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import SoukatsuPdfButton from "@/components/soukatsu-pdf-button"
import SoukatsuPdfPreview from "@/components/soukatsu-pdf-preview"

export default async function InspectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const supabase = await createClient()
    const { id } = await params

    const { data: report } = await supabase
        .from("inspection_soukatsu")
        .select("*")
        .eq("id", id)
        .single()

    if (!report) {
        return notFound()
    }

    return (
        <div className="min-h-screen bg-gray-100 p-4 md:p-8">
            <div className="max-w-[210mm] mx-auto mb-6 flex justify-between items-center gap-3 flex-wrap">
                <Link href="/tool" className="text-blue-600 hover:underline">
                    &larr; ツール選択に戻る
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
