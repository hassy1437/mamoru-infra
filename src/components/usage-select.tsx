"use client"

import { cn } from "@/lib/utils"
import { USAGE_CATEGORIES } from "@/lib/usage-categories"

interface UsageSelectProps {
    id?: string
    value: string
    onChange: (value: string) => void
    required?: boolean
    className?: string
}

// USAGE_CATEGORIES の並び順を保ったまま group(大項目)ごとに optgroup へまとめる
function groupedCategories() {
    const groups: { group: string; items: typeof USAGE_CATEGORIES }[] = []
    for (const c of USAGE_CATEGORIES) {
        let g = groups.find((x) => x.group === c.group)
        if (!g) {
            g = { group: c.group, items: [] }
            groups.push(g)
        }
        g.items.push(c)
    }
    return groups
}

/**
 * 消防法施行令別表第一の用途区分を単一選択するネイティブ select。
 * value/onChange は文字列（USAGE_CATEGORIES.value）。保存値・PDF出力にそのまま使う。
 */
export function UsageSelect({ id, value, onChange, required, className }: UsageSelectProps) {
    return (
        <select
            id={id}
            required={required}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={cn(
                "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 invalid:border-red-400 invalid:ring-red-200",
                className,
            )}
        >
            <option value="">用途を選択してください</option>
            {groupedCategories().map((g) => (
                <optgroup key={g.group} label={g.group}>
                    {g.items.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                </optgroup>
            ))}
        </select>
    )
}
