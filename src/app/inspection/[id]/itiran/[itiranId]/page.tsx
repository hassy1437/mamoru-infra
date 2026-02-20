import { createClient } from "@supabase/supabase-js"
import { notFound } from "next/navigation"
import Link from "next/link"
import ItiranPdfButton from "@/components/itiran-pdf-button"
import type { InspectorData } from "@/types/database"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

const SHOUBOU_TYPES = [
    { key: "toku",   label: "甲種特類" },
    { key: "class1", label: "甲・乙種1類" },
    { key: "class2", label: "甲・乙種2類" },
    { key: "class3", label: "甲・乙種3類" },
    { key: "class4", label: "甲・乙種4類" },
    { key: "class5", label: "甲・乙種5類" },
    { key: "class6", label: "乙種6類" },
    { key: "class7", label: "乙種7類" },
] as const

const KENSA_TYPES = [
    { key: "toku",   label: "特種" },
    { key: "class1", label: "第1種" },
    { key: "class2", label: "第2種" },
] as const

function formatDate(y: string, m: string, d: string) {
    if (!y && !m && !d) return ""
    return `${y}年${m}月${d}日`
}

function formatYearMonth(y: string, m: string) {
    if (!y && !m) return ""
    return `${y}年${m}月`
}

function InspectorBlock({ inspector, label }: { inspector: InspectorData; label: string }) {
    return (
        <div className="border-2 border-black mb-6">
            <div className="bg-gray-100 print:bg-transparent font-bold px-4 py-2 border-b border-black flex justify-between items-center">
                <span>{label}</span>
                {inspector.equipment_names && (
                    <span className="text-sm font-normal">設備名：{inspector.equipment_names}</span>
                )}
            </div>

            {/* 基本情報 */}
            <div className="grid grid-cols-2 border-b border-black text-sm">
                <div className="flex border-r border-black">
                    <div className="w-16 flex items-center justify-center border-r border-black py-2 px-1 bg-gray-50 print:bg-transparent font-bold text-xs">住所</div>
                    <div className="flex-1 py-2 px-3">{inspector.address}</div>
                </div>
                <div className="flex">
                    <div className="w-16 flex items-center justify-center border-r border-black py-2 px-1 bg-gray-50 print:bg-transparent font-bold text-xs">氏名</div>
                    <div className="flex-1 py-2 px-3">{inspector.name}</div>
                </div>
            </div>
            <div className="grid grid-cols-2 border-b border-black text-sm">
                <div className="flex border-r border-black">
                    <div className="w-16 flex items-center justify-center border-r border-black py-2 px-1 bg-gray-50 print:bg-transparent font-bold text-xs">社名</div>
                    <div className="flex-1 py-2 px-3">{inspector.company}</div>
                </div>
                <div className="flex">
                    <div className="w-16 flex items-center justify-center border-r border-black py-2 px-1 bg-gray-50 print:bg-transparent font-bold text-xs">電話番号</div>
                    <div className="flex-1 py-2 px-3">{inspector.phone}</div>
                </div>
            </div>

            {/* 消防設備士 */}
            <div className="border-b border-black">
                <div className="bg-gray-50 print:bg-transparent px-3 py-1 text-xs font-bold border-b border-black">
                    資格：消防設備士
                </div>
                <table className="w-full text-xs border-collapse">
                    <thead>
                        <tr className="bg-gray-50 print:bg-transparent">
                            <th className="border border-gray-400 px-2 py-1 text-left">種類等</th>
                            <th className="border border-gray-400 px-2 py-1 text-center">交付年月日</th>
                            <th className="border border-gray-400 px-2 py-1 text-center">交付番号</th>
                            <th className="border border-gray-400 px-2 py-1 text-center">交付知事</th>
                            <th className="border border-gray-400 px-2 py-1 text-center">講習受講年月</th>
                        </tr>
                    </thead>
                    <tbody>
                        {SHOUBOU_TYPES.map(({ key, label: typeLabel }) => {
                            const lic = inspector.shoubou_licenses?.[key]
                            if (!lic) return null
                            const hasData = lic.issue_year || lic.license_number || lic.issuing_governor || lic.training_year
                            if (!hasData) return null
                            return (
                                <tr key={key}>
                                    <td className="border border-gray-400 px-2 py-1">{typeLabel}</td>
                                    <td className="border border-gray-400 px-2 py-1 text-center">
                                        {formatDate(lic.issue_year, lic.issue_month, lic.issue_day)}
                                    </td>
                                    <td className="border border-gray-400 px-2 py-1 text-center">{lic.license_number}</td>
                                    <td className="border border-gray-400 px-2 py-1 text-center">{lic.issuing_governor}</td>
                                    <td className="border border-gray-400 px-2 py-1 text-center">
                                        {formatYearMonth(lic.training_year, lic.training_month)}
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
                {inspector.shoubou_notes && (
                    <div className="px-3 py-2 text-xs border-t border-gray-400">
                        <span className="font-bold">備考：</span>{inspector.shoubou_notes}
                    </div>
                )}
            </div>

            {/* 消防設備点検資格者 */}
            <div>
                <div className="bg-gray-50 print:bg-transparent px-3 py-1 text-xs font-bold border-b border-black">
                    資格：消防設備点検資格者
                </div>
                <table className="w-full text-xs border-collapse">
                    <thead>
                        <tr className="bg-gray-50 print:bg-transparent">
                            <th className="border border-gray-400 px-2 py-1 text-left">種類等</th>
                            <th className="border border-gray-400 px-2 py-1 text-center">交付年月日</th>
                            <th className="border border-gray-400 px-2 py-1 text-center">交付番号</th>
                            <th className="border border-gray-400 px-2 py-1 text-center">有効期限</th>
                        </tr>
                    </thead>
                    <tbody>
                        {KENSA_TYPES.map(({ key, label: typeLabel }) => {
                            const lic = inspector.kensa_licenses?.[key]
                            if (!lic) return null
                            const hasData = lic.issue_year || lic.license_number || lic.expiry_year
                            if (!hasData) return null
                            return (
                                <tr key={key}>
                                    <td className="border border-gray-400 px-2 py-1">{typeLabel}</td>
                                    <td className="border border-gray-400 px-2 py-1 text-center">
                                        {formatDate(lic.issue_year, lic.issue_month, lic.issue_day)}
                                    </td>
                                    <td className="border border-gray-400 px-2 py-1 text-center">{lic.license_number}</td>
                                    <td className="border border-gray-400 px-2 py-1 text-center">
                                        {formatDate(lic.expiry_year, lic.expiry_month, lic.expiry_day)}
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

export default async function ItiranDetailPage({
    params,
}: {
    params: Promise<{ id: string; itiranId: string }>
}) {
    const { id, itiranId } = await params

    const { data: record } = await supabase
        .from("inspection_itiran")
        .select("*")
        .eq("id", itiranId)
        .single()

    if (!record) return notFound()

    // 総括表から建物名を取得（PDF出力のファイル名用）
    const { data: soukatsu } = await supabase
        .from("inspection_soukatsu")
        .select("building_name")
        .eq("id", id)
        .single()

    const inspector1 = record.inspector1 as InspectorData | null
    const inspector2 = record.inspector2 as InspectorData | null

    return (
        <div className="min-h-screen bg-gray-100 p-8 print:p-0 print:bg-white">
            <div className="max-w-[210mm] mx-auto mb-6 flex justify-between items-center print:hidden">
                <Link href={`/inspection/${id}`} className="text-blue-600 hover:underline">
                    &larr; 総括表に戻る
                </Link>
                <ItiranPdfButton data={record} buildingName={soukatsu?.building_name} />
            </div>

            <div className="max-w-[210mm] mx-auto bg-white p-[15mm] shadow-lg print:shadow-none text-black">
                <h1 className="text-lg font-bold text-center mb-6 leading-relaxed">
                    消防用設備等（特殊消防用設備等）点検者一覧表
                </h1>

                {inspector1 && <InspectorBlock inspector={inspector1} label="点検者 1" />}
                {inspector2 && <InspectorBlock inspector={inspector2} label="点検者 2" />}
            </div>
        </div>
    )
}
