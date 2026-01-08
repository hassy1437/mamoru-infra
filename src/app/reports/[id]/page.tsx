import { createClient } from "@supabase/supabase-js"
import { notFound } from "next/navigation"
import Link from "next/link"
// コンポーネントの読み込み
import DownloadButton from "@/components/download-button"
import PrintButton from "@/components/print-button"
import PdfOverlayButton from "@/components/pdf-overlay-button" // ★追加: PDFボタン

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    const { data: report } = await supabase
        .from("inspection_reports")
        .select("*")
        .eq("id", id)
        .single()

    if (!report) {
        return notFound()
    }

    const formatDate = (dateString: string) => {
        if (!dateString) return ""
        const date = new Date(dateString)
        return `${date.getFullYear()}年 ${date.getMonth() + 1}月 ${date.getDate()}日`
    }

    const equipmentList = report.equipment_types && Array.isArray(report.equipment_types)
        ? report.equipment_types.join("、 ")
        : "なし"

    return (
        <div className="min-h-screen bg-gray-100 p-8 print:p-0 print:bg-white">
            <div className="max-w-[210mm] mx-auto mb-6 flex justify-between items-center print:hidden">
                <Link href="/" className="text-blue-600 hover:underline">
                    &larr; トップに戻る
                </Link>

                {/* ボタンエリア */}
                <div className="flex gap-2">
                    {/* 1. 公式様式PDF (下敷きあり) */}
                    <PdfOverlayButton data={report} />

                    {/* 2. Wordファイル (編集用) */}
                    <DownloadButton data={report} />

                    {/* 3. 画面印刷 (簡易PDF) */}
                    <PrintButton />
                </div>
            </div>

            {/* 以下、プレビュー画面のデザイン（変更なし） */}
            <div className="max-w-[210mm] mx-auto bg-white p-[20mm] shadow-lg print:shadow-none print:w-[210mm] print:h-[297mm] print:p-[15mm] text-black">
                <div className="text-xs text-left mb-2">別記様式第１</div>
                <h1 className="text-xl font-bold text-center mb-10 leading-relaxed">
                    消防用設備等（特殊消防用設備等）<br />点検結果報告書
                </h1>

                {/* ... (中略: デザイン部分は今のままでOKです) ... */}

                <div className="flex justify-between items-end mb-6">
                    <div className="w-1/2 ml-auto">
                        <div className="text-left mb-2 pl-4">{formatDate(report.report_date)}</div>
                        <div className="flex items-end">
                            <div className="text-left border-b border-black flex-1 px-2 text-lg">
                                {report.fire_department_name}
                            </div>
                            <span className="ml-2 text-lg">殿</span>
                        </div>
                    </div>
                </div>

                <div className="mb-8">
                    <div className="flex mb-2">
                        <div className="w-24 font-bold text-lg pt-2">届 出 者</div>
                        <div className="flex-1">
                            <div className="flex items-baseline mb-3">
                                <span className="w-20 text-lg">住 所</span>
                                <div className="flex-1 border-b border-black px-2 text-lg">{report.notifier_address}</div>
                            </div>
                            <div className="flex items-baseline mb-3">
                                <span className="w-20 text-lg">氏 名</span>
                                <div className="flex-1 border-b border-black px-2 text-lg">{report.notifier_name}</div>
                            </div>
                            <div className="flex items-baseline">
                                <span className="w-20 text-lg">電話番号</span>
                                <div className="flex-1 border-b border-black px-2 text-lg">{report.notifier_phone}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <p className="mb-4 text-lg">
                    下記のとおり消防用設備等（特殊消防用設備等）の点検を実施したので、消防法第17条の３の３の規定に基づき報告します。
                </p>

                <div className="text-center mb-2 font-bold text-lg">記</div>

                {/* 表組み部分（既存のコードのまま） */}
                <div className="border-2 border-black">
                    <div className="flex border-b border-black">
                        <div className="w-16 flex items-center justify-center border-r border-black p-2 font-bold writing-vertical-rl text-lg bg-gray-50 print:bg-transparent">
                            <span style={{ writingMode: 'vertical-rl' }} className="h-24">防火対象物</span>
                        </div>
                        <div className="flex-1">
                            <div className="flex border-b border-black">
                                <div className="w-28 border-r border-black p-2 flex items-center justify-center text-lg">所在地</div>
                                <div className="flex-1 p-2 text-lg min-h-[50px] flex items-center">{report.building_address}</div>
                            </div>
                            <div className="flex border-b border-black">
                                <div className="w-28 border-r border-black p-2 flex items-center justify-center text-lg">名称</div>
                                <div className="flex-1 p-2 text-lg min-h-[50px] flex items-center">{report.building_name}</div>
                            </div>
                            <div className="flex border-b border-black">
                                <div className="w-28 border-r border-black p-2 flex items-center justify-center text-lg">用途</div>
                                <div className="flex-1 p-2 text-lg min-h-[50px] flex items-center">{report.building_usage}</div>
                            </div>
                            <div className="flex">
                                <div className="w-28 border-r border-black p-2 flex items-center justify-center text-lg">規模</div>
                                <div className="flex-1 p-2 flex items-center justify-around text-lg">
                                    <span>地上 <span className="border-b border-black px-4">{report.floor_above}</span> 階</span>
                                    <span>地下 <span className="border-b border-black px-4">{report.floor_below ?? 0}</span> 階</span>
                                    <span>延べ面積 <span className="border-b border-black px-4">{report.total_floor_area}</span> ㎡</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex min-h-[200px]">
                        <div className="w-16 flex items-center justify-center border-r border-black p-2 font-bold text-lg bg-gray-50 print:bg-transparent">
                            消防用<br />設備等<br />の種類等
                        </div>
                        <div className="flex-1 p-4 text-lg">
                            {equipmentList}
                        </div>
                    </div>
                </div>

                <div className="mt-4 flex border border-black h-32">
                    <div className="flex-1 border-r border-black p-2 text-sm">※受 付 欄</div>
                    <div className="flex-1 border-r border-black p-2 text-sm">※経 過 欄</div>
                    <div className="flex-1 p-2 text-sm">※備 考</div>
                </div>

                <div className="mt-2 text-sm">
                    <p>備考 １ この用紙の大きさは、日本産業規格Ａ４とすること。</p>
                    <p className="pl-10">２ ※印欄は、記入しないこと。</p>
                </div>
            </div>
        </div>
    )
}