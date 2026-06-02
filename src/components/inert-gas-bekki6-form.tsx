"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCheck, Eye, FileDown, Loader2, Save } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { toDateInputValue } from "@/lib/date-utils"
import {
    normalizeBekkiInspectorNameForPayload,
    normalizeBekkiInspectorNameForState,
    normalizeBekkiWitnessForPayload,
    normalizeBekkiWitnessForState,
} from "@/lib/bekki-form-normalization"
import CameraInput from "@/components/camera-input"

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
    spec4: string
    spec5: string
    // 後方互換用（旧データは date+temp+value 結合の単一テキスト）
    measure1: string
    measure2: string
    measure3: string
    measure4: string
    // 4回ぶんの (date, temp, value) trio
    measure1_date: string
    measure1_temp: string
    measure1_value: string
    measure2_date: string
    measure2_temp: string
    measure2_value: string
    measure3_date: string
    measure3_temp: string
    measure3_value: string
    measure4_date: string
    measure4_temp: string
    measure4_value: string
}

type InertGasBekki6Payload = {
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
        fire_manager_name?: string | null
        inspector_name?: string | null
        inspection_date?: string | null
    }
    soukatsuId: string
    itiranId: string
    propertyId?: string | null
    savedPayload?: Partial<InertGasBekki6Payload> | null
    savedUpdatedAt?: string | null
}

const PAGE1_ITEMS = [
    "消火剤貯蔵容器等 / 貯蔵容器（見出し行・通常入力不要）",
    "消火剤貯蔵容器等 / 貯蔵容器 / 周囲の状況",
    "消火剤貯蔵容器等 / 貯蔵容器 / 外形",
    "消火剤貯蔵容器等 / 貯蔵容器 / 表示・標識",
    "消火剤貯蔵容器等 / 高圧式 / ※消火剤量",
    "消火剤貯蔵容器等 / 高圧式 / 容器弁 / 外形",
    "消火剤貯蔵容器等 / 高圧式 / 容器弁 / 安全性",
    "消火剤貯蔵容器等 / 高圧式 / 安全装置 / 外形",
    "消火剤貯蔵容器等 / 高圧式 / 安全装置 / 安全性",
    "消火剤貯蔵容器等 / 高圧式 / 容器弁開放装置 / 外形",
    "消火剤貯蔵容器等 / 高圧式 / 容器弁開放装置 / 電気式",
    "消火剤貯蔵容器等 / 高圧式 / 容器弁開放装置 / ガス圧式",
    "消火剤貯蔵容器等 / 低圧式 / 消火剤量",
    "消火剤貯蔵容器等 / 低圧式 / 液面計・圧力計",
    "消火剤貯蔵容器等 / 低圧式 / 圧力警報装置・安全装置等",
    "消火剤貯蔵容器等 / 低圧式 / 自動冷凍機",
    "消火剤貯蔵容器等 / 低圧式 / 放出弁",
    "消火剤貯蔵容器等 / 低圧式 / 放出弁開放装置 / 外形",
    "消火剤貯蔵容器等 / 低圧式 / 放出弁開放装置 / 電気式",
    "消火剤貯蔵容器等 / 低圧式 / 放出弁開放装置 / ガス圧式",
    "消火剤貯蔵容器等 / バルブ類",
    "消火剤貯蔵容器等 / 連結管・集合管",
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
] as const

