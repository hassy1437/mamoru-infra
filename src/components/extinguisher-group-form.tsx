"use client"

import { useEffect, useRef, useState } from "react"
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
import ExtinguisherDutyBadges from "@/components/extinguisher-duty-badges"
import { CODE_INPUT_PROPS } from "@/lib/code-input-props"
import { friendlyError } from "@/lib/error-messages"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { cn } from "@/lib/utils"
import {
    EXTINGUISHER_KINDS,
    EXTINGUISHER_LOCATION_MAX,
    EXTINGUISHER_NOTE_MAX,
    EXTINGUISHER_QUANTITY_MAX,
    EXTINGUISHER_TEXT_MAX,
    PRESSURIZATIONS,
    validateExtinguisherInput,
    type ExtinguisherGroup,
    type ExtinguisherGroupInput,
    type ExtinguisherKind,
    type Pressurization,
} from "@/lib/extinguisher-ledger"

type FormState = {
    kind: ExtinguisherKind | ""
    pressurization: Pressurization
    maker: string
    model: string
    approval_number: string
    manufactured_year: string
    quantity: string
    location: string
    last_pressure_test_year: string
    note: string
}

const fromGroup = (g?: ExtinguisherGroup): FormState => ({
    kind: g?.kind ?? "",
    pressurization: g?.pressurization ?? "unknown",
    maker: g?.maker ?? "",
    model: g?.model ?? "",
    approval_number: g?.approval_number ?? "",
    manufactured_year: g?.manufactured_year ? String(g.manufactured_year) : "",
    quantity: g ? String(g.quantity) : "1",
    location: g?.location ?? "",
    last_pressure_test_year: g?.last_pressure_test_year ? String(g.last_pressure_test_year) : "",
    note: g?.note ?? "",
})

const toYear = (s: string) => (s.trim() === "" ? null : Number(s.trim()))

/**
 * 消火器の台帳の 1 行（同じ器種・方式・型式・製造年の組と本数）を登録・直す（2026-10-30・測定機器の台帳と同じ形）。
 * ・「登録して続けて入れる」は器種・方式・製造者名・型式・型式番号を残す（同じ型式で製造年だけ違う組が多いので）
 * ・入れながら、この組がこの年の点検で何の対象かを出す（lib/extinguisher-ledger.ts）
 */
