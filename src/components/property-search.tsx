"use client"

import { useMemo, useState } from "react"
import { Search, MapPin, User, ClipboardCheck } from "lucide-react"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import type { Property } from "@/types/database"
import PropertyActionButtons from "@/components/property-action-buttons"
import MapLink from "@/components/map-link"
import { withdrawnAtOf, type MatchLink } from "@/lib/match-withdrawn"
import NextInspectionBand from "@/components/next-inspection-band"
import { dueSortKey, type NextInspection } from "@/lib/next-inspection"
import { hasNotifierName } from "@/lib/property-notices"

interface PropertySearchProps {
    items: Property[]
    mode: "inspection" | "properties"
    /** 物件 ID → 次の点検（src/lib/next-inspection.ts・地図などの改善 7）。渡したときだけ帯と並べ替えを出す */
    due?: Record<string, NextInspection>
}

type SortKey = "due" | "new"
const SORTS: { key: SortKey; label: string }[] = [
    { key: "due", label: "点検が近い順" },
    { key: "new", label: "登録が新しい順" },
]

const ITEMS_PER_PAGE = 20

/**
 * 成約から作った物件で、成約が取り消されていないか（削除ボタンを出さない物件）。
 * ★Property の型（src/types/database.ts）には source_match_id / withdrawn_at が無い（一覧は select("*") で読んでいる）。
 *   出力画面（output/page.tsx）と同じく、この 2 列だけを絞って読む。
 */
const isFromActiveMatch = (property: Property): boolean => {
    const p = property as Property & { source_match_id?: string | null; withdrawn_at?: string | null }
    return Boolean(p.source_match_id) && !p.withdrawn_at
}

/** 成約が取り消された物件の印（src/lib/match-withdrawn.ts・総点検 B3）。点検を始める前に分かるように一覧にも出す。 */
function WithdrawnBadge({ property }: { property: Property }) {
    if (!withdrawnAtOf(property as MatchLink)) return null
    return (
        <span className="mt-1 inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
            成約取消・納品できません
        </span>
    )
}

export default function PropertySearch({ items, mode, due }: PropertySearchProps) {
    const [query, setQuery] = useState("")
    const [page, setPage] = useState(0)
    // ★点検の帯があるときは「点検が近い順」から（過ぎた物件がいちばん上）。並びはタップで切り替える
    const [sort, setSort] = useState<SortKey>(due ? "due" : "new")

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase()
        const hit = !q
            ? items
            : items.filter((item) =>
                [item.building_name, item.building_address, item.notifier_name].some(
                    (v) => typeof v === "string" && v.toLowerCase().includes(q)
                )
            )
        if (!due || sort === "new") return hit
        // ★安定ソート（同じ残り日数なら登録が新しい順のまま）
        return [...hit].sort((a, b) => {
            const ka = dueSortKey(due[a.id]), kb = dueSortKey(due[b.id])
            return ka === kb ? 0 : ka < kb ? -1 : 1
        })
    }, [items, query, due, sort])

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
            {due && (
                <div className="mb-4 flex gap-2" role="group" aria-label="並べ方">
                    {SORTS.map((o) => (
                        <button
                            key={o.key}
                            type="button"
                            aria-pressed={sort === o.key}
                            onClick={() => { setSort(o.key); setPage(0) }}
                            className={`min-h-11 flex-1 rounded-full border px-4 text-sm font-bold transition-colors sm:flex-none ${
                                sort === o.key
                                    ? "border-brand-600 bg-brand-600 text-white"
                                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                            }`}
                        >
                            {o.label}
                        </button>
                    ))}
                </div>
            )}
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
                        {/* ★次の点検（地図などの改善 7）。カードのいちばん上に置き、名前より先に目に入るように */}
                        {due && <NextInspectionBand next={due[property.id]} pickHref={`/properties/${property.id}#next-inspection`} className="mb-3" />}
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                            {mode === "properties" ? (
                                <Link href={`/properties/${property.id}`} className="min-w-0 sm:flex-1">
                                    <h2 className="text-lg font-bold text-slate-900 truncate hover:text-brand-600 transition-colors">
                                        {property.building_name}
                                    </h2>
                                    <WithdrawnBadge property={property} />
                                    <PropertyMeta property={property} />
                                    <EquipmentTags types={property.equipment_types ?? []} limit={5} />
                                </Link>
                            ) : (
                                <div className="min-w-0 sm:flex-1">
                                    <h2 className="text-lg font-bold text-slate-900 truncate">
                                        {property.building_name}
                                    </h2>
                                    <WithdrawnBadge property={property} />
                                    <PropertyMeta property={property} />
                                    <EquipmentTags types={property.equipment_types ?? []} />
                                </div>
                            )}
                            <div className="shrink-0 w-full sm:w-auto">
                                {mode === "inspection" ? (
                                    <Link
                                        href={`/inspection/new?propertyId=${property.id}`}
                                        className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 bg-cta-600 hover:bg-cta-700 text-white font-medium rounded-lg transition-colors whitespace-nowrap w-full sm:w-auto"
                                    >
                                        <ClipboardCheck className="w-4 h-4" />
                                        この物件で点検開始
                                    </Link>
                                ) : (
                                    <PropertyActionButtons
                                        propertyId={property.id}
                                        propertyName={property.building_name}
                                        fromActiveMatch={isFromActiveMatch(property)}
                                    />
                                )}
                            </div>
                        </div>
                        {/*
                          ★Google マップ（2026-09-22・吉田さんの要望）。現場へ向かうときに開く入口なのでここに。
                            ★カードの本体は Link なので、その外に置く（a の入れ子にしない）。
                            住所は RLS で本人しか読めない＝画面に住所が出る相手にだけ出ている。
                        */}
                        <MapLink prefecture={null} municipality={null} address={property.building_address} lat={property.location_lat} lng={property.location_lng} className="mt-3" />
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
                                        ? "bg-brand-600 text-white font-medium"
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
            <div className="flex items-center gap-1.5 min-w-0">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{property.building_address}</span>
            </div>
            {/* ★届出者が空なら行ごと出さない（成約から作った物件は空で入る・2026-11-12） */}
            {hasNotifierName(property) && (
                <div className="flex items-center gap-1.5 min-w-0">
                    <User className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{property.notifier_name}</span>
                </div>
            )}
        </div>
    )
}

function EquipmentTags({ types, limit }: { types: string[]; limit?: number }) {
    const shown = limit ? types.slice(0, limit) : types
    const colorClass = limit ? "bg-brand-50 text-brand-700" : "bg-emerald-50 text-emerald-700"
    return (
        <div className="mt-2 flex flex-wrap gap-1.5">
            {shown.map((eq) => (
                <span key={eq} className={`inline-block px-2 py-0.5 ${colorClass} text-xs rounded-full font-medium whitespace-nowrap`}>
                    {eq}
                </span>
            ))}
            {limit && types.length > limit && (
                <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-500 text-xs rounded-full whitespace-nowrap">
                    +{types.length - limit}種類
                </span>
            )}
        </div>
    )
}
