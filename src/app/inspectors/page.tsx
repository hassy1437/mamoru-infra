import { getAuthenticatedClient } from "@/lib/supabase/auth-server"
import Link from "next/link"
import { Users, Plus } from "lucide-react"
import type { Inspector } from "@/types/database"
import InspectorList from "@/components/inspector-list"
import Breadcrumb from "@/components/breadcrumb"

export default async function InspectorsPage() {
    const { supabase, user } = await getAuthenticatedClient()
    const { data: inspectors } = await supabase
        .from("inspectors")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })

    const list = (inspectors ?? []) as Inspector[]

    return (
        <main className="min-h-screen bg-gray-50 py-10">
            <div className="max-w-4xl mx-auto px-4">
                <Breadcrumb items={[{ label: "点検者マスタ" }]} />
                {/* ヘッダー */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
                    <div className="min-w-0">
                        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                            <Users className="w-7 h-7 text-blue-600 shrink-0" />
                            点検者マスタ
                        </h1>
                        <p className="text-slate-500 mt-1 text-sm">
                            点検者を事前登録すると、点検報告書の点検者欄にすばやく呼び出せます。
                        </p>
                    </div>
                    <Link
                        href="/inspectors/new"
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 w-full sm:w-auto"
                    >
                        <Plus className="w-4 h-4" />
                        新規登録
                    </Link>
                </div>

                {/* 点検者なし */}
                {list.length === 0 && (
                    <div className="text-center py-20 bg-white rounded-xl border border-slate-200">
                        <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                        <p className="text-slate-500 text-lg font-medium mb-2">登録済みの点検者がありません</p>
                        <p className="text-slate-400 text-sm mb-6">点検者を登録すると点検報告書で呼び出せます。</p>
                        <Link
                            href="/inspectors/new"
                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            点検者を登録する
                        </Link>
                    </div>
                )}

                {/* 点検者一覧 */}
                {list.length > 0 && <InspectorList items={list} />}
            </div>
        </main>
    )
}
