"use client"

import { isBekkiHeadingLabel } from "@/lib/bekki-heading-row"
import { BekkiHeadingCard, BekkiHeadingTableRow } from "@/components/bekki-heading-row"
import { bekkiPeriodDefault } from "@/lib/bekki-period"
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react"
import { BEKKI_ROW_NOTES } from "@/lib/bekki-row-notes"
import { WRAP_CLS, bindLabelBreaks } from "@/components/row-label"
import { RowNote } from "@/components/row-note"
import { Button } from "@/components/ui/button"
import { DOWNLOAD_BUTTON, PREVIEW_BUTTON, SAVE_BUTTON } from "@/lib/action-button"
import { applyBulkGood } from "@/lib/bekki-bulk-good"
import { BekkiBulkGoodButton } from "@/components/bekki-bulk-good-button"
import { isJudgmentsDefaulted } from "@/lib/bekki-default-good"
import { defectPhraseListId } from "@/lib/defect-phrases"
import { DefectPhraseDatalists } from "@/components/defect-phrase-datalists"
import { Input } from "@/components/ui/input"
import MeasureHeaderInputs from "@/components/measure-header-inputs"
import { initialMeasureHeaders, rowOwnMeasure, stripRowsCoveredByHeaders, type MeasureHeader } from "@/lib/measure-headers"
import { BekkiInspectionTypeInput } from "@/components/bekki-inspection-type-input"
import { BekkiChoiceCheckboxes } from "@/components/bekki-choice-checkboxes"
import { EQUIPMENT_SYSTEM_CHOICES, choiceRowsOf } from "@/lib/bekki-choice-rows"
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
import { pdfErrorText } from "@/lib/pdf-request-error"
import { fetchPdf } from "@/lib/pdf-client"
import { PDF_FIT_FRAGMENT, openInAppPdfPreview, prefersInAppPdfViewer } from "@/lib/pdf-preview-mode"
import { soukatsuPdfGate } from "@/lib/pdf-gate-client"
import { CODE_INPUT_PROPS } from "@/lib/code-input-props"
import { useAutoSave } from "@/hooks/use-auto-save"
import FormActionBar from "@/components/form-action-bar"
import InspectorSyncNotice from "@/components/inspector-sync-notice"

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
    // 後方互換用（旧データは単一値テキスト、新規入力は _date/_value 経由）
    measure1: string
    measure2: string
    measure3: string
    measure4: string
    measure5: string
    measure6: string
    // 6回ぶんの (date, value) ペア
    measure1_date: string
    measure1_value: string
    measure2_date: string
    measure2_value: string
    measure3_date: string
    measure3_value: string
    measure4_date: string
    measure4_value: string
    measure5_date: string
    measure5_value: string
    measure6_date: string
    measure6_value: string
}

type PowderBekki8Payload = {
    /** ★判定が初期値（良）のままか（2026-10-20・録音 102・src/lib/bekki-default-good.ts） */
    judgments_defaulted?: boolean
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
    /** 測定機器の 3 行 × 左右（6 台・lib/bekki-device-table.ts）。device1/device2 は古い保存の形（いまは空で保存する） */
    device_table: DeviceTableRow[]
    page5_rows: CylinderRowState[]
    /** その5 の測定の列の見出し（src/lib/measure-headers.ts） */
    measure_headers: MeasureHeader[]
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
    savedPayload?: Partial<PowderBekki8Payload> | null
    savedUpdatedAt?: string | null
}

