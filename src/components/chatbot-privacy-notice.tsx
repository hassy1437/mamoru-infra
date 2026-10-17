"use client"

import { useEffect, useState } from "react"
import { X } from "lucide-react"

/**
 * ★チャットを開いたときに出す注意書き（第3編の読み合わせ P3・2026-10-17）。
 *   チャットボットは外部のサービス（Dify・udify.app）で動いており、入力した内容は外部の事業者へ送られる。
 *   プライバシーポリシーに委託先として書き足すのとあわせて、入口で「個人の情報・物件の住所は入力しない」と伝える。
 *
 * ■ ★Dify の窓の中には手を入れられないので、窓を開いたときに画面の上に出す
 *   （右下の保存ボタン・Dify の窓に重ならない位置）。× で閉じたら、そのタブでは出さない。
 */
export const CHATBOT_PRIVACY_NOTICE =
    "このチャットは外部のサービス（Dify）で動いています。お客様のお名前・ご連絡先・物件の住所などの個人の情報は入力しないでください。"

const STORAGE_KEY = "chatbot-privacy-notice-closed"

export default function ChatbotPrivacyNotice() {
    const [open, setOpen] = useState(false)

    useEffect(() => {
        const onInteraction = (e: Event) => {
            const target = e.target as HTMLElement | null
            if (!target?.closest("#dify-chatbot-bubble-button")) return
            try {
                if (sessionStorage.getItem(STORAGE_KEY) === "1") return
            } catch {
                // 読めなければ出す（安全側）
            }
            setOpen(true)
        }
        document.addEventListener("click", onInteraction)
        return () => document.removeEventListener("click", onInteraction)
    }, [])

    if (!open) return null

    const close = () => {
        setOpen(false)
        try {
            sessionStorage.setItem(STORAGE_KEY, "1")
        } catch {
            // ignore storage errors
        }
    }

    return (
        <div
            role="note"
            className="fixed left-1/2 top-3 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 pr-9 text-xs leading-relaxed text-amber-900 shadow-lg"
            style={{ zIndex: 2147483646 }}
        >
            {CHATBOT_PRIVACY_NOTICE}
            <button
                type="button"
                onClick={close}
                aria-label="注意書きを閉じる"
                className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-amber-700 hover:bg-amber-100"
            >
                <X className="h-3.5 w-3.5" />
            </button>
        </div>
    )
}
