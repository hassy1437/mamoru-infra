"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { CalendarClock, Loader2, X } from "lucide-react"
import { toast } from "sonner"

import { supabase } from "@/lib/supabase"
import { recentMonths } from "@/lib/next-inspection"

/**
 * 前回の点検（種類と月）をボタンで選ぶ（地図などの改善 7 の続き・2026-11-11 橋本さん「おすすめで」）。
 * ★点検アプリに総括表がまだ無い物件でも「次の点検まであと○日」を出すため。字は打たない:
 *   「前回の点検を選ぶ」→ 機器点検／総合点検 → 月（今月から 12 か月・「もっと前」で 24 か月）
 * DB は inspection.properties.last_inspection_month（月の 1 日）/ last_inspection_kind（20261231160000）。
 * ★総括表のほうが新しければ、そちらが前回になる（src/lib/next-inspection.ts）
 */
const KINDS = ["機器点検", "総合点検"] as const

export default function LastInspectionPicker({
    propertyId,
    current,
}: {
    propertyId: string
    current: { month: string; kind: string } | null
}) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [kind, setKind] = useState<(typeof KINDS)[number] | null>(null)
    const [older, setOlder] = useState(false)
    const [saving, setSaving] = useState<string | null>(null)

    const save = async (month: string | null) => {
        setSaving(month ?? "clear")
        const row = month && kind ? { last_inspection_month: month, last_inspection_kind: kind } : { last_inspection_month: null, last_inspection_kind: null }
        const { error } = await supabase.from("properties").update(row).eq("id", propertyId)
        setSaving(null)
        if (error) {
            toast.error("保存できませんでした。電波のある所でもう一度押してください")
            return
        }
        toast.success(month ? "前回の点検を入れました" : "前回の点検を消しました")
        setOpen(false)
        setKind(null)
        router.refresh()
    }

    if (!open) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-blue-300 bg-white px-4 text-base font-bold text-blue-700 hover:bg-blue-50"
            >
                <CalendarClock className="h-5 w-5" aria-hidden="true" />
                {current ? "前回の点検を直す" : "前回の点検を選ぶ"}
            </button>
        )
    }

    const months = [...recentMonths(undefined, 12), ...(older ? recentMonths(undefined, 12, 12) : [])]
    return (
        <div className="space-y-3 rounded-xl border border-blue-200 bg-white p-4">
            <div className="flex items-center justify-between">
                <p className="text-base font-bold text-slate-800">{kind ? "いつ？" : "前回の点検は？"}</p>
                <button type="button" onClick={() => { setOpen(false); setKind(null) }} className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-slate-100" aria-label="閉じる">
                    <X className="h-5 w-5" aria-hidden="true" />
                </button>
            </div>
            {!kind ? (
                <div className="grid grid-cols-2 gap-2">
                    {KINDS.map((k) => (
                        <button
                            key={k}
                            type="button"
                            onClick={() => setKind(k)}
                            className="min-h-14 rounded-lg border-2 border-slate-300 bg-white text-lg font-bold text-slate-800 hover:border-blue-500 hover:bg-blue-50"
                        >
                            {k}
                        </button>
                    ))}
                    {current && (
                        <button
                            type="button"
                            onClick={() => void save(null)}
                            disabled={saving !== null}
                            aria-busy={saving === "clear"}
                            className="col-span-2 min-h-11 rounded-lg text-sm font-bold text-slate-500 underline underline-offset-2"
                        >
                            分からない（消す）
                        </button>
                    )}
                </div>
            ) : (
                <>
                    <p className="text-sm font-bold text-blue-700">{kind}</p>
                    <div className="grid grid-cols-3 gap-2">
                        {months.map((m) => (
                            <button
                                key={m.value}
                                type="button"
                                onClick={() => void save(m.value)}
                                disabled={saving !== null}
                                aria-busy={saving === m.value}
                                className={`inline-flex min-h-12 items-center justify-center rounded-lg border px-1 text-sm font-bold disabled:cursor-wait ${
                                    current?.month === m.value && current.kind === kind ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-800 hover:bg-blue-50"
                                }`}
                            >
                                {saving === m.value ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : m.label}
                            </button>
                        ))}
                    </div>
                    <div className="flex gap-2">
                        <button type="button" onClick={() => setKind(null)} className="min-h-11 flex-1 rounded-lg border border-slate-300 text-sm font-bold text-slate-600">
                            種類に戻る
                        </button>
                        {!older && (
                            <button type="button" onClick={() => setOlder(true)} className="min-h-11 flex-1 rounded-lg border border-slate-300 text-sm font-bold text-slate-600">
                                もっと前
                            </button>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}
