import Link from "next/link"
import { Building2, Mail } from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "お問い合わせ | Mamoru Infra",
}

export default function ContactPage() {
    return (
        <div className="min-h-screen bg-slate-50">
            <header className="border-b border-slate-200 bg-white">
                <div className="mx-auto flex h-16 max-w-4xl items-center px-4">
                    <Link href="/" className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white">
                            <Building2 className="h-4 w-4" />
                        </div>
                        <span className="text-lg font-bold text-slate-800">Mamoru Infra</span>
                    </Link>
                </div>
            </header>

            <main className="mx-auto max-w-2xl px-4 py-12">
                <h1 className="mb-8 text-3xl font-bold text-slate-900">お問い合わせ</h1>

                <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
                    <div className="mb-8 flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50">
                            <Mail className="h-6 w-6 text-blue-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">メールでのお問い合わせ</h2>
                            <p className="text-sm text-slate-500">通常1〜2営業日以内にご返信いたします</p>
                        </div>
                    </div>

                    <div className="space-y-5">
                        <div>
                            <label className="mb-1.5 block text-sm font-medium text-slate-700">お名前</label>
                            <input
                                type="text"
                                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                placeholder="山田 太郎"
                            />
                        </div>
                        <div>
                            <label className="mb-1.5 block text-sm font-medium text-slate-700">メールアドレス</label>
                            <input
                                type="email"
                                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                placeholder="example@email.com"
                            />
                        </div>
                        <div>
                            <label className="mb-1.5 block text-sm font-medium text-slate-700">お問い合わせ内容</label>
                            <textarea
                                rows={5}
                                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
                                placeholder="お問い合わせ内容をご記入ください..."
                            />
                        </div>
                        <button
                            type="button"
                            className="w-full rounded-lg bg-blue-600 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700"
                        >
                            送信する
                        </button>
                        <p className="text-center text-xs text-slate-400">
                            ※ 現在はフォーム送信機能は準備中です。お急ぎの場合はメールにてご連絡ください。
                        </p>
                    </div>
                </div>
            </main>
        </div>
    )
}
