import Link from "next/link"
import PropertyForm from "@/components/property-form"

export default function NewPropertyPage() {
    return (
        <main className="min-h-screen bg-gray-50 py-10">
            <div className="container mx-auto px-4">
                <div className="mb-6 max-w-4xl mx-auto">
                    <Link href="/properties" className="text-sm text-blue-600 hover:underline">
                        ← 物件一覧に戻る
                    </Link>
                    <h1 className="text-2xl font-bold text-slate-900 mt-2">物件基本情報の登録</h1>
                    <p className="text-slate-500 mt-1 text-sm">
                        届出者情報・建物情報・設置されている消防用設備等を登録します。
                    </p>
                </div>
                <PropertyForm />
            </div>
        </main>
    )
}
