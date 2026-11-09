"use client"

import { useId, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AlertTriangle, CheckCircle2, MinusCircle } from "lucide-react"
import { DETAIL_FIELD_LABELS, equipmentFieldLabel, type DetailField, type SoukatsuEquipmentItem, type SoukatsuEquipmentResult } from "@/lib/soukatsu-equipment"
import { DEFECT_PHRASE_LIST_PREFIX, defectPhraseListId } from "@/lib/defect-phrases"
import { DefectPhraseDatalists } from "@/components/defect-phrase-datalists"

/**
 * 総括表の1行ぶんの「不良内容・措置内容（要改善のときだけ）・立会者」（#28）。
 * 作成画面（soukatsu-form）と編集画面（soukatsu-edit-form）で共有する。
 * ★見出しと欄を id・htmlFor で結び、読み上げの名前に設備名を入れる（2026-11-08・定期テスト 27）。
 *   以前は見出しが欄と結びついておらず、設備の数だけ並ぶ欄が読み上げで何の欄か分からなかった。
 */
export function EquipmentDetailInputs({
    item,
    onChange,
}: {
    item: SoukatsuEquipmentItem
    onChange: (field: DetailField, value: string) => void
}) {
    // ★設備の数だけ並ぶので id を部品ごとに分ける（不良内容・措置内容の候補の一覧も・src/lib/defect-phrases.ts）
    const uid = useId()
    const phrasePrefix = `${DEFECT_PHRASE_LIST_PREFIX}${uid}`
    const fieldId = (field: DetailField) => `equipment-${field}-${uid}`
    if (item.result === "該当なし") return null
    return (
        <div className="grid gap-2 sm:grid-cols-3">
            {item.result === "要改善" && (
                <>
                    <DefectPhraseDatalists prefix={phrasePrefix} generalOnly />
                    <div className="space-y-1">
                        <Label htmlFor={fieldId("bad_detail")} className="text-xs font-normal text-slate-500">{DETAIL_FIELD_LABELS.bad_detail}</Label>
                        <Input
                            id={fieldId("bad_detail")}
                            aria-label={equipmentFieldLabel(item.name, "bad_detail")}
                            value={item.bad_detail ?? ""}
                            onChange={(e) => onChange("bad_detail", e.target.value)}
                            list={defectPhraseListId("bad", "", phrasePrefix)}
                        />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor={fieldId("action")} className="text-xs font-normal text-slate-500">{DETAIL_FIELD_LABELS.action}</Label>
                        <Input
                            id={fieldId("action")}
                            aria-label={equipmentFieldLabel(item.name, "action")}
                            value={item.action ?? ""}
                            onChange={(e) => onChange("action", e.target.value)}
                            list={defectPhraseListId("action", "", phrasePrefix)}
                        />
                    </div>
                </>
            )}
            <div className="space-y-1">
                <Label htmlFor={fieldId("witness")} className="text-xs font-normal text-slate-500">{DETAIL_FIELD_LABELS.witness}</Label>
                <Input
                    id={fieldId("witness")}
                    aria-label={equipmentFieldLabel(item.name, "witness")}
                    value={item.witness ?? ""}
                    onChange={(e) => onChange("witness", e.target.value)}
                />
            </div>
        </div>
    )
}

/**
 * 設備ごとの点検結果（指摘なし／要改善／該当なし）を選ぶボタン。
 * ★作成画面（soukatsu-form）と編集画面（soukatsu-edit-form）で同じ部品を使う（2026-11-09・定期テスト 21）。
 *   編集画面では「指摘なし」と「要改善」だけを出す（lib/soukatsu-equipment.ts の EDITABLE_EQUIPMENT_RESULTS）。
 * ★押す所はスマホで 44px 以上（min-h-11・scripts/check-iphone-input.mjs）
 */
export function EquipmentResultButtons({
    name,
    value,
    options,
    onChange,
}: {
    /** 設備名（読み上げ用） */
    name: string
    value: SoukatsuEquipmentResult
    options: readonly SoukatsuEquipmentResult[]
    onChange: (result: SoukatsuEquipmentResult) => void
}) {
    return (
        <div role="group" aria-label={`${name} の点検結果`} className="flex gap-2">
            {options.map((result) => (
                <button
                    key={result}
                    type="button"
                    aria-pressed={value === result}
                    onClick={() => onChange(result)}
                    className={`inline-flex min-h-11 md:min-h-0 items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
                        value === result
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
    )
}

/** 全設備に同じ立会者を入れる（行ごとに後から変えられる） */
export function WitnessFillAll({ onFill }: { onFill: (name: string) => void }) {
    const [name, setName] = useState("")
    // ★見出しと欄を結ぶ（2026-11-08・定期テスト 27）
    const inputId = `witness-fill-all-${useId()}`
    return (
        <div className="flex flex-col gap-2 rounded-md bg-slate-50 p-3 sm:flex-row sm:items-end">
            <div className="space-y-1 sm:flex-1">
                <Label htmlFor={inputId} className="text-xs font-normal text-slate-500">立会者（全設備に同じ人を入れる）</Label>
                <Input id={inputId} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <Button type="button" variant="outline" size="sm" disabled={!name.trim()} onClick={() => onFill(name.trim())}>
                全設備に入れる
            </Button>
        </div>
    )
}
