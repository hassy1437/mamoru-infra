"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Eye, FileDown, Loader2, Save } from "lucide-react"
import { supabase } from "@/lib/supabase"
import {
    normalizeBekkiInspectorNameForPayload,
    normalizeBekkiInspectorNameForState,
    normalizeBekkiWitnessForPayload,
    normalizeBekkiWitnessForState,
} from "@/lib/bekki-form-normalization"

type RowState = {
    content: string
    judgment: string
    bad_content: string
    action_content: string
    current_value: string  // 電圧計・電流計行の電流値（A）
}

type DeviceState = {
    name: string
    model: string
    calibrated_at: string
    maker: string
}

type ShokasenBekki2Payload = {
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
    equipment_name: string
    pump_maker: string
    pump_model: string
    motor_maker: string
    motor_model: string
    page1_rows: RowState[]
    page2_rows: RowState[]
    page3_rows: RowState[]
    notes: string
    device1: DeviceState
    device2: DeviceState
}

interface Props {
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
    savedPayload?: Partial<ShokasenBekki2Payload> | null
    savedUpdatedAt?: string | null
}

const PAGE1_ITEMS = [
    "貯水槽 種別",
    "貯水槽 水量",
    "貯水槽 水状",
    "水源 給水装置",
    "水源 水位計",
    "水源 圧力計",
    "水源 バルブ類",
    "加圧送水装置 周囲の状況",
    "加圧送水装置 外形",
    "加圧送水装置 表示",
    "加圧送水装置 電圧計・電流計",
    "加圧送水装置 開閉器・スイッチ類",
    "加圧送水装置 ヒューズ類",
    "加圧送水装置 継電器",
    "加圧送水装置 表示灯",
    "加圧送水装置 結線接続",
    "加圧送水装置 接地",
    "加圧送水装置 予備品等",
] as const

const PAGE2_ITEMS = [
    "直接操作部 周囲の状況",
    "直接操作部 外形",
    "直接操作部 表示",
    "直接操作部 機能",
    "遠隔操作部 周囲の状況",
    "遠隔操作部 外形",
    "遠隔操作部 表示",
    "遠隔操作部 機能（専用/兼用）",
    "遠隔起動部 周囲の状況",
    "遠隔起動部 外形",
    "遠隔起動部 機能",
    "起動用水圧 圧力スイッチ設定圧力",
    "起動用水圧 起動用圧力タンク",
    "起動用水圧 機能",
    "電動機 外形",
    "電動機 回転軸",
    "電動機 軸受部",
    "電動機 軸継手",
    "電動機 機能",
    "ポンプ 外形",
    "ポンプ 回転軸",
    "ポンプ 軸受部",
    "ポンプ グランド部",
    "ポンプ 連成計・圧力計",
    "ポンプ 性能",
    "呼水装置 呼水槽",
    "呼水装置 バルブ類",
    "呼水装置 自動給水装置",
    "呼水装置 減水警報装置",
    "呼水装置 フート弁",
    "性能試験装置",
    "高架水槽方式",
    "圧力水槽方式",
    "減圧のための措置",
] as const

const PAGE3_ITEMS = [
    "配管等 管・管継手",
    "配管等 支持金具・つり金具",
    "配管等 バルブ類",
    "配管等 ろ過装置",
    "配管等 逃し配管",
    "消火栓箱 周囲の状況",
    "消火栓箱 外形",
    "消火栓箱 表示",
    "ホース・ノズル 外形（1号）",
    "ホース・ノズル 外形（易操作1/2号）",
    "ホース・ノズル 操作性",
    "ホース・ノズル 耐圧性能",
    "消火栓開閉弁",
    "表示灯（専用/兼用）",
    "始動表示灯",
    "使用方法の表示",
    "降下装置 周囲の状況",
    "降下装置 外形",
    "降下装置 表示灯",
    "降下装置 表示",
    "降下装置 機能",
    "耐震措置",
    "総合点検 加圧送水装置",
    "総合点検 表示・警報等",
    "総合点検 電動機の運転電流",
    "総合点検 運転状況",
    "総合点検 放水圧力",
    "総合点検 放水量",
    "総合点検 減圧のための措置",
    "高架水槽方式 放水圧力",
    "高架水槽方式 放水量",
    "圧力水槽方式 減圧のための措置",
] as const

const createEmptyRow = (): RowState => ({
    content: "",
    judgment: "",
    bad_content: "",
    action_content: "",
    current_value: "",
})

