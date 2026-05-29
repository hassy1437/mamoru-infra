import Link from "next/link"
import InspectorMasterForm from "@/components/inspector-master-form"

export default function NewInspectorPage() {
    return (
        <main className="min-h-screen bg-gray-50 py-10">
            <div className="container mx-auto px-4">
                <div className="mb-6 max-w-4xl mx-auto">
                    <Link href="/inspectors" className="text-sm text-blue-600 hover:underline">
                        ← 点検者マスタに戻る
                    </Link>
                    <h1 className="text-2xl font-bold text-slate-900 mt-2">点検者の登録</h1>
                    <p className="text-slate-500 mt-1 text-sm">
                        点検者の基本情報と免状情報を登録します。
                    </p>
                </div>
                <InspectorMasterForm />
            </div>
        </main>
    )
}
