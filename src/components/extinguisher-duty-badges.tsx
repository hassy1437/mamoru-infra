import { cn } from "@/lib/utils"
import {
    internalCheckDuty,
    pressureTestDuty,
    replacementGuide,
    type Duty,
    type ExtinguisherGroup,
} from "@/lib/extinguisher-ledger"

type Group = Pick<ExtinguisherGroup, "kind" | "pressurization" | "manufactured_year" | "last_pressure_test_year">

/** 札の色: 対象は琥珀（★赤にしない・不安を煽らない）、まだ・対象外は灰色、分からないは点線 */
const TONE: Record<Duty["state"], string> = {
    due: "border-amber-300 bg-amber-50 text-amber-900",
    later: "border-slate-200 bg-white text-slate-600",
    exempt: "border-slate-200 bg-slate-50 text-slate-500",
    unknown: "border-dashed border-slate-300 bg-white text-slate-500",
}

function headline(d: Duty): string {
    if (d.state === "due") return "対象"
    if (d.state === "later") return `${d.fromYear} 年から`
    if (d.state === "exempt") return "年数では求めない"
    return "分からない"
}

function DutyRow({ label, duty }: { label: string; duty: Duty }) {
    return (
        <li className={cn("flex flex-wrap items-baseline gap-x-2 rounded-md border px-2 py-1 text-xs", TONE[duty.state])}>
            <span className="font-medium">{label}</span>
            <span className="font-bold">{headline(duty)}</span>
            <span className="opacity-80">{duty.reason}</span>
        </li>
    )
}

/**
 * 消火器の台帳の 1 行が、この年の点検で何の対象か（耐圧性能点検・内部と機能の点検・交換の目安・2026-10-30）。
 * ★年数の決まりは lib/extinguisher-ledger.ts の 1 か所。★交換の目安は法令ではないので「目安」と書く。
 */
export default function ExtinguisherDutyBadges({ group, thisYear }: { group: Group; thisYear: number }) {
    const guide = replacementGuide(group, thisYear)
    return (
        <ul className="space-y-1">
            <DutyRow label="耐圧性能点検" duty={pressureTestDuty(group, thisYear)} />
            <DutyRow label="内部・機能の点検" duty={internalCheckDuty(group, thisYear)} />
            {guide.state !== "unknown" && (
                <li
                    className={cn(
                        "flex flex-wrap items-baseline gap-x-2 rounded-md border px-2 py-1 text-xs",
                        guide.state === "ok" ? "border-slate-200 bg-white text-slate-600" : "border-amber-300 bg-amber-50 text-amber-900",
                    )}
                >
                    <span className="font-medium">交換の目安</span>
                    <span className="font-bold">
                        {guide.state === "past" ? `${guide.year} 年を過ぎています` : guide.state === "this_year" ? `${guide.year} 年（今年）` : `${guide.year} 年まで`}
                    </span>
                </li>
            )}
        </ul>
    )
}
