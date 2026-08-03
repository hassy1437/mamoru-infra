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
import { pdfRequestError, pdfErrorText } from "@/lib/pdf-request-error"

type RowState = {
    content: string
    judgment: string
    bad_content: string
    action_content: string
    current_value: string  // 電圧計・電流計行の電流値（A）
    flow_value: string     // ポンプ性能行の吐出量（L/min）
    hose_count: string     // ホース行の本数
    nozzle_dia: string     // ホース行のノズル径（mm）
}

type DeviceState = {
    name: string
    model: string
    calibrated_at: string
    maker: string
}

type FoamBekki5Payload = {
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
    foam_maker: string
    foam_model: string
    foam_type_no_from: string
    foam_type_no_to: string
    page1_rows: RowState[]
    page2_rows: RowState[]
    page3_rows: RowState[]
    page4_rows: RowState[]
    notes: string
    device1: DeviceState
    device2: DeviceState
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
    savedPayload?: Partial<FoamBekki5Payload> | null
    savedUpdatedAt?: string | null
}

const PAGE1_ITEMS = [
    "機器点検（見出し行・通常入力不要）",
    "水源 / 貯水槽",
    "水源 / 水量",
    "水源 / 水状",
    "水源 / 給水装置",
    "水源 / 水位計",
    "水源 / 圧力計",
    "水源 / バルブ類",
    "加圧送水装置 / ポンプ方式 / 周囲の状況",
    "加圧送水装置 / ポンプ方式 / 外形",
    "加圧送水装置 / 電動機の制御装置 / 表示",
    "加圧送水装置 / 電動機の制御装置 / 電圧計・電流計",
    "加圧送水装置 / 電動機の制御装置 / 開閉器･スイッチ類",
    "加圧送水装置 / 電動機の制御装置 / ヒューズ類",
    "加圧送水装置 / 電動機の制御装置 / 継電器",
    "加圧送水装置 / 電動機の制御装置 / 表示灯",
    "加圧送水装置 / 電動機の制御装置 / 結線接続",
    "加圧送水装置 / 電動機の制御装置 / 接地",
    "加圧送水装置 / 電動機の制御装置 / 予備品等",
] as const

const PAGE2_ITEMS = [
    "加圧送水装置 / ポンプ方式 / 起動装置 / 手動式起動 / 操作部 / 周囲の状況",
    "加圧送水装置 / ポンプ方式 / 起動装置 / 手動式起動 / 操作部 / 外形",
    "加圧送水装置 / ポンプ方式 / 起動装置 / 手動式起動 / 操作部 / 標識",
    "加圧送水装置 / ポンプ方式 / 起動装置 / 手動式起動 / 操作部 / 機能",
    "加圧送水装置 / ポンプ方式 / 起動装置 / 自動式起動装置 / 起動用水圧開閉装置 / 圧力スイッチ",
    "加圧送水装置 / ポンプ方式 / 起動装置 / 自動式起動装置 / 起動用圧力タンク",
    "加圧送水装置 / ポンプ方式 / 起動装置 / 自動式起動装置 / 機能",
    "加圧送水装置 / ポンプ方式 / 起動装置 / 火災感知装置 / 感知器",
    "加圧送水装置 / ポンプ方式 / 起動装置 / 火災感知装置 / 閉鎖型SPヘッド",
    "加圧送水装置 / ポンプ方式 / 電動機 / 外形",
    "加圧送水装置 / ポンプ方式 / 電動機 / 回転軸",
    "加圧送水装置 / ポンプ方式 / 電動機 / 軸受部",
    "加圧送水装置 / ポンプ方式 / 電動機 / 軸継手",
    "加圧送水装置 / ポンプ方式 / 電動機 / 機能",
    "加圧送水装置 / ポンプ方式 / ポンプ / 外形",
    "加圧送水装置 / ポンプ方式 / ポンプ / 回転軸",
    "加圧送水装置 / ポンプ方式 / ポンプ / 軸受部",
    "加圧送水装置 / ポンプ方式 / ポンプ / グランド部",
    "加圧送水装置 / ポンプ方式 / ポンプ / 連成計・圧力計",
    "加圧送水装置 / ポンプ方式 / ポンプ / 性能",
    "加圧送水装置 / 呼水装置 / 呼水槽",
    "加圧送水装置 / 呼水装置 / バルブ類",
    "加圧送水装置 / 呼水装置 / 自動給水装置",
    "加圧送水装置 / 呼水装置 / 減水警報装置",
    "加圧送水装置 / 呼水装置 / フート弁",
    "加圧送水装置 / 性能試験装置",
    "加圧送水装置 / 高架水槽方式",
    "加圧送水装置 / 圧力水槽方式",
    "加圧送水装置 / 減圧のための措置",
    "配管等 / 管・管継手",
    "配管等 / 支持金具・つり金具",
    "配管等 / バルブ類",
    "配管等 / ろ過装置",
    "配管等 / 逃し配管",
] as const

