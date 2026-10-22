"use client"

import { isBekkiHeadingLabel } from "@/lib/bekki-heading-row"
import { BekkiHeadingCard, BekkiHeadingTableRow } from "@/components/bekki-heading-row"
import { bekkiPeriodDefault } from "@/lib/bekki-period"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { BEKKI_ROW_NOTES } from "@/lib/bekki-row-notes"
import { WRAP_CLS, bindLabelBreaks } from "@/components/row-label"
import { RowNote } from "@/components/row-note"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { BekkiInspectionTypeInput } from "@/components/bekki-inspection-type-input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangle, CheckCheck, ChevronDown, Eye, FileDown, Loader2, Save, WifiOff } from "lucide-react"
import { toast } from "sonner"
import { friendlyError } from "@/lib/error-messages"
import { supabase } from "@/lib/supabase"
import { loadDraftLocal, saveDraftLocal } from "@/lib/local-draft"
import { toDateInputValue } from "@/lib/date-utils"
import { bekkiInspectionTypeDefault } from "@/lib/bekki-inspection-type"
import {
    resolveDeviceTable,
    type DeviceTableKind,
    type DeviceTableRow,
} from "@/lib/bekki-device-table"
import CameraInput from "@/components/camera-input"
import JudgmentButtons from "@/components/judgment-buttons"
import DeviceTableInputs from "@/components/device-table-inputs"
import {
    normalizeBekkiInspectorNameForPayload,
    normalizeBekkiInspectorNameForState,
    normalizeBekkiWitnessForPayload,
    normalizeBekkiWitnessForState,
} from "@/lib/bekki-form-normalization"
import { bekkiWitnessInitial } from "@/lib/bekki-witness"
import { pdfRequestError, pdfErrorText } from "@/lib/pdf-request-error"

import { hydrateRows, type BekkiRowState } from "@/lib/bekki-row-state"
import { soukatsuPdfGate } from "@/lib/pdf-gate-client"
import { applyBulkGood, bekkiFormNameOfApiRoute } from "@/lib/bekki-bulk-good"
import { BekkiBulkGoodButton } from "@/components/bekki-bulk-good-button"
import { isJudgmentsDefaulted } from "@/lib/bekki-default-good"
import { defectPhraseListId } from "@/lib/defect-phrases"
import { DefectPhraseDatalists } from "@/components/defect-phrase-datalists"
import { BekkiChoiceCheckboxes } from "@/components/bekki-choice-checkboxes"
import { choiceRowsOf, type ChoiceRow } from "@/lib/bekki-choice-rows"
import { CODE_INPUT_PROPS } from "@/lib/code-input-props"
import { useAutoSave } from "@/hooks/use-auto-save"
import FormActionBar from "@/components/form-action-bar"
import InspectorSyncNotice from "@/components/inspector-sync-notice"
export type { BekkiRowState } from "@/lib/bekki-row-state"

export type BekkiDeviceState = {
    name: string
    model: string
    calibrated_at: string
    maker: string
}

export type BekkiPageRowsKey = "page1_rows" | "page2_rows" | "page3_rows" | "page4_rows"

export type BekkiBasePayload = {
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
    notes: string
    /** 古い保存の形（いまは常に空で保存する） */
    device1: BekkiDeviceState
    device2: BekkiDeviceState
    /** 紙の表どおりの測定機器（lib/bekki-device-table.ts） */
    device_table: DeviceTableRow[]
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
    currentValueRowIndex?: number  // 1行に空欄が2つある行のインデックス（既定は電圧計・電流計）
    /**
     * currentValueRowIndex の行の入力欄の見出しと単位。
     * ★既定は電圧計・電流計。様式12の感度範囲「－○％〜＋○％」のように
     *   意味も単位も違う行があり、既定のままだと点検者に電圧を書かせてしまう。
     */
    currentValueFields?: {
        first: string; firstUnit: string
        second: string; secondUnit: string
    }
    splitTypeCapacity?: boolean    // 種別容量を避難口/通路/客席の3列入力にする（様式16）
    pumpPerfRowIndex?: number      // ポンプ性能行: 吐出圧力(content)/吐出量(flow_value) の2欄入力
    hoseRowIndexes?: readonly number[]  // ホース行: 長さ(content)/本数(hose_count)/口径(nozzle_dia) の3列入力
    /**
     * その行を描画しない条件。★labels は絞らないこと。
     *   labels の配列位置がそのまま payload の行インデックスなので、配列を絞ると
     *   hydrateRows(labels.length) で末尾が切り捨てられ、idx がずれて
     *   選択肢の欄 / BEKKI_ROW_NOTES も別の行に付く（サイレントなデータ破壊）。
     *   ＝ 行数と idx は従来どおりのまま、描画だけを飛ばす。
     *   未指定なら全行を描く（既存16様式の挙動は変わらない）。
     */
    hiddenRow?: (label: string, idx: number) => boolean
    /** hiddenRow で実際に行を隠したときだけ、セクション見出しの下に出す説明。 */
    hiddenRowNotice?: string
}

