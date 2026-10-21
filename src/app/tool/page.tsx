import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight, Building, ClipboardCheck, Settings, Wrench, FileText, Users } from "lucide-react"
import LogoutButton from "@/components/logout-button"
import { InstallPrompt } from "@/components/install-prompt"
import { createClient } from "@/lib/supabase/server"
import ResumeReports from "@/components/resume-reports"

export default async function ToolPage() {
  let propertyCount = 0
  let inspectionCount = 0

  try {
    const supabase = await createClient()

    // RLS(user_id=auth.uid()) で自分の物件/報告書だけが数えられる＝ダッシュボードとして正しい。
    // ★最近の報告書は「続きから」（components/resume-reports.tsx）が引く（2026-10-21）
    const [propCountRes, inspCountRes] = await Promise.all([
      supabase.from("properties").select("id", { count: "exact", head: true }),
      supabase.from("inspection_soukatsu").select("id", { count: "exact", head: true }),
    ])

    propertyCount = propCountRes.count ?? 0
    inspectionCount = inspCountRes.count ?? 0
  } catch {
    // DB errors should not crash the tool page
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 md:p-6 bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      <div className="relative max-w-2xl w-full bg-white rounded-2xl shadow-xl border border-slate-100 p-6 md:p-16 text-center space-y-6 md:space-y-10 overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-indigo-600"></div>

        <div className="flex justify-center relative z-10">
          <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-3 md:p-5 rounded-xl shadow-lg shadow-blue-200/50 transform -rotate-6 hover:rotate-0 transition-transform duration-300">
            <Wrench className="w-8 h-8 md:w-14 md:h-14 text-white" strokeWidth={1.5} />
          </div>
        </div>

        <div className="space-y-2 md:space-y-5 relative z-10">
          <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight text-slate-900 leading-tight">
            Mamoru Infra
            <span className="block text-base md:text-2xl mt-1 md:mt-2 text-blue-600 font-bold">
              消防設備点検・報告書作成ツール
            </span>
          </h1>
        </div>

        {/* ★はじめに押すものを上に（2026-10-21・次に進む方法の洗い出し）。以前は件数と最近の点検の下にあり、
             iPhone では「物件基本情報の入力」「消防設備点検スタート」が最初の画面に入らなかった。
             名前も「物件基本情報の入力」（実際は物件の一覧）・「スタート」（実際は物件を選ぶ画面）で、何をする所か分かりにくかった */}
        <div className="relative z-10 flex flex-col gap-3">
          <Link href="/properties" className="w-full group">
            <Button size="lg" className="h-auto w-full justify-between gap-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-4 text-left font-bold shadow-md transition-all duration-300 hover:from-blue-700 hover:to-indigo-700 hover:shadow-lg">
              <span className="flex min-w-0 items-center gap-3">
                <Building className="h-6 w-6 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-lg">① 物件を登録する</span>
                  <span className="block whitespace-normal text-xs font-normal text-blue-100">建物の情報を入れる・登録した物件を見る</span>
                </span>
              </span>
              <ArrowRight className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-1" />
            </Button>
          </Link>

          <Link href="/inspection" className="w-full group">
            <Button size="lg" className="h-auto w-full justify-between gap-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-4 text-left font-bold shadow-md transition-all duration-300 hover:from-emerald-700 hover:to-teal-700 hover:shadow-lg">
              <span className="flex min-w-0 items-center gap-3">
                <ClipboardCheck className="h-6 w-6 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-lg">② 点検を始める</span>
                  <span className="block whitespace-normal text-xs font-normal text-emerald-50">物件を選んで、新しい報告書を作る</span>
                </span>
              </span>
              <ArrowRight className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-1" />
            </Button>
          </Link>

          {/* 報告書ができるまでの順番（各画面の上の 1〜5 と同じ） */}
          <p className="text-left text-xs leading-relaxed text-slate-500">
            点検の順番: 総括表 → 点検者一覧表 → 点検票（別記様式）→ 結果出力（確定・PDF・納品）
          </p>
        </div>

        <div className="relative z-10">
          <ResumeReports />
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

        <div className="relative z-10 flex flex-col gap-3">
          <Link href="/reports" className="w-full group">
            <Button size="lg" variant="outline" className="w-full text-base px-6 py-6 gap-3 border-slate-300 hover:bg-slate-50 transition-all duration-300 rounded-xl font-medium text-slate-600">
              <FileText className="w-5 h-5" />
              点検報告書一覧
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>

          <Link href="/tool/equipment-settings" className="w-full group">
            <Button size="lg" variant="outline" className="w-full text-base px-6 py-6 gap-3 border-slate-300 hover:bg-slate-50 transition-all duration-300 rounded-xl font-medium text-slate-600">
              <Settings className="w-5 h-5" />
              設備出力設定
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>

          <Link href="/inspectors" className="w-full group">
            <Button size="lg" variant="outline" className="w-full text-base px-6 py-6 gap-3 border-slate-300 hover:bg-slate-50 transition-all duration-300 rounded-xl font-medium text-slate-600">
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
