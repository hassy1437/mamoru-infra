"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react"
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
}

type DeviceState = {
    name: string
    model: string
    calibrated_at: string
    maker: string
}

type CylinderRowState = {
    no: string
    cylinder_no: string
    spec1: string
    spec2: string
    spec3: string
    measure1: string
    measure2: string
    measure3: string
    measure4: string
    measure5: string
    measure6: string
}

type HalogenBekki7Payload = {
    zone_name: string
    equipment_system: string
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
    page1_rows: RowState[]
    page2_rows: RowState[]
    page3_rows: RowState[]
    page4_rows: RowState[]
    notes: string
    device1: DeviceState
    device2: DeviceState
    page5_rows: CylinderRowState[]
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
    savedPayload?: Partial<HalogenBekki7Payload> | null
    savedUpdatedAt?: string | null
}

const PAGE1_ITEMS = [
    "蓄圧式ハロゲン化物消火剤貯蔵容器等 / 周囲の状況",
    "蓄圧式ハロゲン化物消火剤貯蔵容器等 / 消火剤貯蔵容器 / 外形",
    "蓄圧式ハロゲン化物消火剤貯蔵容器等 / 消火剤貯蔵容器 / 表示・標識",
    "蓄圧式ハロゲン化物消火剤貯蔵容器等 / ※消火剤量",
    "蓄圧式ハロゲン化物消火剤貯蔵容器等 / 容器弁 / 外形",
    "蓄圧式ハロゲン化物消火剤貯蔵容器等 / 容器弁 / 安全性",
    "蓄圧式ハロゲン化物消火剤貯蔵容器等 / 安全装置 / 外形",
    "蓄圧式ハロゲン化物消火剤貯蔵容器等 / 安全装置 / 安全性",
    "蓄圧式ハロゲン化物消火剤貯蔵容器等 / 容器弁開放装置 / 外形",
    "蓄圧式ハロゲン化物消火剤貯蔵容器等 / 容器弁開放装置 / 電気式",
    "蓄圧式ハロゲン化物消火剤貯蔵容器等 / 容器弁開放装置 / ガス圧式",
    "蓄圧式ハロゲン化物消火剤貯蔵容器等 / 指示圧力計",
    "蓄圧式ハロゲン化物消火剤貯蔵容器等 / 連結管・集合管",
    "加圧式ハロゲン化物消火剤貯蔵容器等 / 周囲の状況",
    "加圧式ハロゲン化物消火剤貯蔵容器等 / 消火剤貯蔵タンク / 外形",
    "加圧式ハロゲン化物消火剤貯蔵容器等 / 消火剤貯蔵タンク / 表示・標識",
    "加圧式ハロゲン化物消火剤貯蔵容器等 / 安全装置 / 消火剤量",
    "加圧式ハロゲン化物消火剤貯蔵容器等 / 放出弁 / 消火剤量",
    "加圧式ハロゲン化物消火剤貯蔵容器等 / 放出弁 / 外形",
    "加圧式ハロゲン化物消火剤貯蔵容器等 / 放出弁開放装置 / 外形",
    "加圧式ハロゲン化物消火剤貯蔵容器等 / 放出弁開放装置 / 電気式",
    "加圧式ハロゲン化物消火剤貯蔵容器等 / 放出弁開放装置 / ガス圧式",
    "加圧式ハロゲン化物消火剤貯蔵容器等 / バルブ類",
    "加圧式ハロゲン化物消火剤貯蔵容器等 / バルブ類 / 周囲の状況",
    "加圧用ガス容器等 / 加圧用ガス容器 / 外形",
    "加圧用ガス容器等 / 加圧用ガス容器 / 表示",
    "加圧用ガス容器等 / 加圧用ガス容器 / ※ガス量",
    "加圧用ガス容器等 / 容器弁 / 外形",
    "加圧用ガス容器等 / 容器弁 / 安全性",
    "加圧用ガス容器等 / 安全装置 / 外形",
    "加圧用ガス容器等 / 安全装置 / 安全性",
    "加圧用ガス容器等 / 容器弁開放装置 / 外形",
    "加圧用ガス容器等 / 容器弁開放装置 / 電気式",
    "加圧用ガス容器等 / 容器弁開放装置 / ガス圧式",
    "加圧用ガス容器等 / バルブ類",
    "加圧用ガス容器等 / 圧力調整器",
    "加圧用ガス容器等 / 連結管・集合管",
] as const

