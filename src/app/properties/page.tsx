import { createClient } from "@supabase/supabase-js"
import Link from "next/link"
import { Building2, Plus, MapPin, User } from "lucide-react"
import type { Property } from "@/types/database"
import PropertyActionButtons from "@/components/property-action-buttons"

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default async function PropertiesPage() {
    const { data: properties } = await supabase
        .from("properties")
        .select("*")
        .order("created_at", { ascending: false })

    const list = (properties ?? []) as Property[]

    return (
        <main className="min-h-screen bg-gray-50 py-10">
            <div className="max-w-4xl mx-auto px-4">
                {/* ヘッダー */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <Link href="/tool" className="text-sm text-blue-600 hover:underline mb-2 block">
                            ← ツール選択に戻る
                        </Link>
                        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                            <Building2 className="w-7 h-7 text-blue-600" />
                            物件一覧
                        </h1>
                        <p className="text-slate-500 mt-1 text-sm">登録済みの物件から点検を開始できます。</p>
                    </div>
                    <Link
                        href="/properties/new"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
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
                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            物件を登録する
                        </Link>
                    </div>
                )}

                {/* 物件一覧 */}
                <div className="space-y-4">
                    {list.map((property) => (
                        <div
                            key={property.id}
                            className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                    <h2 className="text-lg font-bold text-slate-900 truncate">
                                        {property.building_name}
                                    </h2>
                                    <div className="mt-1.5 space-y-1 text-sm text-slate-500">
                                        <div className="flex items-center gap-1.5">
                                            <MapPin className="w-3.5 h-3.5 shrink-0" />
                                            <span className="truncate">{property.building_address}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <User className="w-3.5 h-3.5 shrink-0" />
                                            <span>{property.notifier_name}</span>
                                        </div>
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        {(property.equipment_types ?? []).slice(0, 5).map((eq) => (
                                            <span
                                                key={eq}
                                                className="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full font-medium"
                                            >
                                                {eq}
                                            </span>
                                        ))}
                                        {(property.equipment_types ?? []).length > 5 && (
                                            <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-500 text-xs rounded-full">
                                                +{(property.equipment_types ?? []).length - 5}種類
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <PropertyActionButtons
                                    propertyId={property.id}
                                    propertyName={property.building_name}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </main>
    )
}
