"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Loader2 } from "lucide-react"
import type { Property } from "@/types/database"
import { ALL_EQUIPMENT_TYPES, getEnabledEquipmentTypes } from "@/lib/equipment-config"

interface PropertyFormProps {
    property?: Property
}

export default function PropertyForm({ property }: PropertyFormProps) {
    const router = useRouter()
    const { user } = useAuth()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // 届出者情報
    const [notifierName, setNotifierName] = useState(property?.notifier_name ?? "")
    const [notifierAddress, setNotifierAddress] = useState(property?.notifier_address ?? "")
    const [notifierPhone, setNotifierPhone] = useState(property?.notifier_phone ?? "")

    // 防火対象物情報
    const [buildingName, setBuildingName] = useState(property?.building_name ?? "")
    const [buildingAddress, setBuildingAddress] = useState(property?.building_address ?? "")
    const [buildingUsage, setBuildingUsage] = useState(property?.building_usage ?? "")
    const [buildingStructure, setBuildingStructure] = useState(property?.building_structure ?? "")
    const [floorAbove, setFloorAbove] = useState(property?.floor_above?.toString() ?? "")
    const [floorBelow, setFloorBelow] = useState(property?.floor_below?.toString() ?? "")
    const [totalFloorArea, setTotalFloorArea] = useState(property?.total_floor_area?.toString() ?? "")

    // 設置設備
    const [selectedEquipment, setSelectedEquipment] = useState<string[]>(property?.equipment_types ?? [])
    const [enabledTypes, setEnabledTypes] = useState<string[]>([...ALL_EQUIPMENT_TYPES])
    useEffect(() => { setEnabledTypes(getEnabledEquipmentTypes()) }, [])

    const toggleEquipment = (name: string) => {
        setSelectedEquipment(prev =>
            prev.includes(name) ? prev.filter(e => e !== name) : [...prev, name]
        )
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (selectedEquipment.length === 0) {
            setError("設置されている消防用設備等を1つ以上選択してください。")
            return
        }
        setLoading(true)
        setError(null)

        try {
            const payload = {
                name: buildingName,
                address: buildingAddress,
                usage_type: buildingUsage,
                floor_area: totalFloorArea ? parseFloat(totalFloorArea) : null,
                notifier_name: notifierName,
                notifier_address: notifierAddress,
                notifier_phone: notifierPhone || null,
                building_name: buildingName,
                building_address: buildingAddress,
                building_usage: buildingUsage,
                building_structure: buildingStructure || null,
                floor_above: floorAbove ? parseInt(floorAbove) : null,
                floor_below: floorBelow ? parseInt(floorBelow) : null,
                total_floor_area: totalFloorArea ? parseFloat(totalFloorArea) : null,
                equipment_types: selectedEquipment,
                updated_at: new Date().toISOString(),
            }

            if (property?.id) {
                const { error: updateError } = await supabase
                    .from("properties")
                    .update(payload)
                    .eq("id", property.id)
                if (updateError) throw updateError
            } else {
                const { error: insertError } = await supabase
                    .from("properties")
                    .insert({ ...payload, user_id: user?.id })
                if (insertError) throw insertError
            }

            router.push("/properties")
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
                    {error}
                </div>
            )}

            {/* 届出者情報 */}
            <Card>
                <CardHeader>
                    <CardTitle>届出者情報</CardTitle>
                    <CardDescription>点検報告の届出者情報を入力してください。</CardDescription>
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
                    <CardDescription>点検対象の建物情報を入力してください。</CardDescription>
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

            {/* 設置されている消防用設備等 */}
            <Card>
                <CardHeader>
                    <CardTitle>設置されている消防用設備等</CardTitle>
                    <CardDescription>
                        この物件に設置されている消防用設備等をすべて選択してください。
                        点検時はここで選択した設備のみが点検結果の入力対象となります。
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {ALL_EQUIPMENT_TYPES.filter(t => enabledTypes.includes(t)).map((name) => (
                            <label
                                key={name}
                                className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all ${
                                    selectedEquipment.includes(name)
                                        ? "bg-blue-50 border-blue-400 text-blue-800"
                                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                }`}
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedEquipment.includes(name)}
                                    onChange={() => toggleEquipment(name)}
                                    className="w-4 h-4 text-blue-600 rounded"
                                />
                                <span className="text-sm font-medium">{name}</span>
                            </label>
                        ))}
                    </div>
                    {selectedEquipment.length > 0 && (
                        <p className="mt-4 text-sm text-blue-600 font-medium">
                            {selectedEquipment.length}種類の設備を選択中
                        </p>
                    )}
                </CardContent>
            </Card>

            <div className="flex justify-end pt-4">
                <Button type="submit" size="lg" disabled={loading} className="w-full md:w-auto">
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {loading ? "保存中..." : property ? "物件情報を更新する" : "物件情報を登録する"}
                </Button>
            </div>
        </form>
    )
}