const PAGE2_ITEMS = [
    "選択弁 / 本体 / 外形",
    "選択弁 / 本体 / 表示",
    "選択弁 / 本体 / 機能",
    "選択弁 / 開放装置 / 外形",
    "選択弁 / 開放装置 / 電気式",
    "選択弁 / 開放装置 / ガス圧式",
    "操作管・逆止弁 / 外形",
    "操作管・逆止弁 / 機能",
    "操作管・逆止弁 / 標識",
    "起動装置 / 手動式起動装置 / 周囲の状況",
    "起動装置 / 手動式起動装置 / 操作箱",
    "起動装置 / 手動式起動装置 / 表示",
    "起動装置 / 手動式起動装置 / 電源表示灯",
    "起動装置 / 手動式起動装置 / 音響警報起動用スイッチ",
    "起動装置 / 手動式起動装置 / 放出用・非常停止用スイッチ",
    "起動装置 / 手動式起動装置 / 表示灯",
    "起動装置 / 手動式起動装置 / 保護カバー",
    "起動装置 / 自動式 / 火災感知装置",
    "起動装置 / 自動式 / 自動・手動切替装置",
    "起動装置 / 自動式 / 自動・手動切替表示灯",
    "起動装置 / 自動式 / AND回路制御機能",
    "起動装置 / 緊急停止装置・警報装置（見出し行）",
    "起動装置 / 警報装置 / 外形",
    "起動装置 / 警報装置 / 音響警報",
    "起動装置 / 警報装置 / 音声警報",
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
    "閉止弁 / 外形",
    "閉止弁 / 機能",
    "配管の安全装置等 / 安全装置",
    "配管の安全装置等 / 破壊板",
    "配管の安全装置等 / 消火剤等排出措置",
    "配管の安全装置等 / 圧力上昇防止措置",
    "配管の安全装置等 / 放出表示灯",
    "噴射ヘッド / 外形",
    "噴射ヘッド / 放射障害",
    "防護区画 / 区画変更等",
    "開口部の自動閉鎖装置 / 外形",
    "開口部の自動閉鎖装置 / 電気で作動するもの",
    "開口部の自動閉鎖装置 / ガス圧で作動するもの",
    "部分の保安措置（防護区画に隣接） / 設定範囲",
    "部分の保安措置 / 消火剤排出措置",
    "部分の保安措置 / 放出表示灯",
    "部分の保安措置 / 警報装置 / 外形",
    "部分の保安措置 / 警報装置 / 音響警報",
    "部分の保安措置 / 警報装置 / 音声警報",
    "部分の保安措置 / 警報装置 / 注意銘板",
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
    "総合点検（見出し行・通常入力不要）",
    "全域放出方式 / 警報装置",
    "全域放出方式 / 遅延装置",
    "全域放出方式 / 開口部の自動閉鎖装置等",
    "全域放出方式 / 起動装置・選択弁",
    "全域放出方式 / 配管・配管接続部",
    "全域放出方式 / 放出表示灯",
    "局所放出方式 / 警報装置",
    "局所放出方式 / 起動装置・選択弁",
    "局所放出方式 / 配管・配管接続部",
    "移動式 / ノズル開閉弁",
    "移動式 / ホース・ホース接続部",
] as const

const PAGE5_ROW_COUNT = 29

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
    spec4: "",
    spec5: "",
    measure1: "",
    measure2: "",
    measure3: "",
    measure4: "",
    measure1_date: "",
    measure1_temp: "",
    measure1_value: "",
    measure2_date: "",
    measure2_temp: "",
    measure2_value: "",
    measure3_date: "",
    measure3_temp: "",
    measure3_value: "",
    measure4_date: "",
    measure4_temp: "",
    measure4_value: "",
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
        spec4: coerceString(source.spec4),
        spec5: coerceString(source.spec5),
        measure1: coerceString(source.measure1),
        measure2: coerceString(source.measure2),
        measure3: coerceString(source.measure3),
        measure4: coerceString(source.measure4),
        measure1_date: coerceString(source.measure1_date),
        measure1_temp: coerceString(source.measure1_temp),
        measure1_value: coerceString(source.measure1_value),
        measure2_date: coerceString(source.measure2_date),
        measure2_temp: coerceString(source.measure2_temp),
        measure2_value: coerceString(source.measure2_value),
        measure3_date: coerceString(source.measure3_date),
        measure3_temp: coerceString(source.measure3_temp),
        measure3_value: coerceString(source.measure3_value),
        measure4_date: coerceString(source.measure4_date),
        measure4_temp: coerceString(source.measure4_temp),
        measure4_value: coerceString(source.measure4_value),
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

