import Link from "next/link"
import { AlertTriangle, CalendarCheck, CalendarClock, ChevronRight, Clock } from "lucide-react"

import { formatYmdJa, type NextInspection } from "@/lib/next-inspection"

/**
 * 「次の点検まであと○日」の帯（地図などの改善 7・2026-11-11）。
 * ★現場で手を止めずに読めるように、字は少なく・数字を大きく・色と印で段を分ける（色だけに頼らない）。
 *   過ぎた＝赤 / 30 日以内＝黄 / それより先＝灰 / 予定（点検日が先の総括表がある）＝青 / 記録なし＝薄い灰
 * 計算は src/lib/next-inspection.ts。
 */
const STYLE = {
    over: { box: "border-red-300 bg-red-50 text-red-800", Icon: AlertTriangle },
    soon: { box: "border-amber-300 bg-amber-50 text-amber-900", Icon: Clock },
    ok: { box: "border-slate-200 bg-slate-50 text-slate-700", Icon: CalendarCheck },
    planned: { box: "border-brand-200 bg-brand-50 text-brand-800", Icon: CalendarClock },
} as const

export default function NextInspectionBand({
    next,
    size = "md",
    className = "",
    pickHref,
}: {
    next: NextInspection | undefined | null
    size?: "md" | "lg"
    className?: string
    /** ★記録が無いとき、前回の点検を選ぶ所へ飛ぶ（物件一覧のカード） */
    pickHref?: string
}) {
    const big = size === "lg" ? "text-3xl" : "text-2xl"
    if (!next && pickHref) {
        return (
            <Link
                href={pickHref}
                data-next-inspection="none"
                className={`flex min-h-11 items-center justify-between gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-bold text-slate-500 hover:bg-slate-50 ${className}`}
            >
                <span className="flex items-center gap-2">
                    <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
                    次の点検: 記録なし
                </span>
                <span className="inline-flex items-center gap-0.5 text-brand-700">
                    前回を選ぶ
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </span>
            </Link>
        )
    }
    if (!next) {
        return (
            <div data-next-inspection="none" className={`flex min-h-11 items-center gap-2 rounded-lg border border-dashed border-slate-200 px-3 py-2 text-sm text-slate-400 ${className}`}>
                <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
                次の点検: 記録なし
            </div>
        )
    }
    const { box, Icon } = STYLE[next.level]
    const days = Math.abs(next.daysLeft)
    const count =
        next.daysLeft === 0 ? (
            <span className={`${big} font-extrabold leading-none`}>今日</span>
        ) : next.daysLeft < 0 ? (
            <span className="inline-flex items-baseline gap-1">
                <span className={`${big} font-extrabold leading-none tabular-nums`}>{days}</span>
                <span className="text-sm font-bold">日 過ぎ</span>
            </span>
        ) : (
            <span className="inline-flex items-baseline gap-1">
                <span className="text-sm font-bold">{next.level === "planned" ? "予定 あと" : "あと"}</span>
                <span className={`${big} font-extrabold leading-none tabular-nums`}>{days}</span>
                <span className="text-sm font-bold">日</span>
            </span>
        )
    return (
        <div data-next-inspection={next.level} className={`flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 py-2 ${box} ${className}`}>
            <span className="flex min-w-0 items-center gap-2">
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                {count}
            </span>
            <span className="min-w-0 text-right text-xs font-medium leading-tight sm:text-sm">
                <span className="block">{next.kind}点検</span>
                <span className="block whitespace-nowrap">{formatYmdJa(next.date, next.approx)}</span>
            </span>
        </div>
    )
}
