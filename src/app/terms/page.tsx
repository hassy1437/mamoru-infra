import Link from "next/link"
import { Building2 } from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "利用規約 | Mamoru Infra",
}

export default function TermsPage() {
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

            <main className="mx-auto max-w-4xl px-4 py-12">
                <h1 className="mb-8 text-3xl font-bold text-slate-900">利用規約</h1>
                <div className="prose prose-slate max-w-none space-y-6 text-sm leading-relaxed text-slate-700">
                    <p>最終更新日: 2026年4月1日</p>

                    <section className="space-y-3">
                        <h2 className="text-lg font-bold text-slate-900">第1条（適用）</h2>
                        <p>本規約は、Mamoru Infra（以下「本サービス」）の利用に関する条件を定めるものです。ユーザーは本規約に同意の上、本サービスを利用するものとします。</p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-lg font-bold text-slate-900">第2条（利用登録）</h2>
                        <p>本サービスの利用を希望する方は、所定の方法により利用登録を行うものとします。登録情報は正確かつ最新の状態に保つものとします。</p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-lg font-bold text-slate-900">第3条（禁止事項）</h2>
                        <p>ユーザーは以下の行為を行ってはなりません。</p>
                        <ul className="list-disc pl-6 space-y-1">
                            <li>法令または公序良俗に違反する行為</li>
                            <li>本サービスの運営を妨害する行為</li>
                            <li>他のユーザーの情報を不正に収集する行為</li>
                            <li>本サービスを不正に利用する行為</li>
                            <li>その他、運営者が不適切と判断する行為</li>
                        </ul>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-lg font-bold text-slate-900">第4条（本サービスの提供）</h2>
                        <p>本サービスは現状有姿で提供されます。運営者は、事前の通知なく本サービスの内容を変更、または提供を中止することがあります。</p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-lg font-bold text-slate-900">第5条（免責事項）</h2>
                        <p>運営者は、本サービスの利用により生じた損害について、故意または重大な過失がある場合を除き、一切の責任を負いません。本サービスで作成された報告書の内容の正確性については、ユーザーの責任において確認するものとします。</p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-lg font-bold text-slate-900">第6条（規約の変更）</h2>
                        <p>運営者は、必要と判断した場合には、ユーザーに通知することなく本規約を変更することができます。変更後の規約は、本サービス上に掲載された時点で効力を生じるものとします。</p>
                    </section>
                </div>
            </main>
        </div>
    )
}
