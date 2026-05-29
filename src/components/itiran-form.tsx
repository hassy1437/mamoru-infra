"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { friendlyError } from "@/lib/error-messages"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import type { InspectorData } from "@/types/database"
import { LicenseEditor, type LicenseEditorValue } from "@/components/license-editor"
import { emptyInspector } from "@/lib/inspector-helpers"

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
