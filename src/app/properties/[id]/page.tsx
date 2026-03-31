import { getAuthenticatedClient } from "@/lib/supabase/auth-server"
import { notFound } from "next/navigation"
import Link from "next/link"
import {
    AlertTriangle,
    Building2,
    Calendar,
    CheckCircle2,
    ClipboardCheck,
    Copy,
    MapPin,
    Pencil,
    Plus,
    User,
} from "lucide-react"
import type { Property } from "@/types/database"
import Breadcrumb from "@/components/breadcrumb"

export default async function PropertyDetailPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { supabase, user } = await getAuthenticatedClient()
    const { id } = await params

    const { data: property } = await supabase
        .from("properties")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .single()

    if (!property) return notFound()

    const p = property as Property

    // 点検履歴を取得
    const { data: inspections } = await supabase
        .from("inspection_soukatsu")
        .select("id, inspection_date, inspection_type, overall_judgment, created_at")
        .eq("property_id", id)
        .order("inspection_date", { ascending: false })

    const history = inspections ?? []
    const latestInspectionId = history.length > 0 ? history[0].id : null

    return (
        <main className="min-h-screen bg-gray-50 py-10">
            <div className="max-w-4xl mx-auto px-4 space-y-6">
                <Breadcrumb items={[
                    { label: "物件一覧", href: "/properties" },
                    { label: p.building_name },
                ]} />
                {/* ヘッダー */}
                <div>
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                                <Building2 className="w-7 h-7 text-blue-600" />
                                {p.building_name}
                            </h1>
                            <div className="mt-2 space-y-1 text-sm text-slate-500">
                                <div className="flex items-center gap-1.5">
                                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                                    <span>{p.building_address}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <User className="w-3.5 h-3.5 shrink-0" />
                                    <span>{p.notifier_name}</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                            <Link
                                href={`/properties/${id}/edit`}
                                className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors"
                            >
                                <Pencil className="w-4 h-4" />
                                編集
                            </Link>
                            <Link
                                href={`/properties/new?copyFrom=${id}`}
                                className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors"
                            >
                                <Copy className="w-4 h-4" />
                                複製
                            </Link>
                        </div>
                    </div>
                </div>

                {/* 物件情報 */}
                <div className="bg-white rounded-xl border border-slate-200 p-6">
                    <h2 className="text-lg font-bold text-slate-800 mb-4">物件情報</h2>
                    <div className="grid md:grid-cols-2 gap-4 text-sm">
                        <div>
                            <span className="text-slate-500">用途</span>
                            <p className="font-medium text-slate-900">{p.building_usage || "—"}</p>
                        </div>
                        <div>
                            <span className="text-slate-500">構造</span>
                            <p className="font-medium text-slate-900">{p.building_structure || "—"}</p>
                        </div>
                        <div>
                            <span className="text-slate-500">階数</span>
                            <p className="font-medium text-slate-900">
                                {p.floor_above ? `地上${p.floor_above}階` : ""}
                                {p.floor_above && p.floor_below ? "・" : ""}
                                {p.floor_below ? `地下${p.floor_below}階` : ""}
                                {!p.floor_above && !p.floor_below ? "—" : ""}
                            </p>
                        </div>
                        <div>
                            <span className="text-slate-500">延べ面積</span>
                            <p className="font-medium text-slate-900">
                                {p.total_floor_area ? `${p.total_floor_area} m²` : "—"}
                            </p>
                        </div>
                    </div>
                    <div className="mt-4">
                        <span className="text-sm text-slate-500">設置設備</span>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                            {(p.equipment_types ?? []).map((eq) => (
                                <span
                                    key={eq}
                                    className="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full font-medium"
                                >
                                    {eq}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>

                {/* 点検アクション */}
                <div className="flex gap-3 flex-wrap">
                    <Link
                        href={`/inspection/new?propertyId=${id}`}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        新規点検を開始
                    </Link>
                    {latestInspectionId && (
                        <Link
                            href={`/inspection/new?propertyId=${id}&copyFrom=${latestInspectionId}`}
                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                        >
                            <Copy className="w-4 h-4" />
                            前回の点検からコピーして開始
                        </Link>
                    )}
                </div>

                {/* 点検履歴 */}
                <div className="bg-white rounded-xl border border-slate-200 p-6">
                    <h2 className="text-lg font-bold text-slate-800 mb-4">
                        点検履歴
                        {history.length > 0 && (
                            <span className="text-sm font-normal text-slate-400 ml-2">
                                {history.length}件
                            </span>
                        )}
                    </h2>

                    {history.length === 0 ? (
                        <div className="text-center py-8">
                            <ClipboardCheck className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                            <p className="text-slate-400 text-sm">まだ点検記録がありません。</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {history.map((inspection) => (
                                <Link
                                    key={inspection.id}
                                    href={`/inspection/${inspection.id}`}
                                    className="flex items-center justify-between gap-4 p-4 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                                        <div>
                                            <p className="text-sm font-medium text-slate-800">
                                                {inspection.inspection_date}
                                            </p>
                                            <p className="text-xs text-slate-500">
                                                {inspection.inspection_type}
                                            </p>
                                        </div>
                                    </div>
                                    {inspection.overall_judgment && (
                                        <span
                                            className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${
                                                inspection.overall_judgment === "適合"
                                                    ? "bg-green-50 text-green-700"
                                                    : "bg-red-50 text-red-700"
                                            }`}
                                        >
                                            {inspection.overall_judgment === "適合"
                                                ? <CheckCircle2 className="w-3.5 h-3.5" />
                                                : <AlertTriangle className="w-3.5 h-3.5" />
                                            }
                                            {inspection.overall_judgment}
                                        </span>
                                    )}
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </main>
    )
}
