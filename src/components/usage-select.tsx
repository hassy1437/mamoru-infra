"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { USAGE_CATEGORIES, formatUsageLabel } from "@/lib/usage-categories"

/** 一覧に無い用途を書くときの選択肢（保存値にはならない） */
const OTHER = "__other__"

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
 *
 * ★「その他」で一覧に無い用途を書ける（2026-10-20・録音 102 の洗い出し）。
 *   一覧は 35 区分だけで、6項イ(1)〜(4) などの細かい区分や 16項の内訳（例「16項イ（3項ロ・5項ロ・15項）」）が無い。
 *   以前は一覧に無い保存値（「事務所兼自宅」など）が「用途を選択してください」に見え、required で物件・総括表を
 *   保存できなくなっていた。表紙の PDF は自由な文字をそのまま印字する（formatUsageShort）。
 */
export function UsageSelect({ id, value, onChange, required, className }: UsageSelectProps) {
    const known = USAGE_CATEGORIES.some((c) => c.value === value)
    const [otherMode, setOtherMode] = useState(value !== "" && !known)
    const showOther = otherMode || (value !== "" && !known)
    return (
        <div className="space-y-2">
            <select
                id={id}
                required={required}
                value={showOther ? OTHER : value}
                onChange={(e) => {
                    if (e.target.value === OTHER) {
                        setOtherMode(true)
                        if (known) onChange("")
                    } else {
                        setOtherMode(false)
                        onChange(e.target.value)
                    }
                }}
                // 注: ネイティブ <select> に display:flex を当てると iOS WebKit で
                // コントロールが潰れて表示されない（Chromium は許容）。既存の動作する
                // select（bekki 判定欄等）と同じく flex を付けずブロック表示にする。
                className={cn(
                    "h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 invalid:border-red-400 invalid:ring-red-200",
                    className,
                )}
            >
                <option value="">用途を選択してください</option>
                {groupedCategories().map((g) => (
                    <optgroup key={g.group} label={formatUsageLabel(g.group)}>
                        {g.items.map((c) => (
                            <option key={c.value} value={c.value}>{formatUsageLabel(c.value)}</option>
                        ))}
                    </optgroup>
                ))}
                <option value={OTHER}>その他（一覧に無い用途を書く）</option>
            </select>
            {showOther && (
                <Input
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    required={required}
                    placeholder="例: 16項イ（3項ロ・5項ロ・15項）"
                    aria-label="用途（一覧に無い用途）"
                />
            )}
        </div>
    )
}
