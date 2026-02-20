"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Loader2 } from "lucide-react"

const EQUIPMENT_LIST = [
    "消火器",
    "屋内消火栓設備",
    "スプリンクラー設備",
    "水噴霧消火設備",
    "泡消火設備",
    "不活性ガス消火設備",
    "ハロゲン化物消火設備",
    "粉末消火設備",
    "屋外消火栓設備",
    "動力消防ポンプ設備",
    "自動火災報知設備",
    "ガス漏れ火災警報設備",
    "漏電火災警報器",
    "消防機関へ通報する火災報知設備",
    "非常警報器具・設備",
    "避難器具",
    "誘導灯・誘導標識",
    "消防用水",
    "排煙設備",
    "連結散水設備",
    "連結送水管",
    "非常コンセント設備",
    "無線通信補助設備",
] as const

type EquipmentResult = {
    name: string
    result: "指摘なし" | "要改善" | "該当なし"
}

export default function SoukatsuForm() {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)

    // 基本情報
    const [inspectionDate, setInspectionDate] = useState(new Date().toISOString().split('T')[0])
    const [inspectionType, setInspectionType] = useState<string>("機器点検")
    const [periodStart, setPeriodStart] = useState("")
    const [periodEnd, setPeriodEnd] = useState("")

    // 届出者情報
    const [notifierAddress, setNotifierAddress] = useState("")
    const [notifierName, setNotifierName] = useState("")
    const [notifierPhone, setNotifierPhone] = useState("")

    // 防火対象物情報
    const [buildingAddress, setBuildingAddress] = useState("")
    const [buildingName, setBuildingName] = useState("")
    const [buildingUsage, setBuildingUsage] = useState("")
    const [buildingStructure, setBuildingStructure] = useState("")
    const [floorAbove, setFloorAbove] = useState("")
    const [floorBelow, setFloorBelow] = useState("")
    const [totalFloorArea, setTotalFloorArea] = useState("")

    // 点検結果
    const [equipmentResults, setEquipmentResults] = useState<EquipmentResult[]>(
        EQUIPMENT_LIST.map(name => ({ name, result: "該当なし" }))
    )

    // 総合判定・備考
    const [overallJudgment, setOverallJudgment] = useState("")
    const [notes, setNotes] = useState("")

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
                })
                .select()
                .single()

            if (insertError) throw insertError

            setSuccess(true)
            setTimeout(() => {
                router.push(`/inspection/${data.id}`)
            }, 1000)
        } catch (err: any) {
            console.error(err)
            setError(err.message || "保存中にエラーが発生しました。")
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

            {/* 基本情報 */}
            <Card>
                <CardHeader>
                    <CardTitle>点検基本情報</CardTitle>
                    <CardDescription>点検の日付・種別・期間を入力してください。</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="inspectionDate">点検年月日</Label>
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
                    <CardDescription>報告する人の情報を入力してください。</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="notifierName">氏名（名称）</Label>
                        <Input
                            id="notifierName"
                            placeholder="氏名を入力"
                            required
                            value={notifierName}
                            onChange={(e) => setNotifierName(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="notifierAddress">住所</Label>
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
                    <CardDescription>点検対象の建物詳細を入力してください。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid gap-6 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="buildingName">名称</Label>
                            <Input
                                id="buildingName"
                                placeholder="建物名"
                                required
                                value={buildingName}
                                onChange={(e) => setBuildingName(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="buildingUsage">用途</Label>
                            <Input
                                id="buildingUsage"
                                placeholder="例：共同住宅、事務所"
                                required
                                value={buildingUsage}
                                onChange={(e) => setBuildingUsage(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                            <Label htmlFor="buildingAddress">所在地</Label>
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
                    <div className="grid grid-cols-3 gap-4">
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
                    <CardDescription>該当する設備の点検結果を選択してください。「該当なし」の設備はPDFに記載されません。</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {equipmentResults.map((item, index) => (
                            <div key={item.name} className="flex items-center justify-between gap-4 py-2 border-b border-slate-100 last:border-0">
                                <span className="text-sm font-medium text-slate-700 min-w-[200px]">{item.name}</span>
                                <div className="flex gap-2">
                                    {(["該当なし", "指摘なし", "要改善"] as const).map(result => (
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
