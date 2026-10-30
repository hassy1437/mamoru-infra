import { getAuthenticatedClient } from "@/lib/supabase/auth-server"
import { notFound } from "next/navigation"
import Link from "next/link"
import {
    AlertTriangle,
    ArrowRight,
    Building2,
    Calendar,
    CheckCircle2,
    ClipboardCheck,
    Copy,
    FireExtinguisher,
    MapPin,
    Pencil,
    Plus,
    User,
} from "lucide-react"
import type { Property } from "@/types/database"
import Breadcrumb from "@/components/breadcrumb"
import MapLink from "@/components/map-link"
import WithdrawnMatchNotice from "@/components/withdrawn-match-notice"
import { withdrawnAtOf, type MatchLink } from "@/lib/match-withdrawn"
import { loadItiranIds, resumeTarget } from "@/lib/report-resume"

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
    // ★成約が取り消された物件（納品できない・総点検 B3）。select("*") なので列は来ている（型に無いだけ）
    const withdrawnAt = withdrawnAtOf(property as MatchLink)

    // 点検履歴を取得
    const { data: inspections } = await supabase
        .from("inspection_soukatsu")
        .select("id, inspection_date, inspection_type, overall_judgment, created_at")
        .eq("property_id", id)
        .order("inspection_date", { ascending: false })

    const history = inspections ?? []
    const latestInspectionId = history.length > 0 ? history[0].id : null
    // ★点検履歴は、総括表の確認画面ではなく「続き」へ（点検者一覧表があれば点検票の一覧・src/lib/report-resume.ts）
    const itiranIds = await loadItiranIds(supabase, history.map((h) => h.id as string))
    // ★消火器の台帳（2026-10-30）は消火器のある物件だけ（設置設備が空の物件は分からないので出す）
    const equipment = p.equipment_types ?? []
    const showExtinguishers = equipment.length === 0 || equipment.includes("消火器")

    return (
        <main className="min-h-screen bg-gray-50 py-10">
            <div className="max-w-4xl mx-auto px-4 space-y-6">
                <Breadcrumb items={[
                    { label: "物件一覧", href: "/properties" },
                    { label: p.building_name },
                ]} />
                <WithdrawnMatchNotice withdrawnAt={withdrawnAt} />
                {/* ヘッダー */}
                <div>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                        <div className="min-w-0">
                            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
                                <Building2 className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600 shrink-0" />
                                <span className="truncate">{p.building_name}</span>
                            </h1>
                            <div className="mt-2 space-y-1 text-sm text-slate-500">
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                                    <span className="truncate">{p.building_address}</span>
                                    {/* ★Google マップ（2026-09-22）。住所は本人の物件のもの */}
                                    <MapLink prefecture={null} municipality={null} address={p.building_address} className="shrink-0" />
                                </div>
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <User className="w-3.5 h-3.5 shrink-0" />
                                    <span className="truncate">{p.notifier_name}</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2 shrink-0 w-full sm:w-auto">
                            <Link
                                href={`/properties/${id}/edit`}
                                className="flex-1 sm:flex-none inline-flex min-h-11 items-center justify-center gap-1.5 px-4 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
                            >
                                <Pencil className="w-4 h-4" />
                                編集
                            </Link>
                            <Link
                                href={`/properties/new?copyFrom=${id}`}
                                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
                            >
                                <Copy className="w-4 h-4" />
                                複製
                            </Link>
                        </div>
                    </div>
                </div>

                {/* ★次にやること（点検を始める・作りかけの続き）を物件情報より上に（2026-10-21・次に進む方法の洗い出し）。
                     以前は物件情報の下（iPhone で 2 画面目）にあり、上には「編集」「複製」しか見えなかった */}
                <div className="space-y-3">
                    {history.length > 0 && (() => {
                        const t = resumeTarget(history[0].id as string, itiranIds.get(history[0].id as string))
                        return (
                            <Link
                                href={t.href}
                                className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 transition-colors hover:bg-blue-100"
                            >
                                <span className="min-w-0">
                                    <span className="block font-semibold">いちばん新しい報告書（点検日 {history[0].inspection_date ?? "未入力"}）</span>
                                    <span className="block text-xs text-blue-700">{t.stage}</span>
                                </span>
                                <span className="inline-flex shrink-0 items-center gap-1 font-medium">
                                    {t.action}
                                    <ArrowRight className="h-4 w-4" />
                                </span>
                            </Link>
                        )
                    })()}
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        <Link
                            href={`/inspection/new?propertyId=${id}`}
                            className="inline-flex min-h-11 items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            新しい点検を始める
                        </Link>
                        {latestInspectionId && (
                            <Link
                                href={`/inspection/new?propertyId=${id}&copyFrom=${latestInspectionId}`}
                                className="inline-flex min-h-11 items-center justify-center gap-2 px-5 py-2.5 border border-blue-300 bg-white hover:bg-blue-50 text-blue-700 font-medium rounded-lg transition-colors"
                            >
                                <Copy className="w-4 h-4" />
                                前回の点検からコピーして始める
                            </Link>
                        )}
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

                {showExtinguishers && (
                    <Link
                        href={`/properties/${id}/extinguishers`}
                        className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 transition-colors hover:bg-slate-50"
                    >
                        <span className="flex min-w-0 items-center gap-3">
                            <FireExtinguisher className="h-5 w-5 shrink-0 text-blue-600" />
                            <span className="min-w-0">
                                <span className="block font-semibold text-slate-800">消火器の台帳</span>
                                <span className="block text-xs text-slate-500">製造年から、耐圧性能点検・内部と機能の点検の対象と交換の目安を出します</span>
                            </span>
                        </span>
                        <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                    </Link>
                )}

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
                                    href={resumeTarget(inspection.id as string, itiranIds.get(inspection.id as string)).href}
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
