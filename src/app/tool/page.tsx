import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight, Building, Building2, ChevronRight, ClipboardCheck, Settings, FileText, Users, Gauge } from "lucide-react"
import LogoutButton from "@/components/logout-button"
import { InstallPrompt } from "@/components/install-prompt"
import { createClient } from "@/lib/supabase/server"
import ResumeReports from "@/components/resume-reports"

export default async function ToolPage() {
  let propertyCount = 0
  let inspectionCount = 0

  try {
    const supabase = await createClient()

    // RLS（会社の人なら・20261231120000）で自分の会社の物件/報告書だけが数えられる＝ダッシュボードとして正しい。
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

  // ★ホーム（2026-11-11・橋本さん「緑をベースにかっこよく」）。
  //   上は深い緑の帯（名前と件数）。はじめに押す 2 つ（① 物件 ② 点検を始める＝オレンジ）を帯にかぶせて置き、
  //   そのほかは 1 枚の一覧にまとめた（以前は大きな枠のボタンを 5 つ縦に並べていて、スマホで場所を取っていた）。
  const menu = [
    { href: "/reports", icon: FileText, label: "点検報告書一覧", note: "作った報告書・PDF" },
    { href: "/inspectors", icon: Users, label: "点検者マスタ", note: "資格・免状" },
    { href: "/instruments", icon: Gauge, label: "測定機器の台帳", note: "校正年月日も" },
    { href: "/tool/equipment-settings", icon: Settings, label: "設備出力設定", note: "出す様式を選ぶ" },
    { href: "/company", icon: Building2, label: "会社と人", note: "同じ会社の人を招待" },
  ]
  return (
    <main className="min-h-screen bg-canvas pb-8">
      <section className="bg-gradient-to-br from-brand-800 via-brand-700 to-brand-900 text-white">
        <div className="mx-auto max-w-2xl px-4 pb-14 pt-5 md:pt-8">
          {/* ★名前は上の帯（components/app-header.tsx）にあるので、ここは「ホーム」だけ */}
          <h1 className="text-lg font-extrabold tracking-wide">ホーム</h1>
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <div className="rounded-xl bg-white/10 px-3.5 py-2.5 ring-1 ring-white/15">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-brand-100">
                <Building className="h-3.5 w-3.5" aria-hidden="true" />登録物件
              </div>
              <div className="text-2xl font-extrabold leading-tight">{propertyCount}</div>
            </div>
            <div className="rounded-xl bg-white/10 px-3.5 py-2.5 ring-1 ring-white/15">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-brand-100">
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />点検報告書
              </div>
              <div className="text-2xl font-extrabold leading-tight">{inspectionCount}</div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto -mt-9 max-w-2xl space-y-4 px-4">
        {/* ★はじめに押すものを上に（2026-10-21・次に進む方法の洗い出し） */}
        <div className="grid gap-2.5">
          <Link href="/properties" className="group w-full">
            <Button size="lg" className="h-auto w-full justify-between gap-3 rounded-xl bg-white px-4 py-3.5 text-left font-bold text-brand-800 shadow-md ring-1 ring-brand-100 hover:bg-brand-50">
              <span className="flex min-w-0 items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-700 text-white">
                  <Building className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-base">① 物件を登録する</span>
                  <span className="block whitespace-normal text-[11px] font-normal text-slate-500">建物の情報・登録した物件</span>
                </span>
              </span>
              <ArrowRight className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-1" />
            </Button>
          </Link>

          <Link href="/inspection" className="group w-full">
            <Button size="lg" className="h-auto w-full justify-between gap-3 rounded-xl bg-cta-600 px-4 py-3.5 text-left font-bold text-white shadow-md hover:bg-cta-700">
              <span className="flex min-w-0 items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/15">
                  <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-base">② 点検を始める</span>
                  <span className="block whitespace-normal text-[11px] font-normal text-cta-100">物件を選んで、新しい報告書を作る</span>
                </span>
              </span>
              <ArrowRight className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-1" />
            </Button>
          </Link>

          {/* 報告書ができるまでの順番（各画面の上の 1〜5 と同じ） */}
          <p className="lead-note px-1">
            点検の順番: 総括表 → 点検者一覧表 → 点検票（別記様式）→ 結果出力（確定・PDF・納品）
          </p>
        </div>

        <ResumeReports />

        <nav aria-label="そのほかの画面" className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
          {menu.map(({ href, icon: Icon, label, note }) => (
            <Link key={href} href={href} className="group flex min-h-14 items-center gap-3 border-b border-border px-4 py-2 last:border-b-0 hover:bg-brand-50">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold text-slate-800">{label}</span>
                <span className="block text-[11px] text-slate-500">{note}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          ))}
        </nav>

        <div className="flex justify-center pt-2">
          <LogoutButton />
        </div>
      </div>
      <InstallPrompt />
    </main>
  )
}
