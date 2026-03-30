"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ClipboardCheck, Copy, Loader2, Pencil, Trash2 } from "lucide-react"
import { supabase } from "@/lib/supabase"

interface PropertyActionButtonsProps {
    propertyId: string
    propertyName: string
}

export default function PropertyActionButtons({
    propertyId,
    propertyName,
}: PropertyActionButtonsProps) {
    const router = useRouter()
    const [deleting, setDeleting] = useState(false)

    const handleDelete = async () => {
        const confirmed = window.confirm(
            `「${propertyName || "この物件"}」を削除しますか？\nこの操作は取り消せません。`
        )

        if (!confirmed) return

        setDeleting(true)
        const { error } = await supabase
            .from("properties")
            .delete()
            .eq("id", propertyId)

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
                href={`/properties/${propertyId}/edit`}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
            >
                <Pencil className="w-4 h-4" />
                編集
            </Link>
            <Link
                href={`/properties/new?copyFrom=${propertyId}`}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
            >
                <Copy className="w-4 h-4" />
                複製
            </Link>
            <Link
                href={`/inspection/new?propertyId=${propertyId}`}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
            >
                <ClipboardCheck className="w-4 h-4" />
                点検開始
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
