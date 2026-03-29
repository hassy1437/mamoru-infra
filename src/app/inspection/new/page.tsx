import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import Link from "next/link"
import SoukatsuForm from "@/components/soukatsu-form"
import type { Property } from "@/types/database"

export default async function NewInspectionPage({
    searchParams,
}: {
    searchParams: Promise<{ propertyId?: string }>
}) {
    const supabase = await createClient()
    const { propertyId } = await searchParams

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
                        点検結果を入力して総括表を作成します。
                    </p>
                </div>
                <SoukatsuForm property={property as Property} />
            </div>
        </main>
    )
}
