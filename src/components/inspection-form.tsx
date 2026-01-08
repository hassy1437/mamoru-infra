"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Plus, Trash2, Loader2 } from "lucide-react"

export default function InspectionForm() {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)

    // フォームの状態管理
    const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0])
    // ★削除: 消防長のStateを削除しました

    // 届出者情報
    const [notifierAddress, setNotifierAddress] = useState("")
    const [notifierName, setNotifierName] = useState("")
    const [notifierPhone, setNotifierPhone] = useState("")

    // 防火対象物情報
    const [buildingAddress, setBuildingAddress] = useState("")
    const [buildingName, setBuildingName] = useState("")
    const [buildingUsage, setBuildingUsage] = useState("")
    const [floorAbove, setFloorAbove] = useState("")
    const [floorBelow, setFloorBelow] = useState("")
    const [totalFloorArea, setTotalFloorArea] = useState("")

    // 消防用設備等
    const [equipmentList, setEquipmentList] = useState<{ id: string, name: string }[]>([
        { id: '1', name: '' }
    ])

    const addEquipment = () => {
        setEquipmentList([...equipmentList, { id: crypto.randomUUID(), name: '' }])
    }

    const removeEquipment = (id: string) => {
        setEquipmentList(equipmentList.filter(item => item.id !== id))
    }

    const updateEquipment = (id: string, value: string) => {
        setEquipmentList(equipmentList.map(item =>
            item.id === id ? { ...item, name: value } : item
        ))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)
        setSuccess(false)

        try {
            // データベースに送信
            const { data, error: insertError } = await supabase
                .from('inspection_reports')
                .insert({
                    report_date: reportDate,
                    // ★削除: fire_department_name の送信をやめました
                    fire_department_name: "", // ← ★この1行を追加！(空文字を送る)
                    notifier_address: notifierAddress,
                    notifier_name: notifierName,
                    notifier_phone: notifierPhone,
                    building_address: buildingAddress,
                    building_name: buildingName,
                    building_usage: buildingUsage,
                    floor_above: floorAbove ? parseInt(floorAbove) : null,
                    floor_below: floorBelow ? parseInt(floorBelow) : null,
                    total_floor_area: totalFloorArea ? parseFloat(totalFloorArea) : null,
                    equipment_types: equipmentList.map(e => e.name).filter(n => n.trim() !== ''),
                    status: 'submitted'
                })
                .select()
                .single()

            if (insertError) throw insertError

            setSuccess(true)

            // プレビュー画面へ移動
            setTimeout(() => {
                router.push(`/reports/${data.id}`)
            }, 1000)

        } catch (err: any) {
            console.error(err)
            setError(err.message || "レポートの保存中にエラーが発生しました。")
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
                    <CardTitle>基本情報</CardTitle>
                    <CardDescription>報告日を入力してください。</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="reportDate">報告日</Label>
                        <Input
                            id="reportDate"
                            type="date"
                            required
                            value={reportDate}
                            onChange={(e) => setReportDate(e.target.value)}
                        />
                    </div>
                    {/* ★削除: 消防長の入力欄をここから削除しました */}
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

            {/* 消防用設備等 */}
            <Card>
                <CardHeader>
                    <CardTitle>設置されている消防用設備等</CardTitle>
                    <CardDescription>建物に設置されている設備をリストアップしてください。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {equipmentList.map((item, index) => (
                        <div key={item.id} className="flex gap-2">
                            <Input
                                placeholder={`設備名 ${index + 1}`}
                                value={item.name}
                                onChange={(e) => updateEquipment(item.id, e.target.value)}
                            />
                            <Button
                                type="button"
                                variant="destructive"
                                size="icon"
                                onClick={() => removeEquipment(item.id)}
                                disabled={equipmentList.length === 1}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    ))}
                    <Button type="button" variant="outline" onClick={addEquipment} className="w-full">
                        <Plus className="mr-2 h-4 w-4" /> 設備を追加
                    </Button>
                </CardContent>
            </Card>

            <div className="flex justify-end pt-4">
                <Button type="submit" size="lg" disabled={loading} className="w-full md:w-auto">
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {loading ? "保存中..." : "報告書を作成する"}
                </Button>
            </div>
        </form>
    )
}