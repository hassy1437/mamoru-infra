"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Lock, Trash2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import {
    SOUKATSU_DELETE_BLOCK_NOTE,
    soukatsuDeleteConfirmText,
    soukatsuDeleteErrorText,
    type SoukatsuDeleteBlock,
} from "@/lib/soukatsu-delete"

/**
 * 総括表（点検）の削除。間違えて始めた点検を消す（src/lib/soukatsu-delete.ts）。
 * ★確定・納品した点検はボタンを出さず、理由だけ出す。
 */
export default function DeleteSoukatsuButton({
    soukatsuId,
    buildingName,
    block,
}: {
    soukatsuId: string
    buildingName: string | null
    block: SoukatsuDeleteBlock
}) {
    const router = useRouter()
    const [deleting, setDeleting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleDelete = async () => {
        if (!window.confirm(soukatsuDeleteConfirmText(buildingName))) return
        setDeleting(true)
        setError(null)
        // ★消えた件数を確かめる（RLS で弾かれると error なしで 0 件になる＝黙って成功にしない）
        const { data, error: err } = await createClient()
            .from("inspection_soukatsu")
            .delete()
            .eq("id", soukatsuId)
            .select("id")
        const message = soukatsuDeleteErrorText(err, data?.length ?? 0)
        if (message) {
            setError(message)
            setDeleting(false)
            return
        }
        router.push("/reports")
        router.refresh()
    }

    return (
        <section aria-labelledby="delete-soukatsu-title" className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 id="delete-soukatsu-title" className="text-sm font-semibold text-slate-800">この点検を削除</h2>
            {block ? (
                <p role="note" className="mt-2 flex items-start gap-2 text-sm leading-relaxed text-slate-600">
                    <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                    <span>{SOUKATSU_DELETE_BLOCK_NOTE[block]}</span>
                </p>
            ) : (
                <>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">
                        間違えて始めた点検を消せます。点検者一覧表と点検票（別記）も一緒に消えます。物件は消えません。
                    </p>
                    <button
                        type="button"
                        onClick={handleDelete}
                        disabled={deleting}
                        className="mt-3 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
                    >
                        {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        {deleting ? "削除中..." : "総括表を削除"}
                    </button>
                    {error && (
                        <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>
                    )}
                </>
            )}
        </section>
    )
}
