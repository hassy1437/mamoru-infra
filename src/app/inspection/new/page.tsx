import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import Link from "next/link"
import SoukatsuForm from "@/components/soukatsu-form"
import type { Property } from "@/types/database"

export default async function NewInspectionPage({
    searchParams,
}: {
    searchParams: Promise<{ propertyId?: string; copyFrom?: string }>
}) {
    const supabase = await createClient()
    const { propertyId, copyFrom } = await searchParams

    if (!propertyId) {
        return notFound()
    }

    const { data: property } = await supabase
        .from("properties")
        .select("*")
        .eq("id", propertyId)
        .single()

    if (!property) {
        return notFound()
    }

    // 前回コピー: copyFrom に soukatsu ID が指定されていたらそのデータを取得
    let previousData: Record<string, unknown> | null = null
    if (copyFrom) {
        const { data: prevSoukatsu } = await supabase
            .from("inspection_soukatsu")
            .select("equipment_results, overall_judgment, notes, inspection_type")
            .eq("id", copyFrom)
            .single()
        if (prevSoukatsu) {
            previousData = prevSoukatsu
        }
    }

    return (
        <main className="min-h-screen bg-gray-50 py-10">
            <div className="container mx-auto px-4">
                <div className="mb-6 max-w-4xl mx-auto">
                    <Link href="/inspection" className="text-sm text-blue-600 hover:underline">
                        ← 物件選択に戻る
                    </Link>
                    <h1 className="text-2xl font-bold text-slate-900 mt-2">
                        消防用設備等点検結果総括表
                    </h1>
                    <p className="text-slate-500 mt-1 text-sm">
                        {previousData
                            ? "前回の点検データをコピーしました。必要に応じて修正してください。"
                            : "点検結果を入力して総括表を作成します。"
                        }
                    </p>
                </div>
                <SoukatsuForm property={property as Property} previousData={previousData} />
            </div>
        </main>
    )
}
