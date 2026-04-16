"use client"

import { useEffect, useState } from "react"
import { X } from "lucide-react"

const STORAGE_KEY = "chatbot-hint-seen"
const SCROLL_THRESHOLD = 500
const AUTO_SHOW_DELAY_MS = 10_000
const AUTO_HIDE_DELAY_MS = 15_000

export default function ChatbotHint() {
    const [visible, setVisible] = useState(false)
    const [dismissed, setDismissed] = useState(() => {
        if (typeof window === "undefined") return false
        try {
            return sessionStorage.getItem(STORAGE_KEY) === "1"
        } catch {
            return false
        }
    })

    const handleDismiss = () => {
        setVisible(false)
        setDismissed(true)
        try {
            sessionStorage.setItem(STORAGE_KEY, "1")
        } catch {
            // ignore storage errors (private mode etc.)
        }
    }

    useEffect(() => {
        if (typeof window === "undefined") return
        try {
            if (sessionStorage.getItem(STORAGE_KEY) === "1") return
        } catch {
            // continue
        }

        let shown = false
        const show = () => {
            if (shown) return
            // Only show hint if the Dify button is actually in the DOM
            if (!document.getElementById("dify-chatbot-bubble-button")) return
            shown = true
            setVisible(true)
            window.removeEventListener("scroll", onScroll)
            clearTimeout(timer)
            // Auto-hide after a while so it doesn't linger
            setTimeout(() => setVisible(false), AUTO_HIDE_DELAY_MS)
        }
        const onScroll = () => {
            if (window.scrollY >= SCROLL_THRESHOLD) show()
        }
        const timer = setTimeout(show, AUTO_SHOW_DELAY_MS)
        window.addEventListener("scroll", onScroll, { passive: true })

        // Hide the hint as soon as the user clicks the Dify bubble
        const handleClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement | null
            if (target?.closest("#dify-chatbot-bubble-button")) {
                setVisible(false)
                setDismissed(true)
                try {
                    sessionStorage.setItem(STORAGE_KEY, "1")
                } catch {
                    // ignore storage errors
                }
            }
        }
        document.addEventListener("click", handleClick)

        return () => {
            window.removeEventListener("scroll", onScroll)
            clearTimeout(timer)
            document.removeEventListener("click", handleClick)
        }
    }, [])

    if (dismissed) return null

    return (
        <div
            aria-live="polite"
            className={`fixed bottom-[6rem] right-4 max-w-[16rem] transition-all duration-500 ${
                visible
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-2 pointer-events-none"
            }`}
            style={{ zIndex: visible ? 2147483646 : -1 }}
        >
            <div className="relative rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-xl">
                <button
                    type="button"
                    onClick={handleDismiss}
                    aria-label="ヒントを閉じる"
                    className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-700"
                >
                    <X className="h-3.5 w-3.5" />
                </button>
                <p className="text-xs font-bold text-slate-900">
                    お困りですか？ 💬
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                    こちらからチャットで質問できます
                </p>
                {/* Pointer tail toward the Dify button */}
                <div className="absolute -bottom-1.5 right-6 h-3 w-3 rotate-45 border-b border-r border-slate-200 bg-white" />
            </div>
        </div>
    )
}
