"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { UsageSelect } from "@/components/usage-select"
import { FloorSelect } from "@/components/floor-select"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Building2, CheckCircle2, AlertTriangle, MinusCircle } from "lucide-react"
import { toast } from "sonner"
import { friendlyError } from "@/lib/error-messages"
import type { Property } from "@/types/database"
import { ALL_EQUIPMENT_TYPES } from "@/lib/equipment-config"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import FormProgress from "@/components/form-progress"
import { toDateInputValue } from "@/lib/date-utils"

const FORM_SECTIONS = [
    "点検基本情報",
    "届出者情報",
    "防火対象物",
    "点検結果",
    "総合判定・備考",
]

type EquipmentResult = {
    name: string
    result: "指摘なし" | "要改善" | "該当なし"
}

interface SoukatsuFormProps {
    property?: Property
    previousData?: Record<string, unknown> | null
    /** 複製元 soukatsu の id。指定時は複製モード（プリフィル元=複製元soukatsu・submit後にサブツリー複製）。 */
    copyFromId?: string | null
    /** 複製元 itiran の id（output の「この報告書を複製」で明示。未指定なら RPC が本命 itiran を自動選択）。 */
    sourceItiranId?: string | null
}

export default function SoukatsuForm({ property, previousData, copyFromId, sourceItiranId }: SoukatsuFormProps) {
    const router = useRouter()
    const { user } = useAuth()
    const { markDirty, markClean } = useUnsavedChanges()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    // 複製モード: プリフィル元は物件マスタでなく「複製元 soukatsu」(= previousData 全列)。
    const isClone = !!copyFromId
    const src = (k: string) => (previousData?.[k] != null ? String(previousData[k]) : "")

    // 基本情報
    const initialInspectionDate = new Date().toISOString().split('T')[0]
    const [inspectionDate, setInspectionDate] = useState(initialInspectionDate)
    const [inspectionType, setInspectionType] = useState<string>(
        (previousData?.inspection_type as string) || "機器点検"
    )
    // 点検期間は点検年月日に追従する。初期値は点検年月日（today）と同じにして、
    // フォームを開いた時点で3つとも揃った状態にする。
    // 複製時は期間も複製元からプリフィル（req5: 期間はコピーして業者に確認させる）。
    const [periodStart, setPeriodStart] = useState(isClone ? src("inspection_period_start") : initialInspectionDate)
    const [periodEnd, setPeriodEnd] = useState(isClone ? src("inspection_period_end") : initialInspectionDate)
    // 手動編集フラグ: ユーザーが開始/終了を手で変えたら true。true の項目は
    // 点検年月日を変えても追従させない（開始・終了それぞれ独立に判定）。
    // 複製時は複製元の期間で埋まっているので、点検年月日(today)への追従で上書きしない＝手動扱いで開始。
    const [startManuallyEdited, setStartManuallyEdited] = useState(isClone)
    const [endManuallyEdited, setEndManuallyEdited] = useState(isClone)

    // 届出者情報（複製時は複製元 soukatsu、通常は物件マスターから初期化）
    const [notifierAddress, setNotifierAddress] = useState(isClone ? src("notifier_address") : (property?.notifier_address ?? ""))
    const [notifierName, setNotifierName] = useState(isClone ? src("notifier_name") : (property?.notifier_name ?? ""))
    const [notifierPhone, setNotifierPhone] = useState(isClone ? src("notifier_phone") : (property?.notifier_phone ?? ""))

    // 防火対象物情報（複製時は複製元 soukatsu、通常は物件マスターから初期化）
    const [buildingAddress, setBuildingAddress] = useState(isClone ? src("building_address") : (property?.building_address ?? ""))
    const [buildingName, setBuildingName] = useState(isClone ? src("building_name") : (property?.building_name ?? ""))
    const [buildingUsage, setBuildingUsage] = useState(isClone ? src("building_usage") : (property?.building_usage ?? ""))
    const [buildingStructure, setBuildingStructure] = useState(isClone ? src("building_structure") : (property?.building_structure ?? ""))
    const [floorAbove, setFloorAbove] = useState(isClone ? src("floor_above") : (property?.floor_above?.toString() ?? ""))
    const [floorBelow, setFloorBelow] = useState(isClone ? src("floor_below") : (property?.floor_below?.toString() ?? ""))
    const [totalFloorArea, setTotalFloorArea] = useState(isClone ? src("total_floor_area") : (property?.total_floor_area?.toString() ?? ""))

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

    // Mark form as dirty on any input change
    useEffect(() => {
        const form = document.querySelector("form")
        if (!form) return
        const handler = () => markDirty()
        form.addEventListener("input", handler)
        return () => form.removeEventListener("input", handler)
    }, [markDirty])

    const updateEquipmentResult = (index: number, result: EquipmentResult["result"]) => {
        markDirty()
        setEquipmentResults(prev =>
            prev.map((item, i) => i === index ? { ...item, result } : item)
        )
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

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
                    user_id: user?.id,
                })
                .select()
                .single()

            if (insertError) throw insertError

            markClean()

            // 複製モード: soukatsu は上で通常どおり作成済み。ここでサブツリー（点検者一覧表+様式群）を
            // 複製し、複製マーカーを立てる。通常作成パスは一切変えていない（回帰リスクゼロ）。
            if (isClone && copyFromId) {
                const { data: newItiran, error: cloneErr } = await supabase.rpc("clone_report_forms", {
                    p_new_soukatsu_id: data.id,
                    p_source_soukatsu_id: copyFromId,
                    p_source_itiran_id: sourceItiranId ?? null,
                })
                if (!cloneErr && newItiran) {
                    toast.success("前回の報告書を複製しました。各様式を開いて内容をご確認ください。")
                    router.push(`/inspection/${data.id}/itiran/${newItiran as string}`)
                    return
                }
                const code = (cloneErr as { code?: string } | null)?.code
                const cmsg = (cloneErr as { message?: string } | null)?.message ?? ""
                if (code === "P0409" || cmsg.includes("ALREADY_CLONED")) {
                    // 非原子性の副作用: 複製は既に成功していたのに再試行された。エラーでなく既存ハブへ。
                    const { data: it } = await supabase
                        .from("inspection_itiran")
                        .select("id")
                        .eq("soukatsu_id", data.id)
                        .order("created_at")
                        .limit(1)
                        .maybeSingle()
                    router.push(it ? `/inspection/${data.id}/itiran/${it.id as string}` : `/inspection/${data.id}`)
                    return
                }
                // graceful degradation: soukatsu は通常の新規報告書として作成済み（cloned_at 未設定＝ゲート無し）。
                toast.error("前回内容の複製に失敗しました。通常の新規報告書として作成されています。各様式をご入力ください。")
                router.push(`/inspection/${data.id}`)
                return
            }

            toast.success("総括表を保存しました")
            router.push(`/inspection/${data.id}`)
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
            <FormProgress sections={FORM_SECTIONS} />
            {error && (
                <div className="bg-red-50 text-red-600 p-4 rounded-md border border-red-200">
                    エラー: {error}
                </div>
            )}

            {/* 複製 / 物件マスター転記バナー */}
            {isClone ? (
                <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                    <Building2 className="w-5 h-5 text-amber-600 shrink-0" />
                    <div className="text-sm">
                        <span className="font-semibold text-amber-800">前回の報告書から複製</span>
                        <span className="text-amber-700"> しています。内容を確認・修正して保存すると、各様式もコピーされます。保存後に各様式を開いて確認してください。</span>
                    </div>
                </div>
            ) : property && (
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
                    <div className="space-y-2 min-w-0">
                        <Label htmlFor="inspectionDate" required>点検年月日</Label>
                        <Input
                            id="inspectionDate"
                            type="date"
                            className="min-w-0"
                            required
                            value={toDateInputValue(inspectionDate)}
                            onChange={(e) => {
                                const value = e.target.value
                                setInspectionDate(value)
                                // 手動編集していない項目は点検年月日に追従させる（同じ日にする）。
                                // 手動フラグが立っている項目は触らない。ここでの setPeriod* は
                                // 追従によるプログラム更新なので、手動フラグは立てない。
                                if (value) {
                                    if (!startManuallyEdited) setPeriodStart(value)
                                    if (!endManuallyEdited) setPeriodEnd(value)
                                }
                            }}
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
                    <div className="space-y-2 min-w-0">
                        <Label htmlFor="periodStart">点検期間（開始）</Label>
                        <Input
                            id="periodStart"
                            type="date"
                            className="min-w-0"
                            value={toDateInputValue(periodStart)}
                            onChange={(e) => {
                                // ユーザーが手で開始を変更 → 以降この項目は追従させない
                                setPeriodStart(e.target.value)
                                setStartManuallyEdited(true)
                            }}
                        />
                    </div>
                    <div className="space-y-2 min-w-0">
                        <Label htmlFor="periodEnd">点検期間（終了）</Label>
                        <Input
                            id="periodEnd"
                            type="date"
                            className="min-w-0"
                            value={toDateInputValue(periodEnd)}
                            onChange={(e) => {
                                // ユーザーが手で終了を変更 → 以降この項目は追従させない
                                setPeriodEnd(e.target.value)
                                setEndManuallyEdited(true)
                            }}
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
                            <UsageSelect
                                id="buildingUsage"
                                required
                                value={buildingUsage}
                                onChange={setBuildingUsage}
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
                            <FloorSelect
                                id="floorAbove"
                                min={1}
                                max={30}
                                value={floorAbove}
                                onChange={setFloorAbove}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="floorBelow">地下階数</Label>
                            <FloorSelect
                                id="floorBelow"
                                min={0}
                                max={5}
                                value={floorBelow}
                                onChange={setFloorBelow}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="totalFloorArea">延べ面積 (㎡)</Label>
                            <Input
                                id="totalFloorArea"
                                type="number"
                                inputMode="decimal"
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
                            <div key={item.name} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4 py-2 border-b border-slate-100 last:border-0">
                                <span className="text-sm font-medium text-slate-700 sm:min-w-[200px]">{item.name}</span>
                                <div className="flex gap-2">
                                    {(property
                                        ? ["指摘なし", "要改善"] as const
                                        : ["該当なし", "指摘なし", "要改善"] as const
                                    ).map(result => (
                                        <button
                                            key={result}
                                            type="button"
                                            onClick={() => updateEquipmentResult(index, result)}
                                            className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
                                                item.result === result
                                                    ? result === "指摘なし"
                                                        ? "bg-green-100 text-green-700 ring-2 ring-green-500"
                                                        : result === "要改善"
                                                            ? "bg-red-100 text-red-700 ring-2 ring-red-500"
                                                            : "bg-slate-200 text-slate-600 ring-2 ring-slate-400"
                                                    : "bg-slate-50 text-slate-400 hover:bg-slate-100"
                                            }`}
                                        >
                                            {result === "指摘なし" && <CheckCircle2 className="w-3 h-3" />}
                                            {result === "要改善" && <AlertTriangle className="w-3 h-3" />}
                                            {result === "該当なし" && <MinusCircle className="w-3 h-3" />}
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