const PAGE3_ITEMS = [
    "泡消火薬剤貯蔵槽等 / 消火薬剤貯蔵槽",
    "泡消火薬剤貯蔵槽等 / 消火薬剤",
    "泡消火薬剤貯蔵槽等 / 圧力計",
    "泡消火薬剤貯蔵槽等 / バルブ類",
    "泡消火薬剤混合装置等 / 外形",
    "泡消火薬剤混合装置等 / 薬剤混合装置",
    "泡消火薬剤混合装置等 / 加圧送液装置",
    "泡放出口 / 外形",
    "泡放出口 / 泡放出障害",
    "泡放出口 / 未警戒部分",
    "流水検知装置・圧力検知装置 / バルブ本体等",
    "流水検知装置・圧力検知装置 / リターディング・チャンバー",
    "流水検知装置・圧力検知装置 / 圧力スイッチ",
    "流水検知装置・圧力検知装置 / 音響警報装置・表示装置",
    "一斉開放弁（電磁弁を含む。）",
    "防護区画（高発泡設備） / 区画変更等",
    "防護区画（高発泡設備） / 開口部の自動閉鎖装置",
    "防護区画（高発泡設備） / 非常停止装置",
    "泡放射用器具格納箱等 / 泡放射用器具格納箱 / 周囲の状況",
    "泡放射用器具格納箱等 / 泡放射用器具格納箱 / 外形",
    "泡放射用器具格納箱等 / 泡放射用器具格納箱 / 表示",
    "泡放射用器具格納箱等 / ホース・ノズル / 外形",
    "泡放射用器具格納箱等 / ホース・ノズル / ホースの耐圧性能",
    "泡放射用器具格納箱等 / ホース接続口",
    "泡放射用器具格納箱等 / 開閉弁",
    "泡放射用器具格納箱等 / 表示灯",
    "泡放射用器具格納箱等 / 耐震措置",
] as const

const PAGE4_ITEMS = [
    "総合点検（見出し行・通常入力不要）",
    "固定式の泡消火設備 / ポンプ方式 / 起動性能等 / 加圧送水装置",
    "固定式の泡消火設備 / ポンプ方式 / 起動性能等 / 表示・警報等",
    "固定式の泡消火設備 / ポンプ方式 / 起動性能等 / 電動機の運転電流",
    "固定式の泡消火設備 / ポンプ方式 / 起動性能等 / 運転状況",
    "固定式の泡消火設備 / ポンプ方式 / 一斉開放弁",
    "固定式の泡消火設備 / ポンプ方式 / 分布等 / 低発泡を用いるもの",
    "固定式の泡消火設備 / ポンプ方式 / 分布等 / 高発泡を用いるもの",
    "固定式の泡消火設備 / ポンプ方式 / 減圧のための措置",
    "固定式の泡消火設備 / 高架水槽方式等 / 表示・警報等",
    "固定式の泡消火設備 / 高架水槽方式等 / 一斉開放弁",
    "固定式の泡消火設備 / 高架水槽方式等 / 分布等 / 低発泡を用いるもの",
    "固定式の泡消火設備 / 高架水槽方式等 / 分布等 / 高発泡を用いるもの",
    "固定式の泡消火設備 / 高架水槽方式等 / 減圧のための措置",
    "移動式の泡消火設備 / ポンプ方式 / 起動性能等 / 加圧送水装置",
    "移動式の泡消火設備 / ポンプ方式 / 起動性能等 / 表示・警報等",
    "移動式の泡消火設備 / ポンプ方式 / 起動性能等 / 電動機の運転電流",
    "移動式の泡消火設備 / ポンプ方式 / 起動性能等 / 運転状況",
    "移動式の泡消火設備 / ポンプ方式 / 減圧のための措置",
    "移動式の泡消火設備 / 方式等 / 発泡倍率等",
    "移動式の泡消火設備 / 高架水槽方式等 / 表示・警報等",
    "移動式の泡消火設備 / 高架水槽方式等 / 発泡倍率等",
    "移動式の泡消火設備 / 高架水槽方式等 / 減圧のための措置",
] as const

