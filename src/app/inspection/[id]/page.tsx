import { createClient } from "@supabase/supabase-js"
import { notFound } from "next/navigation"
import Link from "next/link"
import SoukatsuPdfButton from "@/components/soukatsu-pdf-button"
import { ArrowRight } from "lucide-react"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

export default async function InspectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    const { data: report } = await supabase
        .from("inspection_soukatsu")
        .select("*")
        .eq("id", id)
        .single()

    if (!report) {
        return notFound()
    }

    const formatDate = (dateString: string | null) => {
        if (!dateString) return ""
        const date = new Date(dateString)
        return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
    }

    const equipmentResults = (report.equipment_results as { name: string; result: string }[] | null) ?? []

    return (
        <div className="min-h-screen bg-gray-100 p-8 print:p-0 print:bg-white">
            <div className="max-w-[210mm] mx-auto mb-6 flex justify-between items-center print:hidden">
                <Link href="/tool" className="text-blue-600 hover:underline">
                    &larr; ツール選択に戻る
                </Link>
                <div className="flex gap-2 flex-wrap">
                    <SoukatsuPdfButton data={report} />
                    <Link
                        href={`/inspection/${id}/itiran`}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                        次へ：点検者一覧表を入力
                        <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
            </div>

            {/* プレビュー */}
            <div className="max-w-[210mm] mx-auto bg-white p-[20mm] shadow-lg print:shadow-none text-black">
                <h1 className="text-xl font-bold text-center mb-8 leading-relaxed">
                    消防用設備等点検結果総括表
                </h1>

                {/* 基本情報 */}
                <div className="mb-6 text-sm">
                    <div className="flex gap-8 mb-2">
                        <span>点検年月日: {formatDate(report.inspection_date)}</span>
                        <span>点検種別: {report.inspection_type}</span>
                    </div>
                    {(report.inspection_period_start || report.inspection_period_end) && (
                        <div>
                            点検期間: {formatDate(report.inspection_period_start)} ～ {formatDate(report.inspection_period_end)}
                        </div>
                    )}
                </div>

                {/* 届出者 */}
                <div className="mb-6">
                    <div className="flex mb-2">
                        <div className="w-24 font-bold pt-2">届出者</div>
                        <div className="flex-1">
                            <div className="flex items-baseline mb-2">
                                <span className="w-20">住所</span>
                                <div className="flex-1 border-b border-black px-2">{report.notifier_address}</div>
                            </div>
                            <div className="flex items-baseline mb-2">
                                <span className="w-20">氏名</span>
                                <div className="flex-1 border-b border-black px-2">{report.notifier_name}</div>
                            </div>
                            <div className="flex items-baseline">
                                <span className="w-20">電話番号</span>
                                <div className="flex-1 border-b border-black px-2">{report.notifier_phone}</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 防火対象物 */}
                <div className="border-2 border-black mb-6">
                    <div className="flex border-b border-black">
                        <div className="w-16 flex items-center justify-center border-r border-black p-2 font-bold bg-gray-50 print:bg-transparent">
                            <span style={{ writingMode: 'vertical-rl' as const }} className="h-24">防火対象物</span>
                        </div>
                        <div className="flex-1">
                            <div className="flex border-b border-black">
                                <div className="w-28 border-r border-black p-2 flex items-center justify-center">所在地</div>
                                <div className="flex-1 p-2 min-h-[40px] flex items-center">{report.building_address}</div>
                            </div>
                            <div className="flex border-b border-black">
                                <div className="w-28 border-r border-black p-2 flex items-center justify-center">名称</div>
                                <div className="flex-1 p-2 min-h-[40px] flex items-center">{report.building_name}</div>
                            </div>
                            <div className="flex border-b border-black">
                                <div className="w-28 border-r border-black p-2 flex items-center justify-center">用途</div>
                                <div className="flex-1 p-2 min-h-[40px] flex items-center">{report.building_usage}</div>
                            </div>
                            {report.building_structure && (
                                <div className="flex border-b border-black">
                                    <div className="w-28 border-r border-black p-2 flex items-center justify-center">構造</div>
                                    <div className="flex-1 p-2 min-h-[40px] flex items-center">{report.building_structure}</div>
                                </div>
                            )}
                            <div className="flex">
                                <div className="w-28 border-r border-black p-2 flex items-center justify-center">規模</div>
                                <div className="flex-1 p-2 flex items-center justify-around">
                                    <span>地上 <span className="border-b border-black px-4">{report.floor_above}</span> 階</span>
                                    <span>地下 <span className="border-b border-black px-4">{report.floor_below ?? 0}</span> 階</span>
                                    <span>延べ面積 <span className="border-b border-black px-4">{report.total_floor_area}</span> ㎡</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 点検結果一覧 */}
                {equipmentResults.length > 0 && (
                    <div className="border-2 border-black mb-6">
                        <div className="flex border-b border-black bg-gray-50 print:bg-transparent font-bold">
                            <div className="flex-1 p-2 border-r border-black text-center">消防用設備等の種別</div>
                            <div className="w-32 p-2 text-center">判定</div>
                        </div>
                        {equipmentResults.map((item, index) => (
                            <div key={index} className={`flex ${index < equipmentResults.length - 1 ? 'border-b border-black' : ''}`}>
                                <div className="flex-1 p-2 border-r border-black">{item.name}</div>
                                <div className={`w-32 p-2 text-center font-medium ${item.result === '要改善' ? 'text-red-600' : 'text-green-600'}`}>
                                    {item.result}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* 総合判定 */}
                {report.overall_judgment && (
                    <div className="border-2 border-black p-4 mb-6">
                        <span className="font-bold">総合判定: </span>
                        <span className={report.overall_judgment === '不適合' ? 'text-red-600 font-bold' : 'text-green-600 font-bold'}>
                            {report.overall_judgment}
                        </span>
                    </div>
                )}

                {/* 備考 */}
                {report.notes && (
                    <div className="border-2 border-black p-4">
                        <div className="font-bold mb-2">備考</div>
                        <div className="whitespace-pre-wrap">{report.notes}</div>
                    </div>
                )}
            </div>
        </div>
    )
}
