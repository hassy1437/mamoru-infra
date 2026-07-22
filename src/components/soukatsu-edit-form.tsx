"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { UsageSelect } from "@/components/usage-select"
import { FloorSelect } from "@/components/floor-select"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { friendlyError } from "@/lib/error-messages"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { toDateInputValue } from "@/lib/date-utils"

// 編集対象の soukatsu 行（必要な列を緩く受ける）。プリフィル元＝この soukatsu 自身。
type SoukatsuRow = Record<string, unknown> & { id: string }

interface SoukatsuEditFormProps {
    soukatsu: SoukatsuRow
    isDelivered?: boolean
}

const str = (v: unknown) => (v == null ? "" : String(v))

// ★作成フォーム(soukatsu-form)と「同一の制約」で幹を編集する目的特化フォーム。
//   - 制約(必須/選択肢/型)は作成フォームと揃える（片方だけ緩いと編集経由でしか作れない状態を生む）。
//   - equipment_results は編集対象外＝state も持たず update にも含めない（既存の点検結果を絶対に消さない）。
//   - update は編集項目「だけ」の部分更新。updated_at は BEFORE UPDATE トリガが自動で立てる。
export default function SoukatsuEditForm({ soukatsu, isDelivered }: SoukatsuEditFormProps) {
    const router = useRouter()
    const { user } = useAuth()
    const { markDirty, markClean } = useUnsavedChanges()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [inspectionDate, setInspectionDate] = useState(str(soukatsu.inspection_date))
    const [inspectionType, setInspectionType] = useState(str(soukatsu.inspection_type) || "機器点検")
    const [periodStart, setPeriodStart] = useState(str(soukatsu.inspection_period_start))
    const [periodEnd, setPeriodEnd] = useState(str(soukatsu.inspection_period_end))
    const [notifierAddress, setNotifierAddress] = useState(str(soukatsu.notifier_address))
    const [notifierName, setNotifierName] = useState(str(soukatsu.notifier_name))
    const [notifierPhone, setNotifierPhone] = useState(str(soukatsu.notifier_phone))
    const [buildingAddress, setBuildingAddress] = useState(str(soukatsu.building_address))
    const [buildingName, setBuildingName] = useState(str(soukatsu.building_name))
    const [buildingUsage, setBuildingUsage] = useState(str(soukatsu.building_usage))
    const [buildingStructure, setBuildingStructure] = useState(str(soukatsu.building_structure))
    const [floorAbove, setFloorAbove] = useState(soukatsu.floor_above != null ? String(soukatsu.floor_above) : "")
    const [floorBelow, setFloorBelow] = useState(soukatsu.floor_below != null ? String(soukatsu.floor_below) : "")
    const [totalFloorArea, setTotalFloorArea] = useState(soukatsu.total_floor_area != null ? String(soukatsu.total_floor_area) : "")
    const [overallJudgment, setOverallJudgment] = useState(str(soukatsu.overall_judgment))
    const [notes, setNotes] = useState(str(soukatsu.notes))

    useEffect(() => {
        const form = document.querySelector("form")
        if (!form) return
        const handler = () => markDirty()
        form.addEventListener("input", handler)
        return () => form.removeEventListener("input", handler)
    }, [markDirty])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)
        try {
            // ★部分更新: 編集項目「だけ」を送る。equipment_results / cloned_* / id / created_at / user_id は
            //   update object に含めない＝既存の点検結果・複製由来を絶対に上書きしない。updated_at はトリガ任せ。
            const { error: updateError } = await supabase
                .from("inspection_soukatsu")
                .update({
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
                    overall_judgment: overallJudgment || null,
                    notes: notes || null,
                })
                .eq("id", soukatsu.id)
                .eq("user_id", user?.id ?? "") // RLS に加えた二重防御（properties/[id]/edit と同じ作法）

            if (updateError) throw updateError

            markClean()
            toast.success("総括表を更新しました")
            router.push(`/inspection/${soukatsu.id}`)
        } catch (err: unknown) {
            console.error(err)
            const msg = friendlyError(err)
            setError(msg)
            toast.error(msg)
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

            {/* 納品済み注意（納品済みのときだけ・修正の反映には再納品が要る） */}
            {isDelivered && (
                <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-800">
                        この報告書はオーナーへ<strong>納品済み</strong>です。修正内容をオーナーに反映するには、保存後に
                        <strong>結果出力から再納品</strong>してください（新しい版として差し替わります）。
                    </div>
                </div>
            )}

            {/* 基本情報 */}
            <Card>
                <CardHeader><CardTitle>点検基本情報</CardTitle></CardHeader>
                <CardContent className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2 min-w-0">
                        <Label htmlFor="inspectionDate" required>点検年月日</Label>
                        <Input id="inspectionDate" type="date" className="min-w-0" required
                            value={toDateInputValue(inspectionDate)}
                            onChange={(e) => setInspectionDate(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="inspectionType">点検の種別</Label>
                        <div className="flex gap-4 pt-2">
                            {["機器点検", "総合点検"].map((t) => (
                                <label key={t} className="flex items-center gap-2 cursor-pointer">
                                    <input type="radio" name="inspectionType" value={t}
                                        checked={inspectionType === t}
                                        onChange={(e) => setInspectionType(e.target.value)}
                                        className="w-4 h-4 text-blue-600" />
                                    <span>{t}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-2 min-w-0">
                        <Label htmlFor="periodStart">点検期間（開始）</Label>
                        <Input id="periodStart" type="date" className="min-w-0"
                            value={toDateInputValue(periodStart)}
                            onChange={(e) => setPeriodStart(e.target.value)} />
                    </div>
                    <div className="space-y-2 min-w-0">
                        <Label htmlFor="periodEnd">点検期間（終了）</Label>
                        <Input id="periodEnd" type="date" className="min-w-0"
                            value={toDateInputValue(periodEnd)}
                            onChange={(e) => setPeriodEnd(e.target.value)} />
                    </div>
                </CardContent>
            </Card>

            {/* 届出者情報 */}
            <Card>
                <CardHeader><CardTitle>届出者情報</CardTitle></CardHeader>
                <CardContent className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="notifierName" required>氏名（名称）</Label>
                        <Input id="notifierName" required value={notifierName}
                            onChange={(e) => setNotifierName(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="notifierAddress" required>住所</Label>
                        <Input id="notifierAddress" required value={notifierAddress}
                            onChange={(e) => setNotifierAddress(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="notifierPhone">電話番号</Label>
                        <Input id="notifierPhone" type="tel" value={notifierPhone}
                            onChange={(e) => setNotifierPhone(e.target.value)} />
                    </div>
                </CardContent>
            </Card>

            {/* 防火対象物 */}
            <Card>
                <CardHeader><CardTitle>防火対象物</CardTitle></CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid gap-6 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="buildingName" required>名称</Label>
                            <Input id="buildingName" required value={buildingName}
                                onChange={(e) => setBuildingName(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="buildingUsage" required>用途</Label>
                            <UsageSelect id="buildingUsage" required value={buildingUsage} onChange={setBuildingUsage} />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                            <Label htmlFor="buildingAddress" required>所在地</Label>
                            <Input id="buildingAddress" required value={buildingAddress}
                                onChange={(e) => setBuildingAddress(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="buildingStructure">構造</Label>
                            <Input id="buildingStructure" value={buildingStructure}
                                onChange={(e) => setBuildingStructure(e.target.value)} />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="floorAbove">地上階数</Label>
                            <FloorSelect id="floorAbove" min={1} max={30} value={floorAbove} onChange={setFloorAbove} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="floorBelow">地下階数</Label>
                            <FloorSelect id="floorBelow" min={0} max={5} value={floorBelow} onChange={setFloorBelow} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="totalFloorArea">延べ面積 (㎡)</Label>
                            <Input id="totalFloorArea" type="number" inputMode="decimal" min="0" step="0.01"
                                value={totalFloorArea} onChange={(e) => setTotalFloorArea(e.target.value)} />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* 総合判定・備考（equipment_results はここでは編集しない） */}
            <Card>
                <CardHeader><CardTitle>総合判定・備考</CardTitle></CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="overallJudgment">総合判定</Label>
                        <div className="flex gap-4 pt-1">
                            {["適合", "不適合", ""].map((value) => (
                                <label key={value || "none"} className="flex items-center gap-2 cursor-pointer">
                                    <input type="radio" name="overallJudgment" value={value}
                                        checked={overallJudgment === value}
                                        onChange={(e) => setOverallJudgment(e.target.value)}
                                        className="w-4 h-4 text-blue-600" />
                                    <span>{value || "未選択"}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="notes">備考</Label>
                        <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end pt-4">
                <Button type="submit" size="lg" disabled={loading} className="w-full md:w-auto">
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {loading ? "保存中..." : "変更を保存する"}
                </Button>
            </div>
        </form>
    )
}
