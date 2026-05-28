"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { friendlyError } from "@/lib/error-messages"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import type { InspectorData, ShoubouLicense, KensaLicense } from "@/types/database"
import {
    toDateInputValueFromParts,
    splitDateInputValue,
    toMonthInputValueFromParts,
    splitMonthInputValue,
} from "@/lib/date-utils"

const SHOUBOU_TYPES = [
    { key: "toku",   label: "甲　種　特　類" },
    { key: "class1", label: "甲・乙種　１類" },
    { key: "class2", label: "甲・乙種　２類" },
    { key: "class3", label: "甲・乙種　３類" },
    { key: "class4", label: "甲・乙種　４類" },
    { key: "class5", label: "甲・乙種　５類" },
    { key: "class6", label: "乙　種　６　類" },
    { key: "class7", label: "乙　種　７　類" },
] as const

const KENSA_TYPES = [
    { key: "toku",   label: "特　　　種" },
    { key: "class1", label: "第　１　種" },
    { key: "class2", label: "第　２　種" },
] as const

const emptyShobouLicense = (): ShoubouLicense => ({
    issue_year: "", issue_month: "", issue_day: "",
    license_number: "", issuing_governor: "",
    training_year: "", training_month: "",
})

const emptyKensaLicense = (): KensaLicense => ({
    issue_year: "", issue_month: "", issue_day: "",
    license_number: "",
    expiry_year: "", expiry_month: "", expiry_day: "",
})

const emptyInspector = (): InspectorData => ({
    address: "", name: "", company: "", phone: "", equipment_names: "",
    shoubou_licenses: {
        toku: emptyShobouLicense(), class1: emptyShobouLicense(),
        class2: emptyShobouLicense(), class3: emptyShobouLicense(),
        class4: emptyShobouLicense(), class5: emptyShobouLicense(),
        class6: emptyShobouLicense(), class7: emptyShobouLicense(),
    },
    shoubou_notes: "",
    kensa_licenses: {
        toku: emptyKensaLicense(), class1: emptyKensaLicense(), class2: emptyKensaLicense(),
    },
})

interface Props {
    soukatsuId: string
}

