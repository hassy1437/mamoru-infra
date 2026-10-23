"use client"

import { isBekkiHeadingLabel } from "@/lib/bekki-heading-row"
import { BekkiHeadingCard, BekkiHeadingTableRow } from "@/components/bekki-heading-row"
import { bekkiPeriodDefault } from "@/lib/bekki-period"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { applyBulkGood } from "@/lib/bekki-bulk-good"
import { BekkiBulkGoodButton } from "@/components/bekki-bulk-good-button"
import { isJudgmentsDefaulted } from "@/lib/bekki-default-good"
import { defectPhraseListId } from "@/lib/defect-phrases"
import { DefectPhraseDatalists } from "@/components/defect-phrase-datalists"
import { WRAP_CLS, bindLabelBreaks } from "@/components/row-label"
import { Input } from "@/components/ui/input"
import { BekkiInspectionTypeInput } from "@/components/bekki-inspection-type-input"
import { BekkiChoiceCheckboxes } from "@/components/bekki-choice-checkboxes"
import { choiceRowsOf, type ChoiceRow } from "@/lib/bekki-choice-rows"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCheck, Eye, FileDown, Loader2, Save } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { bekkiInspectionTypeDefault } from "@/lib/bekki-inspection-type"
import { toDateInputValue } from "@/lib/date-utils"
import {
    normalizeBekkiInspectorNameForPayload,
    normalizeBekkiInspectorNameForState,
    normalizeBekkiWitnessForPayload,
    normalizeBekkiWitnessForState,
} from "@/lib/bekki-form-normalization"
import { bekkiWitnessInitial } from "@/lib/bekki-witness"
import CameraInput from "@/components/camera-input"
import JudgmentButtons from "@/components/judgment-buttons"
import DeviceTableInputs from "@/components/device-table-inputs"
import { resolveDeviceTable, type DeviceTableRow } from "@/lib/bekki-device-table"
import { pdfRequestError, pdfErrorText } from "@/lib/pdf-request-error"
import { PDF_FIT_FRAGMENT, openInAppPdfPreview, prefersInAppPdfViewer } from "@/lib/pdf-preview-mode"
import { soukatsuPdfGate } from "@/lib/pdf-gate-client"
import { CODE_INPUT_PROPS } from "@/lib/code-input-props"
import CopyTextFromPhotoHint from "@/components/copy-text-from-photo-hint"
import { useAutoSave } from "@/hooks/use-auto-save"
import FormActionBar from "@/components/form-action-bar"
import InspectorSyncNotice from "@/components/inspector-sync-notice"

type RowState = {
    content: string
    judgment: string
    bad_content: string
    action_content: string
    current_value: string  // 電圧計・電流計行の電流値（A）
    flow_value: string     // ポンプ性能行の吐出量（L/min）
    hose_count: string     // ホース行の本数（content は長さ）
    nozzle_dia: string     // ホース行のノズル径（mm）
}

type DeviceState = {
    name: string
    model: string
    calibrated_at: string
    maker: string
}

type ShokasenBekki2Payload = {
    /** ★判定が初期値（良）のままか（2026-10-20・録音 102・src/lib/bekki-default-good.ts） */
    judgments_defaulted?: boolean
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
    /** 測定機器の 3 行 × 左右（6 台・lib/bekki-device-table.ts）。device1/device2 は古い保存の形（いまは空で保存する） */
    device_table: DeviceTableRow[]
}

