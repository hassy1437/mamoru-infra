"use client"

import { useEffect, useState } from "react"
import { WifiOff } from "lucide-react"

export function OfflineIndicator() {
    const [offline, setOffline] = useState(false)

    useEffect(() => {
        const goOffline = () => setOffline(true)
        const goOnline = () => setOffline(false)

        setOffline(!navigator.onLine)
        window.addEventListener("offline", goOffline)
        window.addEventListener("online", goOnline)
        return () => {
            window.removeEventListener("offline", goOffline)
            window.removeEventListener("online", goOnline)
        }
    }, [])

    if (!offline) return null

    return (
        <div className="fixed top-0 left-0 right-0 z-[9999] bg-amber-500 text-white text-center py-2 px-4 text-sm font-medium flex items-center justify-center gap-2 shadow-md">
            <WifiOff className="w-4 h-4" />
            オフラインです — 入力内容はローカルに保存されます
        </div>
    )
}