const PAGE2_ITEMS = [
    "起動用ガス容器等 / 起動用ガス容器 / 外形",
    "起動用ガス容器等 / 起動用ガス容器 / 表示",
    "起動用ガス容器等 / 起動用ガス容器 / ※ガス量",
    "起動用ガス容器等 / 容器弁 / 外形",
    "起動用ガス容器等 / 容器弁 / 安全性",
    "起動用ガス容器等 / 安全装置 / 外形",
    "起動用ガス容器等 / 安全装置 / 安全性",
    "起動用ガス容器等 / 容器弁開放装置 / 外形",
    "起動用ガス容器等 / 容器弁開放装置 / 電気式",
    "起動用ガス容器等 / 容器弁開放装置 / 手動式",
    "選択弁 / 本体 / 外形",
    "選択弁 / 本体 / 表示",
    "選択弁 / 本体 / 機能",
    "選択弁 / 開放装置 / 外形",
    "選択弁 / 開放装置 / 電気式",
    "選択弁 / 開放装置 / ガス圧式",
    "操作管・逆止弁 / 外形",
    "操作管・逆止弁 / 機能",
    "起動装置 / 手動式起動装置 / 周囲の状況",
    "起動装置 / 手動式起動装置 / 操作箱",
    "起動装置 / 手動式起動装置 / 表示",
    "起動装置 / 手動式起動装置 / 電源表示灯",
    "起動装置 / 手動式起動装置 / 音響警報起動用スイッチ",
    "起動装置 / 手動式起動装置 / 放出用・非常停止スイッチ",
    "起動装置 / 手動式起動装置 / 表示灯",
    "起動装置 / 手動式起動装置 / 保護カバー",
    "起動装置 / 自動式 / 火災感知装置",
    "起動装置 / 自動式 / 自動・手動切替装置",
    "起動装置 / 自動式 / 自動・手動切替表示灯",
    "警報装置 / 外形",
    "警報装置 / 音響警報",
    "警報装置 / 音声警報",
    "制御盤 / 周囲の状況",
    "制御盤 / 外形",
    "制御盤 / 表示",
    "制御盤 / 電圧計",
    "制御盤 / 開閉器・スイッチ類",
    "制御盤 / ヒューズ類",
    "制御盤 / 継電器",
    "制御盤 / 表示灯",
    "制御盤 / 結線接続",
    "制御盤 / 接地",
    "制御盤 / 遅延装置",
    "制御盤 / 自動・手動切替機能",
    "制御盤 / 放出制御機能",
    "制御盤 / 制御盤用音響警報装置",
    "制御盤 / 予備品等",
] as const

const PAGE3_ITEMS = [
    "配管等 / 管・管継手",
    "配管等 / 支持金具・つり金具",
    "配管の安全装置等 / 安全装置",
    "配管の安全装置等 / 破壊板",
    "配管の安全装置等 / 消火剤等排出措置",
    "配管の安全装置等 / 圧力上昇防止措置",
    "配管の安全装置等 / 放出表示灯",
    "噴射ヘッド / 外形",
    "噴射ヘッド / 放射障害",
    "防護区画 / 区画変更等",
    "防護区画 / 外形",
    "防護区画 / 開口部の自動閉鎖装置 / 電気で作動するもの",
    "防護区画 / 開口部の自動閉鎖装置 / ガス圧で作動するもの",
    "非常電源（内蔵型） / 外形",
    "非常電源（内蔵型） / 表示",
    "非常電源（内蔵型） / 端子電圧",
    "非常電源（内蔵型） / 切替装置",
    "非常電源（内蔵型） / 充電装置",
    "非常電源（内蔵型） / 結線接続",
    "ホース等 / 周囲の状況",
    "ホース等 / 格納箱",
    "ホース等 / ホース",
    "ホース等 / ホースリール",
    "ホース等 / ノズル",
    "ホース等 / ノズル開閉弁",
    "ホース等 / 表示灯・標識（移動式）",
    "ホース等 / 耐震措置",
] as const

const PAGE4_ITEMS = [
    "全域放出方式 / 警報装置",
    "全域放出方式 / 遅延装置",
    "全域放出方式 / 開口部の自動閉鎖装置",
    "全域放出方式 / 起動装置・選択弁",
    "全域放出方式 / 配管・配管接続部",
    "全域放出方式 / 放出表示灯",
    "局所放出方式 / 警報装置",
    "局所放出方式 / 起動装置・選択弁",
    "局所放出方式 / 配管・配管接続部",
    "移動式 / ノズル開閉弁",
    "移動式 / ホース・ホース接続部",
] as const

