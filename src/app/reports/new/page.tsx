import InspectionForm from "@/components/inspection-form"

export default function NewReportPage() {
    return (
        <main className="min-h-screen bg-gray-50 py-12">
            <div className="container mx-auto px-4">
                <div className="mb-8 text-center">
                    <h1 className="text-3xl font-bold text-gray-900">消防用設備等点検結果報告書 作成</h1>
                    <p className="text-gray-500 mt-2">必要な情報を入力して報告書を作成します。</p>
                </div>
                <InspectionForm />
            </div>
        </main>
    )
}