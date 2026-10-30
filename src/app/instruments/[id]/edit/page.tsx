import { getAuthenticatedClient } from "@/lib/supabase/auth-server"
import { notFound } from "next/navigation"
import Link from "next/link"
import InstrumentMasterForm from "@/components/instrument-master-form"
import { INSTRUMENT_COLUMNS, type MeasuringInstrument } from "@/lib/measuring-instruments"

export default async function EditInstrumentPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { supabase, user } = await getAuthenticatedClient()
    const { id } = await params

    const { data: instrument } = await supabase
        .from("measuring_instruments")
        .select(INSTRUMENT_COLUMNS)
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle()

    if (!instrument) {
        return notFound()
    }

    return (
        <main className="min-h-screen bg-gray-50 py-10">
            <div className="container mx-auto px-4">
                <div className="mb-6 max-w-4xl mx-auto">
                    <Link href="/instruments" className="text-sm text-blue-600 hover:underline inline-flex min-h-11 items-center">
                        ← 測定機器の台帳に戻る
                    </Link>
                    <h1 className="text-2xl font-bold text-slate-900 mt-2">測定機器の編集</h1>
                    <p className="text-slate-500 mt-1 text-sm">
                        直しても、もう入れた点検票の値は変わりません（写しただけなので）。
                    </p>
                </div>
                <InstrumentMasterForm instrument={instrument as MeasuringInstrument} />
            </div>
        </main>
    )
}
