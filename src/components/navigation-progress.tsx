"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"

/**
 * 画面を移るときの「読み込み中」（録音 102・2026-10-20）。
 *
 * ■ なぜ要るか
 *   点検アプリは画面ごとにサーバーで組み立てるので、リンクを押してから次の画面が出るまで（現場の回線では数秒）
 *   画面が何も変わらず、押せていないと思って何度も押していた。loading.tsx は物件と総括表の一部にしか無く、
 *   点検者・23 様式・出力の間の移動では何も出なかった。
 *
 * ■ 決まり
 *   ・同じサイトの別の画面へのリンクを押した瞬間に、画面の上に帯と「読み込み中…」を出す。画面が変わったら消す
 *   ・保存していない入力の確認（src/lib/leave-guard.ts）で「キャンセル」したら、クリックはそこで止まって
 *     ここには届かない（stopPropagation）＝出さない
 *   ・新しいタブ・修飾キー・ダウンロード・別のサイト・同じ画面（# だけ・同じ URL）は出さない
 *   ・念のため 15 秒で消す（戻るボタンで止めた・読み込みに失敗した など）
 */
export default function NavigationProgress() {
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const current = `${pathname}?${searchParams.toString()}`
    const [pendingFrom, setPendingFrom] = useState<string | null>(null)
    // ★画面が変わったら消す（描画の中で前の URL と比べる・effect で setState しない）
    const [shownUrl, setShownUrl] = useState(current)
    if (shownUrl !== current) {
        setShownUrl(current)
        setPendingFrom(null)
    }
    const timer = useRef<number | null>(null)

    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
            const a = e.target instanceof Element ? e.target.closest("a[href]") : null
            if (!(a instanceof HTMLAnchorElement)) return
            if ((a.target && a.target !== "_self") || a.hasAttribute("download")) return
            const url = new URL(a.href, location.href)
            if (url.origin !== location.origin) return
            if (url.pathname === location.pathname && url.search === location.search) return
            setPendingFrom(`${location.pathname}?${location.search.replace(/^\?/, "")}`)
            if (timer.current) window.clearTimeout(timer.current)
            timer.current = window.setTimeout(() => setPendingFrom(null), 15_000)
        }
        // ★泡立ち（bubble）で window に付ける。leave-guard は捕捉（capture）で止めるので、断られたクリックはここに来ない
        window.addEventListener("click", onClick)
        return () => {
            window.removeEventListener("click", onClick)
            if (timer.current) window.clearTimeout(timer.current)
        }
    }, [])

    if (pendingFrom === null || pendingFrom !== current) return null
    return (
        <div role="status" aria-live="polite" className="nav-progress pointer-events-none fixed inset-x-0 top-0 z-[70]">
            <div className="h-1 w-full overflow-hidden bg-blue-100">
                <div className="nav-progress-bar h-full w-1/3 bg-blue-600" />
            </div>
            <div className="mx-auto mt-2 flex w-fit items-center gap-2 rounded-full bg-slate-900/85 px-4 py-2 text-sm font-medium text-white shadow-lg">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                読み込み中…
            </div>
        </div>
    )
}