interface Props {
    initial: {
        building_name?: string | null
        building_address?: string | null
        notifier_name?: string | null
        fire_manager_name?: string | null
        inspector_name?: string | null
        inspector_company?: string | null
        inspector_address?: string | null
        inspector_tel?: string | null
        inspection_date?: string | null
        /** 総括表の点検期間。別記の期間の初期値にする（src/lib/bekki-period.ts） */
        inspection_period_start?: string | null
        inspection_period_end?: string | null
        /** 総括表の設備の行から引き継いだ立会者（点検票に保存が無いときの初期値・src/lib/bekki-witness.ts） */
        witness?: string | null
        inspection_type?: string | null
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

/**
 * （その3）のホース・ノズルの行（1号・易操作1/2号）。刷り込みが「ホース ___m× ___本 ｜ ノズル径 ___mm」で空欄が 3 つある。
 * ★入力欄が 1 つで「長さ/本数/口径」（例 20/2/19）と書く決まりが画面に無かった（2026-10-20・本番の通しチェック）。
 *   以前の保存（"/" 区切り）は読むときに 3 つへ分ける（ルートは新キーを優先し、無ければ "/" 区切りを読む）。
 */
const HOSE_ROW_INDEXES = [8, 9] as const
const splitLegacyHoseRow = (row: RowState): RowState => {
    if (row.hose_count || row.nozzle_dia || !row.content.includes("/")) return row
    const [len = "", count = "", dia = ""] = row.content.split("/").map((v) => v.trim())
    return { ...row, content: len, hose_count: count, nozzle_dia: dia }
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
    const [fireManager, setFireManager] = useState(coerceString(saved.fire_manager, initial.fire_manager_name ?? ""))
    const [witness, setWitness] = useState(normalizeBekkiWitnessForState(bekkiWitnessInitial(saved.witness, initial.witness)))
    const [location, setLocation] = useState(coerceString(saved.location, initial.building_address ?? ""))
    const [inspectionType, setInspectionType] = useState(coerceString(saved.inspection_type, bekkiInspectionTypeDefault(initial.inspection_type)))
    const [periodStart, setPeriodStart] = useState(coerceString(saved.period_start, bekkiPeriodDefault(initial).start))
    const [periodEnd, setPeriodEnd] = useState(coerceString(saved.period_end, bekkiPeriodDefault(initial).end))
    const [inspectorName, setInspectorName] = useState(normalizeBekkiInspectorNameForState(coerceString(saved.inspector_name, initial.inspector_name ?? "")))
    const [inspectorCompany, setInspectorCompany] = useState(coerceString(saved.inspector_company, initial.inspector_company ?? ""))
    const [inspectorAddress, setInspectorAddress] = useState(coerceString(saved.inspector_address, initial.inspector_address ?? ""))
    const [inspectorTel, setInspectorTel] = useState(coerceString(saved.inspector_tel, initial.inspector_tel ?? ""))
    // ★入力欄は出さない（印字先が無い・#20）。保存済みの値は捨てずに運ぶだけ
    const [equipmentName] = useState(coerceString(saved.equipment_name))
    const [pumpMaker, setPumpMaker] = useState(coerceString(saved.pump_maker))
    const [pumpModel, setPumpModel] = useState(coerceString(saved.pump_model))
    const [motorMaker, setMotorMaker] = useState(coerceString(saved.motor_maker))
    const [motorModel, setMotorModel] = useState(coerceString(saved.motor_model))
    const [notes, setNotes] = useState(coerceString(saved.notes))

    // ★測定機器は紙の 3 行 × 左右（6 台）。古い保存（device1/device2）は 1 行目の左右に読む（ルートと同じ関数）
    const [deviceTableRows, setDeviceTableRows] = useState<DeviceTableRow[]>(() => resolveDeviceTable(saved, "plain"))
    const updateDeviceTableRow = (index: number, field: keyof DeviceTableRow, value: string) =>
        setDeviceTableRows((rows) => rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)))

    const [page1Rows, setPage1Rows] = useState<RowState[]>(() => hydrateRows(PAGE1_ITEMS.length, saved.page1_rows))
    const [page2Rows, setPage2Rows] = useState<RowState[]>(() => hydrateRows(PAGE2_ITEMS.length, saved.page2_rows))
    const [page3Rows, setPage3Rows] = useState<RowState[]>(() =>
        hydrateRows(PAGE3_ITEMS.length, saved.page3_rows).map((row, i) => ((HOSE_ROW_INDEXES as readonly number[]).includes(i) ? splitLegacyHoseRow(row) : row)))

