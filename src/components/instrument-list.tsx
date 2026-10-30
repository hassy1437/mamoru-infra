"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Gauge, Loader2, Pencil, Trash2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import InstrumentCalibrationNote from "@/components/instrument-calibration-note"
import type { MeasuringInstrument } from "@/lib/measuring-instruments"

/** 測定機器の台帳の一覧（点検者の台帳の一覧と同じ形・2026-10-30） */
export default function InstrumentList({ items, today }: { items: MeasuringInstrument[]; today: string }) {
    return (
        <div className="space-y-4">
            {items.map((i) => (
                <div key={i.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                        <div className="min-w-0 sm:flex-1 space-y-1">
                            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                <Gauge className="w-4 h-4 text-blue-600 shrink-0" />
                                <span className="truncate">{i.name}</span>
                            </h2>
                            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm text-slate-600">
                                {i.model && (<><dt className="text-slate-400">型式</dt><dd className="min-w-0 break-all">{i.model}</dd></>)}
                                {i.maker && (<><dt className="text-slate-400">製造者名</dt><dd className="min-w-0 break-all">{i.maker}</dd></>)}
                                {i.serial_number && (<><dt className="text-slate-400">製造番号</dt><dd className="min-w-0 break-all">{i.serial_number}</dd></>)}
                                <dt className="text-slate-400">校正年月日</dt>
                                <dd>{i.calibrated_at ?? "未入力"}{i.calibration_months ? `（${i.calibration_months} か月ごと）` : ""}</dd>
                            </dl>
                            <InstrumentCalibrationNote calibratedAt={i.calibrated_at} months={i.calibration_months} today={today} />
                            {i.note && <p className="text-xs text-slate-500 break-all">{i.note}</p>}
                        </div>
                        <div className="shrink-0 w-full sm:w-auto">
                            <InstrumentActionButtons id={i.id} name={i.name} />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}

function InstrumentActionButtons({ id, name }: { id: string; name: string }) {
    const router = useRouter()
    const [deleting, setDeleting] = useState(false)

    const handleDelete = async () => {
        // ★台帳から消しても、もう入れた点検票の値は変わらない（写しただけなので）
        if (!window.confirm(`「${name}」を台帳から削除しますか？\nもう入れた点検票の値は変わりません。この操作は取り消せません。`)) return
        setDeleting(true)
        const { error } = await supabase.from("measuring_instruments").delete().eq("id", id)
        if (error) {
            alert(`削除できませんでした: ${error.message}`)
            setDeleting(false)
            return
        }
        router.refresh()
    }

    return (
        <div className="flex flex-col gap-2 shrink-0">
            <Link
                href={`/instruments/${id}/edit`}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-11 bg-slate-600 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
            >
                <Pencil className="w-4 h-4" />
                編集
            </Link>
            <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                aria-busy={deleting}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-11 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
            >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {deleting ? "削除中..." : "削除"}
            </button>
        </div>
    )
}
