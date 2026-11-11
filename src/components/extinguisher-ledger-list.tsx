"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2, Pencil, Trash2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import ExtinguisherDutyBadges from "@/components/extinguisher-duty-badges"
import { kindLabel, pressurizationLabel, type ExtinguisherGroup } from "@/lib/extinguisher-ledger"

/** 消火器の台帳の一覧（測定機器の台帳の一覧と同じ形・2026-10-30） */
export default function ExtinguisherLedgerList({ items, thisYear }: { items: ExtinguisherGroup[]; thisYear: number }) {
    return (
        <div className="space-y-4">
            {items.map((g) => {
                const title = `${kindLabel(g.kind)}（${pressurizationLabel(g.pressurization)}）`
                return (
                    <div key={g.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                            <div className="min-w-0 sm:flex-1 space-y-2">
                                <h3 className="text-base font-bold text-slate-900">
                                    {title}
                                    <span className="ml-2 font-medium text-slate-600">{g.quantity} 本</span>
                                    <span className="ml-2 font-medium text-slate-600">{g.manufactured_year ? `${g.manufactured_year} 年製` : "製造年なし"}</span>
                                </h3>
                                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm text-slate-600">
                                    {g.maker && (<><dt className="text-slate-400">製造者名</dt><dd className="min-w-0 break-all">{g.maker}</dd></>)}
                                    {g.model && (<><dt className="text-slate-400">型式</dt><dd className="min-w-0 break-all">{g.model}</dd></>)}
                                    {g.approval_number && (<><dt className="text-slate-400">型式番号</dt><dd className="min-w-0 break-all">{g.approval_number}</dd></>)}
                                    {g.location && (<><dt className="text-slate-400">設置場所</dt><dd className="min-w-0 break-all">{g.location}</dd></>)}
                                    {g.last_pressure_test_year && (<><dt className="text-slate-400">前回の耐圧</dt><dd>{g.last_pressure_test_year} 年</dd></>)}
                                </dl>
                                <ExtinguisherDutyBadges group={g} thisYear={thisYear} />
                                {g.note && <p className="text-xs text-slate-500 break-all">{g.note}</p>}
                            </div>
                            <div className="shrink-0 w-full sm:w-auto">
                                <ActionButtons propertyId={g.property_id} id={g.id} name={title} />
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

function ActionButtons({ propertyId, id, name }: { propertyId: string; id: string; name: string }) {
    const router = useRouter()
    const [deleting, setDeleting] = useState(false)

    const handleDelete = async () => {
        // ★台帳は報告書の記録ではないので、消しても過去の報告書は変わらない
        if (!window.confirm(`「${name}」の行を台帳から削除しますか？\n報告書の中身は変わりません。この操作は取り消せません。`)) return
        setDeleting(true)
        const { error } = await supabase.from("extinguisher_groups").delete().eq("id", id)
        if (error) {
            alert(`削除できませんでした: ${error.message}`)
            setDeleting(false)
            return
        }
        router.refresh()
    }

    return (
        <div className="flex gap-2 sm:flex-col">
            <Link
                href={`/properties/${propertyId}/extinguishers/${id}/edit`}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-11 bg-slate-600 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
            >
                <Pencil className="w-4 h-4" />
                編集
            </Link>
            <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                aria-busy={deleting}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-11 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
            >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {deleting ? "削除中..." : "削除"}
            </button>
        </div>
    )
}
