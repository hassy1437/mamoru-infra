"use client"

import { useCallback, useEffect, useState } from "react"
import { Eye, Loader2, Save } from "lucide-react"

type Section = { title: string; el: Element }

/**
 * 点検票の画面下に固定する操作の帯（スマホだけ・2026-10-20）。
 *
 * ■ なぜ要るか
 *   iPhone 幅では点検票が長く（第6 は約 47 画面ぶん）、保存・プレビューは一番下にしか無かった。
 *   自動保存はあるが、プレビューを見るにも保存の状態を確かめるにも最後までスクロールが要った。
 *
 * ■ 中身
 *   ・表へ移動: 画面の表（カードの見出し）へ飛ぶ。見出しは描いたあとの画面から集める（様式ごとに表の作りが違うため）
 *   ・保存・プレビュー: 一番下のボタンと同じ処理
 *   ・保存の状態（最終保存・自動保存済みなど）
 *   パソコン（md 以上）では出さない（画面が広く、今までどおり一番下のボタンを使う）。
 */
export default function FormActionBar({
    onSave,
    onPreview,
    busy,
    saving,
    previewing,
    message,
    error,
}: {
    onSave: () => void
    onPreview: () => void
    busy: boolean
    saving: boolean
    previewing: boolean
    message: string | null
    /** ★保存・プレビューの失敗。今までは一番下にしか出ず、帯から押すと見えない */
    error?: string | null
}) {
    const [sections, setSections] = useState<Section[]>([])
    const collect = useCallback(() => {
        const found = [...document.querySelectorAll("[data-form-action-root] h3")]
            .map((el) => ({ title: (el.textContent ?? "").replace(/\s+/g, " ").trim(), el }))
            .filter((s) => s.title)
        setSections(found)
    }, [])
    // 表の見出しは描いたあとに決まる。開く前（押した瞬間）にも集め直す（iPhone はプルダウンを開いてから中身を変えても出ない）
    useEffect(() => {
        const t = window.setTimeout(collect, 0)
        return () => window.clearTimeout(t)
    }, [collect])
    const jump = (i: number) => {
        const s = sections[i]
        if (!s) return
        s.el.scrollIntoView({ behavior: "smooth", block: "start" })
    }

    return (
        <>
            {/* ★帯の高さぶんの余白は、ページのいちばん下の「次へ」（itiran-form-nav の ItiranFormNavBottom）が取る */}
            <div
                role="region"
                aria-label="保存とプレビュー"
                className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_-2px_8px_rgba(15,23,42,0.06)] backdrop-blur md:hidden"
            >
                <div className="flex items-center gap-2">
                    <select
                        aria-label="表へ移動"
                        value=""
                        onFocus={collect}
                        onPointerDown={collect}
                        onChange={(e) => jump(Number(e.target.value))}
                        className="h-11 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 text-slate-700"
                    >
                        <option value="">表へ移動…</option>
                        {sections.map((s, i) => (
                            <option key={i} value={i}>{s.title}</option>
                        ))}
                    </select>
                    <button
                        type="button"
                        onClick={onSave}
                        disabled={busy}
                        className="inline-flex h-11 shrink-0 items-center gap-1 rounded-md bg-slate-700 px-3 font-medium text-white disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        保存
                    </button>
                    <button
                        type="button"
                        onClick={onPreview}
                        disabled={busy}
                        className="inline-flex h-11 shrink-0 items-center gap-1 rounded-md bg-blue-600 px-3 font-medium text-white disabled:opacity-50"
                    >
                        {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                        プレビュー
                    </button>
                </div>
                {error ? (
                    <button
                        type="button"
                        role="alert"
                        onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" })}
                        className="mt-1 block w-full truncate text-left text-xs text-red-600"
                    >
                        {error}（押すと一番下に全文）
                    </button>
                ) : (
                    <p role="status" className="mt-1 truncate text-xs text-slate-500">
                        {message ?? "入力は 5 秒たつと自動で保存されます"}
                    </p>
                )}
            </div>
        </>
    )
}
