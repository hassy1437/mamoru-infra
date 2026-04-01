import Link from "next/link";
import {
    Building2,
    Smartphone,
    FileText,
    Download,
    ArrowRight,
    ShieldCheck,
    Zap,
    CheckCircle2,
    PenLine,
    X,
    Check,
    HelpCircle,
    FileSpreadsheet,
} from "lucide-react";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import ScrollAnimate from "@/components/scroll-animate";
import FaqAccordion from "@/components/faq-accordion";
import AppDemo from "@/components/app-demo";

export const metadata: Metadata = {
    title: "Mamoru Infra — 消防設備点検の報告書作成を効率化",
    description:
        "スマホで入力するだけで、消防設備点検結果報告書のPDFをその場で自動生成。別記様式第1〜第8に対応。インストール不要・無料で利用可能。",
    twitter: {
        card: "summary_large_image",
        title: "Mamoru Infra — 消防設備点検の報告書作成を効率化",
        description: "スマホで入力するだけで報告書PDFを自動生成。無料・インストール不要。",
    },
    openGraph: {
        title: "Mamoru Infra — 消防設備点検の報告書作成を効率化",
        description: "スマホで入力するだけで報告書PDFを自動生成。無料・インストール不要。",
        type: "website",
    },
};

export default async function Home() {
    let user = null;
    try {
        const supabase = await createClient();
        const { data } = await supabase.auth.getUser();
        user = data.user;
    } catch {
        // Auth failure should not crash the landing page.
    }
    return (
        <div className="flex min-h-screen flex-col bg-slate-50 font-sans text-slate-900 selection:bg-blue-200">
            {/* Background elements */}
            <div className="fixed inset-0 -z-10 h-full w-full bg-slate-50 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
            <div className="fixed left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-blue-400 opacity-20 blur-[100px]"></div>

            {/* Header */}
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
                    <nav className="flex items-center gap-3">
                        {user ? (
                            <Link
                                href="/tool"
                                className="group relative inline-flex h-10 items-center justify-center overflow-hidden rounded-full bg-slate-900 px-6 font-medium text-white transition-all hover:scale-105 hover:shadow-[0_0_20px_rgba(15,23,42,0.3)] hover:bg-slate-800"
                            >
                                <span className="relative z-10 flex items-center gap-2 text-sm">
                                    アプリを使う
                                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                                </span>
                            </Link>
                        ) : (
                            <>
                                <Link
                                    href="/login"
                                    className="inline-flex h-10 items-center justify-center rounded-full border border-slate-200 bg-white px-5 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50"
                                >
                                    ログイン
                                </Link>
                                <Link
                                    href="/signup"
                                    className="group relative inline-flex h-10 items-center justify-center overflow-hidden rounded-full bg-slate-900 px-6 font-medium text-white transition-all hover:scale-105 hover:shadow-[0_0_20px_rgba(15,23,42,0.3)] hover:bg-slate-800"
                                >
                                    <span className="relative z-10 flex items-center gap-2 text-sm">
                                        新規登録
                                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                                    </span>
                                </Link>
                            </>
                        )}
                    </nav>
                </div>
            </header>

            <main className="flex-1 pt-32">
                {/* Hero Section with App Mockup */}
                <section className="relative px-4 py-16 md:py-24 md:px-6">
                    <div className="mx-auto max-w-6xl">
                        <div className="grid items-center gap-12 md:grid-cols-2">
                            {/* Left: Text */}
                            <div>
                                <div className="mb-8 inline-flex items-center rounded-full border border-blue-200 bg-blue-50/50 px-4 py-1.5 text-sm font-medium text-blue-700 backdrop-blur-sm">
                                    <Zap className="mr-2 h-4 w-4 fill-blue-500 text-blue-500" />
                                    <span>消防設備点検の新しいスタンダード</span>
                                </div>

                                <h1 className="mb-8 text-4xl font-extrabold tracking-tight text-slate-900 md:text-6xl lg:text-7xl">
                                    現場の事務作業を、
                                    <span className="relative whitespace-nowrap">
                                        <span className="relative z-10 bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">ゼロ</span>
                                        <span className="absolute -bottom-2 left-0 h-3 w-full rounded-sm bg-blue-100 opacity-70"></span>
                                    </span>
                                    にする。
                                </h1>

                                <p className="mb-10 max-w-lg text-lg leading-relaxed text-slate-600">
                                    スマホで入力するだけで、その場で報告書が完成。
                                    煩雑な書類作成からあなたを解放します。
                                </p>

                                <div className="flex flex-col gap-4 sm:flex-row">
                                    <Link
                                        href={user ? "/tool" : "/signup"}
                                        className="group relative inline-flex h-14 items-center justify-center overflow-hidden rounded-full bg-blue-600 px-8 text-base font-semibold text-white transition-all hover:scale-105 hover:shadow-[0_0_25px_rgba(37,99,235,0.4)] hover:bg-blue-500"
                                    >
                                        <span className="relative z-10 flex items-center">
                                            {user ? "アプリを使う" : "いますぐ無料で試す"}
                                            <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                                        </span>
                                    </Link>
                                    <a
                                        href="#features"
                                        className="inline-flex h-14 items-center justify-center rounded-full border-2 border-slate-200 bg-white px-8 text-base font-semibold text-slate-700 transition-all hover:bg-slate-50"
                                    >
                                        詳しく見る
                                    </a>
                                </div>

                                <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-slate-500">
                                    <div className="flex items-center gap-2">
                                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                        <span>インストール不要</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                        <span>スマホ対応</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                        <span>自動PDF生成</span>
                                    </div>
                                </div>
                            </div>

                            {/* Right: Animated App Demo */}
                            <AppDemo />
                        </div>
                    </div>
                </section>

                {/* Social Proof Numbers */}
                <ScrollAnimate>
                    <section className="py-16 border-y border-slate-200 bg-white">
                        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 px-4 text-center md:grid-cols-4 md:px-6">
                            <div>
                                <div className="text-3xl font-extrabold text-blue-600 md:text-4xl">22</div>
                                <div className="mt-1 text-sm font-medium text-slate-500">対応様式数</div>
                            </div>
                            <div>
                                <div className="text-3xl font-extrabold text-blue-600 md:text-4xl">1/3</div>
                                <div className="mt-1 text-sm font-medium text-slate-500">作成時間を短縮</div>
                            </div>
                            <div>
                                <div className="text-3xl font-extrabold text-blue-600 md:text-4xl">0円</div>
                                <div className="mt-1 text-sm font-medium text-slate-500">利用料金</div>
                            </div>
                            <div>
                                <div className="text-3xl font-extrabold text-blue-600 md:text-4xl">PWA</div>
                                <div className="mt-1 text-sm font-medium text-slate-500">オフライン対応</div>
                            </div>
                        </div>
                    </section>
                </ScrollAnimate>

                {/* 3-Step Usage */}
                <section className="py-20 px-4 md:px-6">
                    <div className="mx-auto max-w-5xl">
                        <ScrollAnimate>
                            <div className="mb-16 text-center">
                                <h2 className="mb-4 text-3xl font-bold tracking-tight text-slate-900 md:text-5xl">
                                    <span className="text-blue-600">3ステップ</span>で報告書完成
                                </h2>
                                <p className="text-lg text-slate-600">面倒な作業は全て自動化。現場での入力だけで完結します。</p>
                            </div>
                        </ScrollAnimate>
                        <div className="grid gap-8 md:grid-cols-3">
                            <ScrollAnimate delay={0}>
                                <div className="relative text-center">
                                    <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-4 ring-blue-100">
                                        <Building2 className="h-10 w-10" />
                                    </div>
                                    <div className="absolute -top-2 left-1/2 -translate-x-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white shadow-lg">1</div>
                                    <h3 className="mb-2 text-xl font-bold text-slate-900">物件を登録</h3>
                                    <p className="text-sm text-slate-600 leading-relaxed">建物名・住所・届出者などの基本情報と点検対象設備を登録します。</p>
                                </div>
                            </ScrollAnimate>
                            <ScrollAnimate delay={150}>
                                <div className="relative text-center">
                                    <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-4 ring-emerald-100">
                                        <PenLine className="h-10 w-10" />
                                    </div>
                                    <div className="absolute -top-2 left-1/2 -translate-x-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white shadow-lg">2</div>
                                    <h3 className="mb-2 text-xl font-bold text-slate-900">現場で点検入力</h3>
                                    <p className="text-sm text-slate-600 leading-relaxed">スマホから各設備の点検結果を入力。写真撮影・メモも可能です。</p>
                                </div>
                            </ScrollAnimate>
                            <ScrollAnimate delay={300}>
                                <div className="relative text-center">
                                    <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 ring-4 ring-indigo-100">
                                        <Download className="h-10 w-10" />
                                    </div>
                                    <div className="absolute -top-2 left-1/2 -translate-x-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white shadow-lg">3</div>
                                    <h3 className="mb-2 text-xl font-bold text-slate-900">PDF出力・提出</h3>
                                    <p className="text-sm text-slate-600 leading-relaxed">ワンクリックで公式様式のPDFを生成。印刷してそのまま提出できます。</p>
                                </div>
                            </ScrollAnimate>
                        </div>
                    </div>
                </section>

                {/* Features Section (Bento Box) */}
                <section id="features" className="py-20">
                    <div className="mx-auto max-w-6xl px-4 md:px-6">
                        <ScrollAnimate>
                            <div className="mb-16 text-center">
                                <h2 className="mb-4 text-3xl font-bold tracking-tight text-slate-900 md:text-5xl">
                                    圧倒的な<span className="text-blue-600">効率化</span>を実現
                                </h2>
                                <p className="text-lg text-slate-600">
                                    従来の手作業をデジタルに置き換える、強力な機能群
                                </p>
                            </div>
                        </ScrollAnimate>

                        <div className="grid gap-6 md:grid-cols-3 md:grid-rows-2 lg:gap-8">
                            <ScrollAnimate className="col-span-1 md:col-span-2">
                                <div className="group relative h-full overflow-hidden rounded-3xl bg-white p-8 shadow-[0_2px_20px_rgb(0,0,0,0.04)] ring-1 ring-slate-100 transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
                                    <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-blue-500/10 blur-3xl transition-all group-hover:bg-blue-500/20"></div>
                                    <div className="relative z-10">
                                        <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 transition-transform group-hover:scale-110">
                                            <Smartphone className="h-7 w-7" />
                                        </div>
                                        <h3 className="mb-4 text-2xl font-bold text-slate-900">スマホで完結する現場入力</h3>
                                        <p className="max-w-md text-slate-600 leading-relaxed">
                                            重いバインダーや紙の点検票はもう必要ありません。
                                            手元のスマートフォンやタブレットから、直感的なUIでサクサクと入力できます。
                                        </p>
                                    </div>
                                </div>
                            </ScrollAnimate>

                            <ScrollAnimate delay={100}>
                                <div className="group relative col-span-1 h-full overflow-hidden rounded-3xl bg-slate-900 p-8 shadow-md transition-all hover:shadow-xl hover:-translate-y-1 text-white">
                                    <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100"></div>
                                    <div className="relative z-10">
                                        <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-white backdrop-blur-sm transition-transform group-hover:scale-110">
                                            <FileText className="h-7 w-7" />
                                        </div>
                                        <h3 className="mb-4 text-xl font-bold">自動レイアウト</h3>
                                        <p className="text-slate-200 leading-relaxed text-sm">
                                            入力データは公式の別記様式レイアウトに自動変換。面倒なフォーマット調整は不要です。
                                        </p>
                                    </div>
                                </div>
                            </ScrollAnimate>

                            <ScrollAnimate delay={150}>
                                <div className="group relative col-span-1 h-full overflow-hidden rounded-3xl bg-white p-8 shadow-[0_2px_20px_rgb(0,0,0,0.04)] ring-1 ring-slate-100 transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:-translate-y-1">
                                    <div className="absolute right-0 bottom-0 h-32 w-32 translate-x-8 translate-y-8 rounded-full bg-emerald-500/10 blur-2xl"></div>
                                    <div className="relative z-10">
                                        <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 transition-transform group-hover:scale-110">
                                            <ShieldCheck className="h-7 w-7" />
                                        </div>
                                        <h3 className="mb-4 text-xl font-bold text-slate-900">入力ミスの防止</h3>
                                        <p className="text-slate-600 leading-relaxed text-sm">
                                            必須項目チェック機能で転記ミスや漏れを防ぎ、正確な書類作成をサポートします。
                                        </p>
                                    </div>
                                </div>
                            </ScrollAnimate>

                            <ScrollAnimate delay={200} className="col-span-1 md:col-span-2">
                                <div className="group relative h-full overflow-hidden rounded-3xl bg-indigo-50/50 p-8 shadow-[0_2px_20px_rgb(0,0,0,0.04)] ring-1 ring-indigo-100/50 transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
                                    <div className="absolute right-0 top-0 h-full w-1/2 bg-gradient-to-l from-indigo-100/50 to-transparent"></div>
                                    <div className="relative z-10 flex h-full flex-col justify-center">
                                        <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 transition-transform group-hover:scale-110">
                                            <Download className="h-7 w-7" />
                                        </div>
                                        <h3 className="mb-4 text-2xl font-bold text-slate-900">ワンクリックPDF出力</h3>
                                        <p className="max-w-md text-slate-600 leading-relaxed">
                                            完成した報告書はワンクリックでPDFダウンロード。そのまま印刷して消防署へ提出できます。
                                        </p>
                                    </div>
                                </div>
                            </ScrollAnimate>
                        </div>
                    </div>
                </section>

                {/* Comparison Table */}
                <section className="py-20 px-4 md:px-6 bg-white">
                    <div className="mx-auto max-w-4xl">
                        <ScrollAnimate>
                            <div className="mb-12 text-center">
                                <h2 className="mb-4 text-3xl font-bold tracking-tight text-slate-900 md:text-5xl">
                                    紙の作業と<span className="text-blue-600">徹底比較</span>
                                </h2>
                            </div>
                        </ScrollAnimate>
                        <ScrollAnimate>
                            <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-200 bg-slate-50">
                                            <th className="px-4 py-4 text-left font-semibold text-slate-500 w-1/3"></th>
                                            <th className="px-4 py-4 text-center font-semibold text-slate-400 w-1/3">従来の紙作業</th>
                                            <th className="px-4 py-4 text-center font-bold text-blue-600 w-1/3">Mamoru Infra</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        <tr>
                                            <td className="px-4 py-4 font-medium text-slate-700">報告書作成時間</td>
                                            <td className="px-4 py-4 text-center text-slate-500">1物件あたり 60〜90分</td>
                                            <td className="px-4 py-4 text-center font-semibold text-blue-600">約20分</td>
                                        </tr>
                                        <tr className="bg-slate-50/50">
                                            <td className="px-4 py-4 font-medium text-slate-700">転記ミス</td>
                                            <td className="px-4 py-4 text-center"><X className="h-5 w-5 text-red-400 mx-auto" /></td>
                                            <td className="px-4 py-4 text-center"><Check className="h-5 w-5 text-emerald-500 mx-auto" /></td>
                                        </tr>
                                        <tr>
                                            <td className="px-4 py-4 font-medium text-slate-700">様式フォーマット</td>
                                            <td className="px-4 py-4 text-center text-slate-500">手動で調整</td>
                                            <td className="px-4 py-4 text-center font-semibold text-blue-600">自動生成</td>
                                        </tr>
                                        <tr className="bg-slate-50/50">
                                            <td className="px-4 py-4 font-medium text-slate-700">データ管理</td>
                                            <td className="px-4 py-4 text-center text-slate-500">紙ファイル保管</td>
                                            <td className="px-4 py-4 text-center font-semibold text-blue-600">クラウド保存</td>
                                        </tr>
                                        <tr>
                                            <td className="px-4 py-4 font-medium text-slate-700">現場での入力</td>
                                            <td className="px-4 py-4 text-center text-slate-500">紙に記入→後でPC入力</td>
                                            <td className="px-4 py-4 text-center font-semibold text-blue-600">スマホで直接入力</td>
                                        </tr>
                                        <tr className="bg-slate-50/50">
                                            <td className="px-4 py-4 font-medium text-slate-700">料金</td>
                                            <td className="px-4 py-4 text-center text-slate-500">用紙・印刷代</td>
                                            <td className="px-4 py-4 text-center font-bold text-emerald-600">無料</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </ScrollAnimate>
                    </div>
                </section>

                {/* Supported Forms */}
                <section className="py-20 px-4 md:px-6">
                    <div className="mx-auto max-w-5xl">
                        <ScrollAnimate>
                            <div className="mb-12 text-center">
                                <h2 className="mb-4 text-3xl font-bold tracking-tight text-slate-900 md:text-5xl">
                                    対応<span className="text-blue-600">別記様式</span>
                                </h2>
                                <p className="text-lg text-slate-600">消防設備点検結果報告書の主要な別記様式に対応しています</p>
                            </div>
                        </ScrollAnimate>
                        <ScrollAnimate>
                            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                                {[
                                    { num: "第1", name: "消火器", color: "bg-red-50 text-red-700 ring-red-100" },
                                    { num: "第2", name: "屋内消火栓設備", color: "bg-orange-50 text-orange-700 ring-orange-100" },
                                    { num: "第3", name: "スプリンクラー設備", color: "bg-amber-50 text-amber-700 ring-amber-100" },
                                    { num: "第4", name: "水噴霧消火設備", color: "bg-cyan-50 text-cyan-700 ring-cyan-100" },
                                    { num: "第5", name: "泡消火設備", color: "bg-blue-50 text-blue-700 ring-blue-100" },
                                    { num: "第6", name: "不活性ガス消火設備", color: "bg-indigo-50 text-indigo-700 ring-indigo-100" },
                                    { num: "第7", name: "ハロゲン化物消火設備", color: "bg-violet-50 text-violet-700 ring-violet-100" },
                                    { num: "第8", name: "粉末消火設備", color: "bg-pink-50 text-pink-700 ring-pink-100" },
                                ].map((item) => (
                                    <div key={item.num} className={`flex items-center gap-3 rounded-xl p-4 ring-1 ${item.color}`}>
                                        <FileSpreadsheet className="h-5 w-5 shrink-0" />
                                        <div>
                                            <div className="text-xs font-medium opacity-75">別記様式{item.num}</div>
                                            <div className="text-sm font-bold">{item.name}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </ScrollAnimate>
                        <ScrollAnimate>
                            <p className="mt-6 text-center text-sm text-slate-500">※ 別記様式第9〜第22は順次対応予定です</p>
                        </ScrollAnimate>
                    </div>
                </section>

                {/* FAQ Section */}
                <section className="py-20 px-4 md:px-6 bg-white">
                    <div className="mx-auto max-w-3xl">
                        <ScrollAnimate>
                            <div className="mb-12 text-center">
                                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
                                    <HelpCircle className="h-7 w-7 text-slate-600" />
                                </div>
                                <h2 className="mb-4 text-3xl font-bold tracking-tight text-slate-900 md:text-5xl">
                                    よくある質問
                                </h2>
                            </div>
                        </ScrollAnimate>
                        <ScrollAnimate>
                            <div className="rounded-2xl border border-slate-200 bg-white px-6 shadow-sm">
                                <FaqAccordion />
                            </div>
                        </ScrollAnimate>
                    </div>
                </section>

                {/* CTA Section */}
                <ScrollAnimate>
                    <section className="relative py-24 overflow-hidden my-20 mx-4 md:mx-6 rounded-[2.5rem]">
                        <div className="absolute inset-0 bg-blue-600"></div>
                        <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-blue-500 blur-3xl opacity-50"></div>
                        <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-blue-700 blur-3xl opacity-50"></div>

                        <div className="relative mx-auto max-w-4xl px-4 text-center md:px-6">
                            <h2 className="mb-4 text-3xl font-bold tracking-tight text-white md:text-5xl">
                                報告書作成を、1/3の時間に。
                            </h2>
                            <p className="mb-4 text-lg text-blue-100 md:text-xl">
                                無料アカウントを作成して、今すぐブラウザからお試しください。
                            </p>
                            <div className="mb-10 flex flex-wrap items-center justify-center gap-6 text-sm text-blue-200">
                                <div className="flex items-center gap-1.5">
                                    <CheckCircle2 className="h-4 w-4" />
                                    クレジットカード不要
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <CheckCircle2 className="h-4 w-4" />
                                    登録は30秒
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <CheckCircle2 className="h-4 w-4" />
                                    すぐに使える
                                </div>
                            </div>
                            <Link
                                href={user ? "/tool" : "/signup"}
                                className="inline-flex h-14 items-center justify-center rounded-full bg-white px-10 text-lg font-bold text-blue-600 shadow-xl transition-all hover:scale-105 hover:bg-slate-50 hover:shadow-2xl"
                            >
                                {user ? "アプリを起動する" : "無料で始める"}
                            </Link>
                        </div>
                    </section>
                </ScrollAnimate>
            </main>

            {/* Footer */}
            <footer className="border-t border-slate-200 bg-white py-12">
                <div className="mx-auto max-w-6xl px-4 md:px-6">
                    <div className="flex flex-col items-center justify-between gap-8 md:flex-row">
                        <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
                                <Building2 className="h-5 w-5 text-slate-600" />
                            </div>
                            <span className="text-lg font-bold tracking-tight text-slate-700">
                                Mamoru Infra
                            </span>
                        </div>
                        <nav className="flex flex-wrap items-center justify-center gap-6 text-sm text-slate-500">
                            <Link href="/terms" className="hover:text-slate-900 transition-colors">利用規約</Link>
                            <Link href="/privacy" className="hover:text-slate-900 transition-colors">プライバシーポリシー</Link>
                            <Link href="/contact" className="hover:text-slate-900 transition-colors">お問い合わせ</Link>
                        </nav>
                        <p className="text-sm text-slate-400">
                            &copy; 2026 Mamoru Infra
                        </p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
