"use client"

import { useEffect } from "react"
import Link from "next/link"
import { AlertTriangle, RefreshCw, ArrowLeft } from "lucide-react"

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error("Application error:", error)
    }, [error])

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
            <div className="mx-auto max-w-md text-center">
                <div className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-red-50">
                    <AlertTriangle className="h-10 w-10 text-red-500" />
                </div>

                <h1 className="mb-2 text-2xl font-extrabold tracking-tight text-slate-900">エラーが発生しました</h1>
                <p className="mb-8 text-sm leading-relaxed text-slate-500">
                    予期しないエラーが発生しました。もう一度お試しいただくか、トップページからやり直してください。
                </p>

                <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                    <button
                        onClick={reset}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-blue-600 px-6 text-sm font-semibold text-white transition-all hover:bg-blue-500 hover:scale-105"
                    >
                        <RefreshCw className="h-4 w-4" />
                        もう一度試す
                    </button>
                    <Link
                        href="/"
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-6 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        トップページへ
                    </Link>
                </div>
            </div>
        </div>
    )
}
