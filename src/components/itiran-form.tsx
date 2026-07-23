"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Loader2, Plus, X } from "lucide-react"
import { toast } from "sonner"
import { friendlyError } from "@/lib/error-messages"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { useAuth } from "@/components/auth-provider"
import type { Inspector, InspectorData } from "@/types/database"
import { LicenseEditor, type LicenseEditorValue } from "@/components/license-editor"
import { emptyInspector } from "@/lib/inspector-helpers"

interface Props {
    soukatsuId: string
    masters: Inspector[]
    // 編集モード: 既存 itiran を渡すと initial を初期値に流し、submit が update になる。
    // 未指定(=作成モード)なら従来どおり insert（分岐は下で早期returnし、insertコードは1行も変えない）。
    initial?: [InspectorData, InspectorData] | null
    itiranId?: string
}

// 一覧表示と同じ規則: label → name → 「（無題）」（inspector-list.tsx と一致）
function masterLabel(m: Inspector): string {
    return m.label?.trim() || m.inspector_data?.name?.trim() || "（無題）"
}

// その Card に「入力がある」か。基本情報・備考・各免状のいずれかが非空なら true。
// confirm 上書き判定と showSecond 初期値（前方互換）の双方で使う。
function isInspectorFilled(d: InspectorData): boolean {
    if (d.name || d.address || d.company || d.phone || d.equipment_names) return true
    if (d.shoubou_notes) return true
    const shoubouFilled = Object.values(d.shoubou_licenses).some(l =>
        l.issue_year || l.issue_month || l.issue_day || l.license_number ||
        l.issuing_governor || l.training_year || l.training_month
    )
    if (shoubouFilled) return true
    return Object.values(d.kensa_licenses).some(l =>
        l.issue_year || l.issue_month || l.issue_day || l.license_number ||
        l.expiry_year || l.expiry_month || l.expiry_day
    )
}

