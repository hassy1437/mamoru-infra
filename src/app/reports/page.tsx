import { getAuthenticatedClient } from "@/lib/supabase/auth-server"
import Link from "next/link"
import { FileText } from "lucide-react"
import Breadcrumb from "@/components/breadcrumb"
import ReportList, { type ReportSummary } from "@/components/report-list"

// 横断的な報告書一覧(#3)。物件を経由せず自分の全報告書に到達できる唯一の入口。
export default async function ReportsPage() {
    const { supabase } = await getAuthenticatedClient()

    // ★invoker RPC を呼ぶだけ。UI 側で user_id フィルタは重ねない
    //   （認可は get_report_summaries の RLS に一元化＝二重に持たない）。
    //   孤児(property_id null)も含め last_activity_at 降順で返る。
    const { data } = await supabase.rpc("get_report_summaries")
    const reports = (data ?? []) as ReportSummary[]

    return (
        <main className="min-h-screen bg-gray-50 py-10">
            <div className="max-w-4xl mx-auto px-4">
                <Breadcrumb items={[
                    { label: "ツール", href: "/tool" },
                    { label: "報告書一覧" },
                ]} />
                <div className="mb-6">
                    <Link href="/tool" className="text-sm text-blue-600 hover:underline mb-2 block">
                        ← ツール選択に戻る
                    </Link>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <FileText className="w-7 h-7 text-emerald-600 shrink-0" />
                        点検報告書一覧
                        <span className="text-sm font-normal text-slate-400">{reports.length}件</span>
                    </h1>
                    <p className="text-slate-500 mt-1 text-sm">
                        すべての報告書を最終更新順に表示します。未完成の報告書もここから確認できます。
                    </p>
                </div>
                <ReportList reports={reports} />
            </div>
        </main>
    )
}
