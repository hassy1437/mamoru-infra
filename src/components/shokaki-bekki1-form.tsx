"use client"

import { isBekkiHeadingLabel } from "@/lib/bekki-heading-row"
import { BekkiHeadingCard, BekkiHeadingTableRow } from "@/components/bekki-heading-row"
import { bekkiPeriodDefault } from "@/lib/bekki-period"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { loadDraftLocal, saveDraftLocal } from "@/lib/local-draft"
import { WRAP_CLS, bindLabelBreaks } from "@/components/row-label"
import { Button } from "@/components/ui/button"
import { applyBulkGood } from "@/lib/bekki-bulk-good"
import { BekkiBulkGoodButton } from "@/components/bekki-bulk-good-button"
import { isJudgmentsDefaulted } from "@/lib/bekki-default-good"
import { defectPhraseListId } from "@/lib/defect-phrases"
import { DefectPhraseDatalists } from "@/components/defect-phrase-datalists"
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
import { bekkiWitnessInitial } from "@/lib/bekki-witness"
import CameraInput from "@/components/camera-input"
import JudgmentButtons from "@/components/judgment-buttons"
import DeviceTableInputs from "@/components/device-table-inputs"
import { resolveDeviceTable, type DeviceTableRow } from "@/lib/bekki-device-table"
import { pdfRequestError, pdfErrorText } from "@/lib/pdf-request-error"
import { PDF_FIT_FRAGMENT, openInAppPdfPreview, prefersInAppPdfViewer } from "@/lib/pdf-preview-mode"
import { soukatsuPdfGate } from "@/lib/pdf-gate-client"
import { useAutoSave } from "@/hooks/use-auto-save"
import FormActionBar from "@/components/form-action-bar"
import InspectorSyncNotice from "@/components/inspector-sync-notice"

type MarkKey = "A" | "B" | "C" | "D" | "E" | "F"

type RowState = {
    marks: Record<MarkKey, boolean>
    judgment: string
    bad_count: string // 備考3: 消火器具は不良時に不良個数を判定欄に記入（判定は"良"/"否"のまま）
    bad_content: string
    action_content: string
}

type DeviceState = {
    name: string
    model: string
    calibrated_at: string
    maker: string
}

type SummaryRowState = {
    kind: string
    installed: string
    inspected: string
    passed: string
    repair_needed: string
    removed: string
}

type ShokakiBekki1Payload = {
    /** ★判定が初期値（良）のままか（2026-10-20・録音 102・src/lib/bekki-default-good.ts） */
    judgments_defaulted?: boolean
    form_name: string
    fire_manager: string
    witness: string
    location: string
    period_start: string
    period_end: string
    inspector_name: string
    inspector_company: string
    inspector_address: string
    inspector_tel: string
    page1_rows: RowState[]
    page2_rows: RowState[]
    notes: string
    device1: DeviceState
    device2: DeviceState
    /** 測定機器の 3 行 × 左右（6 台・lib/bekki-device-table.ts）。device1/device2 は古い保存の形（いまは空で保存する） */
    device_table: DeviceTableRow[]
    summary_rows: SummaryRowState[]
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
    }
    soukatsuId: string
    itiranId: string
    propertyId?: string | null
    savedPayload?: Partial<ShokakiBekki1Payload> | null
    savedUpdatedAt?: string | null
}

const MARKS: MarkKey[] = ["A", "B", "C", "D", "E", "F"]
/** その2 で種別（A〜F）の欄があるのはこの行の手前まで（簡易消火用具の 2 行＝外形・水量等には無い） */
const P2_MARK_ROWS = 19

