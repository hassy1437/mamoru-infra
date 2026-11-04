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
                    {/* ★2026-11-04 銘板の読み取り（AI）を書き足した案。★山本さん・弁護士の確認のあとにマージし、日付をその日に直す */}
                    <p>最終更新日: 2026年11月4日</p>

                    <section className="space-y-3">
                        <h2 className="text-lg font-bold text-slate-900">1. 収集する情報</h2>
                        <p>本サービスでは、以下の情報を収集します。</p>
                        <ul className="list-disc pl-6 space-y-1">
                            <li><strong>アカウント情報</strong>: メールアドレス、パスワード（暗号化して保存）</li>
                            <li><strong>点検データ</strong>: 物件情報、点検結果、撮影写真など、ユーザーが入力した情報</li>
                            <li><strong>利用ログ</strong>: アクセス日時、利用機能の情報、点検の画面を操作していた時間（1 分単位。入力した内容は含みません。報告書の作成にかかる時間を把握し、サービスの改善に使います）</li>
                            {/* ★「銘板を撮って読む」（docs/銘板の読み取り_使いながら学ぶ_設計_20261103.md）。使った人だけ */}
                            <li>
                                <strong>銘板の写真と読み取りの記録</strong>（「銘板を撮って読む」をお使いになった場合のみ）: 撮影した銘板の写真、AI
                                による読み取りの結果、ご確認のうえ入力された値、使った日時と回数
                            </li>
                        </ul>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-lg font-bold text-slate-900">2. 情報の利用目的</h2>
                        <p>収集した情報は以下の目的で利用します。</p>
                        <ul className="list-disc pl-6 space-y-1">
                            <li>本サービスの提供・運営</li>
                            <li>ユーザーサポートへの対応</li>
                            <li>サービスの改善・新機能の開発</li>
                            <li>銘板の文字の読み取り（AI による読み取りの結果を表示するため）</li>
                            <li>銘板の読み取りの精度の評価と改善（どの AI がどの欄を正しく読めたかを集計し、使う AI を選ぶため）</li>
                            <li>利用規約に違反する行為への対応</li>
                        </ul>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-lg font-bold text-slate-900">3. 情報の第三者提供</h2>
                        <p>ユーザーの同意がある場合、または法令に基づく場合を除き、個人情報を第三者に提供することはありません。</p>
                        {/* ★委託か提供か・外国にある第三者としての書き方（国名と制度の情報）は山本さん・弁護士の確認が要る */}
                        <p className="font-bold text-slate-900">銘板の読み取りでの外部の AI 事業者への送信</p>
                        <p>
                            「銘板を撮って読む」をお使いになったときに限り、読み取りのため、撮影した銘板の写真を以下の事業者へ送信します。
                            写真は端末で縮小し、<strong>撮影場所などの付帯情報（位置情報など）を取り除いてから</strong>送信します。
                            <strong>物件名・住所・お名前などは送信しません</strong>。銘板以外のもの（人の顔・書類など）が写らないように撮影してください。
                        </p>
                        <ul className="list-disc pl-6 space-y-1">
                            <li>Anthropic, PBC（アメリカ合衆国）: Claude</li>
                            <li>Google LLC（アメリカ合衆国）: Gemini</li>
                            <li>OpenAI（アメリカ合衆国）: ChatGPT（API）</li>
                        </ul>
                        <p>各社での写真の取扱い（保存の期間・学習への利用の有無など）は、各社が定める法人向けの API の規約によります。</p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-lg font-bold text-slate-900">4. データの保管</h2>
                        <p>ユーザーデータはSupabase（クラウドデータベース）上に暗号化通信（HTTPS/TLS）を通じて保管されます。ユーザーごとにデータが分離され、他のユーザーからアクセスすることはできません。</p>
                        <p>
                            銘板の写真は、ご本人と当社の担当者だけが見られる非公開の場所に保管し、<strong>撮影から 1 年で削除します</strong>
                            （読み取りの結果と入力された値の記録は、精度の評価のために残ります）。
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-lg font-bold text-slate-900">5. ローカルデータ</h2>
                        <p>オフライン利用時のデータはブラウザのIndexedDBに保存されます。このデータは端末上にのみ存在し、サーバーには自動送信されません。</p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-lg font-bold text-slate-900">6. データの削除</h2>
                        {/* ★「関連する全てのデータを速やかに削除」と書いていたが、そうする仕組みが無かった（第3編の読み合わせ・2026-10-17）。
                            web のプライバシーポリシーに一本化するまでの間、事実どおりに書く */}
                        <p>アカウントの削除をご希望の場合は、運営までご連絡ください。点検の記録や報告書、ご請求の記録など、法令や料金のお支払い・紛争への対応のために必要な情報は、その目的に必要な期間保存したうえで削除します。</p>
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
