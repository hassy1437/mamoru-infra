"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { ACTION_BUTTON } from "@/lib/action-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import CopyTextFromPhotoHint from "@/components/copy-text-from-photo-hint"
import { CODE_INPUT_PROPS } from "@/lib/code-input-props"
import { friendlyError } from "@/lib/error-messages"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import {
    INSTRUMENT_NOTE_MAX,
    INSTRUMENT_TEXT_MAX,
    validateInstrumentInput,
    type MeasuringInstrument,
    type MeasuringInstrumentInput,
} from "@/lib/measuring-instruments"

/**
 * 測定機器の登録・直す（2026-10-30・点検者の台帳の画面と同じ形）。
 * ★写真は残さない（銘板の文字は端末の文字認識でコピーして貼る。AI の読み取りは評価のあと）。
 */
export default function InstrumentMasterForm({ instrument }: { instrument?: MeasuringInstrument }) {
    const router = useRouter()
    const { markDirty, markClean } = useUnsavedChanges()
    const [saving, setSaving] = useState(false)
    const [problems, setProblems] = useState<string[]>([])
    const [v, setV] = useState({
        name: instrument?.name ?? "",
        model: instrument?.model ?? "",
        maker: instrument?.maker ?? "",
        serial_number: instrument?.serial_number ?? "",
        calibrated_at: instrument?.calibrated_at ?? "",
        calibration_months: instrument?.calibration_months ? String(instrument.calibration_months) : "",
        note: instrument?.note ?? "",
    })

    useEffect(() => {
        const form = document.querySelector("form")
        if (!form) return
        const handler = () => markDirty()
        form.addEventListener("input", handler)
        return () => form.removeEventListener("input", handler)
    }, [markDirty])

    const set = (field: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((prev) => ({ ...prev, [field]: e.target.value }))

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        const months = v.calibration_months.trim()
        const input: MeasuringInstrumentInput = {
            name: v.name.trim(),
            model: v.model.trim(),
            maker: v.maker.trim(),
            serial_number: v.serial_number.trim(),
            calibrated_at: v.calibrated_at || null,
            calibration_months: months === "" ? null : Number(months),
            note: v.note.trim(),
        }
        const found = validateInstrumentInput(input)
        setProblems(found)
        if (found.length) return

        setSaving(true)
        // user_id は DB の既定（auth.uid()）で入る
        const { error } = instrument?.id
            ? await supabase.from("measuring_instruments").update(input).eq("id", instrument.id)
            : await supabase.from("measuring_instruments").insert(input)
        if (error) {
            const msg = friendlyError(error)
            setProblems([msg])
            toast.error(msg)
            setSaving(false)
            return
        }
        markClean()
        toast.success(instrument ? "測定機器を更新しました" : "測定機器を登録しました")
        router.push("/instruments")
        router.refresh()
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl mx-auto p-4">
            {problems.length > 0 && (
                <div role="alert" className="bg-red-50 text-red-700 p-4 rounded-md border border-red-200 text-sm space-y-1">
                    {problems.map((p) => <p key={p}>{p}</p>)}
                </div>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>測定機器</CardTitle>
                    <CardDescription>点検票の測定機器の表に入る 4 つ（機器名・型式・校正年月日・製造者名）と、見分けるための製造番号です。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <CopyTextFromPhotoHint />
                    <div className="grid gap-6 md:grid-cols-2">
                        <div className="space-y-2 md:col-span-2">
                            <Label htmlFor="name">機器名（必須）</Label>
                            <Input id="name" placeholder="例：絶縁抵抗計、加煙試験器" maxLength={INSTRUMENT_TEXT_MAX} value={v.name} onChange={set("name")} />
                            <p className="text-xs text-slate-500">自動火災報知設備の点検票では、紙に刷ってある機器名（加熱試験器・加煙試験器など）と同じ名前にすると、その行に入ります。</p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="model">型式</Label>
                            <Input id="model" {...CODE_INPUT_PROPS} maxLength={INSTRUMENT_TEXT_MAX} value={v.model} onChange={set("model")} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="maker">製造者名</Label>
                            <Input id="maker" maxLength={INSTRUMENT_TEXT_MAX} value={v.maker} onChange={set("maker")} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="serial_number">製造番号</Label>
                            <Input id="serial_number" {...CODE_INPUT_PROPS} maxLength={INSTRUMENT_TEXT_MAX} value={v.serial_number} onChange={set("serial_number")} />
                            <p className="text-xs text-slate-500">点検票には出ません（同じ型式の機器を見分けるため）。</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>校正</CardTitle>
                    <CardDescription>周期を入れると、期限を過ぎた機器が一覧と点検票で黄色になります（点検票の確定は止めません）。</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="calibrated_at">校正年月日</Label>
                        <Input id="calibrated_at" type="date" value={v.calibrated_at} onChange={set("calibrated_at")} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="calibration_months">校正の周期（か月）</Label>
                        <Input id="calibration_months" type="number" inputMode="numeric" min={1} max={120} placeholder="例：12" value={v.calibration_months} onChange={set("calibration_months")} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="note">メモ</Label>
                        <Input id="note" placeholder="例：社用車 1 号に積んでいる" maxLength={INSTRUMENT_NOTE_MAX} value={v.note} onChange={set("note")} />
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end pt-4">
                <Button type="submit" size="lg" disabled={saving} aria-busy={saving} className={ACTION_BUTTON}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {saving ? "保存中..." : instrument ? "測定機器を更新する" : "測定機器を登録する"}
                </Button>
            </div>
        </form>
    )
}
