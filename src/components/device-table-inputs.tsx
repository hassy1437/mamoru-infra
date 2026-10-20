"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toDateInputValue } from "@/lib/date-utils"
import {
    DEVICE_TABLE_PRINTED,
    DEVICE_TABLE_ROWS_PER_COLUMN,
    type DeviceTableKind,
    type DeviceTableRow,
} from "@/lib/bekki-device-table"
import { CODE_INPUT_PROPS } from "@/lib/code-input-props"

// ★日付の形でない以前の保存（和暦・年月だけなど）は日付の欄では空に見える（印字はそのまま出る）。文字の欄で見せて直せるようにする（2026-10-20）
const isLegacyDate = (v: string) => v.trim() !== "" && toDateInputValue(v) === ""

const filled = (row: DeviceTableRow | undefined) =>
    !!row && [row.name, row.model, row.calibrated_at, row.maker].some((v) => v.trim() !== "")

/**
 * 測定機器の表の入力（lib/bekki-device-table.ts）。
 * ・11の1・11の2: 紙の表どおりの 10 行（刷り込みの行は機器名なし・空欄の行は機器名から）
 * ・ほかの様式（plain）: 紙の 3 行 × 左右（6 台）。紙と同じく左右に並べ、最初は 1 行目の左右（2 台）だけ出す。
 *   「測定機器の欄を足す」で 1 行（2 台）ずつ増やす（2026-10-20。以前は 2 台までしか入れられなかった）
 */
export default function DeviceTableInputs({
    kind,
    rows,
    onChange,
}: {
    kind: DeviceTableKind
    rows: DeviceTableRow[]
    onChange: (index: number, field: keyof DeviceTableRow, value: string) => void
}) {
    const perColumn = DEVICE_TABLE_ROWS_PER_COLUMN[kind]
    // ★入れてある行は必ず出す（古い保存の 2 台目＝右の列の先頭・下書きの復元で後から入った行も）
    const lastFilledLine = rows.reduce((acc, row, i) => (filled(row) ? Math.max(acc, i % perColumn) : acc), -1)
    const [linesShown, setLinesShown] = useState(1)

    if (kind !== "plain") {
        return (
            <div className="space-y-2">
                <p className="font-medium text-sm">測定機器</p>
                <p className="text-xs text-slate-500">
                    様式の表と同じ並びです（左の列の上から → 右の列の上から）。使った機器の行だけ入れてください。
                </p>
                <div className="space-y-2">
                    {rows.map((row, i) => {
                        const printed = DEVICE_TABLE_PRINTED[kind][i]
                        return (
                            <div key={i} className="grid gap-2 rounded-md border border-slate-200 p-2 md:grid-cols-4 md:items-end">
                                {printed ? (
                                    <p className="text-sm md:self-center">{printed}</p>
                                ) : (
                                    <Input
                                        placeholder="機器名（様式に無い機器）"
                                        value={row.name}
                                        onChange={(e) => onChange(i, "name", e.target.value)}
                                    />
                                )}
                                <Input {...CODE_INPUT_PROPS} placeholder="型式" value={row.model} onChange={(e) => onChange(i, "model", e.target.value)} />
                                <div className="space-y-1">
                                    <Label className="text-xs font-normal text-slate-500">校正年月日</Label>
                                    <Input type={isLegacyDate(row.calibrated_at) ? "text" : "date"} value={isLegacyDate(row.calibrated_at) ? row.calibrated_at : toDateInputValue(row.calibrated_at)} onChange={(e) => onChange(i, "calibrated_at", e.target.value)} />
                                </div>
                                <Input placeholder="製造者名" value={row.maker} onChange={(e) => onChange(i, "maker", e.target.value)} />
                            </div>
                        )
                    })}
                </div>
            </div>
        )
    }

    const lines = Math.min(perColumn, Math.max(linesShown, lastFilledLine + 1))
    // 紙の行ごとに左 → 右（表の並びは左の列の上から → 右の列の上から）
    const slots = Array.from({ length: lines }, (_, line) => [line, perColumn + line]).flat()
    return (
        <div className="space-y-3">
            <div className="grid md:grid-cols-2 gap-4">
                {slots.map((index, k) => {
                    const row = rows[index]
                    const label = `測定機器 ${k + 1}`
                    return (
                        <div key={index} role="group" aria-label={label} className="space-y-2">
                            <p className="font-medium text-sm">{label}</p>
                            <Input placeholder="機器名" aria-label={`${label} 機器名`} value={row.name} onChange={(e) => onChange(index, "name", e.target.value)} />
                            <Input {...CODE_INPUT_PROPS} placeholder="型式" aria-label={`${label} 型式`} value={row.model} onChange={(e) => onChange(index, "model", e.target.value)} />
                            <div className="space-y-1">
                                <Label className="text-xs font-normal text-slate-500">校正年月日</Label>
                                <Input type={isLegacyDate(row.calibrated_at) ? "text" : "date"} aria-label={`${label} 校正年月日`} value={isLegacyDate(row.calibrated_at) ? row.calibrated_at : toDateInputValue(row.calibrated_at)} onChange={(e) => onChange(index, "calibrated_at", e.target.value)} />
                            </div>
                            <Input placeholder="製造者名" aria-label={`${label} 製造者名`} value={row.maker} onChange={(e) => onChange(index, "maker", e.target.value)} />
                        </div>
                    )
                })}
            </div>
            {lines < perColumn && (
                <Button type="button" variant="outline" size="sm" className="min-h-11 md:min-h-0" onClick={() => setLinesShown(lines + 1)}>
                    <Plus className="w-4 h-4 mr-1" />
                    測定機器の欄を足す（様式は {perColumn * 2} 台まで）
                </Button>
            )}
        </div>
    )
}
