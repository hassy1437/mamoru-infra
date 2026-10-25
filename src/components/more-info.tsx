import { ChevronDown } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * ★注意書きの「詳しく見る」（2026-10-25・橋本さん「注意書きは文章が長すぎると読まなくなる。
 *   簡潔にして、詳細は詳細ボタンから開けるようにした方が良い」）。マッチングサイトの components/ui/more-info.tsx と同じ形。
 *
 * ■ 書き方
 *   ・要点（何が起きるか・何をしてほしいか）を 1 文（目安 40 字以内）で外に出す。これだけ読めば足りるように
 *   ・理由・例外・細かい条件は、この中に入れる
 *   ・★押す前に知らないと困ること（印字されない・取り消せない など）は要点の側に書く。中に隠さない
 * ■ 形
 *   ・閉じた「詳しく見る ▼」。押すと開いて「閉じる ▲」（details と summary＝読み上げでも開ける）
 *   ・押せる高さ 44px。文字の色と大きさは囲みに合わせる
 */
export default function MoreInfo({
    children,
    label = "詳しく見る",
    className,
}: {
    children: ReactNode
    /** 閉じているときの札（既定「詳しく見る」） */
    label?: string
    className?: string
}) {
    return (
        <details className={cn("group", className)}>
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 font-medium underline underline-offset-2 [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">{label}</span>
                <span className="hidden group-open:inline">閉じる</span>
                <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="space-y-1.5 pb-2 leading-relaxed">{children}</div>
        </details>
    )
}