const createEmptyRow = (): RowState => ({
    content: "",
    judgment: "",
    bad_content: "",
    action_content: "",
    current_value: "",
    flow_value: "",
    hose_count: "",
    nozzle_dia: "",
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
        flow_value: coerceString(source.flow_value),
        hose_count: coerceString(source.hose_count),
        nozzle_dia: coerceString(source.nozzle_dia),
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

const hydrateRows = (count: number, source?: unknown[]): RowState[] =>
    Array.from({ length: count }, (_, i) => coerceRow(source?.[i] ?? createEmptyRow()))

const formatSavedAt = (value?: string | null) => {
    if (!value) return null
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    return date.toLocaleString("ja-JP")
}

export default function FoamBekki5Form({
    initial,
    soukatsuId,
    itiranId,
    propertyId,
    savedPayload,
    savedUpdatedAt,
}: Props) {
    const saved = savedPayload ?? {}

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
    const [equipmentName, setEquipmentName] = useState(coerceString(saved.equipment_name))
    const [pumpMaker, setPumpMaker] = useState(coerceString(saved.pump_maker))
    const [pumpModel, setPumpModel] = useState(coerceString(saved.pump_model))
    const [motorMaker, setMotorMaker] = useState(coerceString(saved.motor_maker))
    const [motorModel, setMotorModel] = useState(coerceString(saved.motor_model))
    const [foamMaker, setFoamMaker] = useState(coerceString(saved.foam_maker))
    const [foamModel, setFoamModel] = useState(coerceString(saved.foam_model))
    const [foamTypeNoFrom, setFoamTypeNoFrom] = useState(coerceString(saved.foam_type_no_from))
    const [foamTypeNoTo, setFoamTypeNoTo] = useState(coerceString(saved.foam_type_no_to))
    const [notes, setNotes] = useState(coerceString(saved.notes))

    const [device1, setDevice1] = useState<DeviceState>(coerceDevice(saved.device1 ?? createEmptyDevice()))
    const [device2, setDevice2] = useState<DeviceState>(coerceDevice(saved.device2 ?? createEmptyDevice()))

    const [page1Rows, setPage1Rows] = useState<RowState[]>(() => hydrateRows(PAGE1_ITEMS.length, saved.page1_rows))
    const [page2Rows, setPage2Rows] = useState<RowState[]>(() => hydrateRows(PAGE2_ITEMS.length, saved.page2_rows))
    const [page3Rows, setPage3Rows] = useState<RowState[]>(() => hydrateRows(PAGE3_ITEMS.length, saved.page3_rows))
    const [page4Rows, setPage4Rows] = useState<RowState[]>(() => hydrateRows(PAGE4_ITEMS.length, saved.page4_rows))

    const [saving, setSaving] = useState(false)
    const [loadingPreview, setLoadingPreview] = useState(false)
    const [loadingDownload, setLoadingDownload] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [saveMessage, setSaveMessage] = useState<string | null>(
        formatSavedAt(savedUpdatedAt) ? `最終保存: ${formatSavedAt(savedUpdatedAt)}` : null
    )


    const payload = useMemo<FoamBekki5Payload>(() => ({
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
        foam_maker: foamMaker,
        foam_model: foamModel,
        foam_type_no_from: foamTypeNoFrom,
        foam_type_no_to: foamTypeNoTo,
        page1_rows: page1Rows,
        page2_rows: page2Rows,
        page3_rows: page3Rows,
        page4_rows: page4Rows,
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
        foamMaker,
        foamModel,
        foamTypeNoFrom,
        foamTypeNoTo,
        page1Rows,
        page2Rows,
        page3Rows,
        page4Rows,
        notes,
        device1,
        device2,
    ])

    const persistDraft = useCallback(async (clearMessage = true) => {
        setError(null)
        if (clearMessage) setSaveMessage(null)

        const { error: saveError } = await supabase
            .from("inspection_foam_bekki5")
            .upsert({
                soukatsu_id: soukatsuId,
                itiran_id: itiranId,
                property_id: propertyId ?? null,
                payload,
                updated_at: new Date().toISOString(),
            }, { onConflict: "itiran_id" })

        if (saveError) {
            if (saveError.message.includes("inspection_foam_bekki5")) {
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
        const response = await fetch("/api/generate-foam-bekki5-pdf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        })
        if (!response.ok) throw await pdfRequestError(response)

        return response.blob()
    }, [payload])

    const handlePreview = useCallback(async () => {
        setLoadingPreview(true)
        setError(null)
        // ポップアップブロック対策: クリック同期で先に空タブを開く（fetch 後の window.open はブロックされうる、特に iOS Safari）
        const previewWindow = window.open("", "_blank")
        if (previewWindow) {
            // 空タブにローディング表示を書き込む（真っ白→「生成中」に。生成後 location.href で差し替え）
            previewWindow.document.write(`<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PDFプレビュー</title>
<style>
  body { margin:0; height:100vh; display:flex; flex-direction:column;
    align-items:center; justify-content:center; font-family:
    -apple-system, BlinkMacSystemFont, "Hiragino Sans", sans-serif;
    color:#334155; background:#f8fafc; }
  .spinner { width:40px; height:40px; border:4px solid #cbd5e1;
    border-top-color:#2563eb; border-radius:50%;
    animation:spin 0.8s linear infinite; margin-bottom:16px; }
  @keyframes spin { to { transform:rotate(360deg); } }
  .msg { font-size:15px; }
</style></head>
<body><div class="spinner"></div>
<div class="msg">PDFを生成しています…</div></body></html>`)
            previewWindow.document.close()
        }
        try {
            const blob = await generatePdfBlob()
            const url = window.URL.createObjectURL(blob)
            if (previewWindow) {
                // 開いておいたタブに生成PDFを流し込む
                previewWindow.location.href = url
            } else {
                // ポップアップが完全に無効な場合のフォールバック（従来どおり開く）
                window.open(url, "_blank")
            }
            // タブが PDF を読み込んだ後に解放（表示は妨げない）
            window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000)
        } catch (err) {
            if (previewWindow) previewWindow.close()
            setError(pdfErrorText(err, "PDFプレビューの生成に失敗しました。"))
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
            a.download = `泡消火設備点検票_${formName || "bekki5"}.pdf`
            document.body.appendChild(a)
            a.click()
            a.remove()
            window.URL.revokeObjectURL(url)
        } catch (err) {
            setError(pdfErrorText(err, "PDFダウンロードに失敗しました。"))
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

    const renderItemTable = (
        title: string,
        labels: readonly string[],
        rows: RowState[],
        setter: Dispatch<SetStateAction<RowState[]>>,
        // ★位置指定にしない。同型の optional number を並べると、渡し忘れ・順序ずれを
        //   型検査が拾えない（過去に `undefined, new Set([7])` の順序ずれを踏んでいる）。
        special?: {
            currentValueRow?: number
            perfRow?: number
            hoseRow?: number
            pressureSwitchRow?: number
        },
    ) => {
    const currentValueRowIndex = special?.currentValueRow
    const perfRowIndex = special?.perfRow
    const hoseRowIndex = special?.hoseRow
    const pressureSwitchRowIndex = special?.pressureSwitchRow
    const markAllGood = () => setter((prev) => prev.map((row) => (row.judgment === "" ? { ...row, judgment: "良" } : row)))
    return (
        <Card>
            <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                        <CardTitle>{title}</CardTitle>
                        <CardDescription>種別・容量などの内容、判定、不良内容、措置内容を入力してください。</CardDescription>
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
                                <th className="p-2 border w-64 text-left">点検項目</th>
                                <th className="p-2 border w-64 text-left">種別・容量等の内容</th>
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
                                        {idx === hoseRowIndex ? (
                                            <div className="flex gap-1 items-center flex-wrap">
                                                <Input
                                                    value={rows[idx].content}
                                                    onChange={(e) => updateRowField(setter, idx, "content", e.target.value)}
                                                    placeholder="長さ(m)"
                                                    className="w-16"
                                                />
                                                <span className="text-xs text-muted-foreground">m ×</span>
                                                <Input
                                                    value={rows[idx].hose_count}
                                                    onChange={(e) => updateRowField(setter, idx, "hose_count", e.target.value)}
                                                    placeholder="本数"
                                                    className="w-14"
                                                />
                                                <span className="text-xs text-muted-foreground">本 /</span>
                                                <Input
                                                    value={rows[idx].nozzle_dia}
                                                    onChange={(e) => updateRowField(setter, idx, "nozzle_dia", e.target.value)}
                                                    placeholder="口径(mm)"
                                                    className="w-16"
                                                />
                                                <span className="text-xs text-muted-foreground">mm</span>
                                            </div>
                                        ) : idx === perfRowIndex ? (
                                            <div className="flex gap-1 items-center">
                                                <Input
                                                    value={rows[idx].content}
                                                    onChange={(e) => updateRowField(setter, idx, "content", e.target.value)}
                                                    placeholder="吐出圧力(MPa)"
                                                    className="w-24"
                                                />
                                                <span className="text-xs text-muted-foreground">MPa</span>
                                                <Input
                                                    value={rows[idx].flow_value}
                                                    onChange={(e) => updateRowField(setter, idx, "flow_value", e.target.value)}
                                                    placeholder="吐出量(L/min)"
                                                    className="w-24"
                                                />
                                                <span className="text-xs text-muted-foreground">L/min</span>
                                            </div>
                                        ) : idx === pressureSwitchRowIndex ? (
                                            <div className="flex gap-1 items-center">
                                                <Input
                                                    value={rows[idx].content}
                                                    onChange={(e) => updateRowField(setter, idx, "content", e.target.value)}
                                                    placeholder="設定圧力(MPa)"
                                                    className="w-24"
                                                />
                                                <span className="text-xs text-muted-foreground">MPa</span>
                                                <Input
                                                    value={rows[idx].current_value}
                                                    onChange={(e) => updateRowField(setter, idx, "current_value", e.target.value)}
                                                    placeholder="作動圧力(MPa)"
                                                    className="w-24"
                                                />
                                                <span className="text-xs text-muted-foreground">MPa</span>
                                            </div>
                                        ) : idx === currentValueRowIndex ? (
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
                                                placeholder="種別・容量等の内容"
                                            />
                                        )}
                                    </td>
                                    <td className="p-1 border">
                                        <select
                                            className="w-full h-8 border rounded px-2"
                                            value={rows[idx].judgment}
                                            onChange={(e) => updateRowField(setter, idx, "judgment", e.target.value)}
                                        >
                                            <option value="">未選択</option>
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

                {/* Mobile: card layout */}
                <div className="md:hidden space-y-3">
                    {labels.map((label, idx) => (
                        <div key={`${title}-${label}-mobile`} className="border rounded-lg p-3 space-y-2 bg-white">
                            <div className="font-medium text-sm text-slate-800">{label}</div>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                    <span className="text-xs text-slate-500">内容</span>
                                    {idx === hoseRowIndex ? (
                                        <div className="flex gap-1 items-center flex-wrap">
                                            <Input
                                                value={rows[idx].content}
                                                onChange={(e) => updateRowField(setter, idx, "content", e.target.value)}
                                                placeholder="長さ(m)"
                                                className="h-9 w-16 text-sm"
                                            />
                                            <span className="text-xs text-muted-foreground">m ×</span>
                                            <Input
                                                value={rows[idx].hose_count}
                                                onChange={(e) => updateRowField(setter, idx, "hose_count", e.target.value)}
                                                placeholder="本数"
                                                className="h-9 w-14 text-sm"
                                            />
                                            <span className="text-xs text-muted-foreground">本 /</span>
                                            <Input
                                                value={rows[idx].nozzle_dia}
                                                onChange={(e) => updateRowField(setter, idx, "nozzle_dia", e.target.value)}
                                                placeholder="口径(mm)"
                                                className="h-9 w-16 text-sm"
                                            />
                                            <span className="text-xs text-muted-foreground">mm</span>
                                        </div>
                                    ) : idx === perfRowIndex ? (
                                        <div className="flex gap-1 items-center flex-wrap">
                                            <Input
                                                value={rows[idx].content}
                                                onChange={(e) => updateRowField(setter, idx, "content", e.target.value)}
                                                placeholder="吐出圧力(MPa)"
                                                className="h-9 w-24 text-sm"
                                            />
                                            <span className="text-xs text-muted-foreground">MPa</span>
                                            <Input
                                                value={rows[idx].flow_value}
                                                onChange={(e) => updateRowField(setter, idx, "flow_value", e.target.value)}
                                                placeholder="吐出量(L/min)"
                                                className="h-9 w-24 text-sm"
                                            />
                                            <span className="text-xs text-muted-foreground">L/min</span>
                                        </div>
                                    ) : idx === pressureSwitchRowIndex ? (
                                        <div className="flex gap-1 items-center flex-wrap">
                                            <Input
                                                value={rows[idx].content}
                                                onChange={(e) => updateRowField(setter, idx, "content", e.target.value)}
                                                placeholder="設定圧力(MPa)"
                                                className="h-9 w-24 text-sm"
                                            />
                                            <span className="text-xs text-muted-foreground">MPa</span>
                                            <Input
                                                value={rows[idx].current_value}
                                                onChange={(e) => updateRowField(setter, idx, "current_value", e.target.value)}
                                                placeholder="作動圧力(MPa)"
                                                className="h-9 w-24 text-sm"
                                            />
                                            <span className="text-xs text-muted-foreground">MPa</span>
                                        </div>
                                    ) : idx === currentValueRowIndex ? (
                                        <div className="flex gap-1 items-center flex-wrap">
                                            <Input
                                                value={rows[idx].content}
                                                onChange={(e) => updateRowField(setter, idx, "content", e.target.value)}
                                                placeholder="電圧(V)"
                                                className="h-9 w-20 text-sm"
                                            />
                                            <span className="text-xs text-muted-foreground">V</span>
                                            <Input
                                                value={rows[idx].current_value}
                                                onChange={(e) => updateRowField(setter, idx, "current_value", e.target.value)}
                                                placeholder="電流(A)"
                                                className="h-9 w-20 text-sm"
                                            />
                                            <span className="text-xs text-muted-foreground">A</span>
                                        </div>
                                    ) : (
                                        <Input
                                            value={rows[idx].content}
                                            onChange={(e) => updateRowField(setter, idx, "content", e.target.value)}
                                            placeholder="種別・容量等の内容"
                                            className="h-9 text-sm"
                                        />
                                    )}
                                </div>
                                <div className="space-y-1">
                                    <span className="text-xs text-slate-500">判定</span>
                                    <select
                                        className="w-full h-9 border border-input rounded-md bg-background px-2 text-sm"
                                        value={rows[idx].judgment}
                                        onChange={(e) => updateRowField(setter, idx, "judgment", e.target.value)}
                                    >
                                        <option value="">未選択</option>
                                        <option value="良">良</option>
                                        <option value="否">否</option>
                                    </select>
                                </div>
                            </div>
                            {(rows[idx].judgment === "否" || rows[idx].bad_content || rows[idx].action_content) && (
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <span className="text-xs text-slate-500">不良内容</span>
                                        <Input
                                            value={rows[idx].bad_content}
                                            onChange={(e) => updateRowField(setter, idx, "bad_content", e.target.value)}
                                            placeholder="不良内容"
                                            className="h-9 text-sm"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-xs text-slate-500">措置内容</span>
                                        <Input
                                            value={rows[idx].action_content}
                                            onChange={(e) => updateRowField(setter, idx, "action_content", e.target.value)}
                                            placeholder="措置内容"
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
                    <CardTitle>泡消火設備点検票（別記様式5）入力</CardTitle>
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
                        <div className="space-y-1 min-w-0">
                            <Label>点検年月日（開始）</Label>
                            <Input type="date" className="min-w-0" value={toDateInputValue(periodStart)} onChange={(e) => setPeriodStart(e.target.value)} />
                        </div>
                        <div className="space-y-1 min-w-0">
                            <Label>点検年月日（終了）</Label>
                            <Input type="date" className="min-w-0" value={toDateInputValue(periodEnd)} onChange={(e) => setPeriodEnd(e.target.value)} />
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

                    <div className="grid md:grid-cols-7 gap-4">
                        <div className="space-y-1">
                            <Label>点検設備名</Label>
                            <Input value={equipmentName} onChange={(e) => setEquipmentName(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>ポンプ製造者名</Label>
                            <Input value={pumpMaker} onChange={(e) => setPumpMaker(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>ポンプ型式</Label>
                            <Input value={pumpModel} onChange={(e) => setPumpModel(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>電動機製造者名</Label>
                            <Input value={motorMaker} onChange={(e) => setMotorMaker(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>電動機型式</Label>
                            <Input value={motorModel} onChange={(e) => setMotorModel(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>泡消火薬剤製造者名</Label>
                            <Input value={foamMaker} onChange={(e) => setFoamMaker(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>泡合成器型式</Label>
                            <Input value={foamModel} onChange={(e) => setFoamModel(e.target.value)} />
                        </div>
                        {/* ★正典（令和6年9月10日最終改正）で（その3）消火薬剤欄に新設された刷り込み
                            「（泡第 __ ～ __ 号）」の2つの空欄。範囲でない場合は開始側だけ入れる */}
                        <div className="space-y-1">
                            <Label>消火薬剤 型式番号（泡第 ○ 〜）</Label>
                            <Input value={foamTypeNoFrom} onChange={(e) => setFoamTypeNoFrom(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>消火薬剤 型式番号（〜 ○ 号）</Label>
                            <Input value={foamTypeNoTo} onChange={(e) => setFoamTypeNoTo(e.target.value)} />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {renderItemTable("（その1）点検結果", PAGE1_ITEMS, page1Rows, setPage1Rows, { currentValueRow: 11 })}
            {renderItemTable("（その2）点検結果", PAGE2_ITEMS, page2Rows, setPage2Rows, { perfRow: 19 })}
            {/* 12 = 圧力スイッチ。様式が「設定圧力 MPa / 作動圧力 MPa」の2値を求める行 */}
            {renderItemTable("（その3）点検結果", PAGE3_ITEMS, page3Rows, setPage3Rows, { hoseRow: 21, pressureSwitchRow: 12 })}
            {renderItemTable("（その4）総合点検", PAGE4_ITEMS, page4Rows, setPage4Rows)}

            <Card>
                <CardHeader>
                    <CardTitle>備考・測定機器</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="space-y-1">
                        <Label>備考</Label>
                        <Textarea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} />
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