export default function ItiranForm({ soukatsuId, masters, initial, itiranId }: Props) {
    const router = useRouter()
    const { user } = useAuth()
    const { markDirty, markClean } = useUnsavedChanges()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // 編集モード（既存 itiran を編集）か。initial が渡されたら true。
    const isEditMode = !!initial

    // payload 互換のため state は常に [InspectorData, InspectorData] のタプルを維持する。
    // 作成モードは空・編集モードは既存 inspector を初期値に（欠損フィールドは emptyInspector で補完）。
    const initialInspectors: [InspectorData, InspectorData] = initial
        ? [{ ...emptyInspector(), ...initial[0] }, { ...emptyInspector(), ...initial[1] }]
        : [emptyInspector(), emptyInspector()]
    const [inspectors, setInspectors] = useState<[InspectorData, InspectorData]>(initialInspectors)
    // 点検者2 の表示制御。初期値は inspector2 が非空かどうか（Q11 前方互換。
    // 今は editing 経路がないため常に false だが、将来 load 対応した際の保険）。
    const [showSecond, setShowSecond] = useState<boolean>(() => isInspectorFilled(initialInspectors[1]))

    // Mark form as dirty on any input change
    useEffect(() => {
        const form = document.querySelector("form")
        if (!form) return
        const handler = () => markDirty()
        form.addEventListener("input", handler)
        return () => form.removeEventListener("input", handler)
    }, [markDirty])

    // マウント時の自動 pre-fill（A3 自動部分）: マスタが 1 件以上あれば最新（先頭）を
    // 点検者1 に流し込む。新規フォーム表示時の 1 回のみ。dirty にはしない（自動補完のため）。
    useEffect(() => {
        // 作成モードのみ: マスタ最新を点検者1に自動プリフィル。編集モードでは既存を上書きしないため実行しない。
        if (!isEditMode && masters.length > 0) {
            setInspectors(prev => [structuredClone(masters[0].inspector_data), prev[1]])
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const updateInspector = (index: 0 | 1, field: keyof Pick<InspectorData, "address" | "name" | "company" | "phone" | "equipment_names">, value: string) => {
        setInspectors(prev => {
            const next: [InspectorData, InspectorData] = [{ ...prev[0] }, { ...prev[1] }]
            next[index][field] = value
            return next
        })
    }

    const updateLicenseSlice = (index: 0 | 1, slice: LicenseEditorValue) => {
        setInspectors(prev => {
            const next: [InspectorData, InspectorData] = [{ ...prev[0] }, { ...prev[1] }]
            next[index] = { ...next[index], ...slice }
            return next
        })
    }

    // マスタ選択（A3 選び直し）: その Card 全体をマスタの inspector_data で置換。
    // 既に入力がある場合のみ confirm（空なら確認なしで即反映）。
    const applyMaster = (index: 0 | 1, masterId: string) => {
        const master = masters.find(m => m.id === masterId)
        if (!master) return
        if (isInspectorFilled(inspectors[index]) &&
            !window.confirm("入力中の内容を上書きします。よろしいですか？")) {
            return
        }
        setInspectors(prev => {
            const next: [InspectorData, InspectorData] = [{ ...prev[0] }, { ...prev[1] }]
            next[index] = structuredClone(master.inspector_data)
            return next
        })
        markDirty()
    }

    const addSecond = () => setShowSecond(true)

    const removeSecond = () => {
        setShowSecond(false)
        setInspectors(prev => [prev[0], emptyInspector()])
        markDirty()
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        // ★編集モード: 既存 itiran を update（inspector1/inspector2 だけ・.eq(id).eq(user_id) 二重防御）。
        //   ここで早期 return するので、下の「作成(insert)コード」は1行も変えていない。
        if (isEditMode && itiranId) {
            const { error: updateError } = await supabase
                .from("inspection_itiran")
                .update({
                    inspector1: inspectors[0] as unknown,
                    inspector2: (showSecond ? inspectors[1] : emptyInspector()) as unknown,
                })
                .eq("id", itiranId)
                .eq("user_id", user?.id ?? "")
            if (updateError) {
                const msg = friendlyError(updateError)
                setError(msg)
                toast.error(msg)
                setLoading(false)
                return
            }
            markClean()
            toast.success("点検者情報を更新しました")
            router.push(`/inspection/${soukatsuId}/itiran/${itiranId}`)
            return
        }

        // payload 構造は不変: inspector1 / inspector2 の 2 jsonb 固定。
        // showSecond=false のときは inspector2 を emptyInspector() で保存（現状と完全一致）。
        const { data, error: insertError } = await supabase
            .from("inspection_itiran")
            .insert({
                soukatsu_id: soukatsuId,
                inspector1: inspectors[0] as unknown,
                inspector2: (showSecond ? inspectors[1] : emptyInspector()) as unknown,
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

    const renderCard = (idx: 0 | 1, removable: boolean) => (
        <Card key={idx} className="border-2">
            <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle className="text-lg">点検者 {idx + 1}</CardTitle>
                    <div className="flex items-center gap-2">
                        {masters.length > 0 && (
                            <select
                                aria-label={`点検者${idx + 1}にマスタから入力`}
                                className="h-9 max-w-[12rem] rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                value=""
                                onChange={(e) => {
                                    const v = e.target.value
                                    if (v) applyMaster(idx, v)
                                }}
                            >
                                <option value="">マスタから選択</option>
                                {masters.map((m) => (
                                    <option key={m.id} value={m.id}>{masterLabel(m)}</option>
                                ))}
                            </select>
                        )}
                        {removable && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={removeSecond}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                                <X className="w-4 h-4 mr-1" />削除
                            </Button>
                        )}
                    </div>
                </div>
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

                {/* 免状エディタ */}
                <LicenseEditor
                    value={{
                        shoubou_licenses: inspectors[idx].shoubou_licenses,
                        shoubou_notes: inspectors[idx].shoubou_notes,
                        kensa_licenses: inspectors[idx].kensa_licenses,
                    }}
                    onChange={(next) => updateLicenseSlice(idx, next)}
                />
            </CardContent>
        </Card>
    )

    return (
        <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl mx-auto p-6">
            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                    {error}
                </div>
            )}

            {/* マスタ 0 件: ドロップダウンは出さず、登録への軽いヒントのみ */}
            {masters.length === 0 && (
                <p className="text-sm text-gray-500">
                    点検者マスタに登録すると自動入力できます。
                    <Link href="/inspectors/new" className="text-blue-600 hover:underline ml-1">
                        点検者を登録
                    </Link>
                </p>
            )}

            {/* 点検者1（常に表示） */}
            {renderCard(0, false)}

            {/* 点検者2: 既定は非表示。「＋追加」で表示、「削除」で空に戻す */}
            {showSecond ? (
                renderCard(1, true)
            ) : (
                <Button
                    type="button"
                    variant="outline"
                    onClick={addSecond}
                    className="w-full border-dashed"
                >
                    <Plus className="w-4 h-4 mr-2" />点検者を追加
                </Button>
            )}

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
