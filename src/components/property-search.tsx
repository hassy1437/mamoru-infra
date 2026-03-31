"use client"

import { useMemo, useState } from "react"
import { Search, MapPin, User, ClipboardCheck } from "lucide-react"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import type { Property } from "@/types/database"
import PropertyActionButtons from "@/components/property-action-buttons"

interface PropertySearchProps {
    items: Property[]
    mode: "inspection" | "properties"
}

const ITEMS_PER_PAGE = 20

export default function PropertySearch({ items, mode }: PropertySearchProps) {
    const [query, setQuery] = useState("")
    const [page, setPage] = useState(0)

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase()
        if (!q) return items
        return items.filter((item) =>
            [item.building_name, item.building_address, item.notifier_name].some(
                (v) => typeof v === "string" && v.toLowerCase().includes(q)
            )
        )
    }, [items, query])

    // Derive page from filtered results; clamp page to valid range
    const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE)
    const safePage = Math.min(page, Math.max(0, totalPages - 1))
    const paginated = filtered.slice(safePage * ITEMS_PER_PAGE, (safePage + 1) * ITEMS_PER_PAGE)

    return (
        <>
            <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                    type="text"
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setPage(0) }}
                    placeholder="建物名・住所で検索..."
                    className="pl-10"
                />
                {query && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                        {filtered.length}件
                    </span>
                )}
            </div>
            <div className="space-y-4">
                {filtered.length === 0 && (
                    <p className="text-center py-10 text-slate-400 text-sm">
                        検索条件に一致する物件がありません。
                    </p>
                )}
                {paginated.map((property) => (
                    <div
                        key={property.id}
                        className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow"
                    >
                        <div className="flex items-start justify-between gap-4">
                            {mode === "properties" ? (
                                <Link href={`/properties/${property.id}`} className="flex-1 min-w-0">
                                    <h2 className="text-lg font-bold text-slate-900 truncate hover:text-blue-600 transition-colors">
                                        {property.building_name}
                                    </h2>
                                    <PropertyMeta property={property} />
                                    <EquipmentTags types={property.equipment_types ?? []} limit={5} />
                                </Link>
                            ) : (
                                <div className="flex-1 min-w-0">
                                    <h2 className="text-lg font-bold text-slate-900 truncate">
                                        {property.building_name}
                                    </h2>
                                    <PropertyMeta property={property} />
                                    <EquipmentTags types={property.equipment_types ?? []} />
                                </div>
                            )}
                            <div className="shrink-0">
                                {mode === "inspection" ? (
                                    <Link
                                        href={`/inspection/new?propertyId=${property.id}`}
                                        className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors whitespace-nowrap"
                                    >
                                        <ClipboardCheck className="w-4 h-4" />
                                        この物件で点検開始
                                    </Link>
                                ) : (
                                    <PropertyActionButtons
                                        propertyId={property.id}
                                        propertyName={property.building_name}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* ページネーション */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-6 pt-4 border-t border-slate-200">
                    <button
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                        disabled={safePage === 0}
                        className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        前へ
                    </button>
                    <div className="flex items-center gap-1">
                        {Array.from({ length: totalPages }, (_, i) => (
                            <button
                                key={i}
                                onClick={() => setPage(i)}
                                className={`w-8 h-8 text-sm rounded-lg transition-colors ${
                                    i === safePage
                                        ? "bg-blue-600 text-white font-medium"
                                        : "hover:bg-slate-100 text-slate-600"
                                }`}
                            >
                                {i + 1}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                        disabled={safePage === totalPages - 1}
                        className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        次へ
                    </button>
                </div>
            )}
        </>
    )
}

function PropertyMeta({ property }: { property: Property }) {
    return (
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
    )
}

function EquipmentTags({ types, limit }: { types: string[]; limit?: number }) {
    const shown = limit ? types.slice(0, limit) : types
    const colorClass = limit ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"
    return (
        <div className="mt-2 flex flex-wrap gap-1.5">
            {shown.map((eq) => (
                <span key={eq} className={`inline-block px-2 py-0.5 ${colorClass} text-xs rounded-full font-medium`}>
                    {eq}
                </span>
            ))}
            {limit && types.length > limit && (
                <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-500 text-xs rounded-full">
                    +{types.length - limit}種類
                </span>
            )}
        </div>
    )
}
