import { getAuthenticatedClient } from "@/lib/supabase/auth-server"
import { notFound } from "next/navigation"
import Link from "next/link"
import InspectorMasterForm from "@/components/inspector-master-form"
import type { Inspector } from "@/types/database"

export default async function EditInspectorPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { supabase, user } = await getAuthenticatedClient()
    const { id } = await params

    const { data: inspector } = await supabase
        .from("inspectors")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .single()

    if (!inspector) {
        return notFound()
    }

    return (
        <main className="min-h-screen bg-gray-50 py-10">
            <div className="container mx-auto px-4">
                <div className="mb-6 max-w-4xl mx-auto">
                    <Link href="/inspectors" className="text-sm text-blue-600 hover:underline">
                        ← 点検者マスタに戻る
                    </Link>
                    <h1 className="text-2xl font-bold text-slate-900 mt-2">点検者の編集</h1>
                    <p className="text-slate-500 mt-1 text-sm">
                        登録済みの点検者情報を編集して更新できます。
                    </p>
                </div>
                <InspectorMasterForm inspector={inspector as Inspector} />
            </div>
        </main>
    )
}
