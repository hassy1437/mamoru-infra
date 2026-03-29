"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { ArrowLeft, RotateCcw, Save } from "lucide-react"
import {
    ALL_EQUIPMENT_TYPES,
    getEnabledEquipmentTypes,
    setEnabledEquipmentTypes,
    resetEnabledEquipmentTypes,
} from "@/lib/equipment-config"

export default function EquipmentSettingsPage() {
    const router = useRouter()
    const [enabled, setEnabled] = useState<string[]>([])
    const [saved, setSaved] = useState(false)

    useEffect(() => {
        setEnabled(getEnabledEquipmentTypes())
    }, [])

    const toggle = (name: string) => {
        setEnabled(prev =>
            prev.includes(name) ? prev.filter(e => e !== name) : [...prev, name]
        )
        setSaved(false)
    }

    const handleSave = () => {
        setEnabledEquipmentTypes(enabled)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
    }

    const handleReset = () => {
        resetEnabledEquipmentTypes()
        setEnabled(getEnabledEquipmentTypes())
        setSaved(false)
    }

    const handleSelectAll = () => {
        setEnabled([...ALL_EQUIPMENT_TYPES])
        setSaved(false)
    }

    return (
        <main className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 p-6">
            <div className="max-w-2xl mx-auto space-y-6">
                <Button
                    variant="ghost"
                    onClick={() => router.push("/tool")}
                    className="gap-2"
                >
                    <ArrowLeft className="w-4 h-4" />
                    戻る
                </Button>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-xl">設備出力設定</CardTitle>
                        <CardDescription>
                            物件登録・点検時に表示する消防用設備等を選択してください。
                            未修正のフォームは無効にしておくことを推奨します。
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex gap-3 flex-wrap">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleSelectAll}
                                className="gap-1"
                            >
                                全て有効
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleReset}
                                className="gap-1"
                            >
                                <RotateCcw className="w-3 h-3" />
                                デフォルトに戻す
                            </Button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {ALL_EQUIPMENT_TYPES.map((name, i) => (
                                <label
                                    key={name}
                                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                                        enabled.includes(name)
                                            ? "bg-blue-50 border-blue-400 text-blue-800"
                                            : "bg-white border-slate-200 text-slate-400 hover:bg-slate-50"
                                    }`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={enabled.includes(name)}
                                        onChange={() => toggle(name)}
                                        className="w-4 h-4 text-blue-600 rounded"
                                    />
                                    <span className="text-sm font-medium flex-1">
                                        <span className="text-xs text-slate-400 mr-1">
                                            {i + 1}.
                                        </span>
                                        {name}
                                    </span>
                                </label>
                            ))}
                        </div>

                        <p className="text-sm text-slate-500">
                            {enabled.length} / {ALL_EQUIPMENT_TYPES.length} 種類を有効化中
                        </p>

                        <div className="flex gap-3 pt-2">
                            <Button onClick={handleSave} className="gap-2">
                                <Save className="w-4 h-4" />
                                保存する
                            </Button>
                            {saved && (
                                <span className="text-sm text-green-600 font-medium self-center">
                                    保存しました
                                </span>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </main>
    )
}
