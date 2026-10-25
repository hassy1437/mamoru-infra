"use client"

import { useCallback, useEffect, useState } from "react"
import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"

interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

export function InstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
    const [dismissed, setDismissed] = useState(false)

    useEffect(() => {
        // Check if already dismissed in this session
        if (sessionStorage.getItem("pwa-install-dismissed")) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage はブラウザにしか無いので、マウント後に読む（サーバの描画とずらさない）
            setDismissed(true)
        }

        const handler = (e: Event) => {
            e.preventDefault()
            setDeferredPrompt(e as BeforeInstallPromptEvent)
        }
        window.addEventListener("beforeinstallprompt", handler)
        return () => window.removeEventListener("beforeinstallprompt", handler)
    }, [])

    const handleInstall = useCallback(async () => {
        if (!deferredPrompt) return
        await deferredPrompt.prompt()
        const { outcome } = await deferredPrompt.userChoice
        if (outcome === "accepted") {
            setDeferredPrompt(null)
        }
    }, [deferredPrompt])

    const handleDismiss = useCallback(() => {
        setDismissed(true)
        sessionStorage.setItem("pwa-install-dismissed", "1")
    }, [])

    if (!deferredPrompt || dismissed) return null

    return (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 bg-white rounded-2xl shadow-xl border border-slate-200 p-4 flex items-start gap-3">
            <div className="flex-shrink-0 bg-blue-100 rounded-xl p-2.5">
                <Download className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-slate-900">アプリをインストール</p>
                <p className="text-xs text-slate-500 mt-0.5">
                    ホーム画面に追加すると、オフラインでも素早くアクセスできます。
                </p>
                <div className="flex gap-2 mt-2.5">
                    <Button
                        size="sm"
                        onClick={handleInstall}
                        className="bg-blue-600 hover:bg-blue-700 text-sm h-11 px-4"
                    >
                        インストール
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleDismiss}
                        className="text-sm h-11 px-4 text-slate-500"
                    >
                        後で
                    </Button>
                </div>
            </div>
            {/* ★右上の × は「後で」と同じ動き（handleDismiss）だったので外した（2026-10-25 のボタンの見直し）。
                以前は 16px の × と「後で」の 2 つが同じことをしていた */}
        </div>
    )
}
