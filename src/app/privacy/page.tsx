import Link from "next/link"
import { Building2 } from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "プライバシーポリシー | Mamoru Infra",
}

export default function PrivacyPage() {
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
                <h1 className="mb-8 text-3xl font-bold text-slate-900">プライバシーポリシー</h1>
                <div className="prose prose-slate max-w-none space-y-6 text-sm leading-relaxed text-slate-700">
                    <p>最終更新日: 2026年4月1日</p>

                    <section className="space-y-3">
                        <h2 className="text-lg font-bold text-slate-900">1. 収集する情報</h2>
                        <p>本サービスでは、以下の情報を収集します。</p>
                        <ul className="list-disc pl-6 space-y-1">
                            <li><strong>アカウント情報</strong>: メールアドレス、パスワード（暗号化して保存）</li>
                            <li><strong>点検データ</strong>: 物件情報、点検結果、撮影写真など、ユーザーが入力した情報</li>
                            <li><strong>利用ログ</strong>: アクセス日時、利用機能の情報</li>
                        </ul>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-lg font-bold text-slate-900">2. 情報の利用目的</h2>
                        <p>収集した情報は以下の目的で利用します。</p>
                        <ul className="list-disc pl-6 space-y-1">
                            <li>本サービスの提供・運営</li>
                            <li>ユーザーサポートへの対応</li>
                            <li>サービスの改善・新機能の開発</li>
                            <li>利用規約に違反する行為への対応</li>
                        </ul>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-lg font-bold text-slate-900">3. 情報の第三者提供</h2>
                        <p>ユーザーの同意がある場合、または法令に基づく場合を除き、個人情報を第三者に提供することはありません。</p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-lg font-bold text-slate-900">4. データの保管</h2>
                        <p>ユーザーデータはSupabase（クラウドデータベース）上に暗号化通信（HTTPS/TLS）を通じて保管されます。ユーザーごとにデータが分離され、他のユーザーからアクセスすることはできません。</p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-lg font-bold text-slate-900">5. ローカルデータ</h2>
                        <p>オフライン利用時のデータはブラウザのIndexedDBに保存されます。このデータは端末上にのみ存在し、サーバーには自動送信されません。</p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-lg font-bold text-slate-900">6. データの削除</h2>
                        <p>ユーザーはいつでもアカウントの削除を依頼することができます。アカウント削除時には、関連する全てのデータを速やかに削除します。</p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-lg font-bold text-slate-900">7. お問い合わせ</h2>
                        <p>プライバシーに関するお問い合わせは、お問い合わせページからご連絡ください。</p>
                    </section>
                </div>
            </main>
        </div>
    )
}
