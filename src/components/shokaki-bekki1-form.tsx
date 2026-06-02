"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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

type MarkKey = "A" | "B" | "C" | "D" | "E" | "F"

type RowState = {
    marks: Record<MarkKey, boolean>
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

type SummaryRowState = {
    kind: string
    installed: string
    inspected: string
    passed: string
    repair_needed: string
    removed: string
}

type ShokakiBekki1Payload = {
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
    summary_rows: SummaryRowState[]
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
    savedPayload?: Partial<ShokakiBekki1Payload> | null
    savedUpdatedAt?: string | null
}

const MARKS: MarkKey[] = ["A", "B", "C", "D", "E", "F"]

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
    "本体容器・内筒等",
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
    const [fireManager, setFireManager] = useState(coerceString(saved.fire_manager, initial.fire_manager_name || initial.notifier_name || ""))
    const [witness, setWitness] = useState(normalizeBekkiWitnessForState(coerceString(saved.witness)))
    const [location, setLocation] = useState(coerceString(saved.location, initial.building_address ?? ""))
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
    const [summaryRows, setSummaryRows] = useState<SummaryRowState[]>(() => hydrateSummaryRows(6, saved.summary_rows))

    const [saving, setSaving] = useState(false)
    const [loadingPreview, setLoadingPreview] = useState(false)
    const [loadingDownload, setLoadingDownload] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [saveMessage, setSaveMessage] = useState<string | null>(
        formatSavedAt(savedUpdatedAt) ? `最終保存: ${formatSavedAt(savedUpdatedAt)}` : null
    )


    const payload = useMemo<ShokakiBekki1Payload>(() => ({
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
        device1,
        device2,
        summary_rows: summaryRows,
    }), [
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
        device1,
        device2,
        summaryRows,
    ])

    const persistDraft = useCallback(async (clearMessage = true) => {
        setError(null)
        if (clearMessage) {
            setSaveMessage(null)
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

        if (!response.ok) {
            throw new Error("PDF generation failed")
        }

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
        } catch {
            if (previewWindow) previewWindow.close()
            setError("PDFプレビューの生成に失敗しました。")
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
            a.download = `消火器点検票_${formName || "bekki1"}.pdf`
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



    const updateRowField = (
        page: "p1" | "p2",
        index: number,
        field: keyof Omit<RowState, "marks">,
        value: string,
    ) => {
        const setter = page === "p1" ? setPage1Rows : setPage2Rows
        setter((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)))
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
        setter((prev) => prev.map((row) => (row.judgment === "" ? { ...row, judgment: "良" } : row)))
    }
    return (
        <Card>
            <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                        <CardTitle>{title}</CardTitle>
                        <CardDescription>各行で種別(A〜F)、判定、不良内容、措置内容を入力してください。</CardDescription>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={markAllGood} className="shrink-0">
                        <CheckCheck className="w-4 h-4 mr-1.5" />すべて良にする
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
                            {labels.map((label, idx) => (
                                <tr key={`${page}-${label}`}>
                                    <td className="p-2 border">{label}</td>
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
                                    </td>
                                    <td className="p-1 border">
                                        <Input
                                            value={rows[idx].bad_content}
                                            onChange={(e) => updateRowField(page, idx, "bad_content", e.target.value)}
                                            placeholder="不良内容"
                                        />
                                    </td>
                                    <td className="p-1 border">
                                        <Input
                                            value={rows[idx].action_content}
                                            onChange={(e) => updateRowField(page, idx, "action_content", e.target.value)}
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
                    {labels.map((label, idx) => {
                        const row = rows[idx]
                        const showMarks = noMarkFromIndex === undefined || idx < noMarkFromIndex
                        const showDefect = row.judgment === "否" || Boolean(row.bad_content) || Boolean(row.action_content)
                        return (
                            <div key={`${page}-mobile-${idx}`} className="border rounded-lg p-3 space-y-2 bg-white">
                                <div className="font-medium text-sm text-slate-800">{label}</div>

                                {showMarks && (
                                    <div className="space-y-1">
                                        <span className="text-xs text-slate-500">種別（該当する消火器をタップ）</span>
                                        <div className="flex flex-wrap gap-1.5">
                                            {MARK_TYPES.map(({ key, label: typeLabel }) => {
                                                const active = row.marks[key]
                                                return (
                                                    <button
                                                        key={key}
                                                        type="button"
                                                        aria-pressed={active}
                                                        onClick={() => toggleMark(page, idx, key)}
                                                        className={`min-w-[44px] min-h-[44px] px-1.5 py-1 rounded-md border flex flex-col items-center justify-center leading-tight transition-colors ${active ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-300 text-slate-700"}`}
                                                    >
                                                        <span className="text-sm font-bold">{key}</span>
                                                        <span className="text-[10px] whitespace-nowrap">{typeLabel}</span>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-1">
                                    <span className="text-xs text-slate-500">判定</span>
                                    <select
                                        className="w-full h-9 border border-input rounded-md bg-background px-2 text-sm"
                                        value={row.judgment}
                                        onChange={(e) => updateRowField(page, idx, "judgment", e.target.value)}
                                    >
                                        <option value="">未入力</option>
                                        <option value="良">良</option>
                                        <option value="否">否</option>
                                    </select>
                                </div>

                                {showDefect && (
                                    <div className="space-y-2">
                                        <div className="space-y-1">
                                            <span className="text-xs text-slate-500">不良内容</span>
                                            <Input
                                                value={row.bad_content}
                                                onChange={(e) => updateRowField(page, idx, "bad_content", e.target.value)}
                                                className="h-9 text-sm"
                                                placeholder="不良内容"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <span className="text-xs text-slate-500">措置内容</span>
                                            <Input
                                                value={row.action_content}
                                                onChange={(e) => updateRowField(page, idx, "action_content", e.target.value)}
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
        <div className="space-y-6">
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
                            <Input value={inspectorTel} onChange={(e) => setInspectorTel(e.target.value)} />
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

            {renderItemTable("（その1）点検結果", "p1", PAGE1_ITEMS, page1Rows)}
            {renderItemTable("（その2）点検結果", "p2", PAGE2_ITEMS, page2Rows, 18)}

            <Card>
                <CardHeader>
                    <CardTitle>備考・測定機器・集計</CardTitle>
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
                                    <th className="p-2 border">撤去数</th>
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
                                        ["removed", "撤去数"],
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
