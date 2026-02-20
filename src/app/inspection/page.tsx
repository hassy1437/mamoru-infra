import SoukatsuForm from "@/components/soukatsu-form"

export default function InspectionPage() {
    return (
        <main className="min-h-screen bg-gray-50 py-12">
            <div className="container mx-auto px-4">
                <div className="mb-8 text-center">
                    <h1 className="text-3xl font-bold text-gray-900">消防用設備等点検結果総括表</h1>
                    <p className="text-gray-500 mt-2">点検結果を入力して総括表を作成します。</p>
                </div>
                <SoukatsuForm />
            </div>
        </main>
    )
}
