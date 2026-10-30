"use client"

import { useState } from "react"
import { BookOpen, ExternalLink, RotateCw } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import InstrumentCalibrationNote from "@/components/instrument-calibration-note"
import type { InstrumentsState } from "@/hooks/use-measuring-instruments"
import type { DeviceTableKind, DeviceTableRow } from "@/lib/bekki-device-table"
import { placeInstruments, rowChanges } from "@/lib/measuring-instruments"

/** 前に選んだ機器（★この端末だけの便利のため。読めなくても動く） */
const LAST_PICKED_KEY = "mamoru.instruments.lastPicked"

function readLastPicked(): string[] {
    try {
        const v = JSON.parse(window.localStorage.getItem(LAST_PICKED_KEY) ?? "[]")
        return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []
    } catch {
        return []
    }
}

function writeLastPicked(ids: string[]) {
    try {
        window.localStorage.setItem(LAST_PICKED_KEY, JSON.stringify(ids))
    } catch {
        // 保存できない端末（プライベートなど）では前の選択を覚えないだけ
    }
}

/**
 * 様式の測定機器の表に「台帳から選ぶ」（2026-10-30・docs/銘板の転記_全様式_現状と設計案_20261030.md 案 A）。
 * ・前に選んだ機器にはじめから印を付ける（同じ報告書のほかの様式で、もう一度押すだけで入る）
 * ・★入っている行は上書きしない・同じ機器は 2 回入れない（lib/measuring-instruments.ts）
 * ・★ほかの様式へは書かない（複製した報告書の「確かめた」の印が、見ていない様式に付いてしまうため）
 * ・台帳がまだ使えない（DB の更新前）ときは何も出さない（手で入れるのは今までどおり）
 */
export default function InstrumentPicker({
    kind,
    rows,
    onChange,
    state,
    reload,
    today,
}: {
    kind: DeviceTableKind
    rows: DeviceTableRow[]
    onChange: (index: number, field: keyof DeviceTableRow, value: string) => void
    state: InstrumentsState
    reload: () => void
    today: string
}) {
    const [open, setOpen] = useState(false)
    const [picked, setPicked] = useState<Set<string>>(new Set())

    if (state.status === "unavailable") return null

    const instruments = state.status === "ready" ? state.instruments : []
    const toggle = (id: string) =>
        setPicked((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })

    const openPanel = () => {
        const known = new Set(instruments.map((i) => i.id))
        setPicked(new Set(readLastPicked().filter((id) => known.has(id))))
        setOpen(true)
    }

    const apply = () => {
        const chosen = instruments.filter((i) => picked.has(i.id))
        const result = placeInstruments(kind, rows, chosen)
        for (const c of rowChanges(rows, result.rows)) onChange(c.index, c.field, c.value)
        writeLastPicked(chosen.map((i) => i.id))
        const parts = [`${result.placed.length} 台を入れました`]
        if (result.already.length) parts.push(`もう入っていた ${result.already.length} 台はそのまま`)
        if (result.noRoom.length) {
            toast.warning(`表がいっぱいで入りませんでした: ${result.noRoom.map((i) => i.name).join("・")}`)
        }
        toast.success(parts.join("・"))
        setOpen(false)
    }

    return (
        <div className="space-y-2">
            {!open && (
                <Button type="button" variant="outline" className="min-h-11 gap-2" onClick={openPanel} disabled={state.status === "loading"}>
                    <BookOpen className="h-4 w-4" aria-hidden="true" />
                    台帳から選ぶ
                </Button>
            )}
            {open && (
                <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/40 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">測定機器の台帳から選ぶ</p>
                        <div className="flex items-center gap-1">
                            <Button type="button" variant="ghost" size="sm" className="min-h-11 gap-1 text-xs" onClick={reload}>
                                <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                                読み直す
                            </Button>
                            {/* ★別のタブで開く（入力中の様式から離れない） */}
                            <a href="/instruments" target="_blank" rel="noopener" className="inline-flex min-h-11 items-center gap-1 px-2 text-xs text-blue-600 hover:underline">
                                台帳を開く
                                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                            </a>
                        </div>
                    </div>
                    {instruments.length === 0 ? (
                        <p className="text-sm text-slate-600">台帳にまだ機器がありません。「台帳を開く」から登録すると、どの様式でも選ぶだけで入ります。</p>
                    ) : (
                        <ul className="space-y-1">
                            {instruments.map((i) => (
                                <li key={i.id}>
                                    <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-white">
                                        <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={picked.has(i.id)} onChange={() => toggle(i.id)} />
                                        <span className="min-w-0 space-y-0.5">
                                            <span className="block text-sm font-medium">{i.name}</span>
                                            <span className="block text-xs text-slate-500">
                                                {[i.model, i.maker, i.calibrated_at ? `校正 ${i.calibrated_at}` : ""].filter(Boolean).join("・") || "型式・製造者名なし"}
                                            </span>
                                            <InstrumentCalibrationNote calibratedAt={i.calibrated_at} months={i.calibration_months} today={today} />
                                        </span>
                                    </label>
                                </li>
                            ))}
                        </ul>
                    )}
                    <div className="flex flex-wrap gap-2">
                        <Button type="button" className="min-h-11" onClick={apply} disabled={picked.size === 0}>
                            選んだ {picked.size} 台を入れる
                        </Button>
                        <Button type="button" variant="outline" className="min-h-11" onClick={() => setOpen(false)}>
                            閉じる
                        </Button>
                    </div>
                    <p className="text-xs text-slate-500">空いている行に入ります。入っている行は書き換えません。</p>
                </div>
            )}
        </div>
    )
}
