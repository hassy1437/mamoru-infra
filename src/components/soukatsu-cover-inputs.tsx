"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toDateInputValue } from "@/lib/date-utils"
import {
    COVER_FIRE_DEPARTMENT_NOTE,
    COVER_FIRE_DEPARTMENT_PLACEHOLDER,
    COVER_REPORT_DATE_NOTE,
    FIRE_DEPARTMENT_TITLES,
    type FireDepartmentTitle,
    fireDepartmentNameInputMax,
    joinFireDepartment,
    splitFireDepartment,
} from "@/lib/soukatsu-cover"

/**
 * 表紙（報告書・様式第１）の「報告年月日」と「宛名」の欄（lib/soukatsu-cover.ts）。
 * ★作成（soukatsu-form）と編集（soukatsu-edit-form）で同じ欄を使う。どちらも空のままでよい。
 * ★宛名は「名前（自由）＋敬称（選ぶ）」（2026-10-20・録音 102）。保存はつないだ 1 つの文字列（呼ぶ側は今までどおり）。
 */
export function SoukatsuCoverInputs({
    reportDate,
    onReportDateChange,
    fireDepartmentName,
    onFireDepartmentNameChange,
}: {
    reportDate: string
    onReportDateChange: (value: string) => void
    fireDepartmentName: string
    onFireDepartmentNameChange: (value: string) => void
}) {
    const { name, title } = splitFireDepartment(fireDepartmentName)
    const printed = joinFireDepartment(name, title)

    const changeName = (next: string) => {
        // ★名前を入れ始めた（空 → 1 文字目）ときだけ、敬称が無ければいちばん多い「消防署長」を選んでおく（変えられる）。
        //   以前は 1 文字打つたびに付け直していて、「敬称を選ぶ」（敬称なし）に戻しても次の 1 文字で消防署長に戻った
        //   （「○○町長」など刷り込みに無い宛名を書けなかった・2026-10-20 の洗い出し）
        const t = title === "" && name.trim() === "" && next.trim() !== "" ? FIRE_DEPARTMENT_TITLES[0] : title
        onFireDepartmentNameChange(joinFireDepartment(next, t))
    }
    const changeTitle = (next: FireDepartmentTitle | "") => onFireDepartmentNameChange(joinFireDepartment(name, next))

    return (
        <div className="grid gap-6 md:grid-cols-2 md:col-span-2 border-t border-slate-100 pt-4">
            <p className="md:col-span-2 text-sm font-semibold text-slate-700">表紙（報告書・様式第１）</p>
            <div className="space-y-2 min-w-0">
                <Label htmlFor="reportDate">報告年月日</Label>
                <Input
                    id="reportDate"
                    type="date"
                    className="min-w-0"
                    value={toDateInputValue(reportDate)}
                    onChange={(e) => onReportDateChange(e.target.value)}
                    aria-describedby="reportDate-note"
                />
                <p id="reportDate-note" className="text-xs text-slate-500">{COVER_REPORT_DATE_NOTE}</p>
            </div>
            <div className="space-y-2 min-w-0">
                <Label htmlFor="fireDepartmentName">宛名</Label>
                <div className="flex gap-2">
                    <Input
                        id="fireDepartmentName"
                        className="min-w-0 flex-1"
                        placeholder={COVER_FIRE_DEPARTMENT_PLACEHOLDER}
                        maxLength={fireDepartmentNameInputMax(title)}
                        value={name}
                        onChange={(e) => changeName(e.target.value)}
                        aria-describedby="fireDepartmentName-note"
                    />
                    {/* ★敬称は選ぶ（表紙の刷り込みの 3 つ）。押す所は 44px 以上 */}
                    <select
                        id="fireDepartmentTitle"
                        aria-label="宛名の敬称"
                        className="min-h-11 shrink-0 rounded-md border border-input bg-background px-2 text-base md:text-sm"
                        value={title}
                        onChange={(e) => changeTitle(e.target.value as FireDepartmentTitle | "")}
                    >
                        <option value="">敬称を選ぶ</option>
                        {FIRE_DEPARTMENT_TITLES.map((t) => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </select>
                </div>
                <p className="text-sm text-slate-700" aria-live="polite">
                    表紙の印字：
                    {!printed
                        ? "（刷り込みのまま・手書き用）"
                        : title
                          ? `${printed}　殿`
                          : `上の行に「${printed}」（敬称は刷り込みのまま）`}
                </p>
                <p id="fireDepartmentName-note" className="text-xs text-slate-500">{COVER_FIRE_DEPARTMENT_NOTE}</p>
            </div>
        </div>
    )
}