    // ★判定の初期値「良」（2026-10-20・録音 102）。新しい様式は開いたときにボタンの部品が入れ、印を立てる
    const [judgmentsDefaulted, setJudgmentsDefaulted] = useState(() => isJudgmentsDefaulted(saved))
    const [saving, setSaving] = useState(false)
    const [loadingPreview, setLoadingPreview] = useState(false)
    const [loadingDownload, setLoadingDownload] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [saveMessage, setSaveMessage] = useState<string | null>(
        formatSavedAt(savedUpdatedAt) ? `最終保存: ${formatSavedAt(savedUpdatedAt)}` : null
    )


    const payload = useMemo<ShokasenBekki2Payload>(() => ({
        judgments_defaulted: judgmentsDefaulted,
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
        // ★古い2行は空にして保存する（同じ機器を二重に持たない・ルートは device_table を読む）
        device1: createEmptyDevice(),
        device2: createEmptyDevice(),
        device_table: deviceTableRows,
    }), [
        judgmentsDefaulted,
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
        deviceTableRows,
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

        if (!response.ok) throw await pdfRequestError(response)

        return response.blob()
    }, [payload])

    const handlePreview = useCallback(async () => {
        // ★スマホ・タブレットはアプリの中で、ページ全体が見える形で出す（src/lib/pdf-preview-mode.ts）
        if (prefersInAppPdfViewer() && openInAppPdfPreview({ title: "屋内消火栓設備点検票のプレビュー", load: generatePdfBlob })) return
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
                previewWindow.location.href = url + PDF_FIT_FRAGMENT
            } else {
                // ポップアップが完全に無効な場合のフォールバック（従来どおり開く）
                window.open(url + PDF_FIT_FRAGMENT, "_blank")
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
            // ★点検票の PDF も確定してから（K2・業務提携規約 第12条2項・3項）。プレビューは止めない
            const gate = await soukatsuPdfGate(soukatsuId)
            if (gate) {
                setError(gate)
                return
            }
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
        } catch (err) {
            setError(pdfErrorText(err, "PDFダウンロードに失敗しました。"))
        } finally {
            setLoadingDownload(false)
        }
    }, [generatePdfBlob, formName, persistDraft, soukatsuId])

    // Auto-save on unmount (navigation away)
    const persistDraftRef = useRef(persistDraft)
    useEffect(() => { persistDraftRef.current = persistDraft }, [persistDraft])
    useEffect(() => {
        return () => { persistDraftRef.current(false) }
    }, [])
    // 自動保存: 入力が止まって 5 秒後と、別のアプリに切り替えた瞬間（src/hooks/use-auto-save.ts）
    useAutoSave(payload, () => persistDraftRef.current(false), () => setSaveMessage(`自動保存済み: ${new Date().toLocaleString("ja-JP")}`))



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
        perfRowIndex?: number,
        /** 選択肢の欄（専用・兼用など・src/lib/bekki-choice-rows.ts）。キーはこの表の中の行番号 */
        choiceRows?: Readonly<Record<number, ChoiceRow>>,
        /** ホース・ノズルの行（長さ・本数・口径の 3 つの欄） */
        hoseRowIndexes?: readonly number[],
    ) => {
    // 「すべて良にする」: このセクションで判定が空("")の行だけ "良" に（既存の良/否は触らない）
    const markAllGood = () => setter((prev) => prev.map((row, i) => (row.judgment === "" && !isBekkiHeadingLabel(labels[i] ?? "") ? { ...row, judgment: "良" } : row)))
    return (
        <Card>
            <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                        <CardTitle>{title}</CardTitle>
                        <CardDescription>種別・容量等の内容、判定、不良内容、措置内容を入力してください。</CardDescription>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={markAllGood} className="shrink-0 min-h-11 md:min-h-0">
                        <CheckCheck className="w-4 h-4 mr-1.5" />この表の空欄を良にする
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {/* Desktop: table layout */}
                <div className="hidden md:block overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm">
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
                            {labels.map((label, idx) => isBekkiHeadingLabel(label) ? (
                                <BekkiHeadingTableRow key={`${title}-heading-${idx}`} label={label} />
                            ) : (
                                <tr key={`${title}-${label}`}>
                                    <td className={`p-2 border ${WRAP_CLS}`}>{bindLabelBreaks(label)}</td>
                                    <td className="p-1 border">
                                        {hoseRowIndexes?.includes(idx) ? (
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-1">
                                                    <Input
                                                        value={rows[idx].content}
                                                        onChange={(e) => updateRowField(setter, idx, "content", e.target.value)}
                                                        placeholder="長さ"
                                                        inputMode="decimal"
                                                        aria-label={`${label} ホースの長さ(m)`}
                                                        className="w-16"
                                                    />
                                                    <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">m ×</span>
                                                    <Input
                                                        value={rows[idx].hose_count}
                                                        onChange={(e) => updateRowField(setter, idx, "hose_count", e.target.value)}
                                                        placeholder="本数"
                                                        inputMode="numeric"
                                                        aria-label={`${label} 本数`}
                                                        className="w-16"
                                                    />
                                                    <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">本</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">ノズル径</span>
                                                    <Input
                                                        value={rows[idx].nozzle_dia}
                                                        onChange={(e) => updateRowField(setter, idx, "nozzle_dia", e.target.value)}
                                                        placeholder="口径"
                                                        inputMode="decimal"
                                                        aria-label={`${label} ノズル径(mm)`}
                                                        className="w-16"
                                                    />
                                                    <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">mm</span>
                                                </div>
                                            </div>
                                        ) : idx === perfRowIndex ? (
                                            <div className="flex gap-1 items-center">
                                                <Input
                                                    value={rows[idx].content}
                                                    onChange={(e) => updateRowField(setter, idx, "content", e.target.value)}
                                                    placeholder="吐出圧力(MPa)"
                                                    inputMode="decimal"
                                                    className="w-24"
                                                />
                                                <span className="text-xs text-muted-foreground">MPa</span>
                                                <Input
                                                    value={rows[idx].flow_value}
                                                    onChange={(e) => updateRowField(setter, idx, "flow_value", e.target.value)}
                                                    placeholder="吐出量(L/min)"
                                                    inputMode="decimal"
                                                    className="w-24"
                                                />
                                                <span className="text-xs text-muted-foreground">L/min</span>
                                            </div>
                                        ) : idx === currentValueRowIndex ? (
                                            <div className="flex gap-1 items-center">
                                                <Input
                                                    value={rows[idx].content}
                                                    onChange={(e) => updateRowField(setter, idx, "content", e.target.value)}
                                                    placeholder="電圧(V)"
                                                    inputMode="decimal"
                                                    className="w-20"
                                                />
                                                <span className="text-xs text-muted-foreground">V</span>
                                                <Input
                                                    value={rows[idx].current_value}
                                                    onChange={(e) => updateRowField(setter, idx, "current_value", e.target.value)}
                                                    placeholder="電流(A)"
                                                    inputMode="decimal"
                                                    className="w-20"
                                                />
                                                <span className="text-xs text-muted-foreground">A</span>
                                            </div>
                                        ) : choiceRows?.[idx] ? (
                                            <BekkiChoiceCheckboxes
                                                row={choiceRows[idx]}
                                                value={rows[idx].content}
                                                onChange={(next) => updateRowField(setter, idx, "content", next)}
                                                ariaLabel={`${label}（選択）`}
                                            />
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
                                            list={defectPhraseListId("bad", label)}
                                            placeholder="不良内容"
                                        />
                                    </td>
                                    <td className="p-1 border">
                                        <Input
                                            value={rows[idx].action_content}
                                            onChange={(e) => updateRowField(setter, idx, "action_content", e.target.value)}
                                            list={defectPhraseListId("action", label)}
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
                    {labels.map((label, idx) => isBekkiHeadingLabel(label) ? (
                        <BekkiHeadingCard key={`${title}-heading-${idx}-mobile`} label={label} />
                    ) : (
                        <div key={`${title}-${label}-mobile`} className="border rounded-lg p-3 space-y-2 bg-white">
                            <div className={`font-medium text-sm text-slate-800 ${WRAP_CLS}`}>{bindLabelBreaks(label)}</div>
                            {/* ★内容の欄が分かれる行・選ぶ欄の行は、スマホでは内容と判定をそれぞれ横幅いっぱいに置く（2026-10-20） */}
                            <div className="grid grid-cols-2 gap-2">
                                <div className={`space-y-1 min-w-0 ${hoseRowIndexes?.includes(idx) || idx === perfRowIndex || idx === currentValueRowIndex || Boolean(choiceRows?.[idx]) ? "col-span-2" : ""}`}>
                                    <span className="text-xs text-slate-500">内容</span>
                                    {hoseRowIndexes?.includes(idx) ? (
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1">
                                                <Input
                                                    value={rows[idx].content}
                                                    onChange={(e) => updateRowField(setter, idx, "content", e.target.value)}
                                                    placeholder="長さ"
                                                    inputMode="decimal"
                                                    aria-label={`${label} ホースの長さ(m)`}
                                                    className="h-9 w-12 px-2 text-sm"
                                                />
                                                <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">m ×</span>
                                                <Input
                                                    value={rows[idx].hose_count}
                                                    onChange={(e) => updateRowField(setter, idx, "hose_count", e.target.value)}
                                                    placeholder="本数"
                                                    inputMode="numeric"
                                                    aria-label={`${label} 本数`}
                                                    className="h-9 w-12 px-2 text-sm"
                                                />
                                                <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">本</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">ノズル径</span>
                                                <Input
                                                    value={rows[idx].nozzle_dia}
                                                    onChange={(e) => updateRowField(setter, idx, "nozzle_dia", e.target.value)}
                                                    placeholder="口径"
                                                    inputMode="decimal"
                                                    aria-label={`${label} ノズル径(mm)`}
                                                    className="h-9 w-12 px-2 text-sm"
                                                />
                                                <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">mm</span>
                                            </div>
                                        </div>
                                    ) : idx === perfRowIndex ? (
                                        <div className="flex gap-1 items-center flex-wrap">
                                            <Input
                                                value={rows[idx].content}
                                                onChange={(e) => updateRowField(setter, idx, "content", e.target.value)}
                                                placeholder="吐出圧力(MPa)"
                                                inputMode="decimal"
                                                className="h-9 w-24 text-sm"
                                            />
                                            <span className="text-xs text-muted-foreground">MPa</span>
                                            <Input
                                                value={rows[idx].flow_value}
                                                onChange={(e) => updateRowField(setter, idx, "flow_value", e.target.value)}
                                                placeholder="吐出量(L/min)"
                                                inputMode="decimal"
                                                className="h-9 w-24 text-sm"
                                            />
                                            <span className="text-xs text-muted-foreground">L/min</span>
                                        </div>
                                    ) : idx === currentValueRowIndex ? (
                                        <div className="flex gap-1 items-center flex-wrap">
                                            <Input
                                                value={rows[idx].content}
                                                onChange={(e) => updateRowField(setter, idx, "content", e.target.value)}
                                                placeholder="電圧(V)"
                                                inputMode="decimal"
                                                className="h-9 w-20 text-sm"
                                            />
                                            <span className="text-xs text-muted-foreground">V</span>
                                            <Input
                                                value={rows[idx].current_value}
                                                onChange={(e) => updateRowField(setter, idx, "current_value", e.target.value)}
                                                placeholder="電流(A)"
                                                inputMode="decimal"
                                                className="h-9 w-20 text-sm"
                                            />
                                            <span className="text-xs text-muted-foreground">A</span>
                                        </div>
                                    ) : choiceRows?.[idx] ? (
                                        <BekkiChoiceCheckboxes
                                            row={choiceRows[idx]}
                                            value={rows[idx].content}
                                            onChange={(next) => updateRowField(setter, idx, "content", next)}
                                            ariaLabel={`${label}（選択）`}
                                        />
                                    ) : (
                                        <Input
                                            value={rows[idx].content}
                                            onChange={(e) => updateRowField(setter, idx, "content", e.target.value)}
                                            placeholder="種別・容量等"
                                            className="h-9 text-sm"
                                        />
                                    )}
                                </div>
                                <div className={`space-y-1 min-w-0 ${hoseRowIndexes?.includes(idx) || idx === perfRowIndex || idx === currentValueRowIndex || Boolean(choiceRows?.[idx]) ? "col-span-2" : ""}`}>
                                    <span className="text-xs text-slate-500">判定</span>
                                    <JudgmentButtons
                                        value={rows[idx].judgment}
                                        onChange={(v) => updateRowField(setter, idx, "judgment", v)}
                                        label={label}
                                    />
                                </div>
                            </div>
                            {(rows[idx].judgment === "否" || rows[idx].bad_content || rows[idx].action_content) && (
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <span className="text-xs text-slate-500">不良内容</span>
                                        <Input
                                            value={rows[idx].bad_content}
                                            onChange={(e) => updateRowField(setter, idx, "bad_content", e.target.value)}
                                            list={defectPhraseListId("bad", label)}
                                            placeholder="不良内容"
                                            className="h-9 text-sm"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-xs text-slate-500">措置内容</span>
                                        <Input
                                            value={rows[idx].action_content}
                                            onChange={(e) => updateRowField(setter, idx, "action_content", e.target.value)}
                                            list={defectPhraseListId("action", label)}
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
        <div className="space-y-6" data-form-action-root>
            {/* 点検者が点検者一覧表と違うときの知らせ（録音 102・src/components/inspector-sync-notice.tsx） */}
            <InspectorSyncNotice
                current={{ name: inspectorName, company: inspectorCompany, address: inspectorAddress, tel: inspectorTel }}
                fromItiran={{ name: initial.inspector_name, company: initial.inspector_company, address: initial.inspector_address, tel: initial.inspector_tel }}
                onApply={(next) => {
                    if (next.name !== undefined) setInspectorName(next.name)
                    if (next.company !== undefined) setInspectorCompany(next.company)
                    if (next.address !== undefined) setInspectorAddress(next.address)
                    if (next.tel !== undefined) setInspectorTel(next.tel)
                }}
            />
            {/* ★様式の頭に 1 つ。表ごとの「この表の空欄を良にする」は残す（#101）。機器点検だけのときは総合点検の行に入れない */}
            <BekkiBulkGoodButton
                fresh={savedPayload == null}
                defaulted={judgmentsDefaulted}
                onDefaultedChange={setJudgmentsDefaulted}
                form="別記様式第2"
                inspectionType={inspectionType}
                sections={[
                    { key: "page1_rows", labels: PAGE1_ITEMS, rows: page1Rows },
                    { key: "page2_rows", labels: PAGE2_ITEMS, rows: page2Rows },
                    { key: "page3_rows", labels: PAGE3_ITEMS, rows: page3Rows },
                ]}
                onApply={(targets) => {
                    setPage1Rows((prev) => applyBulkGood(prev, targets.page1_rows))
                    setPage2Rows((prev) => applyBulkGood(prev, targets.page2_rows))
                    setPage3Rows((prev) => applyBulkGood(prev, targets.page3_rows))
                }}
            />
            {/* 不良内容・措置内容の候補（自由入力のまま・src/lib/defect-phrases.ts） */}
            <DefectPhraseDatalists />
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
                            <BekkiInspectionTypeInput value={inspectionType} onChange={setInspectionType} />
                        </div>
                        <div className="space-y-1 min-w-0">
                            <Label>点検期間（開始）</Label>
                            <Input type="date" className="min-w-0" value={toDateInputValue(periodStart)} onChange={(e) => setPeriodStart(e.target.value)} />
                        </div>
                        <div className="space-y-1 min-w-0">
                            <Label>点検期間（終了）</Label>
                            <Input type="date" className="min-w-0" value={toDateInputValue(periodEnd)} onChange={(e) => setPeriodEnd(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>TEL</Label>
                            <Input type="tel" autoComplete="tel" value={inspectorTel} onChange={(e) => setInspectorTel(e.target.value)} />
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

                    <CopyTextFromPhotoHint />
                    {/* ★「設備名」の入力欄は出さない（#20）。紙の「点検設備名」はポンプ・電動機の製造者名／型式の
                        行見出しで、自由に設備名を書く欄が無い（ルートも描かない＝入れても載らなかった） */}
                    <div className="grid md:grid-cols-4 gap-4">
                        <div className="space-y-1">
                            <Label>ポンプ 製造者名</Label>
                            <Input value={pumpMaker} onChange={(e) => setPumpMaker(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>ポンプ 型式等</Label>
                            <Input {...CODE_INPUT_PROPS} value={pumpModel} onChange={(e) => setPumpModel(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>電動機 製造者名</Label>
                            <Input value={motorMaker} onChange={(e) => setMotorMaker(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>電動機 型式等</Label>
                            <Input {...CODE_INPUT_PROPS} value={motorModel} onChange={(e) => setMotorModel(e.target.value)} />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {renderItemTable("（その1）機器点検", PAGE1_ITEMS, page1Rows, setPage1Rows, 10)}
            {renderItemTable("（その2）機器点検", PAGE2_ITEMS, page2Rows, setPage2Rows, undefined, 24, choiceRowsOf("/api/generate-shokasen-bekki2-pdf", "page2_rows"))}
            {renderItemTable("（その3）配管等・総合点検", PAGE3_ITEMS, page3Rows, setPage3Rows, undefined, undefined, choiceRowsOf("/api/generate-shokasen-bekki2-pdf", "page3_rows"), HOSE_ROW_INDEXES)}

            <Card>
                <CardHeader>
                    <CardTitle>備考・測定機器</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="space-y-1">
                        <Label>備考</Label>
                        <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
                    </div>

                    <DeviceTableInputs kind="plain" rows={deviceTableRows} onChange={updateDeviceTableRow} />
                </CardContent>
            </Card>

            {/* 点検写真 */}
            <Card>
                <CardContent className="pt-6">
                    <CameraInput itiranId={itiranId} />
                </CardContent>
            </Card>

            <div className="flex gap-2 flex-wrap items-center">
                <Button type="button" onClick={handleSave} disabled={busy} className="min-h-11 md:min-h-0 bg-slate-700 hover:bg-slate-800 text-white">
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    保存
                </Button>
                <Button type="button" onClick={handlePreview} disabled={busy} className="min-h-11 md:min-h-0 bg-blue-600 hover:bg-blue-700 text-white">
                    {loadingPreview ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Eye className="w-4 h-4 mr-2" />}
                    プレビュー
                </Button>
                <Button type="button" onClick={handleDownload} disabled={busy} className="min-h-11 md:min-h-0 bg-emerald-600 hover:bg-emerald-700 text-white">
                    {loadingDownload ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileDown className="w-4 h-4 mr-2" />}
                    PDFダウンロード
                </Button>
                {saveMessage && <span className="text-sm text-slate-500">{saveMessage}</span>}
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            {/* スマホの画面下の帯（保存・プレビュー・表へ移動・保存の状態） */}
            <FormActionBar onSave={handleSave} onPreview={handlePreview} busy={busy} saving={saving} previewing={loadingPreview} message={saveMessage} error={error} />
        </div>
    )
}
