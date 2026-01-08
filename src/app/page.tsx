import Link from "next/link";
import {
    Building2,
    Smartphone,
    FileText,
    Printer,
    ArrowRight
} from "lucide-react";

export default function Home() {
    return (
        <div className="flex min-h-screen flex-col font-sans text-slate-800">
            {/* Header */}
            <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
                <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
                    <Link href="/" className="flex items-center gap-2">
                        <Building2 className="h-6 w-6 text-blue-900" />
                        <span className="text-xl font-bold tracking-tight text-blue-900">
                            Mamoru Infra
                        </span>
                    </Link>
                    <nav className="flex items-center gap-4">
                        <Link
                            href="/tool"
                            className="inline-flex h-9 items-center justify-center rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white shadow transition-colors hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-950 disabled:pointer-events-none disabled:opacity-50"
                        >
                            アプリを使う
                        </Link>
                    </nav>
                </div>
            </header>

            <main className="flex-1">
                {/* Hero Section */}
                <section className="bg-blue-900 py-20 text-white md:py-32">
                    <div className="container mx-auto px-4 md:px-6">
                        <div className="mx-auto flex max-w-[800px] flex-col items-center text-center">
                            <h1 className="mb-6 text-4xl font-extrabold tracking-tight md:text-6xl">
                                現場の事務作業を、
                                <br className="md:hidden" />
                                <span className="text-red-500">ゼロ</span>にする。
                            </h1>
                            <p className="mb-10 text-lg text-blue-100 md:text-xl">
                                スマホで入力、その場で報告書完成。
                                <br className="hidden md:inline" />
                                消防設備点検の新しいスタンダード。
                            </p>
                            <div className="flex flex-col items-center gap-4 sm:flex-row">
                                <Link
                                    href="/tool"
                                    className="inline-flex h-12 items-center justify-center rounded-md bg-red-600 px-8 text-base font-medium text-white shadow-lg transition-transform hover:scale-105 hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
                                >
                                    今すぐ無料で試す
                                    <ArrowRight className="ml-2 h-5 w-5" />
                                </Link>
                            </div>
                            <p className="mt-8 text-sm text-blue-200">
                                ※現在ベータ版です。Word/PDF出力機能は順次アップデート予定です。
                            </p>
                        </div>
                    </div>
                </section>

                {/* Benefits Section */}
                <section className="py-20 bg-slate-50">
                    <div className="container mx-auto px-4 md:px-6">
                        <h2 className="mb-12 text-center text-3xl font-bold tracking-tight text-slate-900">
                            Mamoru Infraが選ばれる理由
                        </h2>
                        <div className="grid gap-8 md:grid-cols-3">
                            {/* Benefit 1 */}
                            <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200">
                                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                                    <Smartphone className="h-6 w-6" />
                                </div>
                                <h3 className="mb-2 text-xl font-bold text-slate-900">手書き不要</h3>
                                <p className="text-slate-600">
                                    スマホ・タブレットで現場から直接入力。
                                    紙のメモからの転記作業から解放されます。
                                </p>
                            </div>

                            {/* Benefit 2 */}
                            <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200">
                                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                                    <FileText className="h-6 w-6" />
                                </div>
                                <h3 className="mb-2 text-xl font-bold text-slate-900">自動レイアウト</h3>
                                <p className="text-slate-600">
                                    入力するだけで公式様式（別記様式第1）に自動変換。
                                    レイアウト調整の手間はいりません。
                                </p>
                            </div>

                            {/* Benefit 3 */}
                            <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200">
                                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                                    <Printer className="h-6 w-6" />
                                </div>
                                <h3 className="mb-2 text-xl font-bold text-slate-900">PDF & Word</h3>
                                <p className="text-slate-600">
                                    そのまま印刷・提出が可能（調整中）。
                                    報告書の作成時間を劇的に短縮します。
                                </p>
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer className="border-t border-slate-200 bg-white py-8">
                <div className="container mx-auto px-4 text-center text-slate-600 md:px-6">
                    <p>© 2025 Mamoru Infra</p>
                </div>
            </footer>
        </div>
    );
}
