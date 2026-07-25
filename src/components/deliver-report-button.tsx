"use client"

import { Button } from "@/components/ui/button"
import { CheckCircle2, Loader2, MinusCircle, Send } from "lucide-react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import {
    ALL_PDF_FAILED,
    buildMergedReport,
    triggerDownload,
    type ReportInputs,
} from "@/lib/build-merged-report"

const BUCKET = "report-deliveries"

export type Delivery = {
    id: string
    inspection_type: string
    version: number
    delivered_at: string
    superseded_at: string | null
    file_name: string | null
}

export type DeliveryStatus = {
    expected_types: string[]
    deliveries: Delivery[]
}

/** 複製由来の報告書の納品ゲート情報。null = 通常作成（ゲートなし）。 */
export type CloneMeta = {
    soukatsuId: string
    clonedAt: string // これが存在する = 複製由来。最終確認チェックは「常に」描画する。
    cloneConfirmedAt: string | null
    unconfirmedCount: number
}

interface DeliverReportButtonProps {
    // マージ入力（CombinedPdfButton と同じ）
    soukatsuData: Record<string, unknown>
    itiranData: Record<string, unknown>
    bekkiPayloads: Record<string, Record<string, unknown>>
    applicableStepIds: string[]
    buildingName?: string
    equipmentTypes?: string[]
    // 納品コンテキスト
    matchId: string
    itiranId: string // p_source_itiran_id（複製ゲート用・常に渡す＝迂回しない）
    inspectionType: string // この soukatsu の種別（機器点検 / 総合点検）
    inspectionDate: string // p_inspection_date（YYYY-MM-DD）
    status: DeliveryStatus | null // get_match_deliveries の結果
    cloneMeta?: CloneMeta | null // 複製由来なら最終確認ゲートを描画
}

type Phase = "idle" | "building" | "uploading" | "recording" | "done" | "error"

function isDuplicateError(message: string | undefined): boolean {
    if (!message) return false
    const m = message.toLowerCase()
    return m.includes("exist") || m.includes("duplicate")
}

function formatDate(iso: string): string {
    // 表示用に日付部分だけ（タイムゾーン変換はしない・素朴表示）
    return iso.slice(0, 10)
}

/** 種別ごとの「最新（superseded_at is null）」納品を引く。 */
function latestFor(deliveries: Delivery[], type: string): Delivery | undefined {
    return deliveries.find((d) => d.inspection_type === type && d.superseded_at === null)
}