const createEmptyDevice = (): DeviceState => ({
    name: "",
    model: "",
    calibrated_at: "",
    maker: "",
})

const coerceString = (value: unknown, fallback = "") => {
    if (typeof value === "string") return value
    return fallback
}

const coerceRow = (value: unknown): RowState => {
    const source = (value ?? {}) as Partial<RowState>
    return {
        content: coerceString(source.content),
        judgment: coerceString(source.judgment),
        bad_content: coerceString(source.bad_content),
        action_content: coerceString(source.action_content),
        current_value: coerceString(source.current_value),
    }
}

const coerceDevice = (value: unknown): DeviceState => {
    const source = (value ?? {}) as Partial<DeviceState>
    return {
        name: coerceString(source.name),
        model: coerceString(source.model),
        calibrated_at: coerceString(source.calibrated_at),
        maker: coerceString(source.maker),
    }
}

const hydrateRows = (count: number, source?: unknown[]): RowState[] => {
    return Array.from({ length: count }, (_, i) => coerceRow(source?.[i] ?? createEmptyRow()))
}

const formatSavedAt = (value?: string | null) => {
    if (!value) return null
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    return date.toLocaleString("ja-JP")
}

export default function ShokasenBekki2Form({
    initial,
    soukatsuId,
    itiranId,
    propertyId,
    savedPayload,
    savedUpdatedAt,
}: Props) {
    const saved = savedPayload ?? {}

    const [formName, setFormName] = useState(coerceString(saved.form_name, initial.building_name ?? ""))
    const [fireManager, setFireManager] = useState(coerceString(saved.fire_manager, initial.notifier_name ?? ""))
    const [witness, setWitness] = useState(normalizeBekkiWitnessForState(coerceString(saved.witness)))
    const [location, setLocation] = useState(coerceString(saved.location, initial.building_address ?? ""))
    const [inspectionType, setInspectionType] = useState(coerceString(saved.inspection_type, "機器・総合"))
    const [periodStart, setPeriodStart] = useState(coerceString(saved.period_start, initial.inspection_date ?? ""))
    const [periodEnd, setPeriodEnd] = useState(coerceString(saved.period_end, initial.inspection_date ?? ""))
    const [inspectorName, setInspectorName] = useState(normalizeBekkiInspectorNameForState(coerceString(saved.inspector_name, initial.inspector_name ?? "")))
    const [inspectorCompany, setInspectorCompany] = useState(coerceString(saved.inspector_company))
    const [inspectorAddress, setInspectorAddress] = useState(coerceString(saved.inspector_address))
    const [inspectorTel, setInspectorTel] = useState(coerceString(saved.inspector_tel))
    const [equipmentName, setEquipmentName] = useState(coerceString(saved.equipment_name))
    const [pumpMaker, setPumpMaker] = useState(coerceString(saved.pump_maker))
    const [pumpModel, setPumpModel] = useState(coerceString(saved.pump_model))
    const [motorMaker, setMotorMaker] = useState(coerceString(saved.motor_maker))
    const [motorModel, setMotorModel] = useState(coerceString(saved.motor_model))
    const [notes, setNotes] = useState(coerceString(saved.notes))

    const [device1, setDevice1] = useState<DeviceState>(coerceDevice(saved.device1 ?? createEmptyDevice()))
    const [device2, setDevice2] = useState<DeviceState>(coerceDevice(saved.device2 ?? createEmptyDevice()))

    const [page1Rows, setPage1Rows] = useState<RowState[]>(() => hydrateRows(PAGE1_ITEMS.length, saved.page1_rows))
    const [page2Rows, setPage2Rows] = useState<RowState[]>(() => hydrateRows(PAGE2_ITEMS.length, saved.page2_rows))
    const [page3Rows, setPage3Rows] = useState<RowState[]>(() => hydrateRows(PAGE3_ITEMS.length, saved.page3_rows))

    const [saving, setSaving] = useState(false)
    const [loadingPreview, setLoadingPreview] = useState(false)
    const [loadingDownload, setLoadingDownload] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [saveMessage, setSaveMessage] = useState<string | null>(
        formatSavedAt(savedUpdatedAt) ? `最終保存: ${formatSavedAt(savedUpdatedAt)}` : null
    )
    const [pdfUrl, setPdfUrl] = useState<string | null>(null)
    const pdfUrlRef = useRef<string | null>(null)

    const setNextPdfUrl = (nextUrl: string | null) => {
        if (pdfUrlRef.current) {
            window.URL.revokeObjectURL(pdfUrlRef.current)
        }
        pdfUrlRef.current = nextUrl
        setPdfUrl(nextUrl)
    }

    const payload = useMemo<ShokasenBekki2Payload>(() => ({
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
        equipment_name: equipmentName,
        pump_maker: pumpMaker,
        pump_model: pumpModel,
        motor_maker: motorMaker,
        motor_model: motorModel,
        page1_rows: page1Rows,
        page2_rows: page2Rows,
        page3_rows: page3Rows,
        notes,
        device1,
        device2,
    }), [
        formName,
        fireManager,
        witness,
        location,
        inspectionType,
        periodStart,
        periodEnd,
        inspectorName,
        inspectorCompany,
        inspectorAddress,
        inspectorTel,
        equipmentName,
        pumpMaker,
        pumpModel,
        motorMaker,
        motorModel,
        page1Rows,
        page2Rows,
        page3Rows,
        notes,
        device1,
        device2,
    ])

    const persistDraft = useCallback(async (clearMessage = true) => {
        setError(null)
        if (clearMessage) {
            setSaveMessage(null)
        }

        const { error: saveError } = await supabase
            .from("inspection_shokasen_bekki2")
            .upsert({
                soukatsu_id: soukatsuId,
                itiran_id: itiranId,
                property_id: propertyId ?? null,
                payload,
                updated_at: new Date().toISOString(),
            }, { onConflict: "itiran_id" })

        if (saveError) {
            if (saveError.message.includes("inspection_shokasen_bekki2")) {
                setError("保存テーブルが未作成です。SQLマイグレーションを適用してください。")
            } else {
                setError(`保存に失敗しました: ${saveError.message}`)
            }
            return false
        }

        setSaveMessage(`保存しました: ${new Date().toLocaleString("ja-JP")}`)
        return true
    }, [itiranId, payload, propertyId, soukatsuId])

    const handleSave = useCallback(async () => {
        setSaving(true)
        await persistDraft()
        setSaving(false)
    }, [persistDraft])

    const generatePdfBlob = useCallback(async () => {
        const response = await fetch("/api/generate-shokasen-bekki2-pdf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        })

        if (!response.ok) {
            throw new Error("PDF generation failed")
        }

        return response.blob()
    }, [payload])

    const handlePreview = useCallback(async () => {
        setLoadingPreview(true)
        setError(null)
        try {
            const blob = await generatePdfBlob()
            const nextUrl = window.URL.createObjectURL(blob)
            setNextPdfUrl(nextUrl)
        } catch {
            setError("PDFプレビューの生成に失敗しました。")
            setNextPdfUrl(null)
        } finally {
            setLoadingPreview(false)
        }
    }, [generatePdfBlob])

    const handleDownload = useCallback(async () => {
        setLoadingDownload(true)
        setError(null)
        try {
            const saved = await persistDraft(false)
            if (!saved) return

            const blob = await generatePdfBlob()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `屋内消火栓設備点検票_${formName || "bekki2"}.pdf`
            document.body.appendChild(a)
            a.click()
            a.remove()
            window.URL.revokeObjectURL(url)
        } catch {
            setError("PDFダウンロードに失敗しました。")
        } finally {
            setLoadingDownload(false)
        }
    }, [generatePdfBlob, formName, persistDraft])

    // Auto-save on unmount (navigation away)
    const persistDraftRef = useRef(persistDraft)
    useEffect(() => { persistDraftRef.current = persistDraft }, [persistDraft])
    useEffect(() => {
        return () => { persistDraftRef.current(false) }
    }, [])

    useEffect(() => {
        return () => {
            if (pdfUrlRef.current) {
                window.URL.revokeObjectURL(pdfUrlRef.current)
            }
        }
    }, [])

    const updateRowField = (
        setter: React.Dispatch<React.SetStateAction<RowState[]>>,
        index: number,
        field: keyof RowState,
        value: string,
    ) => {
        setter((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)))
    }

    const renderItemTable = (
        title: string,
        labels: readonly string[],
        rows: RowState[],
        setter: React.Dispatch<React.SetStateAction<RowState[]>>,
        currentValueRowIndex?: number,
    ) => (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>種別・容量等の内容、判定、不良内容、措置内容を入力してください。</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="overflow-x-auto border rounded-lg">
                    <table className="min-w-[1080px] w-full text-sm">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="p-2 border w-72 text-left">点検項目</th>
                                <th className="p-2 border w-56 text-left">種別・容量等の内容</th>
                                <th className="p-2 border w-24 text-center">判定</th>
                                <th className="p-2 border text-left">不良内容</th>
                                <th className="p-2 border text-left">措置内容</th>
                            </tr>
                        </thead>
                        <tbody>
                            {labels.map((label, idx) => (
                                <tr key={`${title}-${label}`}>
                                    <td className="p-2 border">{label}</td>
                                    <td className="p-1 border">
                                        {idx === currentValueRowIndex ? (
                                            <div className="flex gap-1 items-center">
                                                <Input
                                                    value={rows[idx].content}
                                                    onChange={(e) => updateRowField(setter, idx, "content", e.target.value)}
                                                    placeholder="電圧(V)"
                                                    className="w-20"
                                                />
                                                <span className="text-xs text-muted-foreground">V</span>
                                                <Input
                                                    value={rows[idx].current_value}
                                                    onChange={(e) => updateRowField(setter, idx, "current_value", e.target.value)}
                                                    placeholder="電流(A)"
                                                    className="w-20"
                                                />
                                                <span className="text-xs text-muted-foreground">A</span>
                                            </div>
                                        ) : (
                                            <Input
                                                value={rows[idx].content}
                                                onChange={(e) => updateRowField(setter, idx, "content", e.target.value)}
                                                placeholder="種別・容量等"
                                            />
                                        )}
                                    </td>
                                    <td className="p-1 border">
                                        <select
                                            className="w-full h-8 border rounded px-2"
                                            value={rows[idx].judgment}
                                            onChange={(e) => updateRowField(setter, idx, "judgment", e.target.value)}
                                        >
                                            <option value="">未入力</option>
                                            <option value="良">良</option>
                                            <option value="否">否</option>
                                        </select>
                                    </td>
                                    <td className="p-1 border">
                                        <Input
                                            value={rows[idx].bad_content}
                                            onChange={(e) => updateRowField(setter, idx, "bad_content", e.target.value)}
                                            placeholder="不良内容"
                                        />
                                    </td>
                                    <td className="p-1 border">
                                        <Input
                                            value={rows[idx].action_content}
                                            onChange={(e) => updateRowField(setter, idx, "action_content", e.target.value)}
                                            placeholder="措置内容"
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

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>屋内消火栓設備点検票（別記様式2）入力</CardTitle>
                    <CardDescription>s50_kokuji14_bekki2.pdf に転記する項目です。</CardDescription>
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
                            <Label>点検期間（開始）</Label>
                            <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>点検期間（終了）</Label>
                            <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>TEL</Label>
                            <Input value={inspectorTel} onChange={(e) => setInspectorTel(e.target.value)} />
                        </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <Label>点検者 氏名</Label>
                            <Input value={inspectorName} onChange={(e) => setInspectorName(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>点検者 所属会社</Label>
                            <Input value={inspectorCompany} onChange={(e) => setInspectorCompany(e.target.value)} />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                            <Label>点検者 住所</Label>
                            <Input value={inspectorAddress} onChange={(e) => setInspectorAddress(e.target.value)} />
                        </div>
                    </div>

                    <div className="grid md:grid-cols-5 gap-4">
                        <div className="space-y-1">
                            <Label>設備名</Label>
                            <Input value={equipmentName} onChange={(e) => setEquipmentName(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>ポンプ 製造者名</Label>
                            <Input value={pumpMaker} onChange={(e) => setPumpMaker(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>ポンプ 型式等</Label>
                            <Input value={pumpModel} onChange={(e) => setPumpModel(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>電動機 製造者名</Label>
                            <Input value={motorMaker} onChange={(e) => setMotorMaker(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>電動機 型式等</Label>
                            <Input value={motorModel} onChange={(e) => setMotorModel(e.target.value)} />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {renderItemTable("（その1）機器点検", PAGE1_ITEMS, page1Rows, setPage1Rows, 10)}
            {renderItemTable("（その2）機器点検", PAGE2_ITEMS, page2Rows, setPage2Rows)}
            {renderItemTable("（その3）配管等・総合点検", PAGE3_ITEMS, page3Rows, setPage3Rows)}

            <Card>
                <CardHeader>
                    <CardTitle>備考・測定機器</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="space-y-1">
                        <Label>備考</Label>
                        <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
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
                {saveMessage && <span className="text-sm text-slate-500">{saveMessage}</span>}
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            {pdfUrl && (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <iframe src={pdfUrl} title="屋内消火栓設備点検票PDFプレビュー" className="w-full h-[75vh] md:h-[calc(100vh-220px)]" />
                </div>
            )}
        </div>
    )
}
