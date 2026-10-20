"use client"

import { AlertTriangle } from "lucide-react"
import { selectedChoices, toggleChoice, unmatchedChoiceText, type ChoiceRow } from "@/lib/bekki-choice-rows"

/**
 * 選択肢の欄（刷り込みの語を○で囲む行）の入力。★文字の欄だと何を書けば○が付くか分からない（2026-10-20）。
 * 保存の形は content の文字列のまま（src/lib/bekki-choice-rows.ts）。
 */
export function BekkiChoiceCheckboxes({
    row,
    value,
    onChange,
    ariaLabel,
}: {
    row: ChoiceRow
    value: string
    onChange: (next: string) => void
    ariaLabel: string
}) {
    const selected = selectedChoices(value, row)
    const stray = unmatchedChoiceText(value, row)
    return (
        <div role="group" aria-label={ariaLabel} className="space-y-1">
            <div className="flex flex-wrap gap-x-3 gap-y-1">
                {row.options.map((opt) => (
                    <label key={opt.value} className="inline-flex min-h-11 md:min-h-8 cursor-pointer items-center gap-1.5 text-sm">
                        <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={selected.includes(opt.value)}
                            onChange={() => onChange(toggleChoice(value, row, opt.value))}
                        />
                        <span>{opt.label}</span>
                    </label>
                ))}
            </div>
            {stray && (
                <p className="flex items-start gap-1 text-xs leading-relaxed text-amber-700">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>入力済みの「{stray}」は選択肢と合わず、○が付きません。上から選び直してください</span>
                </p>
            )}
        </div>
    )
}
