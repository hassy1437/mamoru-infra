import Link from "next/link"
import { ArrowRight, Clock } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { loadItiranIds, resumeTarget } from "@/lib/report-resume"

/**
 * 作りかけの報告書の「続きから」（ホーム・点検を始める画面・2026-10-21）。
 *
 * ■ なぜ
 *   以前は「最近の点検」が総括表の確認画面へ飛ぶだけで、どこまで進んだかも出ていなかった。
 *   点検を始める画面には作りかけの報告書が出ず、続きのつもりで「この物件で点検開始」を押して
 *   同じ物件の報告書を 2 つ作ってしまうことがあった。
 *
 * ■ 決まり
 *   ・並びは作った順（新しい順）。行き先と段階は src/lib/report-resume.ts（点検者一覧表の有無）
 *   ・読めないときは何も出さない（この欄が無くても先へ進める）
 */
export default async function ResumeReports({ limit = 3, showAllLink = true }: { limit?: number; showAllLink?: boolean }) {
    let rows: { id: string; building_name: string | null; inspection_date: string | null; inspection_type: string | null; cloned_at: string | null }[] = []
    let itiranIds = new Map<string, string>()
    try {
        const supabase = await createClient()
        const { data } = await supabase
            .from("inspection_soukatsu")
            .select("id, building_name, inspection_date, inspection_type, cloned_at")
            .order("created_at", { ascending: false })
            .limit(limit)
        rows = (data ?? []) as typeof rows
        itiranIds = await loadItiranIds(supabase, rows.map((r) => r.id))
    } catch {
        return null
    }
    if (rows.length === 0) return null

    return (
        <section aria-labelledby="resume-reports-title" className="text-left">
            <div className="mb-2 flex items-center justify-between gap-2">
                <h2 id="resume-reports-title" className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                    <Clock className="h-4 w-4 text-slate-400" />
                    続きから（最近の報告書）
                </h2>
                {showAllLink && (
                    <Link href="/reports" className="inline-flex min-h-11 shrink-0 items-center text-xs font-medium text-blue-600 hover:underline">
                        すべての報告書 →
                    </Link>
                )}
            </div>
            <ul className="space-y-2">
                {rows.map((r) => {
                    const t = resumeTarget(r.id, itiranIds.get(r.id))
                    return (
                        <li key={r.id}>
                            <Link
                                href={t.href}
                                className="group flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm transition-colors hover:border-blue-200 hover:bg-blue-50"
                            >
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="truncate font-medium text-slate-800 group-hover:text-blue-700">
                                            {r.building_name || "無題の報告書"}
                                        </span>
                                        {r.cloned_at && (
                                            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">複製</span>
                                        )}
                                    </div>
                                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                                        {r.inspection_type && <span>{r.inspection_type}</span>}
                                        {r.inspection_date && <span>{new Date(r.inspection_date).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}</span>}
                                        <span className="text-blue-700">・{t.stage}</span>
                                    </div>
                                </div>
                                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-blue-600">
                                    <span className="hidden sm:inline">{t.action}</span>
                                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                                </span>
                            </Link>
                        </li>
                    )
                })}
            </ul>
        </section>
    )
}
