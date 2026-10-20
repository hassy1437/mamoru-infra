"use client"

/**
 * 判定（良・否）を 1 タップで入れるボタン（スマホのカード表示・2026-10-20）。
 *
 * ■ なぜ要るか
 *   iPhone のプルダウンは「開く → 選ぶ → 閉じる」の 3 操作で、点検票 23 様式で約 1,370 か所あった。
 *   ボタンなら 1 タップ。もう一度押すと未入力に戻る（プルダウンの「未入力」と同じ値＝空）。
 *   値は今までと同じ（"" / "良" / "否"）。パソコンの表はプルダウンのまま。
 */
export default function JudgmentButtons({
    value,
    onChange,
    label,
}: {
    value: string
    onChange: (next: string) => void
    /** 読み上げ用（どの行の判定か） */
    label?: string
}) {
    const options = [
        { v: "良", on: "border-emerald-600 bg-emerald-600 text-white", mark: "✓" },
        { v: "否", on: "border-red-600 bg-red-600 text-white", mark: "✗" },
    ] as const
    return (
        <div role="group" aria-label={label ? `${label} の判定` : "判定"} className="grid grid-cols-2 gap-2">
            {options.map((o) => {
                const pressed = value === o.v
                return (
                    <button
                        key={o.v}
                        type="button"
                        aria-pressed={pressed}
                        title={pressed ? "もう一度押すと未入力に戻ります" : undefined}
                        onClick={() => onChange(pressed ? "" : o.v)}
                        className={`h-11 rounded-md border text-base font-medium transition-colors ${
                            pressed ? o.on : "border-slate-300 bg-white text-slate-700 active:bg-slate-100"
                        }`}
                    >
                        {pressed ? `${o.mark} ${o.v}` : o.v}
                    </button>
                )
            })}
        </div>
    )
}
