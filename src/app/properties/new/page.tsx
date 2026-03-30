import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import PropertyForm from "@/components/property-form"
import type { Property } from "@/types/database"

export default async function NewPropertyPage({
    searchParams,
}: {
    searchParams: Promise<{ copyFrom?: string }>
}) {
    const { copyFrom } = await searchParams

    // 複製元の物件データを取得（copyFrom がある場合）
    let sourceProperty: Property | undefined
    if (copyFrom) {
        const supabase = await createClient()
        const { data } = await supabase
            .from("properties")
            .select("*")
            .eq("id", copyFrom)
            .single()
        if (data) {
            // IDを除外して新規作成扱いにする
            sourceProperty = { ...data, id: undefined } as unknown as Property
        }
    }

    return (
        <main className="min-h-screen bg-gray-50 py-10">
            <div className="container mx-auto px-4">
                <div className="mb-6 max-w-4xl mx-auto">
                    <Link href="/properties" className="text-sm text-blue-600 hover:underline">
                        ← 物件一覧に戻る
                    </Link>
                    <h1 className="text-2xl font-bold text-slate-900 mt-2">
                        {sourceProperty ? "物件の複製" : "物件基本情報の登録"}
                    </h1>
                    <p className="text-slate-500 mt-1 text-sm">
                        {sourceProperty
                            ? "複製元の情報を転記しました。必要に応じて修正してください。"
                            : "届出者情報・建物情報・設置されている消防用設備等を登録します。"
                        }
                    </p>
                </div>
                <PropertyForm property={sourceProperty} />
            </div>
        </main>
    )
}
