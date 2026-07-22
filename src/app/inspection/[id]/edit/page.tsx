import { getAuthenticatedClient } from "@/lib/supabase/auth-server"
import { notFound } from "next/navigation"
import SoukatsuEditForm from "@/components/soukatsu-edit-form"
import Breadcrumb from "@/components/breadcrumb"

// 総括表(soukatsu)の編集ページ。properties/[id]/edit と同じパターン（サーバでrow取得→編集フォーム）。
// 作成フロー(soukatsu-form)は触らず、幹の後編集をここで受ける。
export default async function EditSoukatsuPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { supabase, user } = await getAuthenticatedClient()
    const { id } = await params

    const { data: soukatsu } = await supabase
        .from("inspection_soukatsu")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .single()
    if (!soukatsu) return notFound()

    // 納品済み判定（マッチング由来物件のみ・output と同じ get_match_deliveries 経路）。
    // 納品済みなら編集フォームで「修正後は再納品が必要」の注意を出す。
    let isDelivered = false
    if (soukatsu.property_id) {
        const { data: property } = await supabase
            .from("properties")
            .select("source_match_id")
            .eq("id", soukatsu.property_id)
            .single()
        const sourceMatchId = (property as { source_match_id?: string | null } | null)?.source_match_id ?? null
        if (sourceMatchId) {
            const { data: ds } = await supabase.rpc("get_match_deliveries", { p_match_id: sourceMatchId })
            const deliveries = (ds as { deliveries?: unknown[] } | null)?.deliveries ?? []
            isDelivered = deliveries.length > 0
        }
    }

    return (
        <main className="min-h-screen bg-gray-50 py-10">
            <div className="container mx-auto px-4">
                <div className="mb-6 max-w-4xl mx-auto">
                    <Breadcrumb items={[
                        { label: "点検", href: "/inspection" },
                        { label: (soukatsu.building_name as string) || "総括表", href: `/inspection/${id}` },
                        { label: "編集" },
                    ]} />
                    <h1 className="text-2xl font-bold text-slate-900 mt-2">総括表の編集</h1>
                    <p className="text-slate-500 mt-1 text-sm">
                        建物情報・届出者・点検日・総合判定・備考を修正できます。（各設備の点検結果は別記様式で編集します）
                    </p>
                </div>
                <SoukatsuEditForm
                    soukatsu={soukatsu as Record<string, unknown> & { id: string }}
                    isDelivered={isDelivered}
                />
            </div>
        </main>
    )
}