const PAGE1_ITEMS = [
    "蓄圧式粉末消火剤貯蔵容器等 / 周囲の状況",
    "蓄圧式粉末消火剤貯蔵容器等 / 消火剤貯蔵容器 / 外形",
    "蓄圧式粉末消火剤貯蔵容器等 / 消火剤貯蔵容器 / 表示・標識",
    "蓄圧式粉末消火剤貯蔵容器等 / ※消火剤量",
    "蓄圧式粉末消火剤貯蔵容器等 / 容器弁 / 外形",
    "蓄圧式粉末消火剤貯蔵容器等 / 容器弁 / 安全性",
    "蓄圧式粉末消火剤貯蔵容器等 / 安全装置 / 外形",
    "蓄圧式粉末消火剤貯蔵容器等 / 安全装置 / 安全性",
    "蓄圧式粉末消火剤貯蔵容器等 / 容器弁開放装置 / 外形",
    "蓄圧式粉末消火剤貯蔵容器等 / 容器弁開放装置 / 電気式",
    "蓄圧式粉末消火剤貯蔵容器等 / 容器弁開放装置 / ガス圧式",
    "蓄圧式粉末消火剤貯蔵容器等 / 指示圧力計",
    "蓄圧式粉末消火剤貯蔵容器等 / バルブ類",
    "蓄圧式粉末消火剤貯蔵容器等 / 連結管・集合管",
    "加圧式粉末消火剤貯蔵容器等 / 消火剤貯蔵タンク / 周囲の状況",
    "加圧式粉末消火剤貯蔵容器等 / 消火剤貯蔵タンク / 外形",
    "加圧式粉末消火剤貯蔵容器等 / 消火剤貯蔵タンク / 表示・標識",
    "加圧式粉末消火剤貯蔵容器等 / 消火剤貯蔵タンク / 安全装置",
    "加圧式粉末消火剤貯蔵容器等 / 消火剤量（kg）",
    "加圧式粉末消火剤貯蔵容器等 / 放出弁",
    "加圧式粉末消火剤貯蔵容器等 / 放出弁開放装置 / 外形",
    "加圧式粉末消火剤貯蔵容器等 / 放出弁開放装置 / 電気式",
    "加圧式粉末消火剤貯蔵容器等 / 放出弁開放装置 / ガス圧式",
    "加圧式粉末消火剤貯蔵容器等 / バルブ類",
    "加圧用ガス容器等 / 加圧用ガス容器 / 周囲の状況",
    "加圧用ガス容器等 / 加圧用ガス容器 / 外形",
    "加圧用ガス容器等 / 加圧用ガス容器 / 表示",
    "加圧用ガス容器等 / ※ガス量",
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
    "加圧用ガス容器等 / 定圧作動装置",
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
    "制御盤 / 予備品等",
] as const

