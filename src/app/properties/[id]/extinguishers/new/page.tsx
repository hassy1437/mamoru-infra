import { getAuthenticatedClient } from "@/lib/supabase/auth-server"
import { notFound } from "next/navigation"
import Link from "next/link"
import ExtinguisherGroupForm from "@/components/extinguisher-group-form"
import { jstTodayYmd } from "@/lib/date-utils"

export default async function NewExtinguisherGroupPage({
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

    return (
        <main className="min-h-screen bg-gray-50 py-10">
            <div className="container mx-auto px-4">
                <div className="mb-6 max-w-4xl mx-auto">
                    <Link href={`/properties/${id}/extinguishers`} className="text-sm text-blue-600 hover:underline inline-flex min-h-11 items-center">
                        ← 消火器の台帳に戻る
                    </Link>
                    <h1 className="text-2xl font-bold text-slate-900 mt-2">消火器を入れる</h1>
                    <p className="text-slate-500 mt-1 text-sm">{property.building_name as string}</p>
                </div>
                <ExtinguisherGroupForm propertyId={id} thisYear={Number(jstTodayYmd().slice(0, 4))} />
            </div>
        </main>
    )
}
