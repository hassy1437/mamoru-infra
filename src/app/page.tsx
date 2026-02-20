import Link from "next/link";
import {
    Building2,
    Smartphone,
    FileText,
    Printer,
    ArrowRight,
    ShieldCheck,
    Zap,
    CheckCircle2
} from "lucide-react";

export default function Home() {
    return (
        <div className="flex min-h-screen flex-col bg-slate-50 font-sans text-slate-900 selection:bg-blue-200">
            {/* Background elements */}
            <div className="fixed inset-0 -z-10 h-full w-full bg-slate-50 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
            <div className="fixed left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-blue-400 opacity-20 blur-[100px]"></div>

            {/* Header (Floating Glassmorphism) */}
            <header className="fixed top-4 z-50 w-full px-4 md:px-6 transition-all">
                <div className="mx-auto flex h-16 max-w-6xl items-center justify-between rounded-full border border-white/20 bg-white/70 px-6 backdrop-blur-md shadow-sm">
                    <Link href="/" className="flex items-center gap-2 group">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white transition-transform group-hover:scale-110 group-hover:-rotate-6">
                            <Building2 className="h-4 w-4" />
                        </div>
                        <span className="text-xl font-bold tracking-tight text-slate-800">
                            Mamoru Infra
                        </span>
                    </Link>
                    <nav className="flex items-center gap-4">
                        <Link
                            href="/tool"
                            className="group relative inline-flex h-10 items-center justify-center overflow-hidden rounded-full bg-slate-900 px-6 font-medium text-white transition-all hover:scale-105 hover:shadow-[0_0_20px_rgba(15,23,42,0.3)] hover:bg-slate-800"
                        >
                            <span className="relative z-10 flex items-center gap-2 text-sm">
                                アプリを使う
                                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                            </span>
                        </Link>
                    </nav>
                </div>
            </header>

            <main className="flex-1 pt-32">
                {/* Hero Section */}
                <section className="relative px-4 py-16 md:py-24 md:px-6">
                    <div className="mx-auto max-w-5xl text-center">
                        <div className="mb-8 inline-flex items-center rounded-full border border-blue-200 bg-blue-50/50 px-4 py-1.5 text-sm font-medium text-blue-700 backdrop-blur-sm transition-colors hover:bg-blue-100/50 cursor-pointer">
                            <Zap className="mr-2 h-4 w-4 fill-blue-500 text-blue-500" />
                            <span>消防設備点検の新しいスタンダード</span>
                        </div>

                        <h1 className="mb-8 text-5xl font-extrabold tracking-tight text-slate-900 md:text-7xl lg:text-8xl">
                            現場の事務作業を、
                            <span className="relative whitespace-nowrap">
                                <span className="relative z-10 bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">ゼロ</span>
                                <span className="absolute -bottom-2 left-0 h-3 w-full rounded-sm bg-blue-100 opacity-70"></span>
                            </span>
                            にする。
                        </h1>

                        <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-slate-600 md:text-xl">
                            スマホで入力するだけで、その場で報告書が完成。
                            <br className="hidden sm:inline" />
                            煩雑な書類作成からあなたを解放し、現場作業に集中できる環境を提供します。
                        </p>

                        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                            <Link
                                href="/tool"
                                className="group relative inline-flex h-14 w-full sm:w-auto items-center justify-center overflow-hidden rounded-full bg-blue-600 px-8 text-base font-semibold text-white transition-all hover:scale-105 hover:shadow-[0_0_25px_rgba(37,99,235,0.4)] hover:bg-blue-500"
                            >
                                <span className="relative z-10 flex items-center">
                                    いますぐ無料で試す
                                    <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                                </span>
                            </Link>
                            <a
                                href="#features"
                                className="inline-flex h-14 w-full sm:w-auto items-center justify-center rounded-full border-2 border-slate-200 bg-white px-8 text-base font-semibold text-slate-700 transition-all hover:bg-slate-50 hover:text-slate-900"
                            >
                                詳しく見る
                            </a>
                        </div>

                        <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-sm font-medium text-slate-500">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                                <span>インストール不要</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                                <span>スマホ・タブレット対応</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                                <span>自動PDF生成機能（予定）</span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Features Section (Bento Box style) */}
                <section id="features" className="py-20">
                    <div className="mx-auto max-w-6xl px-4 md:px-6">
                        <div className="mb-16 text-center">
                            <h2 className="mb-4 text-3xl font-bold tracking-tight text-slate-900 md:text-5xl">
                                圧倒的な<span className="text-blue-600">効率化</span>を実現
                            </h2>
                            <p className="text-lg text-slate-600">
                                従来の手作業をデジタルに置き換える、強力な機能群
                            </p>
                        </div>

                        <div className="grid gap-6 md:grid-cols-3 md:grid-rows-2 lg:gap-8">
                            {/* Feature 1 - Large */}
                            <div className="group relative col-span-1 md:col-span-2 overflow-hidden rounded-3xl bg-white p-8 shadow-[0_2px_20px_rgb(0,0,0,0.04)] ring-1 ring-slate-100 transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
                                <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-blue-500/10 blur-3xl transition-all group-hover:bg-blue-500/20"></div>
                                <div className="relative z-10">
                                    <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 transition-transform group-hover:scale-110">
                                        <Smartphone className="h-7 w-7" />
                                    </div>
                                    <h3 className="mb-4 text-2xl font-bold text-slate-900">スマホで完結する現場入力</h3>
                                    <p className="max-w-md text-slate-600 leading-relaxed">
                                        重いバインダーや紙の点検票はもう必要ありません。
                                        手元のスマートフォンやタブレットから、スワイプやタップを中心とした直感的なUIでサクサクと入力できます。
                                        写真の添付や特記事項のメモも簡単です。
                                    </p>
                                </div>
                            </div>

                            {/* Feature 2 - Small (Dark) */}
                            <div className="group relative col-span-1 overflow-hidden rounded-3xl bg-slate-900 p-8 shadow-md transition-all hover:shadow-xl hover:-translate-y-1 text-white">
                                <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100"></div>
                                <div className="relative z-10">
                                    <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-white backdrop-blur-sm transition-transform group-hover:scale-110">
                                        <FileText className="h-7 w-7" />
                                    </div>
                                    <h3 className="mb-4 text-xl font-bold">自動レイアウト</h3>
                                    <p className="text-slate-300 leading-relaxed text-sm">
                                        入力されたデータは、公式の消防設備点検報告書（別記様式第1）のレイアウトに自動で変換・整理されます。面倒なフォーマット調整は不要です。
                                    </p>
                                </div>
                            </div>

                            {/* Feature 3 - Small */}
                            <div className="group relative col-span-1 overflow-hidden rounded-3xl bg-white p-8 shadow-[0_2px_20px_rgb(0,0,0,0.04)] ring-1 ring-slate-100 transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:-translate-y-1">
                                <div className="absolute right-0 bottom-0 h-32 w-32 translate-x-8 translate-y-8 rounded-full bg-emerald-500/10 blur-2xl"></div>
                                <div className="relative z-10">
                                    <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 transition-transform group-hover:scale-110">
                                        <ShieldCheck className="h-7 w-7" />
                                    </div>
                                    <h3 className="mb-4 text-xl font-bold text-slate-900">入力ミスの防止</h3>
                                    <p className="text-slate-600 leading-relaxed text-sm">
                                        必須項目のチェック機能や、整合性のバリデーションを搭載。手作業による転記ミスや漏れを根絶し、正確な書類作成をサポートします。
                                    </p>
                                </div>
                            </div>

                            {/* Feature 4 - Large */}
                            <div className="group relative col-span-1 md:col-span-2 overflow-hidden rounded-3xl bg-indigo-50/50 p-8 shadow-[0_2px_20px_rgb(0,0,0,0.04)] ring-1 ring-indigo-100/50 transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
                                <div className="absolute right-0 top-0 h-full w-1/2 bg-gradient-to-l from-indigo-100/50 to-transparent"></div>
                                <div className="relative z-10 flex h-full flex-col justify-center">
                                    <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 transition-transform group-hover:scale-110">
                                        <Printer className="h-7 w-7" />
                                    </div>
                                    <h3 className="mb-4 text-2xl font-bold text-slate-900">PDF & Word出力 <span className="text-sm font-normal text-indigo-600 bg-indigo-100 px-2 py-1 rounded-full ml-2">近日公開</span></h3>
                                    <p className="max-w-md text-slate-600 leading-relaxed">
                                        完成した報告書は、ワンクリックでPDFやWord形式でダウンロード可能。
                                        そのまま印刷して提出したり、メールで共有したりと、社内外のワークフローをシームレスにつなぎます。
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* CTA Section */}
                <section className="relative py-24 overflow-hidden my-20 mx-4 md:mx-6 rounded-[2.5rem]">
                    <div className="absolute inset-0 bg-blue-600"></div>
                    {/* Abstract shapes */}
                    <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-blue-500 blur-3xl opacity-50"></div>
                    <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-blue-700 blur-3xl opacity-50"></div>

                    <div className="relative mx-auto max-w-4xl px-4 text-center md:px-6">
                        <h2 className="mb-6 text-3xl font-bold tracking-tight text-white md:text-5xl">
                            現場の働き方を変える準備はできましたか？
                        </h2>
                        <p className="mb-10 text-lg text-blue-100 md:text-xl">
                            アカウント登録不要で、今すぐブラウザからお試しいただけます。
                        </p>
                        <Link
                            href="/tool"
                            className="inline-flex h-14 items-center justify-center rounded-full bg-white px-10 text-lg font-bold text-blue-600 shadow-xl transition-all hover:scale-105 hover:bg-slate-50 hover:shadow-2xl"
                        >
                            アプリを起動する
                        </Link>
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer className="border-t border-slate-200 bg-white py-12">
                <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 md:flex-row md:px-6">
                    <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
                            <Building2 className="h-5 w-5 text-slate-600" />
                        </div>
                        <span className="text-lg font-bold tracking-tight text-slate-700">
                            Mamoru Infra
                        </span>
                    </div>
                    <div className="text-center md:text-left">
                        <p className="text-sm font-medium text-slate-500">
                            © 2025 Mamoru Infra. <span className="hidden sm:inline">消防設備点検業務を効率化するポータル</span>
                        </p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
