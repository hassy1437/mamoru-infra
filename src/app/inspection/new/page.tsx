import { getAuthenticatedClient } from "@/lib/supabase/auth-server"
import { notFound } from "next/navigation"
import SoukatsuForm from "@/components/soukatsu-form"
import StepIndicator from "@/components/step-indicator"
import { INSPECTION_STEPS } from "@/lib/inspection-steps"
import Breadcrumb from "@/components/breadcrumb"
import type { Property } from "@/types/database"

export default async function NewInspectionPage({
    searchParams,
}: {
    searchParams: Promise<{ propertyId?: string; copyFrom?: string; sourceItiran?: string }>
}) {
    const { supabase, user } = await getAuthenticatedClient()
    const { propertyId, copyFrom, sourceItiran } = await searchParams

    if (!propertyId) {
        return notFound()
    }

    const { data: property } = await supabase
        .from("properties")
        .select("*")
        .eq("id", propertyId)
        .eq("user_id", user.id)
        .single()

    if (!property) {
        return notFound()
    }

    // 前回コピー: copyFrom に soukatsu ID が指定されていたらそのデータを取得
    let previousData: Record<string, unknown> | null = null
    if (copyFrom) {
        // ★全列を取得（建物・届出者・期間も複製元 soukatsu からプリフィルするため。物件マスタでない）。
        //   RLS(owner=auth.uid())で他人の報告書は取得できず previousData は null のまま＝通常作成に劣化。
        const { data: prevSoukatsu } = await supabase
            .from("inspection_soukatsu")
            .select("*")
            .eq("id", copyFrom)
            .single()
        if (prevSoukatsu) {
            previousData = prevSoukatsu
        }
    }

    return (
        <main className="min-h-screen bg-gray-50 py-10">
            <div className="container mx-auto px-4">
                <div className="mb-6 max-w-4xl mx-auto">
                    <Breadcrumb items={[
                        { label: "点検", href: "/inspection" },
                        { label: property.building_name as string, href: `/properties/${property.id}` },
                        { label: "総括表入力" },
                    ]} />
                    <div className="mt-4">
                        <StepIndicator steps={[...INSPECTION_STEPS]} currentStep={0} />
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900 mt-2">
                        消防用設備等点検結果総括表
                    </h1>
                    <p className="text-slate-500 mt-1 text-sm">
                        {previousData
                            ? "前回の報告書からプリフィルしました。必要に応じて修正し、保存後に各様式をご確認ください。"
                            : "点検結果を入力して総括表を作成します。"
                        }
                    </p>
                </div>
                <SoukatsuForm
                    property={property as Property}
                    previousData={previousData}
                    copyFromId={copyFrom ?? null}
                    sourceItiranId={sourceItiran ?? null}
                />
            </div>
        </main>
    )
}