type ExtraFieldConfig = {
    key: string
    label: string
    placeholder?: string
    /**
     * 入力の種類。未指定は "text"（既存の16様式はすべてこれ＝挙動不変）。
     * ★"checkbox" でも保存形は string のまま（"1" = オン / "" = オフ）。
     *   payload の extra_fields は Record<string, string> で、DB列も全様式が共有している。
     *   ここを string | boolean にすると16様式ぶんの読み書きと保存済みデータに波及するため、
     *   型は変えず値の表現だけで表す。空文字がオフ＝未入力と同じ falsy になり、
     *   既存の coerceString による復元もそのまま通る。
     */
    type?: "text" | "checkbox"
}

/** チェックボックス型 extraField のオン判定（保存形が string なので1箇所に閉じる）。 */
const isExtraChecked = (value: string | undefined): boolean => value === "1"

interface Props {
    title: string
    iframeTitle: string
    apiPath: string
    dbTable: string
    downloadFilenamePrefix: string
    initial: {
        building_name?: string | null
        building_address?: string | null
        notifier_name?: string | null
        fire_manager_name?: string | null
        inspector_name?: string | null
        /** 点検者一覧の点検者1の所属会社・住所・TEL（#17）。src/lib/inspector-helpers.ts の bekkiInspectorInitial */
        inspector_company?: string | null
        inspector_address?: string | null
        inspector_tel?: string | null
        inspection_date?: string | null
        /** 総括表の点検期間。別記の期間の初期値にする（src/lib/bekki-period.ts） */
        inspection_period_start?: string | null
        inspection_period_end?: string | null
        /** 総括表の設備の行から引き継いだ立会者（点検票に保存が無いときの初期値・src/lib/bekki-witness.ts） */
        witness?: string | null
        /** 総括表の点検種別。別記の既定にする（無ければ「機器・総合」）。src/lib/bekki-inspection-type.ts */
        inspection_type?: string | null
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
    /**
     * 測定機器の表の種類（lib/bekki-device-table.ts）。
     * 11の1・11の2 は機器名が刷り込んであり、紙の表どおりの 10 行（刷り込みの行は機器名なし・空欄の行は機器名から）で入れる（#23）。
     * ほかの様式は既定の plain（紙の 3 行 × 左右の 6 台・2026-10-20。以前は「機器名つき2行」で 2 台まで）
     */
    deviceTable?: DeviceTableKind
}


const createEmptyDevice = (): BekkiDeviceState => ({
    name: "",
    model: "",
    calibrated_at: "",
    maker: "",
})

const coerceString = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback)


const formatSavedAt = (value?: string | null) => {
    if (!value) return null
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    return date.toLocaleString("ja-JP")
}