export default function ItiranForm({ soukatsuId }: Props) {
    const router = useRouter()
    const { markDirty, markClean } = useUnsavedChanges()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [inspectors, setInspectors] = useState<[InspectorData, InspectorData]>([
        emptyInspector(), emptyInspector(),
    ])

    // Mark form as dirty on any input change
    useEffect(() => {
        const form = document.querySelector("form")
        if (!form) return
        const handler = () => markDirty()
        form.addEventListener("input", handler)
        return () => form.removeEventListener("input", handler)
    }, [markDirty])

    const updateInspector = (index: 0 | 1, field: keyof Pick<InspectorData, "address" | "name" | "company" | "phone" | "equipment_names" | "shoubou_notes">, value: string) => {
        setInspectors(prev => {
            const next: [InspectorData, InspectorData] = [{ ...prev[0] }, { ...prev[1] }]
            next[index][field] = value
            return next
        })
    }

    const updateShoubouLicense = (
        inspectorIndex: 0 | 1,
        typeKey: keyof InspectorData["shoubou_licenses"],
        field: keyof ShoubouLicense,
        value: string,
    ) => {
        setInspectors(prev => {
            const next: [InspectorData, InspectorData] = [
                { ...prev[0], shoubou_licenses: { ...prev[0].shoubou_licenses } },
                { ...prev[1], shoubou_licenses: { ...prev[1].shoubou_licenses } },
            ]
            next[inspectorIndex].shoubou_licenses[typeKey] = {
                ...next[inspectorIndex].shoubou_licenses[typeKey],
                [field]: value,
            }
            return next
        })
    }

    const updateKensaLicense = (
        inspectorIndex: 0 | 1,
        typeKey: keyof InspectorData["kensa_licenses"],
        field: keyof KensaLicense,
        value: string,
    ) => {
        setInspectors(prev => {
            const next: [InspectorData, InspectorData] = [
                { ...prev[0], kensa_licenses: { ...prev[0].kensa_licenses } },
                { ...prev[1], kensa_licenses: { ...prev[1].kensa_licenses } },
            ]
            next[inspectorIndex].kensa_licenses[typeKey] = {
                ...next[inspectorIndex].kensa_licenses[typeKey],
                [field]: value,
            }
            return next
        })
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        const { data, error: insertError } = await supabase
            .from("inspection_itiran")
            .insert({
                soukatsu_id: soukatsuId,
                inspector1: inspectors[0] as unknown,
                inspector2: inspectors[1] as unknown,
            })
            .select()
            .single()

        if (insertError) {
            const msg = friendlyError(insertError)
            setError(msg)
            toast.error(msg)
            setLoading(false)
            return
        }

        markClean()
        toast.success("点検者情報を保存しました")
        router.push(`/inspection/${soukatsuId}/itiran/${data.id}`)
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl mx-auto p-6">
            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                    {error}
                </div>
            )}

            {([0, 1] as const).map((idx) => (
                <Card key={idx} className="border-2">
                    <CardHeader>
                        <CardTitle className="text-lg">
                            点検者 {idx + 1}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* 基本情報 */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <Label>住所</Label>
                                <Input
                                    value={inspectors[idx].address}
                                    onChange={e => updateInspector(idx, "address", e.target.value)}
                                    placeholder="住所を入力"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label>氏名</Label>
                                <Input
                                    value={inspectors[idx].name}
                                    onChange={e => updateInspector(idx, "name", e.target.value)}
                                    placeholder="氏名を入力"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label>社名</Label>
                                <Input
                                    value={inspectors[idx].company}
                                    onChange={e => updateInspector(idx, "company", e.target.value)}
                                    placeholder="社名を入力"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label>電話番号</Label>
                                <Input
                                    value={inspectors[idx].phone}
                                    onChange={e => updateInspector(idx, "phone", e.target.value)}
                                    placeholder="電話番号を入力"
                                />
                            </div>
                            <div className="space-y-1 md:col-span-2">
                                <Label>設備名（点検対象設備）</Label>
                                <Input
                                    value={inspectors[idx].equipment_names}
                                    onChange={e => updateInspector(idx, "equipment_names", e.target.value)}
                                    placeholder="例：消火器、自動火災報知設備"
                                />
                            </div>
                        </div>

                        {/* 消防設備士 */}
                        <div>
                            <h3 className="font-bold text-sm mb-3 bg-gray-100 px-3 py-2 rounded">資格：消防設備士</h3>
                            {/* Desktop: table layout */}
                            <div className="hidden md:block overflow-x-auto">
                                <table className="w-full text-sm border-collapse">
                                    <thead>
                                        <tr className="bg-gray-50">
                                            <th className="border border-gray-300 px-2 py-1 text-left w-36">種類等</th>
                                            <th className="border border-gray-300 px-2 py-1 text-center" colSpan={3}>交付年月日</th>
                                            <th className="border border-gray-300 px-2 py-1 text-center">交付番号</th>
                                            <th className="border border-gray-300 px-2 py-1 text-center">交付知事</th>
                                            <th className="border border-gray-300 px-2 py-1 text-center" colSpan={2}>講習受講年月</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {SHOUBOU_TYPES.map(({ key, label }) => {
                                            const lic = inspectors[idx].shoubou_licenses[key]
                                            const issueDate = toDateInputValueFromParts(lic.issue_year, lic.issue_month, lic.issue_day)
                                            const trainingMonth = toMonthInputValueFromParts(lic.training_year, lic.training_month)
                                            return (
                                                <tr key={key}>
                                                    <td className="border border-gray-300 px-2 py-1 text-sm whitespace-nowrap">{label}</td>
                                                    {/* 交付年月日 (colSpan=3) */}
                                                    <td className="border border-gray-300 px-1 py-1" colSpan={3}>
                                                        <Input type="date" className="h-9 w-full min-w-0 text-sm" value={issueDate}
                                                            onChange={e => {
                                                                const { year, month, day } = splitDateInputValue(e.target.value)
                                                                updateShoubouLicense(idx, key, "issue_year", year)
                                                                updateShoubouLicense(idx, key, "issue_month", month)
                                                                updateShoubouLicense(idx, key, "issue_day", day)
                                                            }} />
                                                    </td>
                                                    {/* 交付番号 */}
                                                    <td className="border border-gray-300 px-1 py-1">
                                                        <Input className="h-9 w-full min-w-0 text-sm px-1" placeholder="交付番号" value={lic.license_number}
                                                            onChange={e => updateShoubouLicense(idx, key, "license_number", e.target.value)} />
                                                    </td>
                                                    {/* 交付知事 */}
                                                    <td className="border border-gray-300 px-1 py-1">
                                                        <Input className="h-9 w-full min-w-0 text-sm px-1" placeholder="知事名" value={lic.issuing_governor}
                                                            onChange={e => updateShoubouLicense(idx, key, "issuing_governor", e.target.value)} />
                                                    </td>
                                                    {/* 講習受講年月 (colSpan=2) */}
                                                    <td className="border border-gray-300 px-1 py-1" colSpan={2}>
                                                        <Input type="month" className="h-9 w-full min-w-0 text-sm" value={trainingMonth}
                                                            onChange={e => {
                                                                const { year, month } = splitMonthInputValue(e.target.value)
                                                                updateShoubouLicense(idx, key, "training_year", year)
                                                                updateShoubouLicense(idx, key, "training_month", month)
                                                            }} />
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile: 1 免状 = 1 カード */}
                            <div className="md:hidden space-y-3">
                                {SHOUBOU_TYPES.map(({ key, label }) => {
                                    const lic = inspectors[idx].shoubou_licenses[key]
                                    const issueDate = toDateInputValueFromParts(lic.issue_year, lic.issue_month, lic.issue_day)
                                    const trainingMonth = toMonthInputValueFromParts(lic.training_year, lic.training_month)
                                    return (
                                        <div key={`${key}-mobile`} className="border border-gray-300 rounded-lg p-3 space-y-2 bg-white">
                                            <div className="font-medium text-sm text-slate-800">{label}</div>
                                            <div className="space-y-1 min-w-0">
                                                <span className="text-xs text-slate-500">交付年月日</span>
                                                <Input type="date" className="h-9 w-full min-w-0 text-sm" value={issueDate}
                                                    onChange={e => {
                                                        const { year, month, day } = splitDateInputValue(e.target.value)
                                                        updateShoubouLicense(idx, key, "issue_year", year)
                                                        updateShoubouLicense(idx, key, "issue_month", month)
                                                        updateShoubouLicense(idx, key, "issue_day", day)
                                                    }} />
                                            </div>
                                            <div className="space-y-1 min-w-0">
                                                <span className="text-xs text-slate-500">交付番号</span>
                                                <Input className="h-9 w-full min-w-0 text-sm" placeholder="交付番号" value={lic.license_number}
                                                    onChange={e => updateShoubouLicense(idx, key, "license_number", e.target.value)} />
                                            </div>
                                            <div className="space-y-1 min-w-0">
                                                <span className="text-xs text-slate-500">交付知事</span>
                                                <Input className="h-9 w-full min-w-0 text-sm" placeholder="知事名" value={lic.issuing_governor}
                                                    onChange={e => updateShoubouLicense(idx, key, "issuing_governor", e.target.value)} />
                                            </div>
                                            <div className="space-y-1 min-w-0">
                                                <span className="text-xs text-slate-500">講習受講年月</span>
                                                <Input type="month" className="h-9 w-full min-w-0 text-sm" value={trainingMonth}
                                                    onChange={e => {
                                                        const { year, month } = splitMonthInputValue(e.target.value)
                                                        updateShoubouLicense(idx, key, "training_year", year)
                                                        updateShoubouLicense(idx, key, "training_month", month)
                                                    }} />
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                            <div className="mt-2 space-y-1">
                                <Label className="text-sm">備考</Label>
                                <Textarea
                                    rows={2}
                                    value={inspectors[idx].shoubou_notes}
                                    onChange={e => updateInspector(idx, "shoubou_notes", e.target.value)}
                                    placeholder="備考（誘導灯及び誘導標識を点検した場合は電気工事士免状等の種類・交付番号・交付年月日を記載）"
                                />
                            </div>
                        </div>

                        {/* 消防設備点検資格者 */}
                        <div>
                            <h3 className="font-bold text-sm mb-3 bg-gray-100 px-3 py-2 rounded">資格：消防設備点検資格者</h3>
                            {/* Desktop: table layout */}
                            <div className="hidden md:block overflow-x-auto">
                                <table className="w-full text-sm border-collapse">
                                    <thead>
                                        <tr className="bg-gray-50">
                                            <th className="border border-gray-300 px-2 py-1 text-left w-28">種類等</th>
                                            <th className="border border-gray-300 px-2 py-1 text-center" colSpan={3}>交付年月日</th>
                                            <th className="border border-gray-300 px-2 py-1 text-center">交付番号</th>
                                            <th className="border border-gray-300 px-2 py-1 text-center" colSpan={3}>有効期限</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {KENSA_TYPES.map(({ key, label }) => {
                                            const lic = inspectors[idx].kensa_licenses[key]
                                            const issueDate = toDateInputValueFromParts(lic.issue_year, lic.issue_month, lic.issue_day)
                                            const expiryDate = toDateInputValueFromParts(lic.expiry_year, lic.expiry_month, lic.expiry_day)
                                            return (
                                                <tr key={key}>
                                                    <td className="border border-gray-300 px-2 py-1 text-sm whitespace-nowrap">{label}</td>
                                                    {/* 交付年月日 (colSpan=3) */}
                                                    <td className="border border-gray-300 px-1 py-1" colSpan={3}>
                                                        <Input type="date" className="h-9 w-full min-w-0 text-sm" value={issueDate}
                                                            onChange={e => {
                                                                const { year, month, day } = splitDateInputValue(e.target.value)
                                                                updateKensaLicense(idx, key, "issue_year", year)
                                                                updateKensaLicense(idx, key, "issue_month", month)
                                                                updateKensaLicense(idx, key, "issue_day", day)
                                                            }} />
                                                    </td>
                                                    {/* 交付番号 */}
                                                    <td className="border border-gray-300 px-1 py-1">
                                                        <Input className="h-9 w-full min-w-0 text-sm px-1" placeholder="交付番号" value={lic.license_number}
                                                            onChange={e => updateKensaLicense(idx, key, "license_number", e.target.value)} />
                                                    </td>
                                                    {/* 有効期限 (colSpan=3) */}
                                                    <td className="border border-gray-300 px-1 py-1" colSpan={3}>
                                                        <Input type="date" className="h-9 w-full min-w-0 text-sm" value={expiryDate}
                                                            onChange={e => {
                                                                const { year, month, day } = splitDateInputValue(e.target.value)
                                                                updateKensaLicense(idx, key, "expiry_year", year)
                                                                updateKensaLicense(idx, key, "expiry_month", month)
                                                                updateKensaLicense(idx, key, "expiry_day", day)
                                                            }} />
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile: 1 免状 = 1 カード */}
                            <div className="md:hidden space-y-3">
                                {KENSA_TYPES.map(({ key, label }) => {
                                    const lic = inspectors[idx].kensa_licenses[key]
                                    const issueDate = toDateInputValueFromParts(lic.issue_year, lic.issue_month, lic.issue_day)
                                    const expiryDate = toDateInputValueFromParts(lic.expiry_year, lic.expiry_month, lic.expiry_day)
                                    return (
                                        <div key={`${key}-mobile`} className="border border-gray-300 rounded-lg p-3 space-y-2 bg-white">
                                            <div className="font-medium text-sm text-slate-800">{label}</div>
                                            <div className="space-y-1 min-w-0">
                                                <span className="text-xs text-slate-500">交付年月日</span>
                                                <Input type="date" className="h-9 w-full min-w-0 text-sm" value={issueDate}
                                                    onChange={e => {
                                                        const { year, month, day } = splitDateInputValue(e.target.value)
                                                        updateKensaLicense(idx, key, "issue_year", year)
                                                        updateKensaLicense(idx, key, "issue_month", month)
                                                        updateKensaLicense(idx, key, "issue_day", day)
                                                    }} />
                                            </div>
                                            <div className="space-y-1 min-w-0">
                                                <span className="text-xs text-slate-500">交付番号</span>
                                                <Input className="h-9 w-full min-w-0 text-sm" placeholder="交付番号" value={lic.license_number}
                                                    onChange={e => updateKensaLicense(idx, key, "license_number", e.target.value)} />
                                            </div>
                                            <div className="space-y-1 min-w-0">
                                                <span className="text-xs text-slate-500">有効期限</span>
                                                <Input type="date" className="h-9 w-full min-w-0 text-sm" value={expiryDate}
                                                    onChange={e => {
                                                        const { year, month, day } = splitDateInputValue(e.target.value)
                                                        updateKensaLicense(idx, key, "expiry_year", year)
                                                        updateKensaLicense(idx, key, "expiry_month", month)
                                                        updateKensaLicense(idx, key, "expiry_day", day)
                                                    }} />
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ))}

            <div className="flex justify-end pb-8">
                <Button type="submit" disabled={loading} size="lg" className="px-12">
                    {loading ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />保存中...</>
                    ) : (
                        "保存してプレビューへ"
                    )}
                </Button>
            </div>
        </form>
    )
}
