"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { InspectorData, ShoubouLicense, KensaLicense } from "@/types/database"
import {
    toDateInputValueFromParts,
    splitDateInputValue,
    toMonthInputValueFromParts,
    splitMonthInputValue,
} from "@/lib/date-utils"

// その分類に値が1つでも入っているか（モバイルの初期タブ選択に使う）。
// itiran-form の isInspectorFilled と同型。保有フラグは持たず値の有無で判定する。
const shoubouFilled = (l: ShoubouLicense) => Boolean(
    l.issue_year || l.issue_month || l.issue_day || l.license_number ||
    l.issuing_governor || l.training_year || l.training_month,
)
const kensaFilled = (l: KensaLicense) => Boolean(
    l.issue_year || l.issue_month || l.issue_day || l.license_number ||
    l.expiry_year || l.expiry_month || l.expiry_day,
)

export type LicenseEditorValue = Pick<
    InspectorData,
    "shoubou_licenses" | "shoubou_notes" | "kensa_licenses"
>

const SHOUBOU_TYPES = [
    { key: "toku",   label: "甲　種　特　類" },
    { key: "class1", label: "甲・乙種　１類" },
    { key: "class2", label: "甲・乙種　２類" },
    { key: "class3", label: "甲・乙種　３類" },
    { key: "class4", label: "甲・乙種　４類" },
    { key: "class5", label: "甲・乙種　５類" },
    { key: "class6", label: "乙　種　６　類" },
    { key: "class7", label: "乙　種　７　類" },
] as const

const KENSA_TYPES = [
    { key: "toku",   label: "特　　　種" },
    { key: "class1", label: "第　１　種" },
    { key: "class2", label: "第　２　種" },
] as const

interface LicenseEditorProps {
    value: LicenseEditorValue
    onChange: (next: LicenseEditorValue) => void
}