const PAGE5_ROW_COUNT = 19

const createEmptyRow = (): RowState => ({
    content: "",
    judgment: "",
    bad_content: "",
    action_content: "",
})

const createEmptyDevice = (): DeviceState => ({
    name: "",
    model: "",
    calibrated_at: "",
    maker: "",
})

const createEmptyCylinderRow = (index: number): CylinderRowState => ({
    no: String(index + 1),
    cylinder_no: "",
    spec1: "",
    spec2: "",
    spec3: "",
    measure1: "",
    measure2: "",
    measure3: "",
    measure4: "",
    measure5: "",
    measure6: "",
})

const coerceString = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback)

const coerceRow = (value: unknown): RowState => {
    const source = (value ?? {}) as Partial<RowState>
    return {
        content: coerceString(source.content),
        judgment: coerceString(source.judgment),
        bad_content: coerceString(source.bad_content),
        action_content: coerceString(source.action_content),
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

const coerceCylinderRow = (value: unknown, index: number): CylinderRowState => {
    const source = (value ?? {}) as Partial<CylinderRowState>
    return {
        no: coerceString(source.no, String(index + 1)),
        cylinder_no: coerceString(source.cylinder_no),
        spec1: coerceString(source.spec1),
        spec2: coerceString(source.spec2),
        spec3: coerceString(source.spec3),
        measure1: coerceString(source.measure1),
        measure2: coerceString(source.measure2),
        measure3: coerceString(source.measure3),
        measure4: coerceString(source.measure4),
        measure5: coerceString(source.measure5),
        measure6: coerceString(source.measure6),
    }
}

const hydrateRows = (count: number, source?: unknown[]): RowState[] =>
    Array.from({ length: count }, (_, i) => coerceRow(source?.[i] ?? createEmptyRow()))

const hydrateCylinders = (count: number, source?: unknown[]): CylinderRowState[] =>
    Array.from({ length: count }, (_, i) => coerceCylinderRow(source?.[i] ?? createEmptyCylinderRow(i), i))

const formatSavedAt = (value?: string | null) => {
    if (!value) return null
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    return date.toLocaleString("ja-JP")
}

export default function HalogenBekki7Form({
    initial,
    soukatsuId,
    itiranId,
    propertyId,
    savedPayload,
    savedUpdatedAt,
}: Props) {
    const saved = savedPayload ?? {}

    const [zoneName, setZoneName] = useState(coerceString(saved.zone_name))
    const [equipmentSystem, setEquipmentSystem] = useState(coerceString(saved.equipment_system, "全域"))
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
    const [notes, setNotes] = useState(coerceString(saved.notes))

    const [device1, setDevice1] = useState<DeviceState>(coerceDevice(saved.device1 ?? createEmptyDevice()))
    const [device2, setDevice2] = useState<DeviceState>(coerceDevice(saved.device2 ?? createEmptyDevice()))

    const [page1Rows, setPage1Rows] = useState<RowState[]>(() => hydrateRows(PAGE1_ITEMS.length, saved.page1_rows))
    const [page2Rows, setPage2Rows] = useState<RowState[]>(() => hydrateRows(PAGE2_ITEMS.length, saved.page2_rows))
    const [page3Rows, setPage3Rows] = useState<RowState[]>(() => hydrateRows(PAGE3_ITEMS.length, saved.page3_rows))
    const [page4Rows, setPage4Rows] = useState<RowState[]>(() => hydrateRows(PAGE4_ITEMS.length, saved.page4_rows))
    const [page5Rows, setPage5Rows] = useState<CylinderRowState[]>(() => hydrateCylinders(PAGE5_ROW_COUNT, saved.page5_rows))

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
        if (pdfUrlRef.current) window.URL.revokeObjectURL(pdfUrlRef.current)
        pdfUrlRef.current = nextUrl
        setPdfUrl(nextUrl)
    }

    const payload = useMemo<HalogenBekki7Payload>(() => ({
        zone_name: zoneName,
        equipment_system: equipmentSystem,
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
        page1_rows: page1Rows,
        page2_rows: page2Rows,
        page3_rows: page3Rows,
        page4_rows: page4Rows,
        notes,
        device1,
        device2,
        page5_rows: page5Rows,
    }), [
        zoneName,
        equipmentSystem,
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
        page1Rows,
        page2Rows,
        page3Rows,
        page4Rows,
        notes,
        device1,
        device2,
        page5Rows,
    ])

    const persistDraft = useCallback(async (clearMessage = true) => {
        setError(null)
        if (clearMessage) setSaveMessage(null)

        const { error: saveError } = await supabase
            .from("inspection_halogen_bekki7")
            .upsert({
                soukatsu_id: soukatsuId,
                itiran_id: itiranId,
                property_id: propertyId ?? null,
                payload,
                updated_at: new Date().toISOString(),
            }, { onConflict: "itiran_id" })

        if (saveError) {
            if (saveError.message.includes("inspection_halogen_bekki7")) {
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
        const response = await fetch("/api/generate-halogen-bekki7-pdf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        })
        if (!response.ok) throw new Error("PDF generation failed")
        return response.blob()
    }, [payload])

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
            a.download = `ハロゲン化物消火設備点検票_${formName || "bekki7"}.pdf`
            document.body.appendChild(a)
            a.click()
            a.remove()
            window.URL.revokeObjectURL(url)
        } catch {
            setError("PDFダウンロードに失敗しました。")
        } finally {
            setLoadingDownload(false)
        }
    }, [formName, generatePdfBlob, persistDraft])

    // Auto-save on unmount (navigation away)
    const persistDraftRef = useRef(persistDraft)
    useEffect(() => { persistDraftRef.current = persistDraft }, [persistDraft])
    useEffect(() => {
        return () => { persistDraftRef.current(false) }
    }, [])

    useEffect(() => {
        return () => {
            if (pdfUrlRef.current) window.URL.revokeObjectURL(pdfUrlRef.current)
        }
    }, [])

    const updateRowField = (
        setter: Dispatch<SetStateAction<RowState[]>>,
        index: number,
        field: keyof RowState,
        value: string,
    ) => {
        setter((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)))
    }

    const updateCylinderField = (index: number, field: keyof CylinderRowState, value: string) => {
        setPage5Rows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)))
    }

    const renderItemTable = (
        title: string,
        labels: readonly string[],
        rows: RowState[],
        setter: Dispatch<SetStateAction<RowState[]>>,
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
                                <th className="p-2 border w-80 text-left">点検項目</th>
                                <th className="p-2 border w-56 text-left">種別・容量等の内容</th>
                                <th className="p-2 border w-24 text-center">判定</th>
                                <th className="p-2 border text-left">不良内容</th>
                                <th className="p-2 border text-left">措置内容</th>
                            </tr>
                        </thead>
                        <tbody>
                            {labels.map((label, idx) => (
                                <tr key={`${title}-${idx}`}>
                                    <td className="p-2 border">{label}</td>
                                    <td className="p-1 border">
                                        <Input
                                            value={rows[idx]?.content ?? ""}
                                            onChange={(e) => updateRowField(setter, idx, "content", e.target.value)}
                                            placeholder="種別・容量等の内容"
                                        />
                                    </td>
                                    <td className="p-1 border">
                                        <select
                                            className="w-full h-8 border rounded px-2"
                                            value={rows[idx]?.judgment ?? ""}
                                            onChange={(e) => updateRowField(setter, idx, "judgment", e.target.value)}
                                        >
                                            <option value="">未選択</option>
                                            <option value="良">良</option>
                                            <option value="否">否</option>
                                        </select>
                                    </td>
                                    <td className="p-1 border">
                                        <Input
                                            value={rows[idx]?.bad_content ?? ""}
                                            onChange={(e) => updateRowField(setter, idx, "bad_content", e.target.value)}
                                            placeholder="不良内容"
                                        />
                                    </td>
                                    <td className="p-1 border">
                                        <Input
                                            value={rows[idx]?.action_content ?? ""}
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
                    <CardTitle>ハロゲン化物消火設備点検票（別記様式7）入力</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="grid md:grid-cols-3 gap-4">
                        <div className="space-y-1">
                            <Label>区画名（その1タイトル欄）</Label>
                            <Input value={zoneName} onChange={(e) => setZoneName(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>設備方式</Label>
                            <Input value={equipmentSystem} onChange={(e) => setEquipmentSystem(e.target.value)} placeholder="全域 / 局所 / 移動" />
                        </div>
                        <div className="space-y-1">
                            <Label>点検種別</Label>
                            <Input value={inspectionType} onChange={(e) => setInspectionType(e.target.value)} />
                        </div>
                    </div>

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
                            <Label>点検年月日（開始）</Label>
                            <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>点検年月日（終了）</Label>
                            <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>点検者氏名</Label>
                            <Input value={inspectorName} onChange={(e) => setInspectorName(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>TEL</Label>
                            <Input value={inspectorTel} onChange={(e) => setInspectorTel(e.target.value)} />
                        </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <Label>点検者所属会社（社名）</Label>
                            <Input value={inspectorCompany} onChange={(e) => setInspectorCompany(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>点検者住所</Label>
                            <Input value={inspectorAddress} onChange={(e) => setInspectorAddress(e.target.value)} />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {renderItemTable("（その1）機器点検", PAGE1_ITEMS, page1Rows, setPage1Rows)}
            {renderItemTable("（その2）機器点検", PAGE2_ITEMS, page2Rows, setPage2Rows)}
            {renderItemTable("（その3）機器点検", PAGE3_ITEMS, page3Rows, setPage3Rows)}
            {renderItemTable("（その4）総合点検", PAGE4_ITEMS, page4Rows, setPage4Rows)}

            <Card>
                <CardHeader>
                    <CardTitle>（その4）備考・測定機器</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="space-y-1">
                        <Label>備考</Label>
                        <Textarea rows={6} value={notes} onChange={(e) => setNotes(e.target.value)} />
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

            <Card>
                <CardHeader>
                    <CardTitle>（その5）容器ごとの点検結果</CardTitle>
                    <CardDescription>
                        ページ5の列順に入力してください（全質量 / 空質量 / ガス質量 / 点検年月日 / 点検時ガス質量1〜5）。
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto border rounded-lg">
                        <table className="min-w-[1800px] w-full text-sm">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="p-2 border w-16">番号</th>
                                    <th className="p-2 border w-24">容器番号</th>
                                    <th className="p-2 border w-28">全質量(kg)</th>
                                    <th className="p-2 border w-28">空質量(kg)</th>
                                    <th className="p-2 border w-32">ガス質量(kg)</th>
                                    <th className="p-2 border w-44">点検年月日</th>
                                    <th className="p-2 border w-28">点検時ガス1</th>
                                    <th className="p-2 border w-28">点検時ガス2</th>
                                    <th className="p-2 border w-28">点検時ガス3</th>
                                    <th className="p-2 border w-28">点検時ガス4</th>
                                    <th className="p-2 border w-28">点検時ガス5</th>
                                </tr>
                            </thead>
                            <tbody>
                                {page5Rows.map((row, idx) => (
                                    <tr key={`p5-${idx}`}>
                                        <td className="p-1 border">
                                            <Input value={row.no} onChange={(e) => updateCylinderField(idx, "no", e.target.value)} />
                                        </td>
                                        <td className="p-1 border">
                                            <Input value={row.cylinder_no} onChange={(e) => updateCylinderField(idx, "cylinder_no", e.target.value)} />
                                        </td>
                                        <td className="p-1 border">
                                            <Input value={row.spec1} onChange={(e) => updateCylinderField(idx, "spec1", e.target.value)} placeholder="全質量" />
                                        </td>
                                        <td className="p-1 border">
                                            <Input value={row.spec2} onChange={(e) => updateCylinderField(idx, "spec2", e.target.value)} placeholder="空質量" />
                                        </td>
                                        <td className="p-1 border">
                                            <Input value={row.spec3} onChange={(e) => updateCylinderField(idx, "spec3", e.target.value)} placeholder="ガス質量" />
                                        </td>
                                        <td className="p-1 border">
                                            <Input value={row.measure1} onChange={(e) => updateCylinderField(idx, "measure1", e.target.value)} placeholder="2026/02/22" />
                                        </td>
                                        <td className="p-1 border">
                                            <Input value={row.measure2} onChange={(e) => updateCylinderField(idx, "measure2", e.target.value)} />
                                        </td>
                                        <td className="p-1 border">
                                            <Input value={row.measure3} onChange={(e) => updateCylinderField(idx, "measure3", e.target.value)} />
                                        </td>
                                        <td className="p-1 border">
                                            <Input value={row.measure4} onChange={(e) => updateCylinderField(idx, "measure4", e.target.value)} />
                                        </td>
                                        <td className="p-1 border">
                                            <Input value={row.measure5} onChange={(e) => updateCylinderField(idx, "measure5", e.target.value)} />
                                        </td>
                                        <td className="p-1 border">
                                            <Input value={row.measure6} onChange={(e) => updateCylinderField(idx, "measure6", e.target.value)} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
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
                    <iframe src={pdfUrl} title="ハロゲン化物消火設備点検票PDFプレビュー" className="w-full h-[75vh] md:h-[calc(100vh-220px)]" />
                </div>
            )}
        </div>
    )
}


