"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2, Pencil, Trash2 } from "lucide-react"
import { supabase } from "@/lib/supabase"

interface InspectorActionButtonsProps {
    inspectorId: string
    inspectorLabel: string
}

export default function InspectorActionButtons({
    inspectorId,
    inspectorLabel,
}: InspectorActionButtonsProps) {
    const router = useRouter()
    const [deleting, setDeleting] = useState(false)

    const handleDelete = async () => {
        const confirmed = window.confirm(
            `「${inspectorLabel || "この点検者"}」を削除しますか？\nこの操作は取り消せません。`
        )

        if (!confirmed) return

        setDeleting(true)
        const { error } = await supabase
            .from("inspectors")
            .delete()
            .eq("id", inspectorId)

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
                href={`/inspectors/${inspectorId}/edit`}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
            >
                <Pencil className="w-4 h-4" />
                編集
            </Link>
            <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
            >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {deleting ? "削除中..." : "削除"}
            </button>
        </div>
    )
}
