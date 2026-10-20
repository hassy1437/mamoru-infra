"use client"

import { CheckCheck, CircleCheck } from "lucide-react"
import { useEffect, useRef } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
    BULK_GOOD_BUTTON_LABEL,
    bulkGoodConfirmText,
    bulkGoodResultText,
    planBulkGood,
    type BulkGoodSection,
} from "@/lib/bekki-bulk-good"
import { DEFAULT_GOOD_CONFIRM_LABEL, DEFAULT_GOOD_NOTICE } from "@/lib/bekki-default-good"

/**
 * 様式の頭に置く「この様式の空欄をすべて良にする」（2026-10-19・#101）。規則は src/lib/bekki-bulk-good.ts。
 * ★押したらまず何行入るかを数えて確かめる（このリポジトリの確認は window.confirm で統一されている）。
 *   入れたあとも行数を知らせる。0 行なら確かめずに理由だけ出す。
 */
export function BekkiBulkGoodButton({
    form,
    inspectionType,
    sections,
    onApply,
    fresh = false,
    defaulted = false,
    onDefaultedChange,
}: {
    /** 「別記様式第N」（BEKKI_ROW_LABELS のキー） */
    form: string
    /** 画面の点検種別（★保存前の今の値）。点検種別の欄が無い様式（別記1）は渡さない */
    inspectionType?: string | null
    sections: readonly BulkGoodSection[]
    /** 表ごとの「良」にする行の添字を受け取り、applyBulkGood で state に入れる */
    onApply: (targets: Record<string, number[]>) => void
    /**
     * ★まだ一度も保存していない様式か（savedPayload が無い）。true なら開いたときに 1 回だけ、
     *   このボタンと同じ処理を自動でかける（初期値「良」・2026-10-20・録音 102・src/lib/bekki-default-good.ts）
     */
    fresh?: boolean
    /** 判定が初期値（良）のままか（payload.judgments_defaulted） */
    defaulted?: boolean
    /** 初期値を入れた（true）・「確かめました」を押した（false） */
    onDefaultedChange?: (defaulted: boolean) => void
}) {
    // ★新しい様式で 1 回だけ（開発時の二重の effect でも 1 回）。確かめの窓は出さない（自動で入れる）
    const autoApplied = useRef(false)
    useEffect(() => {
        if (!fresh || autoApplied.current) return
        autoApplied.current = true
        const plan = planBulkGood(form, inspectionType, sections)
        if (plan.count === 0) return
        onApply(plan.targets)
        onDefaultedChange?.(true)
        // ★開いたときの値だけで決める（入力のたびに入れ直さない）
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleClick = () => {
        const plan = planBulkGood(form, inspectionType, sections)
        if (plan.count === 0) {
            toast.info(bulkGoodResultText(plan))
            return
        }
        if (!window.confirm(bulkGoodConfirmText(plan))) return
        onApply(plan.targets)
        toast.success(bulkGoodResultText(plan))
    }

    return (
        <Card>
            {/* ★初期値（良）が入ったままの様式（2026-10-20・録音 102）。確かめたら押す */}
            {defaulted && (
                <div className="flex flex-col gap-3 border-b border-amber-200 bg-amber-50 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-medium text-amber-900">{DEFAULT_GOOD_NOTICE}</p>
                    <Button
                        type="button"
                        size="lg"
                        onClick={() => onDefaultedChange?.(false)}
                        className="h-auto min-h-11 w-full shrink-0 whitespace-normal bg-amber-600 px-4 py-2 text-white hover:bg-amber-700 sm:w-auto"
                    >
                        <CircleCheck className="mr-1.5 h-4 w-4 shrink-0" />
                        {DEFAULT_GOOD_CONFIRM_LABEL}
                    </Button>
                </div>
            )}
            <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-600">
                    異常の無い様式は、判定が空欄の行をまとめて「良」にできます。入力済みの良・否は変えません。
                    点検種別が機器点検のときは、総合点検の行を空欄のままにします。
                </p>
                {/* ★押す所は 44px 以上。幅の狭いスマホ（320px）では文言を折り返す（1 行固定だとカードからはみ出す） */}
                <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={handleClick}
                    className="h-auto min-h-11 w-full shrink-0 whitespace-normal px-4 py-2 sm:w-auto"
                >
                    <CheckCheck className="mr-1.5 h-4 w-4 shrink-0" />
                    {BULK_GOOD_BUTTON_LABEL}
                </Button>
            </CardContent>
        </Card>
    )
}
