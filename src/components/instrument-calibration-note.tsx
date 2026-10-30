import { AlertTriangle } from "lucide-react"
import { calibrationStatus } from "@/lib/measuring-instruments"

/**
 * 校正の期限の知らせ（台帳の一覧・選ぶ所・様式の表の行で使う・2026-10-30）。
 * ★黄色にするだけ（確定は止めない・設計メモ Q5）。周期か校正年月日が無ければ何も出さない。
 */
export default function InstrumentCalibrationNote({
    calibratedAt,
    months,
    today,
}: {
    calibratedAt: string | null | undefined
    months: number | null | undefined
    today: string
}) {
    const { state, due } = calibrationStatus(calibratedAt, months, today)
    if (state === "overdue") {
        return (
            <p className="flex items-start gap-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>校正の期限（{due}・{months} か月ごと）を過ぎています</span>
            </p>
        )
    }
    if (state === "soon") {
        return <p className="text-xs text-amber-700">まもなく校正の期限（{due}）</p>
    }
    return null
}
