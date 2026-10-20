"use client"

import { AlertTriangle } from "lucide-react"
import { inspectionTypeFromParts, inspectionTypeParts } from "@/lib/bekki-inspection-type"

/**
 * 別記の「点検種別」（様式の「機器・総合」を○で囲む欄）。★文字の欄だと何を書けば○が付くか分からない（2026-10-20）。
 * 保存の形は今までどおり（src/lib/bekki-inspection-type.ts）。
 */
export function BekkiInspectionTypeInput({ value, onChange }: { value: string; onChange: (next: string) => void }) {
    const parts = inspectionTypeParts(value)
    const stray = value.trim() && !parts.kiki && !parts.sougou ? value.trim() : ""
    const toggle = (key: "kiki" | "sougou") => onChange(inspectionTypeFromParts({ ...parts, [key]: !parts[key] }))
    return (
        <div role="group" aria-label="点検種別（選択）" className="space-y-1">
            <div className="flex min-h-10 flex-wrap items-center gap-x-4 gap-y-1">
                <label className="inline-flex min-h-8 cursor-pointer items-center gap-1 text-sm">
                    <input type="checkbox" className="h-4 w-4" checked={parts.kiki} onChange={() => toggle("kiki")} />
                    <span>機器点検</span>
                </label>
                <label className="inline-flex min-h-8 cursor-pointer items-center gap-1 text-sm">
                    <input type="checkbox" className="h-4 w-4" checked={parts.sougou} onChange={() => toggle("sougou")} />
                    <span>総合点検</span>
                </label>
            </div>
            {stray && (
                <p className="flex items-start gap-1 text-xs leading-relaxed text-amber-700">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>入力済みの「{stray}」は機器・総合のどちらにも当たらず、○が付きません。選び直してください</span>
                </p>
            )}
        </div>
    )
}
