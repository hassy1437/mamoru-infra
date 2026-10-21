import ItiranForm from "@/components/itiran-form"
import StepIndicator from "@/components/step-indicator"
import { INSPECTION_STEPS } from "@/lib/inspection-steps"
import Breadcrumb from "@/components/breadcrumb"
import { getAuthenticatedClient } from "@/lib/supabase/auth-server"
import type { Inspector } from "@/types/database"
import { redirect } from "next/navigation"
import { pickMainItiranId } from "@/lib/report-resume"

export default async function ItiranPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    // 点検者マスタを server で取得し props で渡す（S1）。
    // RLS 前提で自ユーザー分のみ、更新が新しい順（pre-fill は先頭＝最新を使う）。
    const { supabase, user } = await getAuthenticatedClient()
    // ★もう点検者一覧表があれば、その点検票の一覧へ（2026-10-21）。以前はこの画面が毎回まっさらの入力欄を出し、
    //   戻るボタンや古いリンクから来て保存すると 2 つ目の点検者一覧表ができた（過去のデータ破損の原因と同じ）。
    //   直すときは点検票の一覧の「点検者を編集」から
    const existing = await pickMainItiranId(supabase, id)
    if (existing) redirect(`/inspection/${id}/itiran/${existing}`)
    const { data: masters } = await supabase
        .from("inspectors")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })

    return (
        <div className="min-h-screen bg-gray-100 py-8">
            <div className="max-w-4xl mx-auto px-6 mb-6">
                <Breadcrumb items={[
                    { label: "点検", href: "/inspection" },
                    { label: "総括表", href: `/inspection/${id}` },
                    { label: "点検者入力" },
                ]} />
                <StepIndicator steps={[...INSPECTION_STEPS]} currentStep={2} />
            </div>
            <div className="max-w-4xl mx-auto px-6 mb-6">
                <h1 className="text-2xl font-bold text-gray-900">
                    消防用設備等（特殊消防用設備等）点検者一覧表
                </h1>
                <p className="text-gray-500 text-sm mt-1">点検者の資格情報を入力してください。</p>
            </div>
            <ItiranForm soukatsuId={id} masters={(masters ?? []) as Inspector[]} />
        </div>
    )
}
