import Link from "next/link"
import type { ReactNode } from "react"
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronRight, ClipboardCheck, XCircle } from "lucide-react"
import { groupReadinessByFix, readinessFixHref, type ReadinessFix, type ReadinessItem, type ReportReadiness } from "@/lib/report-readiness"

/**
 * 確定前・出力前の不備チェックの表示（src/lib/report-readiness.ts・2026-10-19・打合せ #101）。
 *
 * ■ 出し方
 *   ・必須はチェックリストとして全部出す（入っているものも ✓ で出す＝何を見たかが分かる）
 *   ・空の必須は先頭に出し、直す画面へのリンクを付ける
 *   ・注意は入っていないものだけ。止めない（確定・出力はできる）と書く
 *   ・★点検者 1 の氏名・資格・電話番号と報告年月日（urgent）は、赤い枠に点滅する印で出す
 *     （2026-10-20・録音 102「不足している項目は一覧上で赤く光らせるなど、誰が見ても一目で気づく表示」）。止めないのは同じ
 *   ・★点滅は約 5 秒で止める・枠もうっすら光らせる（2026-10-25・app/globals.css の attention-pulse / attention-blink）
 *   ・★同じ画面で直す項目は、直すボタンを 1 つにまとめる（2026-10-25・以前は「総括表を編集」が 3 つ並んだ）
 *   ★確定のボタンを止めるのは FinalizeSoukatsuButton（missingRequired）。ここは知らせるだけ
 */

const FIX_TEXT: Record<ReadinessFix["kind"], string> = {
    soukatsu: "総括表を編集",
    property: "物件の設備を編集",
    itiran: "点検者一覧表を編集",
    bekki: "この様式を開く",
}

type Ctx = Parameters<typeof readinessFixHref>[1]

function FixLink({ fix, ctx }: { fix: ReadinessFix | null; ctx: Ctx }) {
    const href = readinessFixHref(fix, ctx)
    if (!href || !fix) return null
    return (
        // ★押しやすさ: 高さ 44px 以上（min-h-11）
        <Link
            href={href}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
            {FIX_TEXT[fix.kind]}
            <ChevronRight className="h-4 w-4" />
        </Link>
    )
}

/** 同じ画面で直す項目を 1 つの行にまとめ、直すボタンは行に 1 つだけ出す */
function FixGroups({ items, ctx, render }: { items: ReadinessItem[]; ctx: Ctx; render: (item: ReadinessItem) => ReactNode }) {
    return (
        <ul className="space-y-3">
            {groupReadinessByFix(items).map((g) => (
                // ★スマホは項目を横いっぱいに出し、直すボタンはその下の右（横に並べると文字が細切れに折り返す）
                <li key={g.key} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-1.5">{g.items.map((item) => <div key={item.id}>{render(item)}</div>)}</div>
                    <div className="self-end sm:self-auto">
                        <FixLink fix={g.fix} ctx={ctx} />
                    </div>
                </li>
            ))}
        </ul>
    )
}

export default function ReportReadinessBox({
    readiness,
    ctx,
    mode,
}: {
    readiness: ReportReadiness
    ctx: Ctx
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
                <div role="alert" className="attention-pulse space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
                    <p className="text-sm font-semibold text-red-800">
                        {mode === "finalize"
                            ? "必須の項目が空です。入れるまで「この点検を確定する」は押せません。"
                            : "必須の項目が空です。空欄のまま報告書（様式第１）・総括表に出ます。"}
                    </p>
                    <FixGroups
                        items={missing}
                        ctx={ctx}
                        render={(m) => (
                            <span className="flex min-w-0 items-start gap-2 text-sm text-red-800">
                                <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                <span>
                                    <span className="font-medium">{m.label}</span>
                                    {m.id === "equipment" && <span className="block text-xs text-red-700">{m.message}</span>}
                                </span>
                            </span>
                        )}
                    />
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
                <div role="alert" className="attention-pulse space-y-2 rounded-lg border-2 border-red-400 bg-red-50 p-3">
                    <p className="text-sm font-semibold text-red-800">
                        足りない項目（{mode === "finalize" ? "確定はできます" : "出力・納品はできます"}が、報告書に空欄で出ます）
                    </p>
                    <FixGroups
                        items={urgent}
                        ctx={ctx}
                        render={(w) => (
                            <span className="flex min-w-0 items-start gap-2 text-sm text-red-800">
                                {/* ★印を点滅させて目に入れる（約 5 秒で止まる・動きを減らす設定の人には点滅させない） */}
                                <AlertCircle className="attention-blink mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                                <span className="min-w-0">
                                    <span className="font-bold">{w.label}</span>：{w.message}
                                </span>
                            </span>
                        )}
                    />
                </div>
            )}

            {normal.length > 0 ? (
                <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
                    <p className="text-sm font-semibold text-amber-800">
                        注意（{mode === "finalize" ? "確定はできます" : "出力・納品はできます"}。入れ忘れでないか確かめてください）
                    </p>
                    <FixGroups
                        items={normal}
                        ctx={ctx}
                        render={(w) => (
                            <span className="flex min-w-0 items-start gap-2 text-sm text-amber-800">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                <span className="min-w-0">
                                    <span className="font-medium">{w.label}</span>：{w.message}
                                    {w.details.length > 0 && (
                                        <span className="block break-words text-xs text-amber-700">{w.details.join("・")}</span>
                                    )}
                                </span>
                            </span>
                        )}
                    />
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
