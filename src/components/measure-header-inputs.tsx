"use client"

import { Input } from "@/components/ui/input"
import type { MeasureHeader } from "@/lib/measure-headers"
import { toDateInputValue } from "@/lib/date-utils"

/**
 * その5（容器ごとの点検結果）の、測定の列の見出しの入力（src/lib/measure-headers.ts）。
 * 点検年月日（別記6 は容器表面温度も）を測定ごとに 1 回入れる。容器の行には値だけを入れる。
 */
export default function MeasureHeaderInputs({
    headers,
    onChange,
    withTemp,
}: {
    headers: MeasureHeader[]
    onChange: (next: MeasureHeader[]) => void
    /** 容器表面温度の欄も出す（別記6） */
    withTemp: boolean
}) {
    const set = (m: number, key: keyof MeasureHeader, value: string) =>
        onChange(headers.map((h, i) => (i === m ? { ...h, [key]: value } : h)))
    return (
        <div role="group" aria-label="測定ごとの点検年月日" className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-medium text-slate-700">
                測定ごとの点検年月日{withTemp ? "・容器表面温度" : ""}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
                様式の列の見出しに 1 回だけ印字します。容器の行には値だけを入れてください。
            </p>
            <div className={`mt-2 grid gap-2 ${withTemp ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"}`}>
                {headers.map((h, m) => (
                    <div key={m} className="min-w-0 space-y-1 rounded-md border border-slate-200 bg-white p-2">
                        <span className="text-xs font-medium text-slate-600">測定{m + 1}</span>
                        {h.date && !toDateInputValue(h.date) ? (
                            // ★日付の形でない以前の入力（「令和8年…」など）は消さずに文字のまま見せて直せるようにする
                            <Input
                                value={h.date}
                                onChange={(e) => set(m, "date", e.target.value)}
                                aria-label={`測定${m + 1} 点検年月日`}
                                className="h-9 text-sm"
                            />
                        ) : (
                            // ★日付は選ぶ（iPhone で「/」を打たなくてよい・2026-10-20）。保存は 2026-10-14 の形（印字は measureHeaderDateParts が読む）
                            <Input
                                type="date"
                                value={toDateInputValue(h.date)}
                                onChange={(e) => set(m, "date", e.target.value)}
                                aria-label={`測定${m + 1} 点検年月日`}
                                className="h-9 text-sm"
                            />
                        )}
                        {withTemp && (
                            <div className="flex items-center gap-1">
                                <Input
                                    value={h.temp}
                                    onChange={(e) => set(m, "temp", e.target.value)}
                                    placeholder={m === 0 ? "例: 20" : ""}
                                    inputMode="decimal"
                                    aria-label={`測定${m + 1} 容器表面温度`}
                                    className="h-9 text-sm"
                                />
                                <span className="text-sm text-slate-500">℃</span>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}
