"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Eye, FileDown, Loader2, Save, WifiOff } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { saveDraftLocal } from "@/lib/local-draft"
import CameraInput from "@/components/camera-input"
import {
    normalizeBekkiInspectorNameForPayload,
    normalizeBekkiInspectorNameForState,
    normalizeBekkiWitnessForPayload,
    normalizeBekkiWitnessForState,
} from "@/lib/bekki-form-normalization"

export type BekkiRowState = {
    content: string
    judgment: string
    bad_content: string
    action_content: string
    current_value: string  // 電圧計・電流計行の電流値（A）
}

export type BekkiDeviceState = {
    name: string
    model: string
    calibrated_at: string
    maker: string
}

export type BekkiPageRowsKey = "page1_rows" | "page2_rows" | "page3_rows" | "page4_rows"

export type BekkiBasePayload = {
    form_name: string
    fire_manager: string
    witness: string
    location: string
    inspection_type: string
    period_start: string
    period_end: string
    inspector_name: string
    inspector_company: string
    inspector_address: string
    inspector_tel: string
    notes: string
    device1: BekkiDeviceState
    device2: BekkiDeviceState
    extra_fields: Record<string, string>
    page1_rows?: BekkiRowState[]
    page2_rows?: BekkiRowState[]
    page3_rows?: BekkiRowState[]
    page4_rows?: BekkiRowState[]
}

type SectionConfig = {
    key: BekkiPageRowsKey
    title: string
    labels: readonly string[]
    currentValueRowIndex?: number  // 電圧計・電流計行のインデックス
}

type ExtraFieldConfig = {
    key: string
    label: string
    placeholder?: string
}

interface Props {
    title: string
    iframeTitle: string
    apiPath: string
    dbTable: string
    downloadFilenamePrefix: string
    defaultInspectionType?: string
    initial: {
        building_name?: string | null
        building_address?: string | null
        notifier_name?: string | null
        inspector_name?: string | null
        inspection_date?: string | null
    }
    soukatsuId: string
    itiranId: string
    propertyId?: string | null
    savedPayload?: Partial<BekkiBasePayload> | null
    savedUpdatedAt?: string | null
    sections: readonly SectionConfig[]
    extraFields?: readonly ExtraFieldConfig[]
    extraFieldsTitle?: string
    notesCardTitle?: string
    notesRows?: number
}

const createEmptyRow = (): BekkiRowState => ({
    content: "",
    judgment: "",
    bad_content: "",
    action_content: "",
    current_value: "",
})

const createEmptyDevice = (): BekkiDeviceState => ({
    name: "",
    model: "",
    calibrated_at: "",
    maker: "",
})

const coerceString = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback)

const coerceRow = (value: unknown): BekkiRowState => {
    const source = (value ?? {}) as Partial<BekkiRowState>
    return {
        content: coerceString(source.content),
        judgment: coerceString(source.judgment),
        bad_content: coerceString(source.bad_content),
        action_content: coerceString(source.action_content),
        current_value: coerceString(source.current_value),
    }
}

const coerceDevice = (value: unknown): BekkiDeviceState => {
    const source = (value ?? {}) as Partial<BekkiDeviceState>
    return {
        name: coerceString(source.name),
        model: coerceString(source.model),
        calibrated_at: coerceString(source.calibrated_at),
        maker: coerceString(source.maker),
    }
}

const hydrateRows = (count: number, source?: unknown[]): BekkiRowState[] =>
    Array.from({ length: count }, (_, i) => coerceRow(source?.[i] ?? createEmptyRow()))

const formatSavedAt = (value?: string | null) => {
    if (!value) return null
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    return date.toLocaleString("ja-JP")
}

