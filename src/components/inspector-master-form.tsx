"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { friendlyError } from "@/lib/error-messages"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import type { Inspector, InspectorData } from "@/types/database"
import { LicenseEditor, type LicenseEditorValue } from "@/components/license-editor"
import { emptyInspector } from "@/lib/inspector-helpers"

interface InspectorMasterFormProps {
    inspector?: Inspector
}

export default function InspectorMasterForm({ inspector }: InspectorMasterFormProps) {
    const router = useRouter()
    const { markDirty, markClean } = useUnsavedChanges()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [label, setLabel] = useState(inspector?.label ?? "")
    const [data, setData] = useState<InspectorData>(inspector?.inspector_data ?? emptyInspector())

    // Mark form as dirty on any input change
    useEffect(() => {
        const form = document.querySelector("form")
        if (!form) return
        const handler = () => markDirty()
        form.addEventListener("input", handler)
        return () => form.removeEventListener("input", handler)
    }, [markDirty])

    const updateField = (
        field: keyof Pick<InspectorData, "address" | "name" | "company" | "phone" | "equipment_names">,
        value: string,
    ) => {
        setData(prev => ({ ...prev, [field]: value }))
    }

    const licenseSlice: LicenseEditorValue = {
        shoubou_licenses: data.shoubou_licenses,
        shoubou_notes: data.shoubou_notes,
        kensa_licenses: data.kensa_licenses,
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        // user_id は DB DEFAULT auth.uid() で自動補完されるため payload に含めない
        const payload = { label, inspector_data: data as unknown }

        const { error: saveError } = inspector?.id
            ? await supabase.from("inspectors").update(payload).eq("id", inspector.id)
            : await supabase.from("inspectors").insert(payload)

        if (saveError) {
            const msg = friendlyError(saveError)
            setError(msg)
            toast.error(msg)
            setLoading(false)
            return
        }

        markClean()
        toast.success(inspector ? "点検者を更新しました" : "点検者を登録しました")
        router.push("/inspectors")
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl mx-auto p-4">
            {error && (
                <div className="bg-red-50 text-red-600 p-4 rounded-md border border-red-200">
                    {error}
                </div>
            )}

            {/* 基本情報 */}
            <Card>
                <CardHeader>
                    <CardTitle>基本情報</CardTitle>
                    <CardDescription>
                        点検者の情報を登録します。識別名は一覧での表示に使います。
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="label">識別名</Label>
                        <Input
                            id="label"
                            placeholder="例：橋本 拓也、事務 山田（一覧での表示名）"
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="name">氏名</Label>
                        <Input
                            id="name"
                            placeholder="氏名を入力"
                            value={data.name}
                            onChange={(e) => updateField("name", e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="company">社名</Label>
                        <Input
                            id="company"
                            placeholder="社名を入力"
                            value={data.company}
                            onChange={(e) => updateField("company", e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="address">住所</Label>
                        <Input
                            id="address"
                            placeholder="住所を入力"
                            value={data.address}
                            onChange={(e) => updateField("address", e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="phone">電話番号</Label>
                        <Input
                            id="phone"
                            placeholder="090-1234-5678"
                            type="tel"
                            value={data.phone}
                            onChange={(e) => updateField("phone", e.target.value)}
                        />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="equipment_names">設備名（点検対象設備）</Label>
                        <Input
                            id="equipment_names"
                            placeholder="例：消火器、自動火災報知設備"
                            value={data.equipment_names}
                            onChange={(e) => updateField("equipment_names", e.target.value)}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* 免状情報 */}
            <Card>
                <CardHeader>
                    <CardTitle>免状情報</CardTitle>
                    <CardDescription>
                        保有する消防設備士・消防設備点検資格者の免状を登録します。
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <LicenseEditor
                        value={licenseSlice}
                        onChange={(next) => setData(d => ({ ...d, ...next }))}
                    />
                </CardContent>
            </Card>

            <div className="flex justify-end pt-4">
                <Button type="submit" size="lg" disabled={loading} className="w-full md:w-auto">
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {loading ? "保存中..." : inspector ? "点検者を更新する" : "点検者を登録する"}
                </Button>
            </div>
        </form>
    )
}
