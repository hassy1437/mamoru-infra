"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
    Search, Calendar, Copy, Unlink, CheckCircle2, AlertTriangle, ClipboardCheck, ArrowRight,
} from "lucide-react"
import { Input } from "@/components/ui/input"

// get_report_summaries() の返り14列（invoker RPC・DB が唯一の真実源）。
export type ReportSummary = {
    id: string
    building_name: string
    inspection_type: string | null
    inspection_date: string | null
    overall_judgment: string | null
    cloned_at: string | null
    created_at: string | null
    property_id: string | null
    property_name: string | null
    has_itiran: boolean
    itiran_id: string | null
    form_type_count: number
    form_row_count: number
    last_activity_at: string | null
}

// ★ステージ導出は「1箇所」に集約（form_type_count>0 → 様式n件 / has_itiran → 点検者済 / else 総括表のみ）。
//   フィルタ・chip 表示の両方がこの1関数を使う（判定ロジックの二重化を作らない）。
type Stage = "soukatsu" | "itiran" | "forms"
function reportStage(r: ReportSummary): { key: Stage; label: string; cls: string } {
    if (r.form_type_count > 0)
        return { key: "forms", label: `様式${r.form_type_count}件`, cls: "bg-emerald-50 text-emerald-700" }
    if (r.has_itiran)
        return { key: "itiran", label: "点検者済", cls: "bg-blue-50 text-blue-700" }
    return { key: "soukatsu", label: "総括表のみ", cls: "bg-slate-100 text-slate-500" }
}

const ITEMS_PER_PAGE = 20

const fmtDate = (s: string | null) =>
    s ? new Date(s).toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" }) : "—"

type StageFilter = "all" | "incomplete" | "forms"

export default function ReportList({ reports }: { reports: ReportSummary[] }) {
    const [query, setQuery] = useState("")
    const [stageFilter, setStageFilter] = useState<StageFilter>("all")
    const [page, setPage] = useState(0)

    // reports は RPC が last_activity_at 降順で返す（既定ソート）。client は絞るだけで並べ替えない。
    // ★ステージ判定は reportStage() 1関数に一元化（フィルタも chip も同じ導出を使う）。
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase()
        return reports.filter((r) => {
            const hasForms = reportStage(r).key === "forms"
            if (stageFilter === "incomplete" && hasForms) return false
            if (stageFilter === "forms" && !hasForms) return false
            if (q) {
                const hay = [r.building_name, r.property_name].filter(Boolean).join(" ").toLowerCase()
                if (!hay.includes(q)) return false
            }
            return true
        })
    }, [reports, query, stageFilter])

    const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE)
    const safePage = Math.min(page, Math.max(0, totalPages - 1))
    const paginated = filtered.slice(safePage * ITEMS_PER_PAGE, (safePage + 1) * ITEMS_PER_PAGE)

    const resetPage = () => setPage(0)

    // 未完成件数（総括表のみ＋点検者済＝様式なし）をフィルタチップに出す。判定は reportStage() 経由。
    const incompleteCount = useMemo(
        () => reports.filter((r) => reportStage(r).key !== "forms").length,
        [reports]
    )

    if (reports.length === 0) {
        return (
            <div className="text-center py-20 bg-white rounded-xl border border-slate-200">
                <ClipboardCheck className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500 text-lg font-medium mb-1">まだ報告書がありません</p>
                <p className="text-slate-400 text-sm">物件を選んで点検を開始すると、ここに一覧されます。</p>
            </div>
        )
    }

    const filterBtn = (v: StageFilter, label: string) => (
        <button
            onClick={() => { setStageFilter(v); resetPage() }}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                stageFilter === v
                    ? "bg-blue-600 text-white border-blue-600 font-medium"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
        >
            {label}
        </button>
    )

    return (
        <>
            {/* 検索＋ステージフィルタ */}
            <div className="mb-4 space-y-3">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                        type="text"
                        value={query}
                        onChange={(e) => { setQuery(e.target.value); resetPage() }}
                        placeholder="建物名・物件名で検索..."
                        className="pl-10"
                    />
                    {query && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                            {filtered.length}件
                        </span>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {filterBtn("all", `すべて (${reports.length})`)}
                    {filterBtn("incomplete", `未完成 (${incompleteCount})`)}
                    {filterBtn("forms", "様式あり")}
                </div>
            </div>

            {/* 一覧 */}
            <div className="space-y-3">
                {filtered.length === 0 && (
                    <p className="text-center py-10 text-slate-400 text-sm">
                        条件に一致する報告書がありません。
                    </p>
                )}
                {paginated.map((r) => {
                    const stage = reportStage(r)
                    return (
                        <Link
                            key={r.id}
                            href={`/inspection/${r.id}`}
                            className="block bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-blue-200 transition-all group"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                    {/* 建物名＋バッジ */}
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h2 className="text-base font-bold text-slate-900 truncate group-hover:text-blue-700">
                                            {r.building_name}
                                        </h2>
                                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${stage.cls}`}>
                                            {stage.label}
                                        </span>
                                        {r.cloned_at && (
                                            <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                                                <Copy className="w-3 h-3" />複製
                                            </span>
                                        )}
                                        {!r.property_id && (
                                            <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-600">
                                                <Unlink className="w-3 h-3" />物件未紐付け
                                            </span>
                                        )}
                                    </div>
                                    {/* メタ: 点検日・種別・物件名 */}
                                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                                        <span className="inline-flex items-center gap-1">
                                            <Calendar className="w-3.5 h-3.5" />{fmtDate(r.inspection_date)}
                                        </span>
                                        {r.inspection_type && <span>{r.inspection_type}</span>}
                                        {r.property_id && r.property_name && (
                                            <span className="truncate">物件: {r.property_name}</span>
                                        )}
                                    </div>
                                    {/* 最終更新 */}
                                    <div className="mt-1 text-[11px] text-slate-400">
                                        最終更新 {fmtDate(r.last_activity_at)}
                                    </div>
                                </div>
                                {/* 右: 総合判定＋矢印 */}
                                <div className="shrink-0 flex flex-col items-end gap-2">
                                    {r.overall_judgment && (
                                        <span
                                            className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${
                                                r.overall_judgment === "適合"
                                                    ? "bg-green-50 text-green-700"
                                                    : "bg-red-50 text-red-700"
                                            }`}
                                        >
                                            {r.overall_judgment === "適合"
                                                ? <CheckCircle2 className="w-3.5 h-3.5" />
                                                : <AlertTriangle className="w-3.5 h-3.5" />}
                                            {r.overall_judgment}
                                        </span>
                                    )}
                                    <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" />
                                </div>
                            </div>
                        </Link>
                    )
                })}
            </div>

            {/* ページネーション（PropertySearch と同作法・20件/頁） */}
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
