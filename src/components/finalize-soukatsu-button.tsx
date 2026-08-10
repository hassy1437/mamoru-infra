"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, CheckCircle2, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import {
    formatAmount,
    type DuplicateInfo,
    type FinalizationPreview,
    type FinalizationRow,
} from "@/lib/finalization"

/**
 * 総括表の「確定」。
 *
 * ■ ★押す前に金額を見せる
 *   規約 第12条5項が「業者都合の確定後の取消しは返金対象外」と定めている。
 *   金額を知らないまま押した結果を業者は取り消せないので、
 *   何を何項目と数えたか・そのうち課金対象・金額を、押す前に全部出す。
 *   ★0円のときも必ず出す（出さないと「課金されたのか分からない」になる）。
 *
 * ■ ★重複は自動で弾かない
 *   同じ物件・同じ日・同じ種別に確定済みがあっても、正当な2回がありうる
 *   （同一敷地の別棟を午前・午後に点検した場合、総括表は2枚になる）。
 *   確認のダイアログを出し、★何と重複しているかを示したうえで業者に選ばせる。
 */
export default function FinalizeSoukatsuButton({
    soukatsuId,
    preview,
    finalized,
    duplicates,
}: {
    soukatsuId: string
    preview: FinalizationPreview | null
    finalized: FinalizationRow[]
    duplicates: DuplicateInfo[]
}) {
    const [open, setOpen] = useState(false)
    const [confirmingDup, setConfirmingDup] = useState(false)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const router = useRouter()

    const alreadyFinalized = finalized.length > 0

    async function run(duplicateConfirmed: boolean) {
        setBusy(true)
        setError(null)
        const supabase = createClient()
        const { error: e } = await supabase.rpc("finalize_soukatsu", {
            p_soukatsu_id: soukatsuId,
            p_duplicate_confirmed: duplicateConfirmed,
        })
        setBusy(false)
        if (e) {
            // ★確認が要るときは弾かれるのではなく、確認を求められている
            if (/DUPLICATE_CONFIRM_REQUIRED/.test(e.message)) {
                setOpen(false)
                setConfirmingDup(true)
                return
            }
            setError(e.message)
            return
        }
        setOpen(false)
        setConfirmingDup(false)
        router.refresh()
    }

    // ---- 確定済みの表示 ----
    if (alreadyFinalized) {
        const total = finalized.reduce(
            (a, f) => a + (f.billable_codes?.length ?? 0) * (f.unit_price_yen ?? 0),
            0,
        )
        const items = finalized.reduce((a, f) => a + (f.billable_codes?.length ?? 0), 0)
        const last = finalized[finalized.length - 1]
        return (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <p className="flex items-center gap-2 font-bold text-emerald-800">
                    <CheckCircle2 className="h-4 w-4" />
                    確定済み
                </p>
                <dl className="mt-2 space-y-1 text-sm text-emerald-900">
                    <div className="flex gap-2">
                        <dt className="w-24 shrink-0 text-emerald-700">最終確定</dt>
                        <dd>{new Date(last.acted_at).toLocaleString("ja-JP")}</dd>
                    </div>
                    <div className="flex gap-2">
                        <dt className="w-24 shrink-0 text-emerald-700">確定した回数</dt>
                        <dd>{finalized.length} 回</dd>
                    </div>
                    <div className="flex gap-2">
                        <dt className="w-24 shrink-0 text-emerald-700">課金対象</dt>
                        <dd>
                            合計 {items} 項目 ／ {formatAmount(total)}（税別）
                        </dd>
                    </div>
                </dl>
                {/* ★取り消せないことを示す。規約 第12条5項（業者都合の取消しは返金対象外）。 */}
                <p className="mt-3 flex items-start gap-2 rounded border border-emerald-200 bg-white px-3 py-2 text-xs leading-relaxed text-slate-700">
                    <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                    <span>
                        確定はご自身では取り消せません。誤って確定した場合は運営までご連絡ください
                        （設備を追加して確定し直した場合は、増えた分のみが課金対象になります）。
                    </span>
                </p>
            </div>
        )
    }

    if (!preview) return null

    const billable = preview.billable_codes?.length ?? 0
    const codes = preview.equipment_codes ?? []

    return (
        <>
            <Button onClick={() => setOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
                この点検を確定する
            </Button>

            {/* ---- 確定の確認（★押す前に金額を全部見せる） ---- */}
            {open && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
                    role="dialog"
                    aria-modal="true"
                    onClick={() => !busy && setOpen(false)}
                >
                    <div
                        className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-lg font-bold text-slate-900">点検を確定します</h3>

                        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                            <p className="text-sm font-bold text-slate-800">
                                対象の設備（{codes.length} 項目）
                            </p>
                            <ul className="mt-1.5 flex flex-wrap gap-1.5">
                                {codes.map((c) => {
                                    const isBillable = preview.billable_codes?.includes(c)
                                    return (
                                        <li
                                            key={c}
                                            className={
                                                isBillable
                                                    ? "rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800"
                                                    : "rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-600"
                                            }
                                        >
                                            {c}
                                            {!isBillable && "（課金済み）"}
                                        </li>
                                    )
                                })}
                            </ul>

                            <p className="mt-3 border-t border-slate-200 pt-3 text-sm text-slate-800">
                                今回の課金対象：
                                <strong className="ml-1 text-slate-900">{billable} 項目</strong>
                                <span className="mx-1 text-slate-400">×</span>
                                {formatAmount(preview.unit_price_yen)}
                                <span className="mx-1 text-slate-400">＝</span>
                                {/* ★0円も必ず出す */}
                                <strong className="text-base text-blue-700">
                                    {formatAmount(preview.amount_yen)}
                                </strong>
                                <span className="ml-1 text-xs text-slate-500">（税別）</span>
                            </p>
                            {billable === 0 && (
                                <p className="mt-1 text-xs text-slate-600">
                                    設備が増えていないため、今回の追加料金はありません。
                                </p>
                            )}
                        </div>

                        {/* ★確定すると何が起きるか */}
                        <ul className="mt-4 space-y-1.5 text-sm text-slate-700">
                            <li>・報告書の PDF を出力できるようになります</li>
                            <li>
                                ・<strong className="text-slate-900">ご自身では取り消せません</strong>
                                （誤確定は運営までご連絡ください）
                            </li>
                            <li>・上記の金額が請求の対象になります</li>
                        </ul>

                        {error && (
                            <p className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                                {error}
                            </p>
                        )}

                        <div className="mt-5 flex justify-end gap-2">
                            <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
                                キャンセル
                            </Button>
                            <Button
                                disabled={busy}
                                onClick={() => run(false)}
                                className="bg-blue-600 hover:bg-blue-700 text-white"
                            >
                                {busy ? "確定中…" : "確定する"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* ---- 重複の確認（★自動で弾かない。何と重複しているかを示す） ---- */}
            {confirmingDup && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
                    role="dialog"
                    aria-modal="true"
                    onClick={() => !busy && setConfirmingDup(false)}
                >
                    <div
                        className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="flex items-center gap-2 text-lg font-bold text-amber-800">
                            <AlertTriangle className="h-5 w-5" />
                            同じ条件の確定済みがあります
                        </h3>
                        <p className="mt-2 text-sm leading-relaxed text-slate-700">
                            同じ物件・同じ点検日・同じ種別で、すでに確定した総括表があります。
                            <strong className="text-slate-900">別の点検であれば、そのまま確定できます</strong>
                            （別棟を分けて点検した場合など）。同じ点検を二重に確定していないか、
                            下の内容をご確認ください。
                        </p>

                        {/* ★何と重複しているかを示す */}
                        <ul className="mt-3 space-y-2">
                            {duplicates.map((d) => (
                                <li
                                    key={d.soukatsu_id}
                                    className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm"
                                >
                                    <p className="font-medium text-slate-800">
                                        {d.building_name ?? "(建物名なし)"} ／ {d.inspection_date} ／{" "}
                                        {d.inspection_type}
                                    </p>
                                    <p className="mt-0.5 text-xs text-slate-600">
                                        確定日時 {new Date(d.finalized_at).toLocaleString("ja-JP")}
                                    </p>
                                    <p className="mt-0.5 text-xs text-slate-600">
                                        設備：{d.equipment_codes.join("、") || "(なし)"}
                                    </p>
                                </li>
                            ))}
                        </ul>

                        {error && (
                            <p className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                                {error}
                            </p>
                        )}

                        <div className="mt-5 flex justify-end gap-2">
                            <Button
                                variant="outline"
                                disabled={busy}
                                onClick={() => setConfirmingDup(false)}
                            >
                                やめておく
                            </Button>
                            <Button
                                disabled={busy}
                                onClick={() => run(true)}
                                className="bg-amber-600 hover:bg-amber-700 text-white"
                            >
                                {busy ? "確定中…" : "別の点検として確定する"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
