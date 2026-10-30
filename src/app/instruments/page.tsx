import { getAuthenticatedClient } from "@/lib/supabase/auth-server"
import Link from "next/link"
import { Gauge, Plus } from "lucide-react"
import Breadcrumb from "@/components/breadcrumb"
import InstrumentList from "@/components/instrument-list"
import { INSTRUMENT_COLUMNS, type MeasuringInstrument } from "@/lib/measuring-instruments"
import { jstTodayYmd } from "@/lib/date-utils"

/**
 * 測定機器の台帳（2026-10-30・docs/銘板の転記_全様式_現状と設計案_20261030.md 案 A）。
 * ★表がまだ無い（DB の更新前）ときは「まだ使えません」と出す（落とさない）。
 */
export default async function InstrumentsPage() {
    const { supabase, user } = await getAuthenticatedClient()
    const { data, error } = await supabase
        .from("measuring_instruments")
        .select(INSTRUMENT_COLUMNS)
        .eq("user_id", user.id)
        .order("name")

    const list = (data ?? []) as MeasuringInstrument[]

    return (
        <main className="min-h-screen bg-gray-50 py-10">
            <div className="max-w-4xl mx-auto px-4">
                <Breadcrumb items={[{ label: "測定機器の台帳" }]} />
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
                    <div className="min-w-0">
                        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                            <Gauge className="w-7 h-7 text-blue-600 shrink-0" />
                            測定機器の台帳
                        </h1>
                        <p className="text-slate-500 mt-1 text-sm">
                            1 回登録すると、どの点検票の測定機器の表でも「台帳から選ぶ」で入ります。
                        </p>
                    </div>
                    {!error && (
                        <Link
                            href="/instruments/new"
                            className="inline-flex items-center justify-center gap-2 px-4 py-2 min-h-11 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 w-full sm:w-auto"
                        >
                            <Plus className="w-4 h-4" />
                            新規登録
                        </Link>
                    )}
                </div>

                {error && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
                        測定機器の台帳はまだ使えません（準備中です）。点検票の測定機器の表は、今までどおり手で入れられます。
                    </div>
                )}

                {!error && list.length === 0 && (
                    <div className="text-center py-20 bg-white rounded-xl border border-slate-200">
                        <Gauge className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                        <p className="text-slate-500 text-lg font-medium mb-2">登録済みの測定機器がありません</p>
                        <p className="text-slate-400 text-sm mb-6">絶縁抵抗計・加煙試験器など、点検に使う機器を登録してください。</p>
                        <Link
                            href="/instruments/new"
                            className="inline-flex items-center gap-2 px-5 py-2.5 min-h-11 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            測定機器を登録する
                        </Link>
                    </div>
                )}

                {!error && list.length > 0 && <InstrumentList items={list} today={jstTodayYmd()} />}
            </div>
        </main>
    )
}
