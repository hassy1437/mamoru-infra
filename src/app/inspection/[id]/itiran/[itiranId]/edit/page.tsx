import ItiranForm from "@/components/itiran-form"
import Breadcrumb from "@/components/breadcrumb"
import { getAuthenticatedClient } from "@/lib/supabase/auth-server"
import { notFound } from "next/navigation"
import type { Inspector, InspectorData } from "@/types/database"

// 点検者一覧表(itiran)の編集ページ。作成側(/inspection/[id]/itiran)と同じ ItiranForm を
// initial 付きで使う（＝作成/編集で制約もUIも1箇所に統一）。
export default async function EditItiranPage({
    params,
}: {
    params: Promise<{ id: string; itiranId: string }>
}) {
    const { id, itiranId } = await params
    const { supabase, user } = await getAuthenticatedClient()

    // 編集対象 itiran（自ユーザー分のみ）。
    // ★URL整合: soukatsu_id も一致させる。/inspection/<A>/itiran/<B>/edit で B が別報告書の
    //   itiran だった場合（同一ユーザーなら RLS は通る）、single() が0行→notFound にする。
    const { data: itiran } = await supabase
        .from("inspection_itiran")
        .select("*")
        .eq("id", itiranId)
        .eq("soukatsu_id", id)
        .eq("user_id", user.id)
        .single()
    if (!itiran) return notFound()

    // 点検者マスタ（作成側と同じ取得）
    const { data: masters } = await supabase
        .from("inspectors")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })

    const initial: [InspectorData, InspectorData] = [
        (itiran.inspector1 ?? {}) as InspectorData,
        (itiran.inspector2 ?? {}) as InspectorData,
    ]

    return (
        <div className="min-h-screen bg-gray-100 py-8">
            <div className="max-w-4xl mx-auto px-6 mb-6">
                <Breadcrumb items={[
                    { label: "点検", href: "/inspection" },
                    { label: "総括表", href: `/inspection/${id}` },
                    { label: "点検者", href: `/inspection/${id}/itiran/${itiranId}` },
                    { label: "編集" },
                ]} />
            </div>
            <div className="max-w-4xl mx-auto px-6 mb-6">
                <h1 className="text-2xl font-bold text-gray-900">点検者一覧表の編集</h1>
                <p className="text-gray-500 text-sm mt-1">点検者の資格情報を修正できます。</p>
            </div>
            <ItiranForm
                soukatsuId={id}
                masters={(masters ?? []) as Inspector[]}
                initial={initial}
                itiranId={itiranId}
            />
        </div>
    )
}
