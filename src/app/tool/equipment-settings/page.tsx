"use client"

import { useState, useSyncExternalStore } from "react"
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

const noopSubscribe = () => () => {}

export default function EquipmentSettingsPage() {
    const router = useRouter()
    /*
      ★読み込むまでは null（#8・2026-10-06）。以前は [] から始めていて、サーバーの HTML と
        読み込み前の一瞬は「0 / 23 種類を有効化中」・全部のチェックが外れて見えた（実際は全種が出る設定）。
    */
    //   ★端末の設定（localStorage）はブラウザでしか読めない。サーバーと読み込み前は null のまま描く
    //   （effect で setState しない＝set-state-in-effect を避ける。useSyncExternalStore はサーバーでは false を返す）。
    const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false)
    const [edits, setEdits] = useState<string[] | null>(null)
    const enabled: string[] | null = edits ?? (isClient ? getEnabledEquipmentTypes() : null)
    const [saved, setSaved] = useState(false)
    const [emptyError, setEmptyError] = useState(false)

    const toggle = (name: string) => {
        if (enabled === null) return
        setEdits(enabled.includes(name) ? enabled.filter(e => e !== name) : [...enabled, name])
        setSaved(false)
        setEmptyError(false)
    }

    const handleSave = () => {
        if (enabled === null) return
        /*
          ★0 種類では保存しない（#8）。保存すると物件登録に設備が 1 つも出なくなる
            （物件に既に付いている設備だけが出る）。全種に戻すのは「絞り込みを解除」。
        */
        if (enabled.length === 0) {
            setEmptyError(true)
            return
        }
        setEnabledEquipmentTypes(enabled)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
    }

    const handleReset = () => {
        resetEnabledEquipmentTypes()
        setEdits(null) // 端末の設定（いまは無し＝全種）に戻す
        setSaved(false)
        setEmptyError(false)
    }

    const handleSelectAll = () => {
        setEdits([...ALL_EQUIPMENT_TYPES])
        setSaved(false)
        setEmptyError(false)
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
                            物件登録・点検時に表示する消防用設備等を絞り込めます。
                            何もしなければ全種が表示されます（この設定はこの端末・このブラウザだけに効きます）。
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
                                絞り込みを解除（全種に戻す）
                            </Button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {ALL_EQUIPMENT_TYPES.map((name, i) => (
                                <label
                                    key={name}
                                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                                        enabled?.includes(name)
                                            ? "bg-blue-50 border-blue-400 text-blue-800"
                                            : "bg-white border-slate-200 text-slate-400 hover:bg-slate-50"
                                    }`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={enabled?.includes(name) ?? false}
                                        disabled={enabled === null}
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
                            {enabled === null
                                ? "設定を読み込んでいます…"
                                : enabled.length === ALL_EQUIPMENT_TYPES.length
                                    ? `全 ${ALL_EQUIPMENT_TYPES.length} 種類を表示（絞り込みなし）`
                                    : `${enabled.length} / ${ALL_EQUIPMENT_TYPES.length} 種類を表示中`}
                        </p>
                        {emptyError && (
                            <p className="text-sm text-red-600" role="alert">
                                1 種類以上選んでください。0 種類で保存すると、物件登録に設備が出なくなります。
                                全種に戻すときは「絞り込みを解除（全種に戻す）」を押してください。
                            </p>
                        )}

                        <div className="flex gap-3 pt-2">
                            <Button onClick={handleSave} disabled={enabled === null} className="gap-2">
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