// A〜F の器種名（テンプレ s50_kokuji14_bekki1.pdf 備考第2項に準拠）。
// ★アルファベット順ではない（A=粉末 … F=水）。marks のキーは "A"〜"F" のまま、表示ラベルのみ。
const MARK_TYPES: { key: MarkKey; label: string }[] = [
    { key: "A", label: "粉末" },
    { key: "B", label: "泡" },
    { key: "C", label: "強化液" },
    { key: "D", label: "二酸化炭素" },
    { key: "E", label: "ハロゲン化物" },
    { key: "F", label: "水" },
]

const PAGE1_ITEMS = [
    "設置場所",
    "設置間隔",
    "適応性",
    "耐震措置",
    "表示・標識",
    "本体容器",
    "安全栓の封",
    "安全栓",
    "使用済みの表示装置",
    "押し金具・レバー等",
    "キャップ",
    "ホース",
    "ノズル・ホーン・ノズル栓",
    "指示圧力計",
    "圧力調整器",
    "安全弁",
    "保持装置",
    "車輪（車載式）",
    "ガス導入管（車載式）",
] as const

const PAGE2_ITEMS = [
    "本体容器",
    "内筒等",
    "液面表示",
    "性状",
    "消火薬剤量",
    "加圧用ガス容器",
    "カッター・押し金具",
    "ホース",
    "開閉式ノズル・切替式ノズル",
    "指示圧力計",
    "使用済みの表示装置",
    "圧力調整器",
    "安全弁・減圧孔（排圧栓を含む。）",
    "粉上り防止用封板",
    "パッキン",
    "サイホン管・ガス導入管",
    "ろ過網",
    "放射能力",
    "消火器の耐圧性能",
    "外形",
    "水量等",
] as const

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
    const marks: Partial<Record<MarkKey, boolean>> = source.marks ?? {}
    return {
        marks: {
            A: Boolean(marks.A),
            B: Boolean(marks.B),
            C: Boolean(marks.C),
            D: Boolean(marks.D),
            E: Boolean(marks.E),
            F: Boolean(marks.F),
        },
        judgment: coerceString(source.judgment),
        bad_count: coerceString(source.bad_count), // 既存データ非破壊（無ければ ""）
        bad_content: coerceString(source.bad_content),
        action_content: coerceString(source.action_content),
    }
}

const coerceSummary = (value: unknown): SummaryRowState => {
    const source = (value ?? {}) as Partial<SummaryRowState>
    return {
        kind: coerceString(source.kind),
        installed: coerceString(source.installed),
        inspected: coerceString(source.inspected),
        passed: coerceString(source.passed),
        repair_needed: coerceString(source.repair_needed),
        removed: coerceString(source.removed),
    }
}

const hydrateRows = (count: number, source?: unknown[]): RowState[] => {
    return Array.from({ length: count }, (_, i) => coerceRow(source?.[i]))
}

const hydrateSummaryRows = (count: number, source?: unknown[]): SummaryRowState[] => {
    return Array.from({ length: count }, (_, i) => coerceSummary(source?.[i]))
}

const formatSavedAt = (value?: string | null) => {
    if (!value) return null
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    return date.toLocaleString("ja-JP")
}

