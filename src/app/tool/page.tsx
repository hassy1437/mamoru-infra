import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight, Building, ClipboardCheck, Settings, Wrench, Clock, FileText, Users } from "lucide-react"
import LogoutButton from "@/components/logout-button"
import { InstallPrompt } from "@/components/install-prompt"
import { createClient } from "@/lib/supabase/server"

type RecentInspection = {
  id: string
  buildingName: string
  inspectionDate: string | null
  inspectionType: string | null
  isClone: boolean
}

export default async function ToolPage() {
  let recentInspections: RecentInspection[] = []
  let propertyCount = 0
  let inspectionCount = 0

  try {
    const supabase = await createClient()

    // 報告書の幹は inspection_soukatsu（旧 v1 の "inspections" テーブルは現行スキーマに存在しない）。
    // building_name は soukatsu の NOT NULL 列なので properties への join は不要（property_id は null 可）。
    // RLS(user_id=auth.uid()) で自分の物件/報告書だけが数えられる＝ダッシュボードとして正しい。
    //
    // ★並びは created_at 降順。限界: inspection_soukatsu に updated_at は無く、created_at は
    //   「着手した順」であって「最後に触った順」ではない。実作業は23の様式テーブル側で進み、そちらに
    //   updated_at がある。「7/1着手→7/20再開」の報告書はここで上位に来ない。真の「最終更新順」は
    //   様式 updated_at の集約が必要で、横断的な報告書一覧(#3)で本格対応する。
    // ★申し送り(#2 編集画面): soukatsu を編集可能にするなら inspection_soukatsu に updated_at 列を
    //   追加すること（「いつ直したか」＝監査要件＋この並びの精度向上）。今 updated_at が無いのは
    //   「幹は編集されない」前提の名残。
    const [inspRes, propCountRes, inspCountRes] = await Promise.all([
      supabase
        .from("inspection_soukatsu")
        // 複製判定は cloned_at に寄せる（deliver_report ゲートと同じ列＝将来のドリフト防止。
        // RPC が cloned_from/cloned_at を同一Txで立てるので実質同値だが、判定列は1つに統一する）。
        .select("id, building_name, inspection_date, inspection_type, created_at, cloned_at")
        .order("created_at", { ascending: false })
        .limit(3),
      supabase.from("properties").select("id", { count: "exact", head: true }),
      supabase.from("inspection_soukatsu").select("id", { count: "exact", head: true }),
    ])

    if (inspRes.data) {
      recentInspections = (inspRes.data as Record<string, unknown>[]).map((d) => ({
        id: d.id as string,
        buildingName: (d.building_name as string) || "無題の報告書",
        inspectionDate: (d.inspection_date as string | null) ?? null,
        inspectionType: (d.inspection_type as string | null) ?? null,
        isClone: !!d.cloned_at,
      }))
    }
    propertyCount = propCountRes.count ?? 0
    inspectionCount = inspCountRes.count ?? 0
  } catch {
    // DB errors should not crash the tool page
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      <div className="relative max-w-2xl w-full bg-white rounded-2xl shadow-xl border border-slate-100 p-10 md:p-16 text-center space-y-10 overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-indigo-600"></div>

        <div className="flex justify-center relative z-10">
          <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-5 rounded-xl shadow-lg shadow-blue-200/50 transform -rotate-6 hover:rotate-0 transition-transform duration-300">
            <Wrench className="w-14 h-14 text-white" strokeWidth={1.5} />
          </div>
        </div>

        <div className="space-y-5 relative z-10">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900 leading-tight">
            Mamoru Infra
            <span className="block text-xl md:text-2xl mt-2 text-blue-600 font-bold">
              消防設備点検・報告書作成ツール
            </span>
          </h1>
        </div>

        {/* Summary Cards */}
        <div className="relative z-10 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-left">
            <div className="flex items-center gap-2 mb-1">
              <Building className="w-4 h-4 text-blue-500" />
              <span className="text-xs font-medium text-slate-500">登録物件</span>
            </div>
            <div className="text-2xl font-extrabold text-slate-900">{propertyCount}</div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-left">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-medium text-slate-500">点検報告書</span>
            </div>
            <div className="text-2xl font-extrabold text-slate-900">{inspectionCount}</div>
          </div>
        </div>

        {/* Recent Inspections */}
        {recentInspections.length > 0 && (
          <div className="relative z-10 text-left">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-semibold text-slate-500">最近の点検</span>
            </div>
            <div className="space-y-2">
              {recentInspections.map((insp) => (
                <Link
                  key={insp.id}
                  // リンク先は総括表プレビュー(/inspection/[id])。詳細の「次へ」は既存 itiran があれば
                  // ハブへ寄る(判断1修正済み)ので実質2クリック。itiran 直行の1クリック化は #3 で検討。
                  href={`/inspection/${insp.id}`}
                  className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-sm transition-all hover:bg-blue-50 hover:border-blue-200 group"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-700 group-hover:text-blue-700 truncate">
                        {insp.buildingName}
                      </span>
                      {insp.isClone && (
                        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                          複製
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                      {insp.inspectionType && <span>{insp.inspectionType}</span>}
                      {insp.inspectionDate && (
                        <span>{new Date(insp.inspectionDate).toLocaleDateString("ja-JP")}</span>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 shrink-0 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" />
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-5 justify-center items-center relative z-10 pt-4">
          <Link href="/properties" className="w-full group">
            <Button size="lg" className="w-full text-lg px-10 py-7 gap-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 rounded-xl font-bold">
              <Building className="w-6 h-6" />
              物件基本情報の入力
              <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>

          <Link href="/inspection" className="w-full group">
            <Button size="lg" className="w-full text-lg px-10 py-7 gap-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 rounded-xl font-bold">
              <ClipboardCheck className="w-6 h-6" />
              消防設備点検スタート
              <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>

          <Link href="/tool/equipment-settings" className="w-full group">
            <Button size="lg" variant="outline" className="w-full text-base px-10 py-6 gap-3 border-slate-300 hover:bg-slate-50 hover:-translate-y-0.5 transition-all duration-300 rounded-xl font-medium text-slate-600">
              <Settings className="w-5 h-5" />
              設備出力設定
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>

          <Link href="/inspectors" className="w-full group">
            <Button size="lg" variant="outline" className="w-full text-base px-10 py-6 gap-3 border-slate-300 hover:bg-slate-50 hover:-translate-y-0.5 transition-all duration-300 rounded-xl font-medium text-slate-600">
              <Users className="w-5 h-5" />
              点検者マスタ
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
        </div>

        <div className="absolute -top-20 -right-20 w-64 h-64 bg-blue-50 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob"></div>
        <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-indigo-50 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-2000"></div>
      </div>
      <div className="mt-6">
        <LogoutButton />
      </div>
      <InstallPrompt />
    </main>
  )
}
