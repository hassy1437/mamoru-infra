"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toDateInputValue } from "@/lib/date-utils"
import {
    COVER_FIRE_DEPARTMENT_NOTE,
    COVER_FIRE_DEPARTMENT_PLACEHOLDER,
    COVER_REPORT_DATE_NOTE,
    FIRE_DEPARTMENT_NAME_MAX,
} from "@/lib/soukatsu-cover"

/**
 * 表紙（報告書・様式第１）の「報告年月日」と「宛名」の欄（lib/soukatsu-cover.ts）。
 * ★作成（soukatsu-form）と編集（soukatsu-edit-form）で同じ欄を使う。どちらも空のままでよい。
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
                <Input
                    id="fireDepartmentName"
                    placeholder={COVER_FIRE_DEPARTMENT_PLACEHOLDER}
                    maxLength={FIRE_DEPARTMENT_NAME_MAX}
                    value={fireDepartmentName}
                    onChange={(e) => onFireDepartmentNameChange(e.target.value)}
                    aria-describedby="fireDepartmentName-note"
                />
                <p id="fireDepartmentName-note" className="text-xs text-slate-500">{COVER_FIRE_DEPARTMENT_NOTE}</p>
            </div>
        </div>
    )
}
