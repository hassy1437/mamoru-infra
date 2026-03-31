import ItiranForm from "@/components/itiran-form"
import StepIndicator from "@/components/step-indicator"
import { INSPECTION_STEPS } from "@/lib/inspection-steps"
import Breadcrumb from "@/components/breadcrumb"

export default async function ItiranPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    return (
        <div className="min-h-screen bg-gray-100 py-8">
            <div className="max-w-4xl mx-auto px-6 mb-6">
                <Breadcrumb items={[
                    { label: "点検", href: "/inspection" },
                    { label: "総括表", href: `/inspection/${id}` },
                    { label: "点検者入力" },
                ]} />
                <StepIndicator steps={[...INSPECTION_STEPS]} currentStep={2} />
            </div>
            <div className="max-w-4xl mx-auto px-6 mb-6">
                <h1 className="text-2xl font-bold text-gray-900">
                    消防用設備等（特殊消防用設備等）点検者一覧表
                </h1>
                <p className="text-gray-500 text-sm mt-1">点検者の資格情報を入力してください。</p>
            </div>
            <ItiranForm soukatsuId={id} />
        </div>
    )
}
