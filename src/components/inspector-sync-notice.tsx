"use client"

import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { INSPECTOR_FIELD_LABELS as LABELS, inspectorDiff, itiranInspectorFields, type InspectorFields } from "@/lib/inspector-sync"

/**
 * 点検票の点検者（氏名・所属会社・住所・TEL）が、点検者一覧表の点検者 1 と違うときの知らせ（録音 102・2026-10-20）。
 *
 * ■ なぜ要るか
 *   点検票の点検者は、点検者一覧表の点検者 1 を「最初の値」として入れるだけで、一度開いて保存（自動保存を含む）した
 *   点検票には、あとで点検者一覧表を直しても届かない。23 様式を 1 つずつ開いて直す必要があり、直し忘れた点検票は
 *   古い・空の値のまま消防署への報告書に出ていた。
 *
 * ■ 決まり
 *   ・点検者一覧表の値が空の欄は比べない（空で上書きしない）
 *   ・「点検者一覧表の内容に合わせる」で違う欄だけ置き換える（自動保存される）。合わせないことも選べる（知らせるだけ）
 */
export default function InspectorSyncNotice({
    current,
    fromItiran,
    onApply,
}: {
    current: InspectorFields
    fromItiran: Partial<Record<keyof InspectorFields, string | null | undefined>>
    onApply: (next: Partial<InspectorFields>) => void
}) {
    const source = itiranInspectorFields(fromItiran)
    const diff = inspectorDiff(current, source)
    if (!diff.length) return null
    return (
        <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">点検者の欄が点検者一覧表と違います（{diff.map((k) => LABELS[k]).join("・")}）</p>
            <ul className="mt-1 space-y-0.5 text-amber-800">
                {diff.map((k) => (
                    <li key={k} className="break-all">
                        {LABELS[k]}: この点検票「{current[k] || "（空）"}」→ 点検者一覧表「{source[k]}」
                    </li>
                ))}
            </ul>
            <p className="mt-1 text-xs text-amber-700">点検者一覧表をあとで直しても、保存済みの点検票には自動では入りません。</p>
            <Button
                type="button"
                variant="outline"
                className="mt-2 min-h-11 border-amber-400 bg-white text-amber-900 hover:bg-amber-100"
                onClick={() => onApply(Object.fromEntries(diff.map((k) => [k, source[k]])) as Partial<InspectorFields>)}
            >
                <RefreshCw className="mr-1.5 h-4 w-4" />
                点検者一覧表の内容に合わせる
            </Button>
        </div>
    )
}
