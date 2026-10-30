import { getAuthenticatedClient } from "@/lib/supabase/auth-server"
import { notFound } from "next/navigation"
import Link from "next/link"
import ExtinguisherGroupForm from "@/components/extinguisher-group-form"
import { EXTINGUISHER_COLUMNS, type ExtinguisherGroup } from "@/lib/extinguisher-ledger"
import { jstTodayYmd } from "@/lib/date-utils"

export default async function EditExtinguisherGroupPage({
    params,
}: {
    params: Promise<{ id: string; groupId: string }>
}) {
    const { supabase, user } = await getAuthenticatedClient()
    const { id, groupId } = await params

    const { data: group } = await supabase
        .from("extinguisher_groups")
        .select(EXTINGUISHER_COLUMNS)
        .eq("id", groupId)
        .eq("property_id", id)
        .eq("user_id", user.id)
        .maybeSingle()
    if (!group) return notFound()

    return (
        <main className="min-h-screen bg-gray-50 py-10">
            <div className="container mx-auto px-4">
                <div className="mb-6 max-w-4xl mx-auto">
                    <Link href={`/properties/${id}/extinguishers`} className="text-sm text-blue-600 hover:underline inline-flex min-h-11 items-center">
                        ← 消火器の台帳に戻る
                    </Link>
                    <h1 className="text-2xl font-bold text-slate-900 mt-2">消火器の台帳の行を直す</h1>
                    <p className="text-slate-500 mt-1 text-sm">直しても、もう作った報告書の中身は変わりません。</p>
                </div>
                <ExtinguisherGroupForm propertyId={id} group={group as ExtinguisherGroup} thisYear={Number(jstTodayYmd().slice(0, 4))} />
            </div>
        </main>
    )
}
