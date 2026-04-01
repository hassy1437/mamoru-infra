import Link from "next/link"
import { Building2, ArrowLeft, Search } from "lucide-react"

export default function NotFound() {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
            <div className="mx-auto max-w-md text-center">
                <div className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-100">
                    <Search className="h-10 w-10 text-slate-400" />
                </div>

                <h1 className="mb-2 text-6xl font-extrabold tracking-tight text-slate-900">404</h1>
                <h2 className="mb-4 text-xl font-bold text-slate-700">ページが見つかりません</h2>
                <p className="mb-8 text-sm leading-relaxed text-slate-500">
                    お探しのページは存在しないか、移動した可能性があります。
                    URLをご確認の上、もう一度お試しください。
                </p>

                <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                    <Link
                        href="/"
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-blue-600 px-6 text-sm font-semibold text-white transition-all hover:bg-blue-500 hover:scale-105"
                    >
                        <Building2 className="h-4 w-4" />
                        トップページへ
                    </Link>
                    <Link
                        href="/tool"
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-6 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        ツールに戻る
                    </Link>
                </div>
            </div>
        </div>
    )
}
