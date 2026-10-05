"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { DetailField, SoukatsuEquipmentItem } from "@/lib/soukatsu-equipment"

/**
 * 総括表の1行ぶんの「不良内容・措置内容（要改善のときだけ）・立会者」（#28）。
 * 作成画面（soukatsu-form）と編集画面（soukatsu-edit-form）で共有する。
 */
export function EquipmentDetailInputs({
    item,
    onChange,
}: {
    item: SoukatsuEquipmentItem
    onChange: (field: DetailField, value: string) => void
}) {
    if (item.result === "該当なし") return null
    return (
        <div className="grid gap-2 sm:grid-cols-3">
            {item.result === "要改善" && (
                <>
                    <div className="space-y-1">
                        <Label className="text-xs font-normal text-slate-500">不良内容</Label>
                        <Input value={item.bad_detail ?? ""} onChange={(e) => onChange("bad_detail", e.target.value)} />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs font-normal text-slate-500">措置内容</Label>
                        <Input value={item.action ?? ""} onChange={(e) => onChange("action", e.target.value)} />
                    </div>
                </>
            )}
            <div className="space-y-1">
                <Label className="text-xs font-normal text-slate-500">立会者</Label>
                <Input value={item.witness ?? ""} onChange={(e) => onChange("witness", e.target.value)} />
            </div>
        </div>
    )
}

/** 全設備に同じ立会者を入れる（行ごとに後から変えられる） */
export function WitnessFillAll({ onFill }: { onFill: (name: string) => void }) {
    const [name, setName] = useState("")
    return (
        <div className="flex flex-col gap-2 rounded-md bg-slate-50 p-3 sm:flex-row sm:items-end">
            <div className="space-y-1 sm:flex-1">
                <Label className="text-xs font-normal text-slate-500">立会者（全設備に同じ人を入れる）</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <Button type="button" variant="outline" size="sm" disabled={!name.trim()} onClick={() => onFill(name.trim())}>
                全設備に入れる
            </Button>
        </div>
    )
}