export default function InertGasBekki6Form({
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
    const [fireManager, setFireManager] = useState(coerceString(saved.fire_manager, initial.fire_manager_name || initial.notifier_name || ""))
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


    const payload = useMemo<InertGasBekki6Payload>(() => ({
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
            .from("inspection_inert_gas_bekki6")
            .upsert({
                soukatsu_id: soukatsuId,
                itiran_id: itiranId,
                property_id: propertyId ?? null,
                payload,
                updated_at: new Date().toISOString(),
            }, { onConflict: "itiran_id" })

        if (saveError) {
            if (saveError.message.includes("inspection_inert_gas_bekki6")) {
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
        const response = await fetch("/api/generate-inert-gas-bekki6-pdf", {
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
            const url = window.URL.createObjectURL(blob)
            window.open(url, "_blank")
            window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000)
        } catch {
            setError("PDFプレビューの生成に失敗しました。")
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
            a.download = `不活性ガス消火設備点検票_${formName || "bekki6"}.pdf`
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
    ) => {
    const markAllGood = () => setter((prev) => prev.map((row) => (row.judgment === "" ? { ...row, judgment: "良" } : row)))
    return (
        <Card>
            <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                        <CardTitle>{title}</CardTitle>
                        <CardDescription>種別・容量等の内容、判定、不良内容、措置内容を入力してください。</CardDescription>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={markAllGood} className="shrink-0">
                        <CheckCheck className="w-4 h-4 mr-1.5" />すべて良にする
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {/* Desktop: table layout */}
                <div className="hidden md:block overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm">
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

                {/* Mobile: card layout */}
                <div className="md:hidden space-y-3">
                    {labels.map((label, idx) => (
                        <div key={`${title}-${idx}-mobile`} className="border rounded-lg p-3 space-y-2 bg-white">
                            <div className="font-medium text-sm text-slate-800">{label}</div>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                    <span className="text-xs text-slate-500">内容</span>
                                    <Input
                                        value={rows[idx]?.content ?? ""}
                                        onChange={(e) => updateRowField(setter, idx, "content", e.target.value)}
                                        className="h-9 text-sm"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <span className="text-xs text-slate-500">判定</span>
                                    <select
                                        className="w-full h-9 border border-input rounded-md bg-background px-2 text-sm"
                                        value={rows[idx]?.judgment ?? ""}
                                        onChange={(e) => updateRowField(setter, idx, "judgment", e.target.value)}
                                    >
                                        <option value="">未選択</option>
                                        <option value="良">良</option>
                                        <option value="否">否</option>
                                    </select>
                                </div>
                            </div>
                            {(rows[idx]?.judgment === "否" || rows[idx]?.bad_content || rows[idx]?.action_content) && (
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <span className="text-xs text-slate-500">不良内容</span>
                                        <Input
                                            value={rows[idx]?.bad_content ?? ""}
                                            onChange={(e) => updateRowField(setter, idx, "bad_content", e.target.value)}
                                            className="h-9 text-sm"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-xs text-slate-500">措置内容</span>
                                        <Input
                                            value={rows[idx]?.action_content ?? ""}
                                            onChange={(e) => updateRowField(setter, idx, "action_content", e.target.value)}
                                            className="h-9 text-sm"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    )
    }

    const busy = saving || loadingPreview || loadingDownload

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>不活性ガス消火設備点検票（別記様式6）入力</CardTitle>
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
                        <div className="space-y-1 min-w-0">
                            <Label>点検年月日（開始）</Label>
                            <Input type="date" className="min-w-0" value={toDateInputValue(periodStart)} onChange={(e) => setPeriodStart(e.target.value)} />
                        </div>
                        <div className="space-y-1 min-w-0">
                            <Label>点検年月日（終了）</Label>
                            <Input type="date" className="min-w-0" value={toDateInputValue(periodEnd)} onChange={(e) => setPeriodEnd(e.target.value)} />
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
                            <div className="space-y-1">
                                <Label className="text-xs font-normal text-slate-500">校正年月日</Label>
                                <Input type="date" value={toDateInputValue(device1.calibrated_at)} onChange={(e) => setDevice1((p) => ({ ...p, calibrated_at: e.target.value }))} />
                            </div>
                            <Input placeholder="製造者名" value={device1.maker} onChange={(e) => setDevice1((p) => ({ ...p, maker: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <p className="font-medium text-sm">測定機器 2</p>
                            <Input placeholder="機器名" value={device2.name} onChange={(e) => setDevice2((p) => ({ ...p, name: e.target.value }))} />
                            <Input placeholder="型式" value={device2.model} onChange={(e) => setDevice2((p) => ({ ...p, model: e.target.value }))} />
                            <div className="space-y-1">
                                <Label className="text-xs font-normal text-slate-500">校正年月日</Label>
                                <Input type="date" value={toDateInputValue(device2.calibrated_at)} onChange={(e) => setDevice2((p) => ({ ...p, calibrated_at: e.target.value }))} />
                            </div>
                            <Input placeholder="製造者名" value={device2.maker} onChange={(e) => setDevice2((p) => ({ ...p, maker: e.target.value }))} />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>（その5）容器ごとの点検結果</CardTitle>
                    <CardDescription>
                        仕様1〜5（全質量/空質量/消火剤量kg/消火剤量m³/充てん圧力MPa）と測定1〜4 を入力してください。各測定セルは上段に点検年月日、下段に容器表面温度・点検時の消火剤量(kg)または容器内圧力(MPa)を横並びで描画します。
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {/* Desktop: table layout */}
                    <div className="hidden md:block overflow-x-auto border rounded-lg">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="p-2 border w-16">番号</th>
                                    <th className="p-2 border w-24">容器番号</th>
                                    <th className="p-2 border w-24">全質量(kg)</th>
                                    <th className="p-2 border w-24">空質量(kg)</th>
                                    <th className="p-2 border w-24">消火剤量(kg)</th>
                                    <th className="p-2 border w-24">消火剤量(m³)</th>
                                    <th className="p-2 border w-28">充てん圧力(MPa)</th>
                                    <th className="p-2 border w-44">測定1<br /><span className="text-xs font-normal text-slate-500">日付 / 温度・値</span></th>
                                    <th className="p-2 border w-44">測定2<br /><span className="text-xs font-normal text-slate-500">日付 / 温度・値</span></th>
                                    <th className="p-2 border w-44">測定3<br /><span className="text-xs font-normal text-slate-500">日付 / 温度・値</span></th>
                                    <th className="p-2 border w-44">測定4<br /><span className="text-xs font-normal text-slate-500">日付 / 温度・値</span></th>
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
                                            <Input value={row.spec1} onChange={(e) => updateCylinderField(idx, "spec1", e.target.value)} placeholder="例: 67.2" />
                                        </td>
                                        <td className="p-1 border">
                                            <Input value={row.spec2} onChange={(e) => updateCylinderField(idx, "spec2", e.target.value)} placeholder="例: 42.0" />
                                        </td>
                                        <td className="p-1 border">
                                            <Input value={row.spec3} onChange={(e) => updateCylinderField(idx, "spec3", e.target.value)} placeholder="例: 25.2" />
                                        </td>
                                        <td className="p-1 border">
                                            <Input value={row.spec4} onChange={(e) => updateCylinderField(idx, "spec4", e.target.value)} placeholder="例: 13.5" />
                                        </td>
                                        <td className="p-1 border">
                                            <Input value={row.spec5} onChange={(e) => updateCylinderField(idx, "spec5", e.target.value)} placeholder="例: 14.7" />
                                        </td>
                                        {([1, 2, 3, 4] as const).map((n) => {
                                            const dateKey = `measure${n}_date` as const
                                            const tempKey = `measure${n}_temp` as const
                                            const valueKey = `measure${n}_value` as const
                                            return (
                                                <td key={`m${n}`} className="p-1 border">
                                                    <div className="space-y-1">
                                                        <Input
                                                            value={row[dateKey]}
                                                            onChange={(e) => updateCylinderField(idx, dateKey, e.target.value)}
                                                            placeholder={n === 1 ? "2026/02/22" : "日付"}
                                                            className="h-8 text-xs"
                                                        />
                                                        <div className="grid grid-cols-2 gap-1">
                                                            <Input
                                                                value={row[tempKey]}
                                                                onChange={(e) => updateCylinderField(idx, tempKey, e.target.value)}
                                                                placeholder={n === 1 ? "18℃" : "温度"}
                                                                className="h-8 text-xs"
                                                            />
                                                            <Input
                                                                value={row[valueKey]}
                                                                onChange={(e) => updateCylinderField(idx, valueKey, e.target.value)}
                                                                placeholder={n === 1 ? "41.0" : "値"}
                                                                className="h-8 text-xs"
                                                            />
                                                        </div>
                                                    </div>
                                                </td>
                                            )
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile: 1 容器 = 1 カード */}
                    <div className="md:hidden space-y-4">
                        {page5Rows.map((row, idx) => (
                            <div key={`p5-mobile-${idx}`} className="border rounded-lg p-3 space-y-3 bg-white">
                                {/* 容器ヘッダ */}
                                <div className="flex items-center gap-2 pb-2 border-b">
                                    <span className="text-sm font-bold text-slate-800 whitespace-nowrap">容器 {idx + 1}</span>
                                    <Input
                                        value={row.no}
                                        onChange={(e) => updateCylinderField(idx, "no", e.target.value)}
                                        placeholder="番号"
                                        className="h-8 w-16 text-xs"
                                    />
                                    <Input
                                        value={row.cylinder_no}
                                        onChange={(e) => updateCylinderField(idx, "cylinder_no", e.target.value)}
                                        placeholder="容器番号"
                                        className="h-8 flex-1 text-xs min-w-0"
                                    />
                                </div>

                                {/* 仕様 (spec1-5) */}
                                <div>
                                    <div className="text-xs text-slate-500 mb-1">仕様</div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1 min-w-0">
                                            <span className="text-xs text-slate-500">全質量(kg)</span>
                                            <Input value={row.spec1} onChange={(e) => updateCylinderField(idx, "spec1", e.target.value)} placeholder="例: 67.2" className="h-9 text-sm" />
                                        </div>
                                        <div className="space-y-1 min-w-0">
                                            <span className="text-xs text-slate-500">空質量(kg)</span>
                                            <Input value={row.spec2} onChange={(e) => updateCylinderField(idx, "spec2", e.target.value)} placeholder="例: 42.0" className="h-9 text-sm" />
                                        </div>
                                        <div className="space-y-1 min-w-0">
                                            <span className="text-xs text-slate-500">消火剤量(kg)</span>
                                            <Input value={row.spec3} onChange={(e) => updateCylinderField(idx, "spec3", e.target.value)} placeholder="例: 25.2" className="h-9 text-sm" />
                                        </div>
                                        <div className="space-y-1 min-w-0">
                                            <span className="text-xs text-slate-500">消火剤量(m³)</span>
                                            <Input value={row.spec4} onChange={(e) => updateCylinderField(idx, "spec4", e.target.value)} placeholder="例: 13.5" className="h-9 text-sm" />
                                        </div>
                                        <div className="space-y-1 min-w-0 col-span-2">
                                            <span className="text-xs text-slate-500">充てん圧力(MPa)</span>
                                            <Input value={row.spec5} onChange={(e) => updateCylinderField(idx, "spec5", e.target.value)} placeholder="例: 14.7" className="h-9 text-sm" />
                                        </div>
                                    </div>
                                </div>

                                {/* 測定 1-4 */}
                                {([1, 2, 3, 4] as const).map((n) => {
                                    const dateKey = `measure${n}_date` as const
                                    const tempKey = `measure${n}_temp` as const
                                    const valueKey = `measure${n}_value` as const
                                    return (
                                        <div key={`m${n}-mobile`}>
                                            <div className="text-xs text-slate-500 mb-1">測定 {n}</div>
                                            <div className="space-y-2">
                                                <div className="space-y-1 min-w-0">
                                                    <span className="text-xs text-slate-500">日付</span>
                                                    <Input
                                                        value={row[dateKey]}
                                                        onChange={(e) => updateCylinderField(idx, dateKey, e.target.value)}
                                                        placeholder={n === 1 ? "2026/02/22" : "日付"}
                                                        className="h-9 text-sm"
                                                    />
                                                </div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div className="space-y-1 min-w-0">
                                                        <span className="text-xs text-slate-500">温度</span>
                                                        <Input
                                                            value={row[tempKey]}
                                                            onChange={(e) => updateCylinderField(idx, tempKey, e.target.value)}
                                                            placeholder={n === 1 ? "18℃" : "温度"}
                                                            className="h-9 text-sm"
                                                        />
                                                    </div>
                                                    <div className="space-y-1 min-w-0">
                                                        <span className="text-xs text-slate-500">値</span>
                                                        <Input
                                                            value={row[valueKey]}
                                                            onChange={(e) => updateCylinderField(idx, valueKey, e.target.value)}
                                                            placeholder={n === 1 ? "41.0" : "値"}
                                                            className="h-9 text-sm"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        ))}
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
                    保存
                </Button>
                <Button type="button" onClick={handlePreview} disabled={busy} className="bg-blue-600 hover:bg-blue-700 text-white">
                    {loadingPreview ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Eye className="w-4 h-4 mr-2" />}
                    プレビュー
                </Button>
                <Button type="button" onClick={handleDownload} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    {loadingDownload ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileDown className="w-4 h-4 mr-2" />}
                    PDFダウンロード
                </Button>
                {saveMessage && <span className="text-sm text-slate-500">{saveMessage}</span>}
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}


        </div>
    )
}
