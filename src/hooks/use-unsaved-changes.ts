"use client"

import { useEffect, useRef, useCallback } from "react"
import { LEAVE_CONFIRM_MESSAGE, linkLeavesPage } from "@/lib/leave-guard"

/**
 * Warns the user before leaving the page with unsaved changes.
 * Call markDirty() when the form state changes, markClean() after save.
 *
 * ★beforeunload だけでは Next の <Link> で離れるときに出ない（ページを読み直さないため）。
 *   画面の中のリンクのクリックも捕まえて確かめる（src/lib/leave-guard.ts・総点検 B13）。
 */
export function useUnsavedChanges() {
    const isDirty = useRef(false)

    const markDirty = useCallback(() => {
        isDirty.current = true
    }, [])

    const markClean = useCallback(() => {
        isDirty.current = false
    }, [])

    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            if (!isDirty.current) return
            e.preventDefault()
        }
        window.addEventListener("beforeunload", handler)
        return () => window.removeEventListener("beforeunload", handler)
    }, [])

    useEffect(() => {
        // ★捕捉（capture）で document に付ける。React はルート要素で受けるので、ここで止めれば
        //   <Link> の onClick（＝画面の切り替え）まで届かない（本番の画面で確かめた・2026-10-09）。
        const onClick = (e: MouseEvent) => {
            if (!isDirty.current) return
            const a = e.target instanceof Element ? e.target.closest("a[href]") : null
            if (!(a instanceof HTMLAnchorElement)) return
            const leaves = linkLeavesPage(
                e,
                { href: a.href, target: a.target, download: a.hasAttribute("download") },
                window.location.href,
            )
            if (!leaves) return
            if (window.confirm(LEAVE_CONFIRM_MESSAGE)) {
                isDirty.current = false
                return
            }
            e.preventDefault()
            e.stopPropagation()
        }
        document.addEventListener("click", onClick, true)
        return () => document.removeEventListener("click", onClick, true)
    }, [])

    return { markDirty, markClean, isDirty }
}