export default function DeliverReportButton({
    soukatsuData,
    itiranData,
    bekkiPayloads,
    applicableStepIds,
    buildingName,
    equipmentTypes,
    matchId,
    itiranId,
    inspectionType,
    inspectionDate,
    status,
    cloneMeta,
}: DeliverReportButtonProps) {
    const router = useRouter()
    const supabase = createClient()

    const [phase, setPhase] = useState<Phase>("idle")
    const [progress, setProgress] = useState({ done: 0, total: 0 })
    const [message, setMessage] = useState<string | null>(null)

    // 複製ゲート: cloneMeta があれば最終確認チェックを「常に」描画（複製元0本itiran＝未確認0でも
    // 描画しないと clone_confirmed_at を立てられず永久に納品不能になる）。無効化は未確認が残る間だけ。
    const [confirmed, setConfirmed] = useState(!!cloneMeta?.cloneConfirmedAt)
    const [confirmSaving, setConfirmSaving] = useState(false)
    // ★描画条件は「複製由来 = cloned_at がある」こと。unconfirmedCount には一切依存させない
    //   （未確認0でもチェックを出さないと clone_confirmed_at を立てられず永久に納品不能になるため）。
    const isClone = !!cloneMeta?.clonedAt
    const hasUnconfirmed = (cloneMeta?.unconfirmedCount ?? 0) > 0
    // 複製由来は「未確認ゼロ」かつ「最終確認済み」でなければ納品不可（deliver_report ゲートの先回り）。
    const cloneBlocked = isClone && (hasUnconfirmed || !confirmed)

    const toggleConfirm = async (checked: boolean) => {
        if (!cloneMeta) return
        setConfirmSaving(true)
        // clone_confirmed_at を直接 update（RLS: soukatsu は owner の ALL。専用RPC不要＝deliver_report が本体ゲート）。
        const { error } = await supabase
            .from("inspection_soukatsu")
            .update({ clone_confirmed_at: checked ? new Date().toISOString() : null })
            .eq("id", cloneMeta.soukatsuId)
        setConfirmSaving(false)
        if (error) {
            setMessage(`最終確認の保存に失敗しました: ${error.message}`)
            return
        }
        setConfirmed(checked)
        router.refresh()
    }

    const input: ReportInputs = {
        soukatsuData,
        itiranData,
        bekkiPayloads,
        applicableStepIds,
        equipmentTypes,
    }

    const deliveries = status?.deliveries ?? []
    const expected = status?.expected_types ?? []
    const currentLatest = latestFor(deliveries, inspectionType)

    // 状態表示に並べる種別 = 依頼が要求する種別 ∪ すでに納品された種別 ∪ この soukatsu の種別
    const allTypes = Array.from(
        new Set<string>([...expected, ...deliveries.map((d) => d.inspection_type), inspectionType]),
    )

    const fileNameJa = `点検報告書_${inspectionType}_${buildingName || "報告書"}.pdf`
    const busy = phase === "building" || phase === "uploading" || phase === "recording"

    const handleDeliver = async () => {
        // 再納品は確認
        if (currentLatest) {
            const ok = window.confirm(
                `${inspectionType}はすでに納品済みです（v${currentLatest.version}）。\n再納品するとオーナーの表示が新しい版(v${currentLatest.version + 1})に差し替わります。続けますか？`,
            )
            if (!ok) return
        }

        setPhase("building")
        setMessage(null)
        setProgress({ done: 0, total: 0 })

        try {
            // 1) Blob を1回だけ生成（この blob を upload と download の両方に使う）
            const { blob, failedLabels, fitFailures } = await buildMergedReport(input, (done, total) =>
                setProgress({ done, total }),
            )

            // ★原因で分ける。枠に収まらない項目は業者が直せるので、直してから納品させる。
            //   ここで「それ以外を結合して納品」を選ばせると、様式が欠けた法定書類が
            //   オーナーに届き、しかも report_deliveries に版として記録されてしまう。
            if (fitFailures.length > 0) {
                setPhase("error")
                setMessage(
                    [
                        "枠に収まらない項目があるため、納品できません。",
                        "次の項目を短くしてから、もう一度納品してください:",
                        ...fitFailures.flatMap((f) => [
                            `【${f.label}】`,
                            ...f.items.map(
                                (it) => `  ${it.label}: ${it.input}文字（${it.over}文字超過）`,
                            ),
                        ]),
                    ].join("\n"),
                )
                return
            }

            // サーバ側の不具合・通信断は業者には直せないので、従来どおり選ばせる
            if (failedLabels.length > 0) {
                const ok = window.confirm(
                    `一部の様式PDF生成に失敗しました（${failedLabels.join(", ")}）。\nそれ以外を結合して納品しますか？`,
                )
                if (!ok) {
                    setPhase("idle")
                    return
                }
            }

            // 2) upload（upsert:false。万一パス衝突なら delivery_id を再採番して1回だけ再試行）
            setPhase("uploading")
            let deliveryId = crypto.randomUUID()
            let path = `${matchId}/${deliveryId}/report.pdf`
            let up = await supabase.storage
                .from(BUCKET)
                .upload(path, blob, { upsert: false, contentType: "application/pdf" })
            if (up.error && isDuplicateError(up.error.message)) {
                deliveryId = crypto.randomUUID()
                path = `${matchId}/${deliveryId}/report.pdf`
                up = await supabase.storage
                    .from(BUCKET)
                    .upload(path, blob, { upsert: false, contentType: "application/pdf" })
            }
            if (up.error) {
                throw new Error(`アップロードに失敗しました: ${up.error.message}`)
            }

            // 3) 納品を記録（upload成功後に呼ぶ＝失敗の非対称性で安全側）
            setPhase("recording")
            const { error: rpcError } = await supabase.rpc("deliver_report", {
                p_match_id: matchId,
                p_delivery_id: deliveryId,
                p_inspection_type: inspectionType,
                p_storage_path: path,
                p_file_name: fileNameJa,
                p_inspection_date: inspectionDate,
                p_note: null,
                // 複製ゲート用に常に itiran を渡す（複製由来でなければサーバ側で素通り）。迂回しない。
                p_source_itiran_id: itiranId,
            })
            if (rpcError) {
                // RPC失敗 = 孤児ファイルが残るがオーナーには見えない（納品レコード無し）。
                throw new Error(`納品の記録に失敗しました: ${rpcError.message}`)
            }

            // 4) 納品したものと同一の blob を控えとしてダウンロード（物理的に同一）
            triggerDownload(blob, fileNameJa)

            setPhase("done")
            setMessage("オーナーへ納品しました（同じPDFを控えとしてダウンロードしました）")
            router.refresh()
        } catch (e) {
            setPhase("error")
            if (e instanceof Error && e.message === ALL_PDF_FAILED) {
                setMessage("全てのPDF生成に失敗しました。時間をおいて再試行してください。")
            } else {
                setMessage(e instanceof Error ? e.message : "納品に失敗しました。再試行してください。")
            }
        }
    }

    return (
        <div className="rounded-lg border border-teal-200 bg-teal-50/50 p-4 space-y-3">
            <div className="flex items-center gap-2">
                <Send className="h-4 w-4 text-teal-700" />
                <h2 className="text-sm font-semibold text-teal-900">オーナーへ納品</h2>
            </div>

            {/* 種別ごとの納品状態 */}
            <div className="space-y-1">
                {allTypes.map((type) => {
                    const latest = latestFor(deliveries, type)
                    return (
                        <div key={type} className="flex items-center gap-2 text-sm">
                            {latest ? (
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                            ) : (
                                <MinusCircle className="h-4 w-4 shrink-0 text-slate-400" />
                            )}
                            <span className="font-medium">{type}</span>
                            {latest ? (
                                <span className="text-slate-600">
                                    納品済み（v{latest.version}・{formatDate(latest.delivered_at)}）
                                </span>
                            ) : (
                                <span className="text-slate-400">未納品</span>
                            )}
                            {type !== inspectionType && !latest && (
                                <span className="text-amber-600 text-xs">
                                    ← この報告書とは別に作成が必要
                                </span>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* 複製由来の最終確認（★clonedAt があれば未確認0でも常に描画・無効化は未確認が残る間だけ） */}
            {isClone && (
                <label
                    className={`flex items-start gap-2 rounded-md border p-3 text-sm ${
                        hasUnconfirmed ? "border-slate-200 bg-slate-50 opacity-70" : "border-amber-300 bg-amber-50"
                    }`}
                >
                    <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4"
                        checked={confirmed}
                        disabled={confirmSaving || hasUnconfirmed}
                        onChange={(e) => toggleConfirm(e.target.checked)}
                    />
                    <span>
                        各様式の内容が、今回実施した点検の結果であることを確認しました。
                        <span className="block text-xs text-slate-500">
                            （この報告書は前回から複製されています。前回の内容のまま提出していないことをご確認ください）
                        </span>
                    </span>
                </label>
            )}

            <Button
                onClick={handleDeliver}
                disabled={busy || cloneBlocked}
                className="bg-teal-700 hover:bg-teal-800 text-white"
            >
                {busy ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {phase === "building"
                            ? `PDF生成中... (${progress.done}/${progress.total})`
                            : phase === "uploading"
                              ? "アップロード中..."
                              : "納品を記録中..."}
                    </>
                ) : (
                    <>
                        <Send className="mr-2 h-4 w-4" />
                        {currentLatest
                            ? `${inspectionType}を再納品（v${currentLatest.version + 1}）`
                            : `${inspectionType}をオーナーへ納品`}
                    </>
                )}
            </Button>

            {cloneBlocked && (
                <p className="text-xs text-amber-600">
                    {hasUnconfirmed
                        ? "未確認の様式があります。各様式を開いて保存してから納品してください。"
                        : "「今回実施した点検の結果である」に最終確認のチェックを入れると納品できます。"}
                </p>
            )}

            {message && (
                <p
                    className={`text-sm ${phase === "error" ? "text-red-600" : "text-emerald-700"}`}
                >
                    {message}
                </p>
            )}
        </div>
    )
}
