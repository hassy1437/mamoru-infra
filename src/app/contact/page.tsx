"use client"

import { useState } from "react"
import Link from "next/link"
import { Building2, Mail, CheckCircle2 } from "lucide-react"

export default function ContactPage() {
    const [sent, setSent] = useState(false)

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        const body = {
            name: data.get("name") as string,
            email: data.get("email") as string,
            message: data.get("message") as string,
        }

        // mailto fallback – opens user's mail client with pre-filled content
        const subject = encodeURIComponent(`[Mamoru Infra] ${body.name}様からのお問い合わせ`)
        const mailBody = encodeURIComponent(
            `お名前: ${body.name}\nメールアドレス: ${body.email}\n\n${body.message}`
        )
        window.location.href = `mailto:support@mamoruinfra.com?subject=${subject}&body=${mailBody}`
        setSent(true)
    }

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

                {sent ? (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
                        <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-emerald-500" />
                        <h2 className="mb-2 text-xl font-bold text-slate-900">メーラーが起動しました</h2>
                        <p className="text-sm text-slate-600">
                            メールアプリからそのまま送信してください。<br />
                            メーラーが起動しない場合は、直接
                            <a href="mailto:support@mamoruinfra.com" className="text-blue-600 underline ml-1">
                                support@mamoruinfra.com
                            </a>
                            までご連絡ください。
                        </p>
                        <Link
                            href="/"
                            className="mt-6 inline-flex h-10 items-center justify-center rounded-full bg-blue-600 px-6 text-sm font-semibold text-white hover:bg-blue-500"
                        >
                            トップページへ
                        </Link>
                    </div>
                ) : (
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

                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div>
                                <label htmlFor="contact-name" className="mb-1.5 block text-sm font-medium text-slate-700">お名前</label>
                                <input
                                    id="contact-name"
                                    name="name"
                                    type="text"
                                    required
                                    className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                    placeholder="山田 太郎"
                                />
                            </div>
                            <div>
                                <label htmlFor="contact-email" className="mb-1.5 block text-sm font-medium text-slate-700">メールアドレス</label>
                                <input
                                    id="contact-email"
                                    name="email"
                                    type="email"
                                    required
                                    className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                    placeholder="example@email.com"
                                />
                            </div>
                            <div>
                                <label htmlFor="contact-message" className="mb-1.5 block text-sm font-medium text-slate-700">お問い合わせ内容</label>
                                <textarea
                                    id="contact-message"
                                    name="message"
                                    rows={5}
                                    required
                                    className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
                                    placeholder="お問い合わせ内容をご記入ください..."
                                />
                            </div>
                            <button
                                type="submit"
                                className="w-full rounded-lg bg-blue-600 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700"
                            >
                                送信する
                            </button>
                        </form>
                    </div>
                )}
            </main>
        </div>
    )
}
