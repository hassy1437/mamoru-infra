import Link from "next/link"
import InstrumentMasterForm from "@/components/instrument-master-form"

export default function NewInstrumentPage() {
    return (
        <main className="min-h-screen bg-gray-50 py-10">
            <div className="container mx-auto px-4">
                <div className="mb-6 max-w-4xl mx-auto">
                    <Link href="/instruments" className="text-sm text-blue-600 hover:underline inline-flex min-h-11 items-center">
                        ← 測定機器の台帳に戻る
                    </Link>
                    <h1 className="text-2xl font-bold text-slate-900 mt-2">測定機器の登録</h1>
                    <p className="text-slate-500 mt-1 text-sm">
                        1 回登録すると、どの点検票の測定機器の表でも選ぶだけで入ります。
                    </p>
                </div>
                <InstrumentMasterForm />
            </div>
        </main>
    )
}
