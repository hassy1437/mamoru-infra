import { getAuthenticatedClient } from "@/lib/supabase/auth-server"
import { notFound } from "next/navigation"
import Link from "next/link"
import { FireExtinguisher, Plus } from "lucide-react"
import Breadcrumb from "@/components/breadcrumb"
import MoreInfo from "@/components/more-info"
import ExtinguisherLedgerList from "@/components/extinguisher-ledger-list"
import {
    EXTINGUISHER_COLUMNS,
    EXTINGUISHER_KINDS,
    EXTINGUISHER_RULES,
    summarizeLedger,
    type ExtinguisherGroup,
} from "@/lib/extinguisher-ledger"
import { jstTodayYmd } from "@/lib/date-utils"

/**
 * 物件ごとの消火器の台帳（2026-10-30・docs/消火器の台帳_現状と設計案_20261030.md 案 A）。
 * ★表がまだ無い（DB の更新前）ときは「まだ使えません」と出す（落とさない）。
 */
export default async function ExtinguisherLedgerPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { supabase, user } = await getAuthenticatedClient()
    const { id } = await params

    const { data: property } = await supabase
        .from("properties")
        .select("id, building_name")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle()
    if (!property) return notFound()

    const { data, error } = await supabase
        .from("extinguisher_groups")
        .select(EXTINGUISHER_COLUMNS)
        .eq("property_id", id)
        .order("kind")
        .order("manufactured_year", { ascending: true, nullsFirst: false })
        .order("created_at")

    const list = (data ?? []) as ExtinguisherGroup[]
    const thisYear = Number(jstTodayYmd().slice(0, 4))
    const s = summarizeLedger(list, thisYear)
    const rules = EXTINGUISHER_RULES
    const kindCounts = EXTINGUISHER_KINDS.filter((k) => s.byKind[k.key] > 0).map((k) => `${k.label} ${s.byKind[k.key]}`)

    return (
        <main className="min-h-screen bg-gray-50 py-10">
            <div className="max-w-4xl mx-auto px-4 space-y-6">
                <Breadcrumb items={[
                    { label: "物件一覧", href: "/properties" },
                    { label: property.building_name as string, href: `/properties/${id}` },
                    { label: "消火器の台帳" },
                ]} />
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                            <FireExtinguisher className="w-7 h-7 text-blue-600 shrink-0" />
                            消火器の台帳
                        </h1>
                        <p className="text-slate-500 mt-1 text-sm">
                            1 回入れると年をまたいで残ります。{thisYear} 年の点検で何をするかを製造年から出します。
                        </p>
                    </div>
                    {!error && (
                        <Link
                            href={`/properties/${id}/extinguishers/new`}
                            className="inline-flex items-center justify-center gap-2 px-4 py-2 min-h-11 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 w-full sm:w-auto"
                        >
                            <Plus className="w-4 h-4" />
                            行を足す
                        </Link>
                    )}
                </div>

                {error && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
                        消火器の台帳はまだ使えません（準備中です）。第1 の点検票は今までどおり入れられます。
                    </div>
                )}

                {!error && list.length === 0 && (
                    <div className="text-center py-16 bg-white rounded-xl border border-slate-200 px-4">
                        <FireExtinguisher className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                        <p className="text-slate-500 text-lg font-medium mb-2">まだ消火器がありません</p>
                        <p className="text-slate-400 text-sm mb-6">同じ器種・方式・型式・製造年の消火器を 1 行にまとめ、本数を入れます。</p>
                        <Link
                            href={`/properties/${id}/extinguishers/new`}
                            className="inline-flex items-center gap-2 px-5 py-2.5 min-h-11 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            消火器を入れる
                        </Link>
                    </div>
                )}

                {!error && list.length > 0 && (
                    <>
                        <section aria-labelledby="ledger-summary" className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
                            <h2 id="ledger-summary" className="text-base font-bold text-slate-800">
                                {thisYear} 年の点検でのまとめ
                            </h2>
                            <p className="text-sm text-slate-600">
                                合計 <span className="font-bold text-slate-900">{s.total} 本</span>（{kindCounts.join("・")}）
                            </p>
                            <ul className="grid gap-2 text-sm sm:grid-cols-2">
                                <SummaryItem label="耐圧性能点検の対象" n={s.pressureTestDue} />
                                <SummaryItem
                                    label="内部・機能の点検の対象"
                                    n={s.internalCheckDue}
                                    extra={s.internalCheckUnknown > 0 ? `ほかに方式が分からない ${s.internalCheckUnknown} 本` : undefined}
                                />
                                <SummaryItem label="交換の目安を過ぎた" n={s.replacementPast} />
                                {s.noYear > 0 && <SummaryItem label="製造年が入っていない" n={s.noYear} />}
                            </ul>
                            <div className="text-xs text-slate-500">
                                <p>内部・機能の点検は対象を出すだけです。抜き取りの数は点検要領に沿って決めてください。</p>
                                <MoreInfo label="数え方">
                                    <p>
                                        耐圧性能点検: 製造年から {rules.pressureTestFirstYears} 年の年から。以後 {rules.pressureTestEveryYears} 年ごと（前回の年を入れた行）。
                                        二酸化炭素・ハロゲン化物は年数では出しません。
                                    </p>
                                    <p>
                                        内部・機能の点検: 加圧式は製造年から {rules.internalYears.pressurized} 年、蓄圧式は {rules.internalYears.stored} 年の年から。
                                        化学泡は設置後 {rules.internalYears.chemical} 年（台帳に設置年が無いので製造年で数えます）。
                                    </p>
                                    <p>
                                        交換の目安: 製造年から {rules.replacementGuideYears} 年（設計標準使用期限。法令ではなくメーカーの目安です）。
                                    </p>
                                    <p>外形の点検で腐食や安全栓の異常が見つかったものは、年数にかかわらず点検してください（この台帳では出しません）。</p>
                                </MoreInfo>
                            </div>
                        </section>
                        <ExtinguisherLedgerList items={list} thisYear={thisYear} />
                    </>
                )}
            </div>
        </main>
    )
}

function SummaryItem({ label, n, extra }: { label: string; n: number; extra?: string }) {
    return (
        <li className={`rounded-lg border px-3 py-2 ${n > 0 ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 text-slate-600"}`}>
            <span className="block text-xs">{label}</span>
            <span className="text-lg font-bold">{n} 本</span>
            {extra && <span className="block text-xs">{extra}</span>}
        </li>
    )
}