export default function ShokakiBekki1Form({
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
    const [summaryRows, setSummaryRows] = useState<SummaryRowState[]>(() => hydrateSummaryRows(6, saved.summary_rows))

    // ★判定の初期値「良」（2026-10-20・録音 102）。新しい様式は開いたときにボタンの部品が入れ、印を立てる
    const [judgmentsDefaulted, setJudgmentsDefaulted] = useState(() => isJudgmentsDefaulted(saved))
    const [saving, setSaving] = useState(false)
    const [loadingPreview, setLoadingPreview] = useState(false)
    const [loadingDownload, setLoadingDownload] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [saveMessage, setSaveMessage] = useState<string | null>(
        formatSavedAt(savedUpdatedAt) ? `最終保存: ${formatSavedAt(savedUpdatedAt)}` : null
    )


    const payload = useMemo<ShokakiBekki1Payload>(() => ({
        judgments_defaulted: judgmentsDefaulted,
        form_name: formName,
        fire_manager: fireManager,
        witness: normalizeBekkiWitnessForPayload(witness),
        location,
        period_start: periodStart,
        period_end: periodEnd,
        inspector_name: normalizeBekkiInspectorNameForPayload(inspectorName),
        inspector_company: inspectorCompany,
        inspector_address: inspectorAddress,
        inspector_tel: inspectorTel,
        page1_rows: page1Rows,
        page2_rows: page2Rows,
        notes,
        // ★古い2行は空にして保存する（同じ機器を二重に持たない・ルートは device_table を読む）
        device1: createEmptyDevice(),
        device2: createEmptyDevice(),
        device_table: deviceTableRows,
        summary_rows: summaryRows,
    }), [
        judgmentsDefaulted,
        formName,
        fireManager,
        witness,
        location,
        periodStart,
        periodEnd,
        inspectorName,
        inspectorCompany,
        inspectorAddress,
        inspectorTel,
        page1Rows,
        page2Rows,
        notes,
        deviceTableRows,
        summaryRows,
    ])

    const persistDraft = useCallback(async (clearMessage = true) => {
        setError(null)
        if (clearMessage) {
            setSaveMessage(null)
        }

        // オフライン耐性: 入力を常にローカル(IndexedDB)へ保存（base/他22様式と同等）
        try {
            await saveDraftLocal(`inspection_shokaki_bekki1:${itiranId}`, {
                soukatsu_id: soukatsuId,
                itiran_id: itiranId,
                property_id: propertyId ?? null,
                payload,
            })
        } catch {
            // IndexedDB 失敗は致命的でない
        }

        // オフライン時はローカル保存で完了（Supabase 送信はスキップ）
        if (!navigator.onLine) {
            setSaveMessage(`ローカル保存済み (オフライン): ${new Date().toLocaleString("ja-JP")}`)
            return true
        }

        const { error: saveError } = await supabase
            .from("inspection_shokaki_bekki1")
            .upsert({
                soukatsu_id: soukatsuId,
                itiran_id: itiranId,
                property_id: propertyId ?? null,
                payload,
                updated_at: new Date().toISOString(),
            }, { onConflict: "itiran_id" })

        if (saveError) {
            if (saveError.message.includes("inspection_shokaki_bekki1")) {
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
        const response = await fetch("/api/generate-shokaki-bekki1-pdf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        })

        if (!response.ok) throw await pdfRequestError(response)

        return response.blob()
    }, [payload])

    const handlePreview = useCallback(async () => {
        // ★スマホ・タブレットはアプリの中で、ページ全体が見える形で出す（src/lib/pdf-preview-mode.ts）
        if (prefersInAppPdfViewer() && openInAppPdfPreview({ title: "消火器点検票のプレビュー", load: generatePdfBlob })) return
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
            a.download = `消火器点検票_${formName || "bekki1"}.pdf`
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
    // 復元完了フラグ: 復元前の自動保存（StrictMode の擬似アンマウントや復元前の離脱）で
    // 新しいローカル下書きをサーバー初期値で上書きしないためのガード。
    const restoreReadyRef = useRef(false)
    useEffect(() => {
        return () => { if (restoreReadyRef.current) persistDraftRef.current(false) }
    }, [])

    // 自動保存: 入力が止まって 5 秒後と、別のアプリに切り替えた瞬間（src/hooks/use-auto-save.ts）
    useAutoSave(payload, () => persistDraftRef.current(false), () => setSaveMessage(`自動保存済み: ${new Date().toLocaleString("ja-JP")}`))

    // オフライン下書きの復元: ローカルがサーバー保存より新しければ復元（base と同優先ルール）。
    // 完了後に restoreReadyRef を立て、以降の自動保存を許可する。
    useEffect(() => {
        let cancelled = false
        loadDraftLocal(`inspection_shokaki_bekki1:${itiranId}`).then((draft) => {
            if (cancelled) return
            try {
                if (!draft) return
                const serverAt = savedUpdatedAt ?? ""
                if (serverAt && draft.savedAt <= serverAt) return
                const p = (draft.payload as { payload?: Partial<ShokakiBekki1Payload> } | null)?.payload
                if (!p || typeof p !== "object") return
                setFormName(coerceString(p.form_name, initial.building_name ?? ""))
                setFireManager(coerceString(p.fire_manager, initial.fire_manager_name ?? ""))
                setWitness(normalizeBekkiWitnessForState(coerceString(p.witness)))
                setLocation(coerceString(p.location, initial.building_address ?? ""))
                setPeriodStart(coerceString(p.period_start, bekkiPeriodDefault(initial).start))
                setPeriodEnd(coerceString(p.period_end, bekkiPeriodDefault(initial).end))
                setInspectorName(normalizeBekkiInspectorNameForState(coerceString(p.inspector_name, initial.inspector_name ?? "")))
                setInspectorCompany(coerceString(p.inspector_company, initial.inspector_company ?? ""))
                setInspectorAddress(coerceString(p.inspector_address, initial.inspector_address ?? ""))
                setInspectorTel(coerceString(p.inspector_tel, initial.inspector_tel ?? ""))
                setNotes(coerceString(p.notes))
                setDeviceTableRows(resolveDeviceTable(p, "plain"))
                setPage1Rows(hydrateRows(PAGE1_ITEMS.length, p.page1_rows))
                setPage2Rows(hydrateRows(PAGE2_ITEMS.length, p.page2_rows))
                setSummaryRows(hydrateSummaryRows(6, p.summary_rows))
                setSaveMessage("オフラインの下書きを復元しました")
            } finally {
                if (!cancelled) restoreReadyRef.current = true
            }
        }).catch(() => { if (!cancelled) restoreReadyRef.current = true })
        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])



    const updateRowField = (
        page: "p1" | "p2",
        index: number,
        field: keyof Omit<RowState, "marks">,
        value: string,
    ) => {
        const setter = page === "p1" ? setPage1Rows : setPage2Rows
        setter((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)))
    }

    // ★種別（A〜F）をまとめて付ける（2026-10-20）。iPhone では行ごとに約 35 回タップしていた。
    //   種別が 1 つも付いていない行だけに付ける（付いている行・見出しの行・種別の欄が無い行は変えない）
    const [bulkMarks, setBulkMarks] = useState<Record<MarkKey, boolean>>({ A: false, B: false, C: false, D: false, E: false, F: false })
    const [bulkMarksMessage, setBulkMarksMessage] = useState<string | null>(null)
    const applyBulkMarks = () => {
        const picked = MARKS.filter((k) => bulkMarks[k])
        if (!picked.length) return
        let count = 0
        const fill = (labels: readonly string[], rows: RowState[], limit: number) => rows.map((row, i) => {
            if (i >= limit || isBekkiHeadingLabel(labels[i] ?? "") || MARKS.some((k) => row.marks[k])) return row
            count += 1
            return { ...row, marks: { ...row.marks, ...Object.fromEntries(picked.map((k) => [k, true])) } }
        })
        const next1 = fill(PAGE1_ITEMS, page1Rows, PAGE1_ITEMS.length)
        const next2 = fill(PAGE2_ITEMS, page2Rows, P2_MARK_ROWS)
        setPage1Rows(next1)
        setPage2Rows(next2)
        setBulkMarksMessage(count ? `${count} 行に ${picked.join("・")} を付けました` : "種別が空欄の行はありませんでした")
    }

    const toggleMark = (page: "p1" | "p2", index: number, key: MarkKey) => {
        const setter = page === "p1" ? setPage1Rows : setPage2Rows
        setter((prev) => prev.map((row, i) => (
            i === index ? { ...row, marks: { ...row.marks, [key]: !row.marks[key] } } : row
        )))
    }

    const updateSummary = (index: number, field: keyof SummaryRowState, value: string) => {
        setSummaryRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)))
    }

    const renderItemTable = (title: string, page: "p1" | "p2", labels: readonly string[], rows: RowState[], noMarkFromIndex?: number) => {
    // 「すべて良にする」: この点検項目テーブル(page1/page2)で判定が空("")の行だけ "良" に。
    // marks(A〜F)・集計表(summaryRows)・既存の良/否は触らない。
    const markAllGood = () => {
        const setter = page === "p1" ? setPage1Rows : setPage2Rows
        setter((prev) => prev.map((row, i) => (row.judgment === "" && !isBekkiHeadingLabel(labels[i] ?? "") ? { ...row, judgment: "良" } : row)))
    }
    return (
        <Card>
            <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                        <CardTitle>{title}</CardTitle>
                        <CardDescription>各行で種別(A〜F)、判定、不良内容、措置内容を入力してください。</CardDescription>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={markAllGood} className="shrink-0 min-h-11 md:min-h-0">
                        <CheckCheck className="w-4 h-4 mr-1.5" />この表の空欄を良にする
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {/* Desktop: table layout（md 以上。デスクトップは現状維持） */}
                <div className="hidden md:block overflow-x-auto border rounded-lg">
                    <table className="min-w-[1000px] w-full text-sm">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="p-2 border w-64 text-left">点検項目</th>
                                {MARKS.map((k) => (
                                    <th key={k} className="p-2 border w-12 text-center">{k}</th>
                                ))}
                                <th className="p-2 border w-24 text-center">判定</th>
                                <th className="p-2 border text-left">不良内容</th>
                                <th className="p-2 border text-left">措置内容</th>
                            </tr>
                        </thead>
                        <tbody>
                            {labels.map((label, idx) => isBekkiHeadingLabel(label) ? (
                                <BekkiHeadingTableRow key={`${title}-heading-${idx}`} label={label} />
                            ) : (
                                <tr key={`${page}-${label}`}>
                                    <td className={`p-2 border ${WRAP_CLS}`}>{bindLabelBreaks(label)}</td>
                                    {(noMarkFromIndex !== undefined && idx >= noMarkFromIndex) ? (
                                        <td colSpan={MARKS.length} className="p-2 border" />
                                    ) : MARKS.map((k) => (
                                        <td key={`${label}-${k}`} className="p-2 border text-center">
                                            <input
                                                type="checkbox"
                                                checked={rows[idx].marks[k]}
                                                onChange={() => toggleMark(page, idx, k)}
                                            />
                                        </td>
                                    ))}
                                    <td className="p-1 border">
                                        <select
                                            className="w-full h-8 border rounded px-2"
                                            value={rows[idx].judgment}
                                            onChange={(e) => updateRowField(page, idx, "judgment", e.target.value)}
                                        >
                                            <option value="">未入力</option>
                                            <option value="良">良</option>
                                            <option value="否">否</option>
                                        </select>
                                        {/* 備考3: 消火器具は不良時に不良個数を判定欄に記入。否のときのみ表示 */}
                                        {rows[idx].judgment === "否" && (
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                pattern="[0-9]*"
                                                value={rows[idx].bad_count}
                                                onChange={(e) => updateRowField(page, idx, "bad_count", e.target.value.replace(/[^0-9]/g, ""))}
                                                placeholder="不良個数"
                                                className="w-full h-8 border rounded px-2 mt-1"
                                            />
                                        )}
                                    </td>
                                    <td className="p-1 border">
                                        <Input
                                            value={rows[idx].bad_content}
                                            onChange={(e) => updateRowField(page, idx, "bad_content", e.target.value)}
                                            list={defectPhraseListId("bad", label)}
                                            placeholder="不良内容"
                                        />
                                    </td>
                                    <td className="p-1 border">
                                        <Input
                                            value={rows[idx].action_content}
                                            onChange={(e) => updateRowField(page, idx, "action_content", e.target.value)}
                                            list={defectPhraseListId("action", label)}
                                            placeholder="措置内容"
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Mobile: card layout（md 未満） */}
                <div className="md:hidden space-y-3">
                    {/*
                      ★種別の凡例は上に固定し、各行は記号（A〜F）だけを横一列に（2026-10-20・録音 102）。
                        以前は行ごとに「記号＋器種名」の 2 段のボタンで、器種名の長さで幅が広がり 2〜3 段に折り返していた（スクロールが長い）。
                    */}
                    {(noMarkFromIndex === undefined || noMarkFromIndex > 0) && (
                        <div className="sticky top-0 z-20 rounded-lg border border-slate-300 bg-white/95 px-2 py-1.5 shadow-sm backdrop-blur" aria-label="種別の凡例">
                            <span className="text-[11px] text-slate-500">種別の凡例（該当する消火器の記号をタップ）</span>
                            <div className="mt-0.5 grid grid-cols-6 gap-1 text-center text-[11px] leading-tight text-slate-700">
                                {MARK_TYPES.map(({ key, label: typeLabel }) => (
                                    <span key={key}>
                                        <span className="block text-sm font-bold text-slate-900">{key}</span>
                                        {typeLabel}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                    {labels.map((label, idx) => {
                        if (isBekkiHeadingLabel(label)) return <BekkiHeadingCard key={`${title}-heading-${idx}-mobile`} label={label} />
                        const row = rows[idx]
                        const showMarks = noMarkFromIndex === undefined || idx < noMarkFromIndex
                        const showDefect = row.judgment === "否" || Boolean(row.bad_content) || Boolean(row.action_content)
                        return (
                            <div key={`${page}-mobile-${idx}`} className="border rounded-lg p-3 space-y-2 bg-white">
                                <div className={`font-medium text-sm text-slate-800 ${WRAP_CLS}`}>{bindLabelBreaks(label)}</div>

                                {showMarks && (
                                    // ★記号だけを横一列（6 等分・高さ 44px）。器種名は上の凡例と、読み上げ（aria-label）に
                                    <div className="grid grid-cols-6 gap-1" role="group" aria-label="種別">
                                        {MARK_TYPES.map(({ key, label: typeLabel }) => {
                                            const active = row.marks[key]
                                            return (
                                                <button
                                                    key={key}
                                                    type="button"
                                                    aria-pressed={active}
                                                    aria-label={`${key} ${typeLabel}`}
                                                    onClick={() => toggleMark(page, idx, key)}
                                                    className={`min-h-11 rounded-md border text-base font-bold transition-colors ${active ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-300 text-slate-700"}`}
                                                >
                                                    {key}
                                                </button>
                                            )
                                        })}
                                    </div>
                                )}

                                <div className="space-y-1">
                                    <span className="text-xs text-slate-500">判定</span>
                                    <JudgmentButtons
                                        value={row.judgment}
                                        onChange={(v) => updateRowField(page, idx, "judgment", v)}
                                        label={label}
                                    />
                                    {/* 備考3: 不良時は不良個数を判定欄に記入。否のときのみ表示 */}
                                    {row.judgment === "否" && (
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            value={row.bad_count}
                                            onChange={(e) => updateRowField(page, idx, "bad_count", e.target.value.replace(/[^0-9]/g, ""))}
                                            placeholder="不良個数"
                                            className="w-full h-9 border border-input rounded-md bg-background px-2 text-sm"
                                        />
                                    )}
                                </div>

                                {showDefect && (
                                    <div className="space-y-2">
                                        <div className="space-y-1">
                                            <span className="text-xs text-slate-500">不良内容</span>
                                            <Input
                                                value={row.bad_content}
                                                onChange={(e) => updateRowField(page, idx, "bad_content", e.target.value)}
                                                list={defectPhraseListId("bad", label)}
                                                className="h-9 text-sm"
                                                placeholder="不良内容"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <span className="text-xs text-slate-500">措置内容</span>
                                            <Input
                                                value={row.action_content}
                                                onChange={(e) => updateRowField(page, idx, "action_content", e.target.value)}
                                                list={defectPhraseListId("action", label)}
                                                className="h-9 text-sm"
                                                placeholder="措置内容"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    })}
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
            {/* ★様式の頭に 1 つ。表ごとの「この表の空欄を良にする」は残す（#101）。消火器は点検種別の欄も総合点検の行も無い */}
            <BekkiBulkGoodButton
                fresh={savedPayload == null}
                defaulted={judgmentsDefaulted}
                onDefaultedChange={setJudgmentsDefaulted}
                form="別記様式第1"
                sections={[
                    { key: "page1_rows", labels: PAGE1_ITEMS, rows: page1Rows },
                    { key: "page2_rows", labels: PAGE2_ITEMS, rows: page2Rows },
                ]}
                onApply={(targets) => {
                    setPage1Rows((prev) => applyBulkGood(prev, targets.page1_rows))
                    setPage2Rows((prev) => applyBulkGood(prev, targets.page2_rows))
                }}
            />
            {/* 不良内容・措置内容の候補（自由入力のまま・src/lib/defect-phrases.ts） */}
            <DefectPhraseDatalists />
            <Card>
                <CardHeader>
                    <CardTitle>消火器点検票 入力</CardTitle>
                    <CardDescription>s50_kokuji14_bekki1.pdf に転記する項目です。</CardDescription>
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
                        <div className="space-y-1 min-w-0">
                            <Label>点検期間（開始）</Label>
                            <Input type="date" className="min-w-0" value={toDateInputValue(periodStart)} onChange={(e) => setPeriodStart(e.target.value)} />
                        </div>
                        <div className="space-y-1 min-w-0">
                            <Label>点検期間（終了）</Label>
                            <Input type="date" className="min-w-0" value={toDateInputValue(periodEnd)} onChange={(e) => setPeriodEnd(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>点検者 氏名</Label>
                            <Input value={inspectorName} onChange={(e) => setInspectorName(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>TEL</Label>
                            <Input type="tel" autoComplete="tel" value={inspectorTel} onChange={(e) => setInspectorTel(e.target.value)} />
                        </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <Label>点検者 所属会社</Label>
                            <Input value={inspectorCompany} onChange={(e) => setInspectorCompany(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>点検者 住所</Label>
                            <Input value={inspectorAddress} onChange={(e) => setInspectorAddress(e.target.value)} />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>種別（A〜F）をまとめて付ける</CardTitle>
                    <CardDescription>
                        この建物にある消火器の種別を選んで押すと、その1・その2 で種別が空欄の行にまとめて付けます。種別が付いている行は変えません。
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div role="group" aria-label="まとめて付ける種別" className="flex flex-wrap gap-1.5">
                        {MARK_TYPES.map(({ key, label: typeLabel }) => (
                            <button
                                key={key}
                                type="button"
                                aria-pressed={bulkMarks[key]}
                                onClick={() => { setBulkMarks((m) => ({ ...m, [key]: !m[key] })); setBulkMarksMessage(null) }}
                                className={`min-w-[44px] min-h-[44px] px-1.5 py-1 rounded-md border flex flex-col items-center justify-center leading-tight transition-colors ${bulkMarks[key] ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-300 text-slate-700"}`}
                            >
                                <span className="text-sm font-bold">{key}</span>
                                <span className="text-[10px] whitespace-nowrap">{typeLabel}</span>
                            </button>
                        ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <Button type="button" variant="outline" className="min-h-11" onClick={applyBulkMarks} disabled={!MARKS.some((k) => bulkMarks[k])}>
                            種別が空欄の行に付ける
                        </Button>
                        {bulkMarksMessage && <span role="status" className="text-sm text-slate-600">{bulkMarksMessage}</span>}
                    </div>
                </CardContent>
            </Card>

            {renderItemTable("（その1）点検結果", "p1", PAGE1_ITEMS, page1Rows)}
            {/* ★種別（A〜F）が無いのは簡易消火用具の 2 行（外形・水量等・19〜）だけ。以前は 18 にしていて、
                「消火器の耐圧性能」の行でも種別を付けられなかった（雛形にはその行の A〜F の欄がある・2026-10-20 の記入漏れ点検） */}
            {renderItemTable("（その2）点検結果", "p2", PAGE2_ITEMS, page2Rows, P2_MARK_ROWS)}

            <Card>
                <CardHeader>
                    <CardTitle>備考・測定機器・集計</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="space-y-1">
                        <Label>備考</Label>
                        <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
                    </div>

                    <DeviceTableInputs kind="plain" rows={deviceTableRows} onChange={updateDeviceTableRow} />

                    {/* Desktop: 集計テーブル（md 以上、現状維持） */}
                    <div className="hidden md:block overflow-x-auto border rounded-lg">
                        <table className="min-w-[760px] w-full text-sm">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="p-2 border">器種名</th>
                                    <th className="p-2 border">設置数</th>
                                    <th className="p-2 border">点検数</th>
                                    <th className="p-2 border">合格数</th>
                                    <th className="p-2 border">要修理数</th>
                                    {/* ★様式（別記様式第1）の刷り込みは「廃棄数」。画面だけ「撤去数」だった（#18） */}
                                    <th className="p-2 border">廃棄数</th>
                                </tr>
                            </thead>
                            <tbody>
                                {summaryRows.map((row, idx) => (
                                    <tr key={idx}>
                                        <td className="p-1 border"><Input value={row.kind} onChange={(e) => updateSummary(idx, "kind", e.target.value)} /></td>
                                        <td className="p-1 border"><Input value={row.installed} onChange={(e) => updateSummary(idx, "installed", e.target.value)} /></td>
                                        <td className="p-1 border"><Input value={row.inspected} onChange={(e) => updateSummary(idx, "inspected", e.target.value)} /></td>
                                        <td className="p-1 border"><Input value={row.passed} onChange={(e) => updateSummary(idx, "passed", e.target.value)} /></td>
                                        <td className="p-1 border"><Input value={row.repair_needed} onChange={(e) => updateSummary(idx, "repair_needed", e.target.value)} /></td>
                                        <td className="p-1 border"><Input value={row.removed} onChange={(e) => updateSummary(idx, "removed", e.target.value)} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile: 集計を器種別カードに（md 未満） */}
                    <div className="md:hidden space-y-3">
                        {summaryRows.map((row, idx) => (
                            <div key={`summary-mobile-${idx}`} className="border rounded-lg p-3 space-y-2 bg-white">
                                <div className="space-y-1">
                                    <span className="text-xs text-slate-500">器種名</span>
                                    <Input
                                        value={row.kind}
                                        onChange={(e) => updateSummary(idx, "kind", e.target.value)}
                                        className="h-9 text-sm"
                                        placeholder="器種名"
                                    />
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    {([
                                        ["installed", "設置数"],
                                        ["inspected", "点検数"],
                                        ["passed", "合格数"],
                                        ["repair_needed", "要修理数"],
                                        ["removed", "廃棄数"],
                                    ] as const).map(([field, fieldLabel]) => (
                                        <div key={field} className="space-y-1">
                                            <span className="text-xs text-slate-500">{fieldLabel}</span>
                                            <Input
                                                inputMode="numeric"
                                                value={row[field]}
                                                onChange={(e) => updateSummary(idx, field, e.target.value)}
                                                className="h-9 text-sm"
                                            />
                                        </div>
                                    ))}
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
