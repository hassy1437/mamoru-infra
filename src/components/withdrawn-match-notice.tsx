import { AlertTriangle } from "lucide-react"
import { WITHDRAWN_MATCH_NOTE, formatWithdrawnDate } from "@/lib/match-withdrawn"

/** 成約が取り消された物件の知らせ（src/lib/match-withdrawn.ts・総点検 B3）。withdrawnAt が無ければ何も出さない。 */
export default function WithdrawnMatchNotice({ withdrawnAt, className = "" }: { withdrawnAt: string | null; className?: string }) {
    if (!withdrawnAt) return null
    const date = formatWithdrawnDate(withdrawnAt)
    return (
        <div role="alert" className={`rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 ${className}`}>
            <p className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                成約が取り消されています{date && `（${date}）`}
            </p>
            <p className="mt-1 text-amber-700">{WITHDRAWN_MATCH_NOTE}</p>
        </div>
    )
}
