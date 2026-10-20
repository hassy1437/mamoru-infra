"use client"

import { cn } from "@/lib/utils"

interface FloorSelectProps {
    id?: string
    value: string
    onChange: (value: string) => void
    /** 選択肢の最小値（含む） */
    min: number
    /** 選択肢の最大値（含む） */
    max: number
    required?: boolean
    className?: string
}

/**
 * 階数選択用のネイティブ select（min〜max の整数。範囲の外の保存値はそのまま 1 つ足して出す）。
 * value/onChange は文字列（"1"〜"30" 等）。保存側の parseInt をそのまま通すため値は不変。
 *
 * 注: ネイティブ <select> に display:flex を当てると iOS WebKit でコントロールが
 * 潰れて表示されない（UsageSelect で発生）。className に flex を付けず、既存の
 * 動作する select（bekki 判定欄等）と同じ w-full ブロック表示にすること。
 */
export function FloorSelect({ id, value, onChange, min, max, required, className }: FloorSelectProps) {
    const options: number[] = []
    for (let n = min; n <= max; n += 1) options.push(n)
    // ★範囲の外の保存値（以前の入力・複製元）も消さずに出す。出さないと「選択してください」に見え、
    //   ほかの欄を直して保存したときに気づかないまま別の値を選び直してしまう（録音 102 の洗い出し・2026-10-20）
    const n = Number(value)
    if (value !== "" && Number.isInteger(n) && !options.includes(n)) options.push(n)
    options.sort((a, b) => a - b)

    return (
        <select
            id={id}
            required={required}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={cn(
                "h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 invalid:border-red-400 invalid:ring-red-200",
                className,
            )}
        >
            <option value="">選択してください</option>
            {options.map((n) => (
                <option key={n} value={String(n)}>{n}</option>
            ))}
        </select>
    )
}
