"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, FileText } from "lucide-react"
import ItiranPdfPreview from "@/components/itiran-pdf-preview"

// 点検者一覧PDFプレビューを折りたたみにするラッパ。
// ★開いた時だけ ItiranPdfPreview をマウントする＝閉じている間は /api/generate-itiran-pdf を叩かない。
//   これでハブを開くたびの自動PDF生成（＝重い iframe が最下部を占有）が無くなり、様式リストが最初に見える。
export default function ItiranPdfPreviewCollapsible({ data }: { data: Record<string, unknown> }) {
    const [open, setOpen] = useState(false)

    return (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                className="w-full flex items-center justify-between gap-2 px-5 py-4 text-left hover:bg-slate-50 transition-colors"
            >
                <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <FileText className="w-4 h-4 text-slate-400" />
                    点検者一覧のプレビュー
                </span>
                <span className="flex items-center gap-1.5 text-xs text-slate-400">
                    {open ? "閉じる" : "表示"}
                    {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </span>
            </button>
            {open && (
                <div className="border-t border-slate-100 p-4">
                    <ItiranPdfPreview data={data} />
                </div>
            )}
        </div>
    )
}
