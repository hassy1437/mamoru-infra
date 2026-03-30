"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Building2 } from "lucide-react"
import type { Property } from "@/types/database"
import { ALL_EQUIPMENT_TYPES, getEnabledEquipmentTypes } from "@/lib/equipment-config"

type EquipmentResult = {
    name: string
    result: "指摘なし" | "要改善" | "該当なし"
}

interface SoukatsuFormProps {
    property?: Property
    previousData?: Record<string, unknown> | null
}

export default function SoukatsuForm({ property, previousData }: SoukatsuFormProps) {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)

    // 基本情報
    const [inspectionDate, setInspectionDate] = useState(new Date().toISOString().split('T')[0])
    const [inspectionType, setInspectionType] = useState<string>(
        (previousData?.inspection_type as string) || "機器点検"
    )
    const [periodStart, setPeriodStart] = useState("")
    const [periodEnd, setPeriodEnd] = useState("")

    // 届出者情報（物件マスターから初期化）
    const [notifierAddress, setNotifierAddress] = useState(property?.notifier_address ?? "")
    const [notifierName, setNotifierName] = useState(property?.notifier_name ?? "")
    const [notifierPhone, setNotifierPhone] = useState(property?.notifier_phone ?? "")

    // 防火対象物情報（物件マスターから初期化）
    const [buildingAddress, setBuildingAddress] = useState(property?.building_address ?? "")
    const [buildingName, setBuildingName] = useState(property?.building_name ?? "")
    const [buildingUsage, setBuildingUsage] = useState(property?.building_usage ?? "")
    const [buildingStructure, setBuildingStructure] = useState(property?.building_structure ?? "")
    const [floorAbove, setFloorAbove] = useState(property?.floor_above?.toString() ?? "")
    const [floorBelow, setFloorBelow] = useState(property?.floor_below?.toString() ?? "")
    const [totalFloorArea, setTotalFloorArea] = useState(property?.total_floor_area?.toString() ?? "")

    // 点検結果：物件マスターで選択した設備のみ表示、初期値「指摘なし」
    // 物件なしの場合は有効設備のみ・初期値「該当なし」
    // 前回コピーがある場合は前回の結果を初期値にする
    const [equipmentResults, setEquipmentResults] = useState<EquipmentResult[]>(() => {
        const prevResults = previousData?.equipment_results as EquipmentResult[] | undefined
        if (prevResults && prevResults.length > 0) {
            // 前回の結果をベースに、物件の設備リストと照合
            const equipTypes = property?.equipment_types ?? ALL_EQUIPMENT_TYPES
            return equipTypes.map(name => {
                const prev = prevResults.find(r => r.name === name)
                return prev ? { name, result: prev.result } : { name, result: "指摘なし" as const }
            })
        }
        return property && (property.equipment_types ?? []).length > 0
            ? (property.equipment_types ?? []).map(name => ({ name, result: "指摘なし" as const }))
            : [...ALL_EQUIPMENT_TYPES].map(name => ({ name, result: "該当なし" as const }))
    })

    // 総合判定・備考
    const [overallJudgment, setOverallJudgment] = useState(
        (previousData?.overall_judgment as string) || ""
    )
    const [notes, setNotes] = useState(
        (previousData?.notes as string) || ""
    )

    const updateEquipmentResult = (index: number, result: EquipmentResult["result"]) => {
        setEquipmentResults(prev =>
            prev.map((item, i) => i === index ? { ...item, result } : item)
        )
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)
        setSuccess(false)

        try {
            const { data, error: insertError } = await supabase
                .from('inspection_soukatsu')
                .insert({
                    inspection_date: inspectionDate,
                    inspection_type: inspectionType,
                    inspection_period_start: periodStart || null,
                    inspection_period_end: periodEnd || null,
                    notifier_address: notifierAddress,
                    notifier_name: notifierName,
                    notifier_phone: notifierPhone || null,
                    building_address: buildingAddress,
                    building_name: buildingName,
                    building_usage: buildingUsage,
                    building_structure: buildingStructure || null,
                    floor_above: floorAbove ? parseInt(floorAbove) : null,
                    floor_below: floorBelow ? parseInt(floorBelow) : null,
                    total_floor_area: totalFloorArea ? parseFloat(totalFloorArea) : null,
                    equipment_results: equipmentResults.filter(e => e.result !== "該当なし"),
                    overall_judgment: overallJudgment || null,
                    notes: notes || null,
                    property_id: property?.id ?? null,
                })
                .select()
                .single()

            if (insertError) throw insertError

            setSuccess(true)
            setTimeout(() => {
                router.push(`/inspection/${data.id}`)
            }, 1000)
        } catch (err: unknown) {
            console.error(err)
            setError((err as Error).message || "保存中にエラーが発生しました。")
        } finally {
            setLoading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl mx-auto p-4">
            {error && (
                <div className="bg-red-50 text-red-600 p-4 rounded-md border border-red-200">
                    エラー: {error}
                </div>
            )}
            {success && (
                <div className="bg-green-50 text-green-600 p-4 rounded-md border border-green-200">
                    保存成功！プレビュー画面へ移動します...
                </div>
            )}

            {/* 物件マスター転記バナー */}
            {property && (
                <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                    <Building2 className="w-5 h-5 text-blue-600 shrink-0" />
                    <div className="text-sm">
                        <span className="font-semibold text-blue-800">{property.building_name}</span>
                        <span className="text-blue-600"> の情報を転記しました。必要に応じて修正してください。</span>
                    </div>
                </div>
            )}

            {/* 基本情報 */}
            <Card>
                <CardHeader>
                    <CardTitle>点検基本情報</CardTitle>
                    <CardDescription>点検の日付・種別・期間を入力してください。</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="inspectionDate" required>点検年月日</Label>
                        <Input
                            id="inspectionDate"
                            type="date"
                            required
                            value={inspectionDate}
                            onChange={(e) => setInspectionDate(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="inspectionType">点検の種別</Label>
                        <div className="flex gap-4 pt-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="inspectionType"
                                    value="機器点検"
                                    checked={inspectionType === "機器点検"}
                                    onChange={(e) => setInspectionType(e.target.value)}
                                    className="w-4 h-4 text-blue-600"
                                />
                                <span>機器点検</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="inspectionType"
                                    value="総合点検"
                                    checked={inspectionType === "総合点検"}
                                    onChange={(e) => setInspectionType(e.target.value)}
                                    className="w-4 h-4 text-blue-600"
                                />
                                <span>総合点検</span>
                            </label>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="periodStart">点検期間（開始）</Label>
                        <Input
                            id="periodStart"
                            type="date"
                            value={periodStart}
                            onChange={(e) => setPeriodStart(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="periodEnd">点検期間（終了）</Label>
                        <Input
                            id="periodEnd"
                            type="date"
                            value={periodEnd}
                            onChange={(e) => setPeriodEnd(e.target.value)}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* 届出者情報 */}
            <Card>
                <CardHeader>
                    <CardTitle>届出者情報</CardTitle>
                    <CardDescription>
                        {property ? "物件マスターから転記しました。" : "報告する人の情報を入力してください。"}
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="notifierName" required>氏名（名称）</Label>
                        <Input
                            id="notifierName"
                            placeholder="氏名を入力"
                            required
                            value={notifierName}
                            onChange={(e) => setNotifierName(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="notifierAddress" required>住所</Label>
                        <Input
                            id="notifierAddress"
                            placeholder="届出者の住所"
                            required
                            value={notifierAddress}
                            onChange={(e) => setNotifierAddress(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="notifierPhone">電話番号</Label>
                        <Input
                            id="notifierPhone"
                            placeholder="090-1234-5678"
                            type="tel"
                            value={notifierPhone}
                            onChange={(e) => setNotifierPhone(e.target.value)}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* 防火対象物情報 */}
            <Card>
                <CardHeader>
                    <CardTitle>防火対象物</CardTitle>
                    <CardDescription>
                        {property ? "物件マスターから転記しました。" : "点検対象の建物詳細を入力してください。"}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid gap-6 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="buildingName" required>名称</Label>
                            <Input
                                id="buildingName"
                                placeholder="建物名"
                                required
                                value={buildingName}
                                onChange={(e) => setBuildingName(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="buildingUsage" required>用途</Label>
                            <Input
                                id="buildingUsage"
                                placeholder="例：共同住宅、事務所"
                                required
                                value={buildingUsage}
                                onChange={(e) => setBuildingUsage(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                            <Label htmlFor="buildingAddress" required>所在地</Label>
                            <Input
                                id="buildingAddress"
                                placeholder="防火対象物の所在地"
                                required
                                value={buildingAddress}
                                onChange={(e) => setBuildingAddress(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="buildingStructure">構造</Label>
                            <Input
                                id="buildingStructure"
                                placeholder="例：鉄筋コンクリート造"
                                value={buildingStructure}
                                onChange={(e) => setBuildingStructure(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="floorAbove">地上階数</Label>
                            <Input
                                id="floorAbove"
                                type="number"
                                min="0"
                                value={floorAbove}
                                onChange={(e) => setFloorAbove(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="floorBelow">地下階数</Label>
                            <Input
                                id="floorBelow"
                                type="number"
                                min="0"
                                value={floorBelow}
                                onChange={(e) => setFloorBelow(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="totalFloorArea">延べ面積 (㎡)</Label>
                            <Input
                                id="totalFloorArea"
                                type="number"
                                min="0"
                                step="0.01"
                                value={totalFloorArea}
                                onChange={(e) => setTotalFloorArea(e.target.value)}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* 点検結果 */}
            <Card>
                <CardHeader>
                    <CardTitle>消防用設備等の点検結果</CardTitle>
                    <CardDescription>
                        {property
                            ? `物件に登録された${equipmentResults.length}種類の設備の点検結果を選択してください。`
                            : "該当する設備の点検結果を選択してください。「該当なし」の設備はPDFに記載されません。"
                        }
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {equipmentResults.map((item, index) => (
                            <div key={item.name} className="flex items-center justify-between gap-4 py-2 border-b border-slate-100 last:border-0">
                                <span className="text-sm font-medium text-slate-700 min-w-[200px]">{item.name}</span>
                                <div className="flex gap-2">
                                    {(property
                                        ? ["指摘なし", "要改善"] as const
                                        : ["該当なし", "指摘なし", "要改善"] as const
                                    ).map(result => (
                                        <button
                                            key={result}
                                            type="button"
                                            onClick={() => updateEquipmentResult(index, result)}
                                            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
                                                item.result === result
                                                    ? result === "指摘なし"
                                                        ? "bg-green-100 text-green-700 ring-2 ring-green-500"
                                                        : result === "要改善"
                                                            ? "bg-red-100 text-red-700 ring-2 ring-red-500"
                                                            : "bg-slate-200 text-slate-600 ring-2 ring-slate-400"
                                                    : "bg-slate-50 text-slate-400 hover:bg-slate-100"
                                            }`}
                                        >
                                            {result}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* 総合判定・備考 */}
            <Card>
                <CardHeader>
                    <CardTitle>総合判定・備考</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="overallJudgment">総合判定</Label>
                        <div className="flex gap-4 pt-1">
                            {["適合", "不適合", ""].map(value => (
                                <label key={value || "none"} className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="overallJudgment"
                                        value={value}
                                        checked={overallJudgment === value}
                                        onChange={(e) => setOverallJudgment(e.target.value)}
                                        className="w-4 h-4 text-blue-600"
                                    />
                                    <span>{value || "未選択"}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="notes">備考</Label>
                        <Textarea
                            id="notes"
                            placeholder="特記事項があれば入力してください"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={4}
                        />
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end pt-4">
                <Button type="submit" size="lg" disabled={loading} className="w-full md:w-auto">
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {loading ? "保存中..." : "点検結果を保存する"}
                </Button>
            </div>
        </form>
    )
}