export default function BekkiResultFormBase({
    title,
    iframeTitle,
    apiPath,
    dbTable,
    downloadFilenamePrefix,
    defaultInspectionType = "機器・総合",
    initial,
    soukatsuId,
    itiranId,
    propertyId,
    savedPayload,
    savedUpdatedAt,
    sections,
    extraFields = [],
    extraFieldsTitle = "設備情報",
    notesCardTitle = "備考・測定機器",
    notesRows = 4,
}: Props) {
    const saved = savedPayload ?? {}

    const [formName, setFormName] = useState(coerceString(saved.form_name, initial.building_name ?? ""))
    const [fireManager, setFireManager] = useState(coerceString(saved.fire_manager, initial.notifier_name ?? ""))
    const [witness, setWitness] = useState(normalizeBekkiWitnessForState(coerceString(saved.witness)))
    const [location, setLocation] = useState(coerceString(saved.location, initial.building_address ?? ""))
    const [inspectionType, setInspectionType] = useState(coerceString(saved.inspection_type, defaultInspectionType))
    const [periodStart, setPeriodStart] = useState(coerceString(saved.period_start, initial.inspection_date ?? ""))
    const [periodEnd, setPeriodEnd] = useState(coerceString(saved.period_end, initial.inspection_date ?? ""))
    const [inspectorName, setInspectorName] = useState(normalizeBekkiInspectorNameForState(coerceString(saved.inspector_name, initial.inspector_name ?? "")))
    const [inspectorCompany, setInspectorCompany] = useState(coerceString(saved.inspector_company))
    const [inspectorAddress, setInspectorAddress] = useState(coerceString(saved.inspector_address))
    const [inspectorTel, setInspectorTel] = useState(coerceString(saved.inspector_tel))
    const [notes, setNotes] = useState(coerceString(saved.notes))
    const [device1, setDevice1] = useState<BekkiDeviceState>(coerceDevice(saved.device1 ?? createEmptyDevice()))
    const [device2, setDevice2] = useState<BekkiDeviceState>(coerceDevice(saved.device2 ?? createEmptyDevice()))

    const [extraFieldValues, setExtraFieldValues] = useState<Record<string, string>>(() =>
        Object.fromEntries(extraFields.map((field) => [field.key, coerceString((saved.extra_fields ?? {})[field.key])])),
    )

    const [rowsByKey, setRowsByKey] = useState<Record<BekkiPageRowsKey, BekkiRowState[]>>(() => {
        const base: Record<BekkiPageRowsKey, BekkiRowState[]> = {
            page1_rows: [],
            page2_rows: [],
            page3_rows: [],
            page4_rows: [],
        }
        for (const section of sections) {
            const source = saved[section.key] as unknown[] | undefined
            base[section.key] = hydrateRows(section.labels.length, source)
        }
        return base
    })

    const [saving, setSaving] = useState(false)
    const [loadingPreview, setLoadingPreview] = useState(false)
    const [loadingDownload, setLoadingDownload] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [saveMessage, setSaveMessage] = useState<string | null>(
        formatSavedAt(savedUpdatedAt) ? `最終保存: ${formatSavedAt(savedUpdatedAt)}` : null,
    )
    const [pdfUrl, setPdfUrl] = useState<string | null>(null)
    const pdfUrlRef = useRef<string | null>(null)

    const setNextPdfUrl = (nextUrl: string | null) => {
        if (pdfUrlRef.current) window.URL.revokeObjectURL(pdfUrlRef.current)
        pdfUrlRef.current = nextUrl
        setPdfUrl(nextUrl)
    }

    const payload = useMemo<BekkiBasePayload>(() => ({
        form_name: formName,
        fire_manager: fireManager,
        witness: normalizeBekkiWitnessForPayload(witness),
        location,
        inspection_type: inspectionType,
        period_start: periodStart,
        period_end: periodEnd,
        inspector_name: normalizeBekkiInspectorNameForPayload(inspectorName),
        inspector_company: inspectorCompany,
        inspector_address: inspectorAddress,
        inspector_tel: inspectorTel,
        notes,
        device1,
        device2,
        extra_fields: extraFieldValues,
        page1_rows: rowsByKey.page1_rows,
        page2_rows: rowsByKey.page2_rows,
        page3_rows: rowsByKey.page3_rows,
        page4_rows: rowsByKey.page4_rows,
    }), [
        device1,
        device2,
        extraFieldValues,
        fireManager,
        formName,
        inspectionType,
        inspectorAddress,
        inspectorCompany,
        inspectorName,
        inspectorTel,
        location,
        notes,
        periodEnd,
        periodStart,
        rowsByKey,
        witness,
    ])

    const persistDraft = useCallback(async (clearMessage = true) => {
        setError(null)
        if (clearMessage) setSaveMessage(null)

        // Always save locally for offline resilience
        const localKey = `${dbTable}:${itiranId}`
        try {
            await saveDraftLocal(localKey, {
                soukatsu_id: soukatsuId,
                itiran_id: itiranId,
                property_id: propertyId ?? null,
                payload,
            })
        } catch {
            // IndexedDB failure is non-critical
        }

        // Try saving to Supabase (may fail if offline)
        if (!navigator.onLine) {
            setSaveMessage(`ローカル保存済み (オフライン): ${new Date().toLocaleString("ja-JP")}`)
            return true
        }

        const { error: saveError } = await supabase
            .from(dbTable)
            .upsert(
                {
                    soukatsu_id: soukatsuId,
                    itiran_id: itiranId,
                    property_id: propertyId ?? null,
                    payload,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "itiran_id" },
            )

        if (saveError) {
            if (saveError.message.includes(dbTable)) {
                setError("保存テーブルが未作成です。SQLをSupabaseで実行してください。")
            } else {
                setError(`保存に失敗しました: ${saveError.message}`)
            }
            return false
        }

        setSaveMessage(`保存しました: ${new Date().toLocaleString("ja-JP")}`)
        return true
    }, [dbTable, itiranId, payload, propertyId, soukatsuId])

    const handleSave = useCallback(async () => {
        setSaving(true)
        await persistDraft()
        setSaving(false)
    }, [persistDraft])

    const generatePdfBlob = useCallback(async () => {
        const response = await fetch(apiPath, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        })
        if (!response.ok) throw new Error("PDF generation failed")
        return response.blob()
    }, [apiPath, payload])

    const handlePreview = useCallback(async () => {
        setLoadingPreview(true)
        setError(null)
        try {
            const blob = await generatePdfBlob()
            setNextPdfUrl(window.URL.createObjectURL(blob))
        } catch {
            setError("PDFプレビュー生成に失敗しました。")
            setNextPdfUrl(null)
        } finally {
            setLoadingPreview(false)
        }
    }, [generatePdfBlob])

    const handleDownload = useCallback(async () => {
        setLoadingDownload(true)
        setError(null)
        try {
            const savedOk = await persistDraft(false)
            if (!savedOk) return

            const blob = await generatePdfBlob()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `${downloadFilenamePrefix}_${formName || "bekki"}.pdf`
            document.body.appendChild(a)
            a.click()
            a.remove()
            window.URL.revokeObjectURL(url)
        } catch {
            setError("PDFダウンロードに失敗しました。")
        } finally {
            setLoadingDownload(false)
        }
    }, [downloadFilenamePrefix, formName, generatePdfBlob, persistDraft])

    // Keep a stable ref to the latest persistDraft
    const persistDraftRef = useRef(persistDraft)
    useEffect(() => { persistDraftRef.current = persistDraft }, [persistDraft])

    // Track whether this is the initial render (skip auto-save on mount)
    const isInitialMount = useRef(true)

    // Debounced auto-save: save 5 seconds after last payload change
    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false
            return
        }
        const timer = setTimeout(() => {
            persistDraftRef.current(false).then((ok) => {
                if (ok) setSaveMessage(`自動保存済み: ${new Date().toLocaleString("ja-JP")}`)
            })
        }, 5000)
        return () => clearTimeout(timer)
    }, [payload])

    // Auto-save on unmount (navigation away)
    useEffect(() => {
        return () => { persistDraftRef.current(false) }
    }, [])

    useEffect(() => {
        return () => {
            if (pdfUrlRef.current) window.URL.revokeObjectURL(pdfUrlRef.current)
        }
    }, [])

    const updateRowField = (key: BekkiPageRowsKey, index: number, field: keyof BekkiRowState, value: string) => {
        setRowsByKey((prev) => ({
            ...prev,
            [key]: prev[key].map((row, i) => (i === index ? { ...row, [field]: value } : row)),
        }))
    }

    const renderItemTable = (section: SectionConfig) => (
        <Card key={section.key}>
            <CardHeader>
                <CardTitle>{section.title}</CardTitle>
                <CardDescription>種別・容量等の内容、判定、不良内容、措置内容を入力してください。</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="overflow-x-auto border rounded-lg">
                    <table className="min-w-[1080px] w-full text-sm">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="p-2 border w-80 text-left">点検項目</th>
                                <th className="p-2 border w-56 text-left">種別・容量等の内容</th>
                                <th className="p-2 border w-24 text-center">判定</th>
                                <th className="p-2 border text-left">不良内容</th>
                                <th className="p-2 border text-left">措置内容</th>
                            </tr>
                        </thead>
                        <tbody>
                            {section.labels.map((label, idx) => (
                                <tr key={`${section.key}-${idx}`}>
                                    <td className="p-2 border">{label}</td>
                                    <td className="p-1 border">
                                        {idx === section.currentValueRowIndex ? (
                                            <div className="flex gap-1 items-center">
                                                <Input
                                                    value={rowsByKey[section.key]?.[idx]?.content ?? ""}
                                                    onChange={(e) => updateRowField(section.key, idx, "content", e.target.value)}
                                                    placeholder="電圧(V)"
                                                    className="w-20"
                                                />
                                                <span className="text-xs text-muted-foreground">V</span>
                                                <Input
                                                    value={rowsByKey[section.key]?.[idx]?.current_value ?? ""}
                                                    onChange={(e) => updateRowField(section.key, idx, "current_value", e.target.value)}
                                                    placeholder="電流(A)"
                                                    className="w-20"
                                                />
                                                <span className="text-xs text-muted-foreground">A</span>
                                            </div>
                                        ) : (
                                            <Input
                                                value={rowsByKey[section.key]?.[idx]?.content ?? ""}
                                                onChange={(e) => updateRowField(section.key, idx, "content", e.target.value)}
                                            />
                                        )}
                                    </td>
                                    <td className="p-1 border">
                                        <select
                                            className="w-full h-10 border border-input rounded-md bg-background px-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                            value={rowsByKey[section.key]?.[idx]?.judgment ?? ""}
                                            onChange={(e) => updateRowField(section.key, idx, "judgment", e.target.value)}
                                        >
                                            <option value="">未選択</option>
                                            <option value="良">良</option>
                                            <option value="否">否</option>
                                        </select>
                                    </td>
                                    <td className="p-1 border">
                                        <Input
                                            value={rowsByKey[section.key]?.[idx]?.bad_content ?? ""}
                                            onChange={(e) => updateRowField(section.key, idx, "bad_content", e.target.value)}
                                        />
                                    </td>
                                    <td className="p-1 border">
                                        <Input
                                            value={rowsByKey[section.key]?.[idx]?.action_content ?? ""}
                                            onChange={(e) => updateRowField(section.key, idx, "action_content", e.target.value)}
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>
    )

    const busy = saving || loadingPreview || loadingDownload
    const extraColumnsClass = extraFields.length >= 5 ? "md:grid-cols-5" : extraFields.length >= 4 ? "md:grid-cols-4" : "md:grid-cols-3"

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>{title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <Label>名称</Label>
                            <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>所在地</Label>
                            <Input value={location} onChange={(e) => setLocation(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>防火管理者</Label>
                            <Input value={fireManager} onChange={(e) => setFireManager(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>立会者</Label>
                            <Input value={witness} onChange={(e) => setWitness(e.target.value)} />
                        </div>
                    </div>

                    <div className="grid md:grid-cols-4 gap-4">
                        <div className="space-y-1">
                            <Label>点検種別</Label>
                            <Input value={inspectionType} onChange={(e) => setInspectionType(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>点検年月日（開始）</Label>
                            <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>点検年月日（終了）</Label>
                            <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>TEL</Label>
                            <Input value={inspectorTel} onChange={(e) => setInspectorTel(e.target.value)} />
                        </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <Label>点検者氏名</Label>
                            <Input value={inspectorName} onChange={(e) => setInspectorName(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>点検者所属会社</Label>
                            <Input value={inspectorCompany} onChange={(e) => setInspectorCompany(e.target.value)} />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                            <Label>点検者住所</Label>
                            <Input value={inspectorAddress} onChange={(e) => setInspectorAddress(e.target.value)} />
                        </div>
                    </div>

                    {extraFields.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-sm font-medium text-slate-700">{extraFieldsTitle}</p>
                            <div className={`grid gap-4 ${extraColumnsClass}`}>
                                {extraFields.map((field) => (
                                    <div key={field.key} className="space-y-1">
                                        <Label>{field.label}</Label>
                                        <Input
                                            placeholder={field.placeholder}
                                            value={extraFieldValues[field.key] ?? ""}
                                            onChange={(e) => setExtraFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {sections.map(renderItemTable)}

            <Card>
                <CardHeader>
                    <CardTitle>{notesCardTitle}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="space-y-1">
                        <Label>備考</Label>
                        <Textarea rows={notesRows} value={notes} onChange={(e) => setNotes(e.target.value)} />
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <p className="font-medium text-sm">測定機器 1</p>
                            <Input placeholder="機器名" value={device1.name} onChange={(e) => setDevice1((p) => ({ ...p, name: e.target.value }))} />
                            <Input placeholder="型式" value={device1.model} onChange={(e) => setDevice1((p) => ({ ...p, model: e.target.value }))} />
                            <Input placeholder="校正年月日" value={device1.calibrated_at} onChange={(e) => setDevice1((p) => ({ ...p, calibrated_at: e.target.value }))} />
                            <Input placeholder="製造者名" value={device1.maker} onChange={(e) => setDevice1((p) => ({ ...p, maker: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <p className="font-medium text-sm">測定機器 2</p>
                            <Input placeholder="機器名" value={device2.name} onChange={(e) => setDevice2((p) => ({ ...p, name: e.target.value }))} />
                            <Input placeholder="型式" value={device2.model} onChange={(e) => setDevice2((p) => ({ ...p, model: e.target.value }))} />
                            <Input placeholder="校正年月日" value={device2.calibrated_at} onChange={(e) => setDevice2((p) => ({ ...p, calibrated_at: e.target.value }))} />
                            <Input placeholder="製造者名" value={device2.maker} onChange={(e) => setDevice2((p) => ({ ...p, maker: e.target.value }))} />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* 点検写真 */}
            <Card>
                <CardContent className="pt-6">
                    <CameraInput itiranId={itiranId} />
                </CardContent>
            </Card>

            <div className="flex gap-2 flex-wrap items-center">
                <Button type="button" onClick={handleSave} disabled={busy} className="bg-slate-700 hover:bg-slate-800 text-white">
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    DB保存
                </Button>
                <Button type="button" onClick={handlePreview} disabled={busy} className="bg-blue-600 hover:bg-blue-700 text-white">
                    {loadingPreview ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Eye className="w-4 h-4 mr-2" />}
                    PDFプレビュー更新
                </Button>
                <Button type="button" onClick={handleDownload} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    {loadingDownload ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileDown className="w-4 h-4 mr-2" />}
                    PDFダウンロード
                </Button>
                {saveMessage && (
                    <span className="text-sm text-slate-500 flex items-center gap-1">
                        {saveMessage.includes("オフライン") && <WifiOff className="w-3.5 h-3.5 text-amber-500" />}
                        {saveMessage}
                    </span>
                )}
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            {pdfUrl && (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <iframe src={pdfUrl} title={iframeTitle} className="w-full h-[75vh] md:h-[calc(100vh-220px)]" />
                </div>
            )}
        </div>
    )
}