export default function ExtinguisherGroupForm({
    propertyId,
    group,
    thisYear,
}: {
    propertyId: string
    group?: ExtinguisherGroup
    thisYear: number
}) {
    const router = useRouter()
    const { markDirty, markClean } = useUnsavedChanges()
    const [saving, setSaving] = useState<"" | "save" | "next">("")
    const [problems, setProblems] = useState<string[]>([])
    const [v, setV] = useState<FormState>(() => fromGroup(group))
    const formRef = useRef<HTMLFormElement>(null)
    const yearRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        const form = formRef.current
        if (!form) return
        const handler = () => markDirty()
        form.addEventListener("input", handler)
        return () => form.removeEventListener("input", handler)
    }, [markDirty])

    const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => setV((prev) => ({ ...prev, [field]: e.target.value }))
    const setKind = (kind: ExtinguisherKind) =>
        // ★化学泡は泡だけ。器種を泡から変えたら方式は「わからない」に戻す
        setV((prev) => ({ ...prev, kind, pressurization: kind !== "B" && prev.pressurization === "chemical" ? "unknown" : prev.pressurization }))

    const madeYear = toYear(v.manufactured_year)
    const testedYear = toYear(v.last_pressure_test_year)
    // ★入れかけ・範囲外の年（2099 など）では出さない（「2109 年から」のような答えを見せない）
    const okYear = (y: number | null) => y === null || (Number.isInteger(y) && y >= 1950 && y <= thisYear)
    const preview =
        v.kind && okYear(madeYear) && okYear(testedYear)
            ? { kind: v.kind, pressurization: v.pressurization, manufactured_year: madeYear, last_pressure_test_year: testedYear }
            : null

    const submit = async (mode: "save" | "next") => {
        if (!v.kind) {
            setProblems(["器種を選んでください"])
            return
        }
        const input: ExtinguisherGroupInput = {
            property_id: propertyId,
            kind: v.kind,
            pressurization: v.pressurization,
            maker: v.maker.trim(),
            model: v.model.trim(),
            approval_number: v.approval_number.trim(),
            manufactured_year: madeYear,
            quantity: Number(v.quantity.trim() || "0"),
            location: v.location.trim(),
            last_pressure_test_year: testedYear,
            note: v.note.trim(),
        }
        const found = validateExtinguisherInput(input, thisYear)
        setProblems(found)
        if (found.length) return

        setSaving(mode)
        // user_id は DB の既定（auth.uid()）で入る
        const { error } = group?.id
            ? await supabase.from("extinguisher_groups").update(input).eq("id", group.id)
            : await supabase.from("extinguisher_groups").insert(input)
        if (error) {
            const msg = friendlyError(error)
            setProblems([msg])
            toast.error(msg)
            setSaving("")
            return
        }
        markClean()
        if (mode === "next") {
            toast.success("登録しました。続けて入れられます（器種・方式・型式は残しています）")
            setV((prev) => ({ ...prev, manufactured_year: "", quantity: "1", location: "", last_pressure_test_year: "", note: "" }))
            setSaving("")
            router.refresh()
            yearRef.current?.focus()
            return
        }
        toast.success(group ? "消火器の台帳を更新しました" : "消火器の台帳に登録しました")
        router.push(`/properties/${propertyId}/extinguishers`)
        router.refresh()
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        void submit("save")
    }

    return (
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-8 max-w-4xl mx-auto p-4">
            {problems.length > 0 && (
                <div role="alert" className="bg-red-50 text-red-700 p-4 rounded-md border border-red-200 text-sm space-y-1">
                    {problems.map((p) => <p key={p}>{p}</p>)}
                </div>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>器種と方式</CardTitle>
                    <CardDescription>同じ器種・方式・型式・製造年の消火器は 1 行にまとめ、本数を入れます。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <fieldset className="space-y-2">
                        <legend className="text-sm font-medium">器種（必須）</legend>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
                            {EXTINGUISHER_KINDS.map((k) => (
                                <label
                                    key={k.key}
                                    className={cn(
                                        "flex min-h-11 cursor-pointer items-center justify-center rounded-lg border px-2 text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500",
                                        v.kind === k.key ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
                                    )}
                                >
                                    <input type="radio" name="kind" value={k.key} checked={v.kind === k.key} onChange={() => setKind(k.key)} className="sr-only" />
                                    {k.label}
                                </label>
                            ))}
                        </div>
                    </fieldset>
                    <fieldset className="space-y-2">
                        <legend className="text-sm font-medium">方式</legend>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {PRESSURIZATIONS.map((p) => {
                                const disabled = p.key === "chemical" && v.kind !== "B"
                                return (
                                    <label
                                        key={p.key}
                                        className={cn(
                                            "flex min-h-11 items-center justify-center rounded-lg border px-2 text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500",
                                            disabled ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400" : "cursor-pointer",
                                            !disabled && (v.pressurization === p.key ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"),
                                        )}
                                    >
                                        <input
                                            type="radio"
                                            name="pressurization"
                                            value={p.key}
                                            checked={v.pressurization === p.key}
                                            disabled={disabled}
                                            onChange={() => setV((prev) => ({ ...prev, pressurization: p.key }))}
                                            className="sr-only"
                                        />
                                        {p.label}
                                    </label>
                                )
                            })}
                        </div>
                        <p className="text-xs text-slate-500">ラベルに「蓄圧式」「加圧式」と書いてあります。内部・機能の点検の時期が変わります（化学泡は泡のときだけ）。</p>
                    </fieldset>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>製造年と本数</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid gap-6 grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="manufactured_year">製造年（西暦）</Label>
                            <Input ref={yearRef} id="manufactured_year" type="number" inputMode="numeric" min={1950} max={thisYear} placeholder={`例：${thisYear - 5}`} value={v.manufactured_year} onChange={set("manufactured_year")} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="quantity">本数</Label>
                            <Input id="quantity" type="number" inputMode="numeric" min={1} max={EXTINGUISHER_QUANTITY_MAX} value={v.quantity} onChange={set("quantity")} />
                        </div>
                        <div className="space-y-2 col-span-2">
                            <Label htmlFor="last_pressure_test_year">前回の耐圧性能点検の年（西暦）</Label>
                            <Input id="last_pressure_test_year" type="number" inputMode="numeric" min={1950} max={thisYear} value={v.last_pressure_test_year} onChange={set("last_pressure_test_year")} />
                            <p className="text-xs text-slate-500">まだ・分からなければ空欄で構いません。</p>
                        </div>
                    </div>
                    {preview && (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1.5">
                            <p className="text-xs font-medium text-slate-600">{thisYear} 年の点検では</p>
                            <ExtinguisherDutyBadges group={preview} thisYear={thisYear} />
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>ラベルの文字と設置場所</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <CopyTextFromPhotoHint />
                    <div className="grid gap-6 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="maker">製造者名</Label>
                            <Input id="maker" maxLength={EXTINGUISHER_TEXT_MAX} value={v.maker} onChange={set("maker")} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="model">型式</Label>
                            <Input id="model" {...CODE_INPUT_PROPS} maxLength={EXTINGUISHER_TEXT_MAX} value={v.model} onChange={set("model")} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="approval_number">型式番号</Label>
                            <Input id="approval_number" {...CODE_INPUT_PROPS} placeholder="例：消第 30〜1 号" maxLength={EXTINGUISHER_TEXT_MAX} value={v.approval_number} onChange={set("approval_number")} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="location">設置場所</Label>
                            <Input id="location" placeholder="例：各階 廊下" maxLength={EXTINGUISHER_LOCATION_MAX} value={v.location} onChange={set("location")} />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                            <Label htmlFor="note">メモ</Label>
                            <Input id="note" maxLength={EXTINGUISHER_NOTE_MAX} value={v.note} onChange={set("note")} />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="flex flex-col-reverse gap-3 pt-4 sm:flex-row sm:justify-end">
                {!group && (
                    <Button type="button" size="lg" variant="outline" disabled={saving !== ""} aria-busy={saving === "next"} className={ACTION_BUTTON} onClick={() => void submit("next")}>
                        {saving === "next" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        登録して続けて入れる
                    </Button>
                )}
                <Button type="submit" size="lg" disabled={saving !== ""} aria-busy={saving === "save"} className={ACTION_BUTTON}>
                    {saving === "save" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {saving === "save" ? "保存中..." : group ? "更新する" : "登録する"}
                </Button>
            </div>
        </form>
    )
}
