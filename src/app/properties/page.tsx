import { getAuthenticatedClient } from "@/lib/supabase/auth-server"
import Link from "next/link"
import { Building2, Plus } from "lucide-react"
import type { Property } from "@/types/database"
import PropertySearch from "@/components/property-search"
import { loadNextInspections } from "@/lib/next-inspection"
import Breadcrumb from "@/components/breadcrumb"

export default async function PropertiesPage() {
    const { supabase } = await getAuthenticatedClient()
    const { data: properties } = await supabase
        .from("properties")
        .select("*")
        .order("created_at", { ascending: false })

    const list = (properties ?? []) as Property[]
    // ★次の点検まであと○日（地図などの改善 7）
    const due = list.length > 0 ? await loadNextInspections(supabase, list) : {}

    return (
        <main className="min-h-screen bg-canvas py-4 md:py-10">
            <div className="max-w-4xl mx-auto px-4">
                <Breadcrumb items={[{ label: "物件一覧" }]} />
                {/* ヘッダー */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
                    <div className="min-w-0">
                        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                            <Building2 className="w-7 h-7 text-brand-600 shrink-0" />
                            物件一覧
                        </h1>
                        <p className="lead-note mt-0.5">登録済みの物件から点検を開始できます。</p>
                    </div>
                    <Link
                        href="/properties/new"
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 w-full sm:w-auto"
                    >
                        <Plus className="w-4 h-4" />
                        新規物件登録
                    </Link>
                </div>

                {/* 物件なし */}
                {list.length === 0 && (
                    <div className="text-center py-20 bg-white rounded-xl border border-slate-200">
                        <Building2 className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                        <p className="text-slate-500 text-lg font-medium mb-2">登録済みの物件がありません</p>
                        <p className="text-slate-400 text-sm mb-6">まず物件情報を登録してください。</p>
                        <Link
                            href="/properties/new"
                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-lg transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            物件を登録する
                        </Link>
                    </div>
                )}

                {/* 物件一覧（検索付き） */}
                {list.length > 0 && (
                    <PropertySearch items={list} mode="properties" due={due} />
                )}
            </div>
        </main>
    )
}