const PAGE3_ITEMS = [
    "配管等 / 管・管継手",
    "配管等 / 支持金具・つり金具",
    "配管の安全装置等 / 安全装置",
    "配管の安全装置等 / 破壊板",
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

// ★雛形のその5 は 20 行（2026-10-20 に 19 → 20。以前は 1 行目を使っていなかった・route の P5_ROW_BOUNDS）
const PAGE5_ROW_COUNT = 20

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
    measure1_date: "",
    measure1_value: "",
    measure2_date: "",
    measure2_value: "",
    measure3_date: "",
    measure3_value: "",
    measure4_date: "",
    measure4_value: "",
    measure5_date: "",
    measure5_value: "",
    measure6_date: "",
    measure6_value: "",
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
        measure1_date: coerceString(source.measure1_date),
        measure1_value: coerceString(source.measure1_value),
        measure2_date: coerceString(source.measure2_date),
        measure2_value: coerceString(source.measure2_value),
        measure3_date: coerceString(source.measure3_date),
        measure3_value: coerceString(source.measure3_value),
        measure4_date: coerceString(source.measure4_date),
        measure4_value: coerceString(source.measure4_value),
        measure5_date: coerceString(source.measure5_date),
        measure5_value: coerceString(source.measure5_value),
        measure6_date: coerceString(source.measure6_date),
        measure6_value: coerceString(source.measure6_value),
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

const API_PATH = "/api/generate-powder-bekki8-pdf"

export default function PowderBekki8Form({
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
    const [notes, setNotes] = useState(coerceString(saved.notes))

    // ★測定機器は紙の 3 行 × 左右（6 台）。古い保存（device1/device2）は 1 行目の左右に読む（ルートと同じ関数）
    const [deviceTableRows, setDeviceTableRows] = useState<DeviceTableRow[]>(() => resolveDeviceTable(saved, "plain"))
    const updateDeviceTableRow = (index: number, field: keyof DeviceTableRow, value: string) =>
        setDeviceTableRows((rows) => rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)))

    const [page1Rows, setPage1Rows] = useState<RowState[]>(() => hydrateRows(PAGE1_ITEMS.length, saved.page1_rows))
    const [page2Rows, setPage2Rows] = useState<RowState[]>(() => hydrateRows(PAGE2_ITEMS.length, saved.page2_rows))
    const [page3Rows, setPage3Rows] = useState<RowState[]>(() => hydrateRows(PAGE3_ITEMS.length, saved.page3_rows))
    const [page4Rows, setPage4Rows] = useState<RowState[]>(() => hydrateRows(PAGE4_ITEMS.length, saved.page4_rows))
    // ★測定の列の見出し（点検年月日）。保存に無ければ、行の日付がそろっている測定はそれを初期値にする
    const [measureHeaders, setMeasureHeaders] = useState<MeasureHeader[]>(() =>
        initialMeasureHeaders(saved.measure_headers, (saved.page5_rows ?? []) as Record<string, unknown>[], 6))
    const [page5Rows, setPage5Rows] = useState<CylinderRowState[]>(() =>
        stripRowsCoveredByHeaders(hydrateCylinders(PAGE5_ROW_COUNT, saved.page5_rows), measureHeaders))

    // ★判定の初期値「良」（2026-10-20・録音 102）。新しい様式は開いたときにボタンの部品が入れ、印を立てる
    const [judgmentsDefaulted, setJudgmentsDefaulted] = useState(() => isJudgmentsDefaulted(saved))
    const [saving, setSaving] = useState(false)
    const [loadingPreview, setLoadingPreview] = useState(false)
    const [loadingDownload, setLoadingDownload] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [saveMessage, setSaveMessage] = useState<string | null>(
        formatSavedAt(savedUpdatedAt) ? `最終保存: ${formatSavedAt(savedUpdatedAt)}` : null
    )


    const payload = useMemo<PowderBekki8Payload>(() => ({
        judgments_defaulted: judgmentsDefaulted,
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
        // ★古い2行は空にして保存する（同じ機器を二重に持たない・ルートは device_table を読む）
        device1: createEmptyDevice(),
        device2: createEmptyDevice(),
        device_table: deviceTableRows,
        page5_rows: stripRowsCoveredByHeaders(page5Rows, measureHeaders),
        measure_headers: measureHeaders,
    }), [
        judgmentsDefaulted,
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
        deviceTableRows,
        page5Rows,
        measureHeaders,
    ])

    const persistDraft = useCallback(async (clearMessage = true) => {
        setError(null)
        if (clearMessage) setSaveMessage(null)

        const { error: saveError } = await supabase
            .from("inspection_powder_bekki8")
            .upsert({
                soukatsu_id: soukatsuId,
                itiran_id: itiranId,
                property_id: propertyId ?? null,
                payload,
                updated_at: new Date().toISOString(),
            }, { onConflict: "itiran_id" })

        if (saveError) {
            if (saveError.message.includes("inspection_powder_bekki8")) {
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
        const { blob } = await fetchPdf(API_PATH, payload)
        return blob
    }, [payload])

    const handlePreview = useCallback(async () => {
        // ★スマホ・タブレットはアプリの中で、ページ全体が見える形で出す（src/lib/pdf-preview-mode.ts）
        if (prefersInAppPdfViewer() && openInAppPdfPreview({ title: "粉末消火設備点検票のプレビュー", load: generatePdfBlob })) return
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
            const savedOk = await persistDraft(false)
            if (!savedOk) return

            const blob = await generatePdfBlob()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `粉末消火設備点検票_${formName || "bekki8"}.pdf`
            document.body.appendChild(a)
            a.click()
            a.remove()
            window.URL.revokeObjectURL(url)
        } catch (err) {
            setError(pdfErrorText(err, "PDFダウンロードに失敗しました。"))
        } finally {
            setLoadingDownload(false)
        }
    }, [formName, generatePdfBlob, persistDraft, soukatsuId])

    // Auto-save on unmount (navigation away)
    const persistDraftRef = useRef(persistDraft)
    useEffect(() => { persistDraftRef.current = persistDraft }, [persistDraft])
    useEffect(() => {
        return () => { persistDraftRef.current(false) }
    }, [])
    // 自動保存: 入力が止まって 5 秒後と、別のアプリに切り替えた瞬間（src/hooks/use-auto-save.ts）
    useAutoSave(payload, () => persistDraftRef.current(false), () => setSaveMessage(`自動保存済み: ${new Date().toLocaleString("ja-JP")}`))



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
    // ★同じ型の容器は仕様が同じ。iPhone で容器ごとに打ち直していたので、前の容器の仕様を 1 タップで写す（2026-10-20）
    const SPEC_KEYS = ["spec1", "spec2", "spec3"] as const
    const copySpecFromPrevious = (index: number) => {
        setPage5Rows((prev) => prev.map((row, i) => (
            i === index && i > 0 ? { ...row, ...Object.fromEntries(SPEC_KEYS.map((k) => [k, prev[i - 1][k]])) } : row
        )))
    }

    const renderItemTable = (
        title: string,
        labels: readonly string[],
        rows: RowState[],
        setter: Dispatch<SetStateAction<RowState[]>>,
        // ★どの様式のどの欄かが分からないと BEKKI_ROW_NOTES を引けない。
        //   共有ベースは section.key を持っているが、この3様式は専用フォームなので明示的に渡す。
        rowsKey: string,
    ) => {
    // 選択肢の欄（専用・兼用・src/lib/bekki-choice-rows.ts）
    const choiceRows = choiceRowsOf(API_PATH, rowsKey)
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
                                <th className="p-2 border w-80 text-left">点検項目</th>
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
                                <tr key={`${title}-${idx}`}>
                                    <td className={`p-2 border ${WRAP_CLS}`}>
                                        {bindLabelBreaks(label)}
                                        {/* ★※印の条件は様式の備考にしか書かれておらず、入力画面には
                                            出ていなかった（行ラベルに※はあるのに条件が無い状態）。
                                            文言は備考の原文のまま。言い換えると意味が変わる。 */}
                                        {BEKKI_ROW_NOTES[API_PATH]?.[rowsKey]?.[idx] && (
                                            <RowNote text={BEKKI_ROW_NOTES[API_PATH][rowsKey][idx]} className="mt-1" />
                                        )}
                                    </td>
                                    <td className="p-1 border">
                                        {choiceRows?.[idx] ? (
                                            <BekkiChoiceCheckboxes
                                                row={choiceRows[idx]}
                                                value={rows[idx]?.content ?? ""}
                                                onChange={(next) => updateRowField(setter, idx, "content", next)}
                                                ariaLabel={`${label}（選択）`}
                                            />
                                        ) : (
                                            <Input
                                                value={rows[idx]?.content ?? ""}
                                                onChange={(e) => updateRowField(setter, idx, "content", e.target.value)}
                                                placeholder="種別・容量等の内容"
                                            />
                                        )}
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
                                            list={defectPhraseListId("bad", label)}
                                            placeholder="不良内容"
                                        />
                                    </td>
                                    <td className="p-1 border">
                                        <Input
                                            value={rows[idx]?.action_content ?? ""}
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
                        <div key={`${title}-${idx}-mobile`} className="border rounded-lg p-3 space-y-2 bg-white">
                            <div className={`font-medium text-sm text-slate-800 ${WRAP_CLS}`}>{bindLabelBreaks(label)}</div>
                            {BEKKI_ROW_NOTES[API_PATH]?.[rowsKey]?.[idx] && (
                                <RowNote text={BEKKI_ROW_NOTES[API_PATH][rowsKey][idx]} />
                            )}
                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                    <span className="text-xs text-slate-500">内容</span>
                                    {choiceRows?.[idx] ? (
                                        <BekkiChoiceCheckboxes
                                            row={choiceRows[idx]}
                                            value={rows[idx]?.content ?? ""}
                                            onChange={(next) => updateRowField(setter, idx, "content", next)}
                                            ariaLabel={`${label}（選択）`}
                                        />
                                    ) : (
                                        <Input
                                            value={rows[idx]?.content ?? ""}
                                            onChange={(e) => updateRowField(setter, idx, "content", e.target.value)}
                                            className="h-9 text-sm"
                                        />
                                    )}
                                </div>
                                <div className="space-y-1">
                                    <span className="text-xs text-slate-500">判定</span>
                                    <JudgmentButtons
                                        value={rows[idx]?.judgment ?? ""}
                                        onChange={(v) => updateRowField(setter, idx, "judgment", v)}
                                        label={label}
                                    />
                                </div>
                            </div>
                            {(rows[idx]?.judgment === "否" || rows[idx]?.bad_content || rows[idx]?.action_content) && (
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <span className="text-xs text-slate-500">不良内容</span>
                                        <Input
                                            value={rows[idx]?.bad_content ?? ""}
                                            onChange={(e) => updateRowField(setter, idx, "bad_content", e.target.value)}
                                            list={defectPhraseListId("bad", label)}
                                            className="h-9 text-sm"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-xs text-slate-500">措置内容</span>
                                        <Input
                                            value={rows[idx]?.action_content ?? ""}
                                            onChange={(e) => updateRowField(setter, idx, "action_content", e.target.value)}
                                            list={defectPhraseListId("action", label)}
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
                form="別記様式第8"
                inspectionType={inspectionType}
                sections={[
                    { key: "page1_rows", labels: PAGE1_ITEMS, rows: page1Rows },
                    { key: "page2_rows", labels: PAGE2_ITEMS, rows: page2Rows },
                    { key: "page3_rows", labels: PAGE3_ITEMS, rows: page3Rows },
                    { key: "page4_rows", labels: PAGE4_ITEMS, rows: page4Rows },
                ]}
                onApply={(targets) => {
                    setPage1Rows((prev) => applyBulkGood(prev, targets.page1_rows))
                    setPage2Rows((prev) => applyBulkGood(prev, targets.page2_rows))
                    setPage3Rows((prev) => applyBulkGood(prev, targets.page3_rows))
                    setPage4Rows((prev) => applyBulkGood(prev, targets.page4_rows))
                }}
            />
            {/* 不良内容・措置内容の候補（自由入力のまま・src/lib/defect-phrases.ts） */}
            <DefectPhraseDatalists />
            <Card>
                <CardHeader>
                    <CardTitle>粉末消火設備点検票（別記様式8）入力</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="grid md:grid-cols-3 gap-4">
                        <div className="space-y-1">
                            <Label>区画名（その1タイトル欄）</Label>
                            <Input value={zoneName} onChange={(e) => setZoneName(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>設備方式</Label>
                            {/* ★様式の「全域・局所・移動」を○で囲む欄。文字の欄だと合わない語で○が付かない（2026-10-20） */}
                            <BekkiChoiceCheckboxes
                                row={EQUIPMENT_SYSTEM_CHOICES}
                                value={equipmentSystem}
                                onChange={setEquipmentSystem}
                                ariaLabel="設備方式（選択）"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label>点検種別</Label>
                            <BekkiInspectionTypeInput value={inspectionType} onChange={setInspectionType} />
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
                            <Input type="tel" autoComplete="tel" value={inspectorTel} onChange={(e) => setInspectorTel(e.target.value)} />
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

            {renderItemTable("（その1）機器点検", PAGE1_ITEMS, page1Rows, setPage1Rows, "page1_rows")}
            {renderItemTable("（その2）機器点検", PAGE2_ITEMS, page2Rows, setPage2Rows, "page2_rows")}
            {renderItemTable("（その3）機器点検", PAGE3_ITEMS, page3Rows, setPage3Rows, "page3_rows")}
            {renderItemTable("（その4）総合点検", PAGE4_ITEMS, page4Rows, setPage4Rows, "page4_rows")}

            <Card>
                <CardHeader>
                    <CardTitle>（その4）備考・測定機器</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="space-y-1">
                        <Label>備考</Label>
                        <Textarea rows={6} value={notes} onChange={(e) => setNotes(e.target.value)} />
                    </div>

                    <DeviceTableInputs kind="plain" rows={deviceTableRows} onChange={updateDeviceTableRow} />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>（その5）容器ごとの点検結果</CardTitle>
                    <CardDescription>
                        測定1〜6 の値（点検時加圧用・起動用ガス質量(kg)）を容器ごとに入力してください。点検年月日は上の見出しに測定ごとに 1 回だけ入れます。
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <MeasureHeaderInputs headers={measureHeaders} onChange={setMeasureHeaders} withTemp={false} />
                    {/* Desktop: table layout */}
                    <div className="hidden md:block overflow-x-auto border rounded-lg">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="p-2 border w-16">番号</th>
                                    <th className="p-2 border w-24">容器番号</th>
                                    <th className="p-2 border w-28">全質量(kg)</th>
                                    <th className="p-2 border w-28">空質量(kg)</th>
                                    <th className="p-2 border w-32">ガス質量(kg)</th>
                                    <th className="p-2 border w-32">測定1<br /><span className="text-xs font-normal text-slate-500">値</span></th>
                                    <th className="p-2 border w-32">測定2<br /><span className="text-xs font-normal text-slate-500">値</span></th>
                                    <th className="p-2 border w-32">測定3<br /><span className="text-xs font-normal text-slate-500">値</span></th>
                                    <th className="p-2 border w-32">測定4<br /><span className="text-xs font-normal text-slate-500">値</span></th>
                                    <th className="p-2 border w-32">測定5<br /><span className="text-xs font-normal text-slate-500">値</span></th>
                                    <th className="p-2 border w-32">測定6<br /><span className="text-xs font-normal text-slate-500">値</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {page5Rows.map((row, idx) => (
                                    <tr key={`p5-${idx}`}>
                                        <td className="p-1 border">
                                            <Input value={row.no} onChange={(e) => updateCylinderField(idx, "no", e.target.value)} />
                                        </td>
                                        <td className="p-1 border">
                                            <Input {...CODE_INPUT_PROPS} value={row.cylinder_no} onChange={(e) => updateCylinderField(idx, "cylinder_no", e.target.value)} />
                                        </td>
                                        <td className="p-1 border">
                                            <Input value={row.spec1} onChange={(e) => updateCylinderField(idx, "spec1", e.target.value)} placeholder="全質量" inputMode="decimal" />
                                        </td>
                                        <td className="p-1 border">
                                            <Input value={row.spec2} onChange={(e) => updateCylinderField(idx, "spec2", e.target.value)} placeholder="空質量" inputMode="decimal" />
                                        </td>
                                        <td className="p-1 border">
                                            <Input value={row.spec3} onChange={(e) => updateCylinderField(idx, "spec3", e.target.value)} placeholder="ガス質量" inputMode="decimal" />
                                        </td>
                                        {([1, 2, 3, 4, 5, 6] as const).map((n) => {
                                            const dateKey = `measure${n}_date` as const
                                            const valueKey = `measure${n}_value` as const
                                            // ★日付は見出しに書く。この容器だけ違う値が保存にあるときだけ行に出す
                                            const own = rowOwnMeasure(row, n, measureHeaders[n - 1])
                                            return (
                                                <td key={`m${n}`} className="p-1 border">
                                                    <div className="space-y-1">
                                                        {own.date && (
                                                            <Input
                                                                value={row[dateKey]}
                                                                onChange={(e) => updateCylinderField(idx, dateKey, e.target.value)}
                                                                aria-label={`容器${idx + 1} 測定${n} この容器だけの点検年月日`}
                                                                className="h-8 text-xs"
                                                            />
                                                        )}
                                                        <Input
                                                            value={row[valueKey]}
                                                            onChange={(e) => updateCylinderField(idx, valueKey, e.target.value)}
                                                            placeholder={n === 1 ? "41.0" : "値"}
                                                            inputMode="decimal"
                                                            className="h-8 text-xs"
                                                        />
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
                                        inputMode="numeric"
                                        className="h-8 w-16 text-xs"
                                    />
                                    <Input
                                        {...CODE_INPUT_PROPS}
                                        value={row.cylinder_no}
                                        onChange={(e) => updateCylinderField(idx, "cylinder_no", e.target.value)}
                                        placeholder="容器番号"
                                        className="h-8 flex-1 text-xs min-w-0"
                                    />
                                </div>

                                {/* 仕様 (spec1-3) */}
                                <div>
                                    <div className="mb-1 flex items-center justify-between gap-2">
                                        <span className="text-xs text-slate-500">仕様</span>
                                        {idx > 0 && (
                                            <Button type="button" variant="outline" size="sm" className="h-11" onClick={() => copySpecFromPrevious(idx)}>
                                                前の容器と同じ仕様
                                            </Button>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1 min-w-0">
                                            <span className="text-xs text-slate-500">全質量(kg)</span>
                                            <Input value={row.spec1} onChange={(e) => updateCylinderField(idx, "spec1", e.target.value)} placeholder="全質量" inputMode="decimal" className="h-9 text-sm" />
                                        </div>
                                        <div className="space-y-1 min-w-0">
                                            <span className="text-xs text-slate-500">空質量(kg)</span>
                                            <Input value={row.spec2} onChange={(e) => updateCylinderField(idx, "spec2", e.target.value)} placeholder="空質量" inputMode="decimal" className="h-9 text-sm" />
                                        </div>
                                        <div className="space-y-1 min-w-0 col-span-2">
                                            <span className="text-xs text-slate-500">ガス質量(kg)</span>
                                            <Input value={row.spec3} onChange={(e) => updateCylinderField(idx, "spec3", e.target.value)} placeholder="ガス質量" inputMode="decimal" className="h-9 text-sm" />
                                        </div>
                                    </div>
                                </div>

                                {/* 測定 1-6 (温度なし)（2 列に並べる・iPhone で縦に長くならないように・2026-10-20） */}
                                <div className="grid grid-cols-2 gap-x-2 gap-y-3">
                                    {([1, 2, 3, 4, 5, 6] as const).map((n) => {
                                        const dateKey = `measure${n}_date` as const
                                        const valueKey = `measure${n}_value` as const
                                        // ★日付は見出しに書く。この容器だけ違う値が保存にあるときだけ行に出す
                                        const own = rowOwnMeasure(row, n, measureHeaders[n - 1])
                                        return (
                                            <div key={`m${n}-mobile`} className="min-w-0">
                                                <div className="text-xs text-slate-500 mb-1">測定 {n}</div>
                                                <div className="space-y-2">
                                                    {own.date && (
                                                        <div className="space-y-1 min-w-0">
                                                            <span className="text-xs text-slate-500">この容器だけの点検年月日</span>
                                                            <Input
                                                                value={row[dateKey]}
                                                                onChange={(e) => updateCylinderField(idx, dateKey, e.target.value)}
                                                                className="h-9 text-sm"
                                                            />
                                                        </div>
                                                    )}
                                                    <div className="space-y-1 min-w-0">
                                                        <Input
                                                            value={row[valueKey]}
                                                            onChange={(e) => updateCylinderField(idx, valueKey, e.target.value)}
                                                            placeholder={n === 1 ? "41.0" : "値"}
                                                            aria-label={`容器${idx + 1} 測定${n} の値`}
                                                            inputMode="decimal"
                                                            className="h-9 text-sm"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
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

            <div className="flex flex-wrap items-center gap-3">
                <Button type="button" onClick={handleSave} disabled={busy} className={SAVE_BUTTON}>
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    保存
                </Button>
                <Button type="button" onClick={handlePreview} disabled={busy} className={PREVIEW_BUTTON}>
                    {loadingPreview ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Eye className="w-4 h-4 mr-2" />}
                    プレビュー
                </Button>
                <Button type="button" onClick={handleDownload} disabled={busy} className={DOWNLOAD_BUTTON}>
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
