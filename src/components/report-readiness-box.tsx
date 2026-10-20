import Link from "next/link"
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronRight, ClipboardCheck, XCircle } from "lucide-react"
import { readinessFixHref, type ReadinessFix, type ReadinessItem, type ReportReadiness } from "@/lib/report-readiness"

/**
 * 確定前・出力前の不備チェックの表示（src/lib/report-readiness.ts・2026-10-19・打合せ #101）。
 *
 * ■ 出し方
 *   ・必須はチェックリストとして全部出す（入っているものも ✓ で出す＝何を見たかが分かる）
 *   ・空の必須は先頭に出し、直す画面へのリンクを付ける
 *   ・注意は入っていないものだけ。止めない（確定・出力はできる）と書く
 *   ・★点検者 1 の氏名・資格・電話番号と報告年月日（urgent）は、赤い枠に点滅する印で出す
 *     （2026-10-20・録音 102「不足している項目は一覧上で赤く光らせるなど、誰が見ても一目で気づく表示」）。止めないのは同じ
 *   ★確定のボタンを止めるのは FinalizeSoukatsuButton（missingRequired）。ここは知らせるだけ
 */

const FIX_TEXT: Record<ReadinessFix["kind"], string> = {
    soukatsu: "総括表を編集",
    property: "物件の設備を編集",
    itiran: "点検者一覧表を編集",
    bekki: "この様式を開く",
}

function FixLink({ item, ctx }: { item: ReadinessItem; ctx: Parameters<typeof readinessFixHref>[1] }) {
    const href = readinessFixHref(item.fix, ctx)
    if (!href || !item.fix) return null
    return (
        // ★押しやすさ: 高さ 44px 以上（min-h-11）
        <Link
            href={href}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
            {FIX_TEXT[item.fix.kind]}
            <ChevronRight className="h-4 w-4" />
        </Link>
    )
}

export default function ReportReadinessBox({
    readiness,
    ctx,
    mode,
}: {
    readiness: ReportReadiness
    ctx: Parameters<typeof readinessFixHref>[1]
    /** finalize … この画面に確定のボタンがある（空の必須があると押せない）／ review … 確定済み・出力の画面 */
    mode: "finalize" | "review"
}) {
    const { required, missing, warnings } = readiness
    const okItems = required.filter((r) => r.ok)
    // ★赤で目立たせる注意と、黄色の注意に分ける
    const urgent = warnings.filter((w) => w.urgent)
    const normal = warnings.filter((w) => !w.urgent)
    return (
        <section aria-labelledby="report-readiness-title" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="report-readiness-title" className="flex items-center gap-2 font-bold text-slate-900">
                    <ClipboardCheck className="h-5 w-5 shrink-0 text-teal-700" />
                    {mode === "finalize" ? "確定前の確認" : "出力前の確認"}
                </h2>
                <p className="text-xs text-slate-500">
                    必須 {required.length} 項目中 {okItems.length} 項目 OK ／ 注意 {warnings.length} 件
                </p>
            </div>

            {missing.length > 0 && (
                <div role="alert" className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
                    <p className="text-sm font-semibold text-red-800">
                        {mode === "finalize"
                            ? "必須の項目が空です。入れるまで「この点検を確定する」は押せません。"
                            : "必須の項目が空です。空欄のまま報告書（様式第１）・総括表に出ます。"}
                    </p>
                    <ul className="space-y-2">
                        {missing.map((m) => (
                            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2">
                                <span className="flex min-w-0 items-start gap-2 text-sm text-red-800">
                                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                    <span>
                                        <span className="font-medium">{m.label}</span>
                                        {m.id === "equipment" && <span className="block text-xs text-red-700">{m.message}</span>}
                                    </span>
                                </span>
                                <FixLink item={m} ctx={ctx} />
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {okItems.length > 0 && (
                <ul aria-label="入っている必須の項目" className="flex flex-wrap gap-x-4 gap-y-1">
                    {okItems.map((r) => (
                        <li key={r.id} className="flex items-center gap-1 text-sm text-slate-700">
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                            {r.label}
                        </li>
                    ))}
                </ul>
            )}

            {urgent.length > 0 && (
                <div role="alert" className="space-y-2 rounded-lg border-2 border-red-400 bg-red-50 p-3">
                    <p className="text-sm font-semibold text-red-800">
                        足りない項目（{mode === "finalize" ? "確定はできます" : "出力・納品はできます"}が、報告書に空欄で出ます）
                    </p>
                    <ul className="space-y-2">
                        {urgent.map((w) => (
                            <li key={w.id} className="flex flex-wrap items-center justify-between gap-2">
                                <span className="flex min-w-0 items-start gap-2 text-sm text-red-800">
                                    {/* ★印を点滅させて目に入れる（動きを減らす設定の人には点滅させない） */}
                                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 motion-safe:animate-pulse" />
                                    <span className="min-w-0">
                                        <span className="font-bold">{w.label}</span>：{w.message}
                                    </span>
                                </span>
                                <FixLink item={w} ctx={ctx} />
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {normal.length > 0 ? (
                <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
                    <p className="text-sm font-semibold text-amber-800">
                        注意（{mode === "finalize" ? "確定はできます" : "出力・納品はできます"}。入れ忘れでないか確かめてください）
                    </p>
                    <ul className="space-y-2">
                        {normal.map((w) => (
                            <li key={w.id} className="flex flex-wrap items-center justify-between gap-2">
                                <span className="flex min-w-0 items-start gap-2 text-sm text-amber-800">
                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                    <span className="min-w-0">
                                        <span className="font-medium">{w.label}</span>：{w.message}
                                        {w.details.length > 0 && (
                                            <span className="block break-words text-xs text-amber-700">{w.details.join("・")}</span>
                                        )}
                                    </span>
                                </span>
                                <FixLink item={w} ctx={ctx} />
                            </li>
                        ))}
                    </ul>
                </div>
            ) : (
                missing.length === 0 && urgent.length === 0 && (
                    <p className="flex items-center gap-2 text-sm text-emerald-700">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        必須の項目はすべて入っています。注意の項目もありません。
                    </p>
                )
            )}
        </section>
    )
}
