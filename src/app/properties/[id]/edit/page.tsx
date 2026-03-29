import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import Link from "next/link"
import PropertyForm from "@/components/property-form"
import type { Property } from "@/types/database"

export default async function EditPropertyPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const supabase = await createClient()
    const { id } = await params

    const { data: property } = await supabase
        .from("properties")
        .select("*")
        .eq("id", id)
        .single()

    if (!property) {
        return notFound()
    }

    return (
        <main className="min-h-screen bg-gray-50 py-10">
            <div className="container mx-auto px-4">
                <div className="mb-6 max-w-4xl mx-auto">
                    <Link href="/properties" className="text-sm text-blue-600 hover:underline">
                        ← 物件一覧に戻る
                    </Link>
                    <h1 className="text-2xl font-bold text-slate-900 mt-2">物件情報の編集</h1>
                    <p className="text-slate-500 mt-1 text-sm">
                        登録済みの物件情報を編集して更新できます。
                    </p>
                </div>
                <PropertyForm property={property as Property} />
            </div>
        </main>
    )
}
