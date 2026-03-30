import { WifiOff } from "lucide-react"

export default function OfflinePage() {
    return (
        <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
            <div className="text-center space-y-4">
                <WifiOff className="w-16 h-16 text-slate-400 mx-auto" />
                <h1 className="text-2xl font-bold text-slate-800">オフラインです</h1>
                <p className="text-slate-500 max-w-md">
                    インターネットに接続できません。接続が回復すると自動的にページが表示されます。
                </p>
                <p className="text-sm text-slate-400">
                    既に開いているフォームでは、入力内容がローカルに自動保存されます。
                </p>
            </div>
        </main>
    )
}