export function LicenseEditor({ value, onChange }: LicenseEditorProps) {
    // updates は 1 回の onChange でまとめて反映する (日付分解の year/month/day を
    // 1 イベントで原子的に書き換えるため。3 回連続で onChange を呼ぶと props.value
    // の stale closure で前 2 つが上書きされる)。
    const updateShoubouLicense = (
        typeKey: keyof InspectorData["shoubou_licenses"],
        updates: Partial<ShoubouLicense>,
    ) => {
        onChange({
            ...value,
            shoubou_licenses: {
                ...value.shoubou_licenses,
                [typeKey]: { ...value.shoubou_licenses[typeKey], ...updates },
            },
        })
    }

    const updateKensaLicense = (
        typeKey: keyof InspectorData["kensa_licenses"],
        updates: Partial<KensaLicense>,
    ) => {
        onChange({
            ...value,
            kensa_licenses: {
                ...value.kensa_licenses,
                [typeKey]: { ...value.kensa_licenses[typeKey], ...updates },
            },
        })
    }

    // ── モバイルの大分類2択タブ（表示制御のみ。保存データ構造は変えない）──
    // 初期選択は値の有無で決定（マウント時の value から1回だけ算出。effect は使わない）:
    //   点検資格者に値があれば kensa / なくて消防設備士に値があれば shoubou /
    //   両方空（新規）はデフォルト kensa（橋本さんがよく使う方）。
    const [mobileTab, setMobileTab] = useState<"shoubou" | "kensa">(() => {
        const kensaHas = KENSA_TYPES.some(({ key }) => kensaFilled(value.kensa_licenses[key]))
        if (kensaHas) return "kensa"
        const shoubouHas = SHOUBOU_TYPES.some(({ key }) => shoubouFilled(value.shoubou_licenses[key]))
        if (shoubouHas) return "shoubou"
        return "kensa"
    })

    // button への flex は OK（iOS で潰れるのはネイティブ control の input/select のみ）。
    // 縦中央寄せ＋leading-tight で、1行ラベルと2行ラベルが同じ高さで揃う。
    const tabClass = (active: boolean) =>
        `flex-1 min-h-[44px] px-2 py-2 rounded-md border text-sm font-medium leading-tight flex flex-col items-center justify-center transition-colors ${active ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-300 text-slate-700"}`

    return (
        <>
            {/* Mobile: 大分類2択タブ（div の flex は OK。ネイティブ control には付けない） */}
            <div className="md:hidden flex gap-2">
                <button
                    type="button"
                    aria-pressed={mobileTab === "shoubou"}
                    onClick={() => setMobileTab("shoubou")}
                    className={tabClass(mobileTab === "shoubou")}
                >
                    消防設備士
                </button>
                <button
                    type="button"
                    aria-pressed={mobileTab === "kensa"}
                    onClick={() => setMobileTab("kensa")}
                    className={tabClass(mobileTab === "kensa")}
                >
                    {/* 「消防設備点検資格者」は幅に収まらず「者」だけ折り返すため、
                        消防設備 / 点検資格者 の2行に明示改行する（正式名称は維持） */}
                    <span className="block">消防設備</span>
                    <span className="block">点検資格者</span>
                </button>
            </div>

            {/* 消防設備士 */}
            <div>
                {/* 見出しは PC のみ（モバイルはタブが見出しを兼ねる） */}
                <h3 className="hidden md:block font-bold text-sm mb-3 bg-gray-100 px-3 py-2 rounded">資格：消防設備士</h3>
                {/* Desktop: table layout */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr className="bg-gray-50">
                                <th className="border border-gray-300 px-2 py-1 text-left w-36">種類等</th>
                                <th className="border border-gray-300 px-2 py-1 text-center" colSpan={3}>交付年月日</th>
                                <th className="border border-gray-300 px-2 py-1 text-center">交付番号</th>
                                <th className="border border-gray-300 px-2 py-1 text-center">交付知事</th>
                                <th className="border border-gray-300 px-2 py-1 text-center" colSpan={2}>講習受講年月</th>
                            </tr>
                        </thead>
                        <tbody>
                            {SHOUBOU_TYPES.map(({ key, label }) => {
                                const lic = value.shoubou_licenses[key]
                                const issueDate = toDateInputValueFromParts(lic.issue_year, lic.issue_month, lic.issue_day)
                                const trainingMonth = toMonthInputValueFromParts(lic.training_year, lic.training_month)
                                return (
                                    <tr key={key}>
                                        <td className="border border-gray-300 px-2 py-1 text-sm whitespace-nowrap">{label}</td>
                                        {/* 交付年月日 (colSpan=3) */}
                                        <td className="border border-gray-300 px-1 py-1" colSpan={3}>
                                            <Input type="date" className="h-9 w-full min-w-0 text-sm" value={issueDate}
                                                onChange={e => {
                                                    const { year, month, day } = splitDateInputValue(e.target.value)
                                                    updateShoubouLicense(key, { issue_year: year, issue_month: month, issue_day: day })
                                                }} />
                                        </td>
                                        {/* 交付番号 */}
                                        <td className="border border-gray-300 px-1 py-1">
                                            <Input className="h-9 w-full min-w-0 text-sm px-1" placeholder="交付番号" value={lic.license_number}
                                                onChange={e => updateShoubouLicense(key, { license_number: e.target.value })} />
                                        </td>
                                        {/* 交付知事 */}
                                        <td className="border border-gray-300 px-1 py-1">
                                            <Input className="h-9 w-full min-w-0 text-sm px-1" placeholder="知事名" value={lic.issuing_governor}
                                                onChange={e => updateShoubouLicense(key, { issuing_governor: e.target.value })} />
                                        </td>
                                        {/* 講習受講年月 (colSpan=2) */}
                                        <td className="border border-gray-300 px-1 py-1" colSpan={2}>
                                            <Input type="month" className="h-9 w-full min-w-0 text-sm" value={trainingMonth}
                                                onChange={e => {
                                                    const { year, month } = splitMonthInputValue(e.target.value)
                                                    updateShoubouLicense(key, { training_year: year, training_month: month })
                                                }} />
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Mobile: 消防設備士タブ選択時のみ 8 種別カードを表示 */}
                <div className={mobileTab === "shoubou" ? "md:hidden space-y-3" : "hidden"}>
                    {SHOUBOU_TYPES.map(({ key, label }) => {
                        const lic = value.shoubou_licenses[key]
                        const issueDate = toDateInputValueFromParts(lic.issue_year, lic.issue_month, lic.issue_day)
                        const trainingMonth = toMonthInputValueFromParts(lic.training_year, lic.training_month)
                        return (
                            <div key={`${key}-mobile`} className="border border-gray-300 rounded-lg p-3 space-y-2 bg-white">
                                <div className="font-medium text-sm text-slate-800">{label}</div>
                                <div className="space-y-1 min-w-0">
                                    <span className="text-xs text-slate-500">交付年月日</span>
                                    <Input type="date" className="h-9 w-full min-w-0 text-sm" value={issueDate}
                                        onChange={e => {
                                            const { year, month, day } = splitDateInputValue(e.target.value)
                                            updateShoubouLicense(key, { issue_year: year, issue_month: month, issue_day: day })
                                        }} />
                                </div>
                                <div className="space-y-1 min-w-0">
                                    <span className="text-xs text-slate-500">交付番号</span>
                                    <Input className="h-9 w-full min-w-0 text-sm" placeholder="交付番号" value={lic.license_number}
                                        onChange={e => updateShoubouLicense(key, { license_number: e.target.value })} />
                                </div>
                                <div className="space-y-1 min-w-0">
                                    <span className="text-xs text-slate-500">交付知事</span>
                                    <Input className="h-9 w-full min-w-0 text-sm" placeholder="知事名" value={lic.issuing_governor}
                                        onChange={e => updateShoubouLicense(key, { issuing_governor: e.target.value })} />
                                </div>
                                <div className="space-y-1 min-w-0">
                                    <span className="text-xs text-slate-500">講習受講年月</span>
                                    <Input type="month" className="h-9 w-full min-w-0 text-sm" value={trainingMonth}
                                        onChange={e => {
                                            const { year, month } = splitMonthInputValue(e.target.value)
                                            updateShoubouLicense(key, { training_year: year, training_month: month })
                                        }} />
                                </div>
                            </div>
                        )
                    })}
                </div>
                {/* 備考: PC は常時表示。モバイルは消防設備士タブ選択時のみ表示 */}
                <div className={mobileTab === "shoubou" ? "mt-2 space-y-1" : "mt-2 space-y-1 hidden md:block"}>
                    <Label className="text-sm">備考</Label>
                    <Textarea
                        rows={2}
                        value={value.shoubou_notes}
                        onChange={e => onChange({ ...value, shoubou_notes: e.target.value })}
                        placeholder="備考（誘導灯及び誘導標識を点検した場合は電気工事士免状等の種類・交付番号・交付年月日を記載）"
                    />
                </div>
            </div>

            {/* 消防設備点検資格者 */}
            <div>
                {/* 見出しは PC のみ（モバイルはタブが見出しを兼ねる） */}
                <h3 className="hidden md:block font-bold text-sm mb-3 bg-gray-100 px-3 py-2 rounded">資格：消防設備点検資格者</h3>
                {/* Desktop: table layout */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr className="bg-gray-50">
                                <th className="border border-gray-300 px-2 py-1 text-left w-28">種類等</th>
                                <th className="border border-gray-300 px-2 py-1 text-center" colSpan={3}>交付年月日</th>
                                <th className="border border-gray-300 px-2 py-1 text-center">交付番号</th>
                                <th className="border border-gray-300 px-2 py-1 text-center" colSpan={3}>有効期限</th>
                            </tr>
                        </thead>
                        <tbody>
                            {KENSA_TYPES.map(({ key, label }) => {
                                const lic = value.kensa_licenses[key]
                                const issueDate = toDateInputValueFromParts(lic.issue_year, lic.issue_month, lic.issue_day)
                                const expiryDate = toDateInputValueFromParts(lic.expiry_year, lic.expiry_month, lic.expiry_day)
                                return (
                                    <tr key={key}>
                                        <td className="border border-gray-300 px-2 py-1 text-sm whitespace-nowrap">{label}</td>
                                        {/* 交付年月日 (colSpan=3) */}
                                        <td className="border border-gray-300 px-1 py-1" colSpan={3}>
                                            <Input type="date" className="h-9 w-full min-w-0 text-sm" value={issueDate}
                                                onChange={e => {
                                                    const { year, month, day } = splitDateInputValue(e.target.value)
                                                    updateKensaLicense(key, { issue_year: year, issue_month: month, issue_day: day })
                                                }} />
                                        </td>
                                        {/* 交付番号 */}
                                        <td className="border border-gray-300 px-1 py-1">
                                            <Input className="h-9 w-full min-w-0 text-sm px-1" placeholder="交付番号" value={lic.license_number}
                                                onChange={e => updateKensaLicense(key, { license_number: e.target.value })} />
                                        </td>
                                        {/* 有効期限 (colSpan=3) */}
                                        <td className="border border-gray-300 px-1 py-1" colSpan={3}>
                                            <Input type="date" className="h-9 w-full min-w-0 text-sm" value={expiryDate}
                                                onChange={e => {
                                                    const { year, month, day } = splitDateInputValue(e.target.value)
                                                    updateKensaLicense(key, { expiry_year: year, expiry_month: month, expiry_day: day })
                                                }} />
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Mobile: 消防設備点検資格者タブ選択時のみ 3 種別カードを表示 */}
                <div className={mobileTab === "kensa" ? "md:hidden space-y-3" : "hidden"}>
                    {KENSA_TYPES.map(({ key, label }) => {
                        const lic = value.kensa_licenses[key]
                        const issueDate = toDateInputValueFromParts(lic.issue_year, lic.issue_month, lic.issue_day)
                        const expiryDate = toDateInputValueFromParts(lic.expiry_year, lic.expiry_month, lic.expiry_day)
                        return (
                            <div key={`${key}-mobile`} className="border border-gray-300 rounded-lg p-3 space-y-2 bg-white">
                                <div className="font-medium text-sm text-slate-800">{label}</div>
                                <div className="space-y-1 min-w-0">
                                    <span className="text-xs text-slate-500">交付年月日</span>
                                    <Input type="date" className="h-9 w-full min-w-0 text-sm" value={issueDate}
                                        onChange={e => {
                                            const { year, month, day } = splitDateInputValue(e.target.value)
                                            updateKensaLicense(key, { issue_year: year, issue_month: month, issue_day: day })
                                        }} />
                                </div>
                                <div className="space-y-1 min-w-0">
                                    <span className="text-xs text-slate-500">交付番号</span>
                                    <Input className="h-9 w-full min-w-0 text-sm" placeholder="交付番号" value={lic.license_number}
                                        onChange={e => updateKensaLicense(key, { license_number: e.target.value })} />
                                </div>
                                <div className="space-y-1 min-w-0">
                                    <span className="text-xs text-slate-500">有効期限</span>
                                    <Input type="date" className="h-9 w-full min-w-0 text-sm" value={expiryDate}
                                        onChange={e => {
                                            const { year, month, day } = splitDateInputValue(e.target.value)
                                            updateKensaLicense(key, { expiry_year: year, expiry_month: month, expiry_day: day })
                                        }} />
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </>
    )
}