export default function BekkiResultFormBase({
    title,
    apiPath,
    dbTable,
    downloadFilenamePrefix,
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
    deviceTable = "plain",
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
    const [notes, setNotes] = useState(coerceString(saved.notes))
    // ★古い保存（device1/device2）は表の行へ振り分けて読む（ルートと同じ関数）
    const [deviceTableRows, setDeviceTableRows] = useState<DeviceTableRow[]>(() => resolveDeviceTable(saved, deviceTable))
    const updateDeviceTableRow = (index: number, field: keyof DeviceTableRow, value: string) =>
        setDeviceTableRows((rows) => rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)))

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

    // ★基本情報（名称・所在地・点検種別・期間・点検者）は総括表・点検者一覧から自動で入る。
    //   入っていれば最初は畳み、判定表を先に見せる（2026-10-19 打合せ #101）。開けば今までどおり直せる。
    //   ★開閉は最初の 1 回だけ決める。入力のたびに決め直すと、最後の 1 文字を入れた瞬間に畳まれて入力中の欄が消える。
    //   防火管理者・立会者・TEL・所属会社・住所は空が正しいことがある（物件に防火管理者が無い等）ので数えない。
    const basicInfoBlank = ([
        ["名称", formName], ["所在地", location], ["点検種別", inspectionType],
        ["点検年月日（開始）", periodStart], ["点検年月日（終了）", periodEnd], ["点検者氏名", inspectorName],
    ] as const).filter(([, v]) => v.trim() === "").map(([label]) => label)
    const [basicInfoOpen, setBasicInfoOpen] = useState(() => basicInfoBlank.length > 0)

    // ★判定の初期値「良」（2026-10-20・録音 102）。新しい様式は開いたときにボタンの部品が入れ、印を立てる
    const [judgmentsDefaulted, setJudgmentsDefaulted] = useState(() => isJudgmentsDefaulted(saved))

    const [saving, setSaving] = useState(false)
    const [loadingPreview, setLoadingPreview] = useState(false)
    const [loadingDownload, setLoadingDownload] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [saveMessage, setSaveMessage] = useState<string | null>(
        formatSavedAt(savedUpdatedAt) ? `最終保存: ${formatSavedAt(savedUpdatedAt)}` : null,
    )


    const payload = useMemo<BekkiBasePayload>(() => ({
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
        notes,
        // ★古い2行は空にして保存する（同じ機器を二重に持たない・ルートは device_table を読む）
        device1: createEmptyDevice(),
        device2: createEmptyDevice(),
        device_table: deviceTableRows,
        extra_fields: extraFieldValues,
        page1_rows: rowsByKey.page1_rows,
        page2_rows: rowsByKey.page2_rows,
        page3_rows: rowsByKey.page3_rows,
        page4_rows: rowsByKey.page4_rows,
    }), [
        deviceTableRows,
        extraFieldValues,
        fireManager,
        formName,
        inspectionType,
        inspectorAddress,
        inspectorCompany,
        inspectorName,
        inspectorTel,
        judgmentsDefaulted,
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
            const msg = saveError.message.includes(dbTable)
                ? "保存テーブルが未作成です。SQLをSupabaseで実行してください。"
                : friendlyError(saveError)
            setError(msg)
            toast.error(msg)
            return false
        }

        setSaveMessage(`保存しました: ${new Date().toLocaleString("ja-JP")}`)
        toast.success("保存しました")
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
        if (!response.ok) throw await pdfRequestError(response)

        return response.blob()
    }, [apiPath, payload])

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
            a.download = `${downloadFilenamePrefix}_${formName || "bekki"}.pdf`
            document.body.appendChild(a)
            a.click()
            a.remove()
            window.URL.revokeObjectURL(url)
        } catch (err) {
            setError(pdfErrorText(err, "PDFダウンロードに失敗しました。"))
        } finally {
            setLoadingDownload(false)
        }
    }, [downloadFilenamePrefix, formName, generatePdfBlob, persistDraft, soukatsuId])

    // Keep a stable ref to the latest persistDraft
    const persistDraftRef = useRef(persistDraft)
    useEffect(() => { persistDraftRef.current = persistDraft }, [persistDraft])

    // 自動保存: 入力が止まって 5 秒後と、別のアプリに切り替えた瞬間（src/hooks/use-auto-save.ts）
    useAutoSave(payload, () => persistDraftRef.current(false), () => setSaveMessage(`自動保存済み: ${new Date().toLocaleString("ja-JP")}`))

    // 復元完了フラグ: 復元前の自動保存（StrictMode の擬似アンマウントや復元前の離脱）で
    // 新しいローカル下書きをサーバー初期値で上書きしないためのガード。
    const restoreReadyRef = useRef(false)

    // Auto-save on unmount (navigation away)。復元が完了するまでは保存しない。
    useEffect(() => {
        return () => { if (restoreReadyRef.current) persistDraftRef.current(false) }
    }, [])

    // オフライン下書きの復元: ローカル(IndexedDB)がサーバー保存より新しければ初期化後に復元する。
    // saveDraftLocal で常にローカル保存しているが従来は読み戻していなかった（書込専用）ため追加。
    // 完了後に restoreReadyRef を立て、以降の自動保存（unmount 等）を許可する。
    useEffect(() => {
        let cancelled = false
        loadDraftLocal(`${dbTable}:${itiranId}`).then((draft) => {
            if (cancelled) return
            try {
                if (!draft) return
                const serverAt = savedUpdatedAt ?? ""
                if (serverAt && draft.savedAt <= serverAt) return // サーバーが同等以上に新しい→復元不要
                const p = (draft.payload as { payload?: Partial<BekkiBasePayload> } | null)?.payload
                if (!p || typeof p !== "object") return
                setFormName(coerceString(p.form_name, initial.building_name ?? ""))
                setFireManager(coerceString(p.fire_manager, initial.fire_manager_name ?? ""))
                setWitness(normalizeBekkiWitnessForState(coerceString(p.witness)))
                setLocation(coerceString(p.location, initial.building_address ?? ""))
                setInspectionType(coerceString(p.inspection_type, bekkiInspectionTypeDefault(initial.inspection_type)))
                setPeriodStart(coerceString(p.period_start, bekkiPeriodDefault(initial).start))
                setPeriodEnd(coerceString(p.period_end, bekkiPeriodDefault(initial).end))
                setInspectorName(normalizeBekkiInspectorNameForState(coerceString(p.inspector_name, initial.inspector_name ?? "")))
                setInspectorCompany(coerceString(p.inspector_company, initial.inspector_company ?? ""))
                setInspectorAddress(coerceString(p.inspector_address, initial.inspector_address ?? ""))
                setInspectorTel(coerceString(p.inspector_tel, initial.inspector_tel ?? ""))
                setNotes(coerceString(p.notes))
                setDeviceTableRows(resolveDeviceTable(p, deviceTable))
                setExtraFieldValues(Object.fromEntries(extraFields.map((f) => [f.key, coerceString((p.extra_fields ?? {})[f.key])])))
                setRowsByKey(() => {
                    const next: Record<BekkiPageRowsKey, BekkiRowState[]> = { page1_rows: [], page2_rows: [], page3_rows: [], page4_rows: [] }
                    for (const section of sections) {
                        next[section.key] = hydrateRows(section.labels.length, (p as Record<string, unknown>)[section.key] as unknown[] | undefined)
                    }
                    return next
                })
                setSaveMessage("オフラインの下書きを復元しました")
            } finally {
                if (!cancelled) restoreReadyRef.current = true
            }
        }).catch(() => { if (!cancelled) restoreReadyRef.current = true })
        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])



    const updateRowField = (key: BekkiPageRowsKey, index: number, field: keyof BekkiRowState, value: string) => {
        setRowsByKey((prev) => ({
            ...prev,
            [key]: prev[key].map((row, i) => (i === index ? { ...row, [field]: value } : row)),
        }))
    }

    // 選択肢の欄（刷り込みの語を○で囲む行）。定義は src/lib/bekki-choice-rows.ts（ルートの label と突き合わせ済み）。
    // 選択語は content に空白区切りで保存され、ルートの drawChoiceCircle（content.includes）がそのまま○を描く。
    // ★以前は様式ごとに choiceRows を渡す形で、別記11の1 の感知器の行にしか無かった（2026-10-20）
    const choiceRowAt = (key: BekkiPageRowsKey, idx: number) => choiceRowsOf(apiPath, key)?.[idx]
    const renderChoiceCheckboxes = (section: SectionConfig, idx: number, row: ChoiceRow, label: string) => (
        <BekkiChoiceCheckboxes
            row={row}
            value={rowsByKey[section.key]?.[idx]?.content ?? ""}
            onChange={(next) => updateRowField(section.key, idx, "content", next)}
            ariaLabel={`${label}（選択）`}
        />
    )

    // 「すべて良にする」: そのセクションの判定が空("")の行だけ "良" にする。
    // 既に "良"/"否" の行は触らない（不良の意図・既入力を上書きしない）。
    // ★見出し行（紙では全幅の見出し・route は描かない）には入れない（src/lib/bekki-heading-row.ts）
    const markAllGoodInSection = (key: BekkiPageRowsKey) => {
        const labels = sections.find((s) => s.key === key)?.labels ?? []
        setRowsByKey((prev) => ({
            ...prev,
            [key]: prev[key].map((row, i) =>
                row.judgment === "" && !isBekkiHeadingLabel(labels[i] ?? "") ? { ...row, judgment: "良" } : row,
            ),
        }))
    }

    // 「この様式の空欄をすべて良にする」: 全部の表に同じ規則（src/lib/bekki-bulk-good.ts）。
    // ★機器点検だけのときは総合点検の行に入れない。画面で畳んでいる行（hiddenRow）にも入れない
    const applyBulkGoodToSections = (targets: Record<string, number[]>) => {
        setRowsByKey((prev) => {
            const next = { ...prev }
            for (const section of sections) next[section.key] = applyBulkGood(prev[section.key], targets[section.key])
            return next
        })
    }

    // ★内容の欄が 2〜3 個に分かれる行（ホース・ポンプ性能・避難口/通路/客席・電圧/電流）と選ぶ欄の行は、
    //   スマホでは内容と判定をそれぞれ横幅いっぱいに置く（半分の幅に 3 つ並べると 1 欄 40px ほどで読めなかった・2026-10-20）
    const isWideContentRow = (section: SectionConfig, idx: number) =>
        Boolean(choiceRowAt(section.key, idx)) || Boolean(section.hoseRowIndexes?.includes(idx)) || idx === section.pumpPerfRowIndex
        || Boolean(section.splitTypeCapacity) || idx === section.currentValueRowIndex

    const renderItemTable = (section: SectionConfig) => (
        <Card key={section.key}>
            <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                        <CardTitle>{section.title}</CardTitle>
                        <CardDescription>種別・容量等の内容、判定、不良内容、措置内容を入力してください。</CardDescription>
                    </div>
                    {/* 判定が空の行だけ一括で「良」にする（既入力の良/否は変えない） */}
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => markAllGoodInSection(section.key)}
                        className="shrink-0 min-h-11 md:min-h-0"
                    >
                        <CheckCheck className="w-4 h-4 mr-1.5" />
                        この表の空欄を良にする
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {/* Desktop: table layout */}
                {section.hiddenRowNotice &&
                    section.labels.some((l, i) => section.hiddenRow?.(l, i)) && (
                        <p className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                            {section.hiddenRowNotice}
                        </p>
                    )}
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
                            {section.labels.map((label, idx) =>
                                section.hiddenRow?.(label, idx) ? null : isBekkiHeadingLabel(label) ? (
                                <BekkiHeadingTableRow key={`${section.key}-heading-${idx}`} label={label} />
                            ) : (
                                <tr key={`${section.key}-${idx}`}>
                                    <td className={`p-2 border ${WRAP_CLS}`}>
                                        {bindLabelBreaks(label)}
                                        {/* ★※印の条件は様式の備考にしか書かれておらず、入力画面には
                                            出ていなかった（行ラベルに※はあるのに条件が無い状態）。
                                            文言は備考の原文のまま。言い換えると意味が変わる。 */}
                                        {BEKKI_ROW_NOTES[apiPath]?.[section.key]?.[idx] && (
                                            <RowNote text={BEKKI_ROW_NOTES[apiPath][section.key][idx]} className="mt-1" />
                                        )}
                                    </td>
                                    <td className="p-1 border">
                                        {choiceRowAt(section.key, idx) ? (
                                            renderChoiceCheckboxes(section, idx, choiceRowAt(section.key, idx)!, label)
                                        ) : section.hoseRowIndexes?.includes(idx) ? (
                                            <div className="flex gap-1 items-center">
                                                <Input
                                                    value={rowsByKey[section.key]?.[idx]?.content ?? ""}
                                                    onChange={(e) => updateRowField(section.key, idx, "content", e.target.value)}
                                                    placeholder="長さ(m)"
                                                    inputMode="decimal"
                                                    className="w-16"
                                                />
                                                <Input
                                                    value={rowsByKey[section.key]?.[idx]?.hose_count ?? ""}
                                                    onChange={(e) => updateRowField(section.key, idx, "hose_count", e.target.value)}
                                                    placeholder="本数"
                                                    inputMode="numeric"
                                                    className="w-14"
                                                />
                                                <Input
                                                    value={rowsByKey[section.key]?.[idx]?.nozzle_dia ?? ""}
                                                    onChange={(e) => updateRowField(section.key, idx, "nozzle_dia", e.target.value)}
                                                    placeholder="口径(mm)"
                                                    inputMode="decimal"
                                                    className="w-16"
                                                />
                                            </div>
                                        ) : idx === section.pumpPerfRowIndex ? (
                                            <div className="flex gap-1 items-center">
                                                <Input
                                                    value={rowsByKey[section.key]?.[idx]?.content ?? ""}
                                                    onChange={(e) => updateRowField(section.key, idx, "content", e.target.value)}
                                                    placeholder="吐出圧力(MPa)"
                                                    inputMode="decimal"
                                                    className="w-24"
                                                />
                                                <Input
                                                    value={rowsByKey[section.key]?.[idx]?.flow_value ?? ""}
                                                    onChange={(e) => updateRowField(section.key, idx, "flow_value", e.target.value)}
                                                    placeholder="吐出量(L/min)"
                                                    inputMode="decimal"
                                                    className="w-24"
                                                />
                                            </div>
                                        ) : section.splitTypeCapacity ? (
                                            <div className="flex gap-1 items-center">
                                                <Input
                                                    value={rowsByKey[section.key]?.[idx]?.content ?? ""}
                                                    onChange={(e) => updateRowField(section.key, idx, "content", e.target.value)}
                                                    placeholder="避難口"
                                                    className="w-20"
                                                />
                                                <Input
                                                    value={rowsByKey[section.key]?.[idx]?.content_tsuro ?? ""}
                                                    onChange={(e) => updateRowField(section.key, idx, "content_tsuro", e.target.value)}
                                                    placeholder="通路"
                                                    className="w-20"
                                                />
                                                <Input
                                                    value={rowsByKey[section.key]?.[idx]?.content_kyaku ?? ""}
                                                    onChange={(e) => updateRowField(section.key, idx, "content_kyaku", e.target.value)}
                                                    placeholder="客席"
                                                    className="w-20"
                                                />
                                            </div>
                                        ) : idx === section.currentValueRowIndex ? (
                                            <div className="flex gap-1 items-center">
                                                <Input
                                                    value={rowsByKey[section.key]?.[idx]?.content ?? ""}
                                                    onChange={(e) => updateRowField(section.key, idx, "content", e.target.value)}
                                                    placeholder={section.currentValueFields?.first ?? "電圧(V)"}
                                                    inputMode="decimal"
                                                    className="w-20"
                                                />
                                                <span className="text-xs text-muted-foreground">{section.currentValueFields?.firstUnit ?? "V"}</span>
                                                <Input
                                                    value={rowsByKey[section.key]?.[idx]?.current_value ?? ""}
                                                    onChange={(e) => updateRowField(section.key, idx, "current_value", e.target.value)}
                                                    placeholder={section.currentValueFields?.second ?? "電流(A)"}
                                                    inputMode="decimal"
                                                    className="w-20"
                                                />
                                                <span className="text-xs text-muted-foreground">{section.currentValueFields?.secondUnit ?? "A"}</span>
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
                                            <option value="良">&#10003; 良</option>
                                            <option value="否">&#10007; 否</option>
                                        </select>
                                    </td>
                                    <td className="p-1 border">
                                        <Input
                                            value={rowsByKey[section.key]?.[idx]?.bad_content ?? ""}
                                            onChange={(e) => updateRowField(section.key, idx, "bad_content", e.target.value)}
                                            list={defectPhraseListId("bad", label)}
                                        />
                                    </td>
                                    <td className="p-1 border">
                                        <Input
                                            value={rowsByKey[section.key]?.[idx]?.action_content ?? ""}
                                            onChange={(e) => updateRowField(section.key, idx, "action_content", e.target.value)}
                                            list={defectPhraseListId("action", label)}
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Mobile: card layout */}
                <div className="md:hidden space-y-3">
                    {section.labels.map((label, idx) =>
                        section.hiddenRow?.(label, idx) ? null : isBekkiHeadingLabel(label) ? (
                        <BekkiHeadingCard key={`${section.key}-heading-${idx}-mobile`} label={label} />
                    ) : (
                        <div key={`${section.key}-mobile-${idx}`} className="border rounded-lg p-3 space-y-2 bg-white">
                            <div className={`font-medium text-sm text-slate-800 ${WRAP_CLS}`}>{bindLabelBreaks(label)}</div>
                            {BEKKI_ROW_NOTES[apiPath]?.[section.key]?.[idx] && (
                                <RowNote text={BEKKI_ROW_NOTES[apiPath][section.key][idx]} />
                            )}
                            <div className="grid grid-cols-2 gap-2">
                                <div className={`space-y-1 min-w-0 ${isWideContentRow(section, idx) ? "col-span-2" : ""}`}>
                                    <span className="text-xs text-slate-500">内容</span>
                                    {choiceRowAt(section.key, idx) ? (
                                        renderChoiceCheckboxes(section, idx, choiceRowAt(section.key, idx)!, label)
                                    ) : section.hoseRowIndexes?.includes(idx) ? (
                                        <div className="flex gap-1 items-center">
                                            <Input
                                                value={rowsByKey[section.key]?.[idx]?.content ?? ""}
                                                onChange={(e) => updateRowField(section.key, idx, "content", e.target.value)}
                                                placeholder="長さ(m)"
                                                inputMode="decimal"
                                                className="h-9 text-sm"
                                            />
                                            <Input
                                                value={rowsByKey[section.key]?.[idx]?.hose_count ?? ""}
                                                onChange={(e) => updateRowField(section.key, idx, "hose_count", e.target.value)}
                                                placeholder="本数"
                                                inputMode="numeric"
                                                className="h-9 text-sm"
                                            />
                                            <Input
                                                value={rowsByKey[section.key]?.[idx]?.nozzle_dia ?? ""}
                                                onChange={(e) => updateRowField(section.key, idx, "nozzle_dia", e.target.value)}
                                                placeholder="口径(mm)"
                                                inputMode="decimal"
                                                className="h-9 text-sm"
                                            />
                                        </div>
                                    ) : idx === section.pumpPerfRowIndex ? (
                                        <div className="flex gap-1 items-center">
                                            <Input
                                                value={rowsByKey[section.key]?.[idx]?.content ?? ""}
                                                onChange={(e) => updateRowField(section.key, idx, "content", e.target.value)}
                                                placeholder="吐出圧力(MPa)"
                                                inputMode="decimal"
                                                className="h-9 text-sm"
                                            />
                                            <Input
                                                value={rowsByKey[section.key]?.[idx]?.flow_value ?? ""}
                                                onChange={(e) => updateRowField(section.key, idx, "flow_value", e.target.value)}
                                                placeholder="吐出量(L/min)"
                                                inputMode="decimal"
                                                className="h-9 text-sm"
                                            />
                                        </div>
                                    ) : section.splitTypeCapacity ? (
                                        <div className="flex gap-1 items-center">
                                            <Input
                                                value={rowsByKey[section.key]?.[idx]?.content ?? ""}
                                                onChange={(e) => updateRowField(section.key, idx, "content", e.target.value)}
                                                placeholder="避難口"
                                                className="h-9 text-sm"
                                            />
                                            <Input
                                                value={rowsByKey[section.key]?.[idx]?.content_tsuro ?? ""}
                                                onChange={(e) => updateRowField(section.key, idx, "content_tsuro", e.target.value)}
                                                placeholder="通路"
                                                className="h-9 text-sm"
                                            />
                                            <Input
                                                value={rowsByKey[section.key]?.[idx]?.content_kyaku ?? ""}
                                                onChange={(e) => updateRowField(section.key, idx, "content_kyaku", e.target.value)}
                                                placeholder="客席"
                                                className="h-9 text-sm"
                                            />
                                        </div>
                                    ) : idx === section.currentValueRowIndex ? (
                                        <div className="flex gap-1 items-center">
                                            <Input
                                                value={rowsByKey[section.key]?.[idx]?.content ?? ""}
                                                onChange={(e) => updateRowField(section.key, idx, "content", e.target.value)}
                                                placeholder={section.currentValueFields?.firstUnit ?? "V"}
                                                inputMode="decimal"
                                                className="h-9 text-sm"
                                            />
                                            <Input
                                                value={rowsByKey[section.key]?.[idx]?.current_value ?? ""}
                                                onChange={(e) => updateRowField(section.key, idx, "current_value", e.target.value)}
                                                placeholder={section.currentValueFields?.secondUnit ?? "A"}
                                                inputMode="decimal"
                                                className="h-9 text-sm"
                                            />
                                        </div>
                                    ) : (
                                        <Input
                                            value={rowsByKey[section.key]?.[idx]?.content ?? ""}
                                            onChange={(e) => updateRowField(section.key, idx, "content", e.target.value)}
                                            className="h-9 text-sm"
                                        />
                                    )}
                                </div>
                                <div className={`space-y-1 min-w-0 ${isWideContentRow(section, idx) ? "col-span-2" : ""}`}>
                                    <span className="text-xs text-slate-500">判定</span>
                                    <JudgmentButtons
                                        value={rowsByKey[section.key]?.[idx]?.judgment ?? ""}
                                        onChange={(v) => updateRowField(section.key, idx, "judgment", v)}
                                        label={label}
                                    />
                                </div>
                            </div>
                            {(rowsByKey[section.key]?.[idx]?.judgment === "否" || rowsByKey[section.key]?.[idx]?.bad_content || rowsByKey[section.key]?.[idx]?.action_content) && (
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <span className="text-xs text-slate-500">不良内容</span>
                                        <Input
                                            value={rowsByKey[section.key]?.[idx]?.bad_content ?? ""}
                                            onChange={(e) => updateRowField(section.key, idx, "bad_content", e.target.value)}
                                            className="h-9 text-sm"
                                            list={defectPhraseListId("bad", label)}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-xs text-slate-500">措置内容</span>
                                        <Input
                                            value={rowsByKey[section.key]?.[idx]?.action_content ?? ""}
                                            onChange={(e) => updateRowField(section.key, idx, "action_content", e.target.value)}
                                            className="h-9 text-sm"
                                            list={defectPhraseListId("action", label)}
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

    const busy = saving || loadingPreview || loadingDownload
    const extraColumnsClass = extraFields.length >= 5 ? "md:grid-cols-5" : extraFields.length >= 4 ? "md:grid-cols-4" : "md:grid-cols-3"

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
            {/* ★様式の頭に 1 つ。表ごとの「この表の空欄を良にする」は残す（#101） */}
            <BekkiBulkGoodButton
                form={bekkiFormNameOfApiRoute(apiPath) ?? apiPath}
                inspectionType={inspectionType}
                sections={sections.map((s) => ({ key: s.key, labels: s.labels, rows: rowsByKey[s.key], hiddenRow: s.hiddenRow }))}
                onApply={applyBulkGoodToSections}
                fresh={savedPayload == null}
                defaulted={judgmentsDefaulted}
                onDefaultedChange={setJudgmentsDefaulted}
            />
            {/* 不良内容・措置内容の候補（自由入力のまま・src/lib/defect-phrases.ts） */}
            <DefectPhraseDatalists />
            <Card>
                <CardHeader>
                    <CardTitle>{title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                    {/* ★基本情報の開閉（畳んでいるときは中身を 1 行で見せる）。押しやすさ: 高さ 44px 以上 */}
                    <button
                        type="button"
                        onClick={() => setBasicInfoOpen((v) => !v)}
                        aria-expanded={basicInfoOpen}
                        aria-controls="bekki-basic-info-1 bekki-basic-info-2 bekki-basic-info-3"
                        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-left hover:bg-slate-100"
                    >
                        <span className="min-w-0">
                            <span className="block text-sm font-medium text-slate-800">
                                基本情報（名称・所在地・立会者・点検種別・期間・点検者）
                            </span>
                            {basicInfoBlank.length > 0 ? (
                                <span className="flex items-center gap-1 text-xs text-amber-700">
                                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                    空の欄があります（{basicInfoBlank.join("・")}）
                                </span>
                            ) : (
                                !basicInfoOpen && (
                                    <span className="block truncate text-xs text-slate-500">
                                        {formName} ／ {inspectionType} ／ {periodStart === periodEnd ? periodStart : `${periodStart}〜${periodEnd}`} ／ 点検者 {inspectorName}
                                        {/* ★立会者も見せる。畳んだ中で空のまま気づかれず、23 様式すべて立会者の空欄で出た（2026-10-20） */}
                                        {" "}／ 立会者 {witness.trim() || "未入力"}
                                    </span>
                                )
                            )}
                        </span>
                        <span className="flex shrink-0 items-center gap-1 text-xs text-slate-600">
                            {basicInfoOpen ? "閉じる" : "開いて直す"}
                            <ChevronDown className={`h-4 w-4 transition-transform ${basicInfoOpen ? "rotate-180" : ""}`} />
                        </span>
                    </button>

                    {/* ★畳むのは hidden 属性（入力欄と値はそのまま残る）。Tailwind の preflight が [hidden] を display:none !important にする */}
                    <div id="bekki-basic-info-1" hidden={!basicInfoOpen} className="grid md:grid-cols-2 gap-4">
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

                    <div id="bekki-basic-info-2" hidden={!basicInfoOpen} className="grid md:grid-cols-4 gap-4">
                        <div className="space-y-1">
                            <Label>点検種別</Label>
                            <BekkiInspectionTypeInput value={inspectionType} onChange={setInspectionType} />
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
                            <Input type="tel" autoComplete="tel" value={inspectorTel} onChange={(e) => setInspectorTel(e.target.value)} />
                        </div>
                    </div>

                    <div id="bekki-basic-info-3" hidden={!basicInfoOpen} className="grid md:grid-cols-2 gap-4">
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
                                {extraFields.map((field) =>
                                    field.type === "checkbox" ? (
                                        <div key={field.key} className="space-y-1">
                                            <label className="flex items-start gap-2 text-sm text-slate-800">
                                                <input
                                                    type="checkbox"
                                                    className="mt-0.5"
                                                    checked={isExtraChecked(extraFieldValues[field.key])}
                                                    onChange={(e) =>
                                                        setExtraFieldValues((prev) => ({
                                                            ...prev,
                                                            // ★保存形は string のまま（"1" = オン / "" = オフ）
                                                            [field.key]: e.target.checked ? "1" : "",
                                                        }))
                                                    }
                                                />
                                                <span>{field.label}</span>
                                            </label>
                                            {field.placeholder && (
                                                <p className="text-xs text-slate-500 pl-6">{field.placeholder}</p>
                                            )}
                                        </div>
                                    ) : (
                                        <div key={field.key} className="space-y-1">
                                            <Label>{field.label}</Label>
                                            <Input
                                                {...(field.key.endsWith("_model") ? CODE_INPUT_PROPS : {})}
                                                placeholder={field.placeholder}
                                                value={extraFieldValues[field.key] ?? ""}
                                                onChange={(e) => setExtraFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                                            />
                                        </div>
                                    ),
                                )}
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

                    <DeviceTableInputs kind={deviceTable} rows={deviceTableRows} onChange={updateDeviceTableRow} />
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
                {saveMessage && (
                    <span className="text-sm text-slate-500 flex items-center gap-1">
                        {saveMessage.includes("オフライン") && <WifiOff className="w-3.5 h-3.5 text-amber-500" />}
                        {saveMessage}
                    </span>
                )}
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            {/* スマホの画面下の帯（保存・プレビュー・表へ移動・保存の状態） */}
            <FormActionBar onSave={handleSave} onPreview={handlePreview} busy={busy} saving={saving} previewing={loadingPreview} message={saveMessage} error={error} />
        </div>
    )
}
