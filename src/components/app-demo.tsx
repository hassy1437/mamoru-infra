"use client"

import { useEffect, useState } from "react"
import { Building2, CheckCircle2, PenLine, FileDown, ArrowRight } from "lucide-react"

const STEPS = [
    { label: "物件登録", duration: 3000 },
    { label: "点検入力", duration: 3000 },
    { label: "PDF出力", duration: 3000 },
] as const

export default function AppDemo() {
    const [step, setStep] = useState(0)

    useEffect(() => {
        const timer = setInterval(() => {
            setStep((s) => (s + 1) % STEPS.length)
        }, STEPS[0].duration)
        return () => clearInterval(timer)
    }, [])

    return (
        <div className="relative mx-auto w-full max-w-[280px] md:max-w-[300px]">
            <div className="rounded-[2.5rem] border-[8px] border-slate-800 bg-slate-800 p-1 shadow-2xl">
                <div className="rounded-[2rem] bg-white overflow-hidden">
                    {/* Status bar */}
                    <div className="flex items-center justify-between bg-slate-50 px-5 py-2 text-[10px] text-slate-400">
                        <span>9:41</span>
                        <div className="h-5 w-20 rounded-full bg-slate-800"></div>
                        <span>100%</span>
                    </div>
                    {/* App header */}
                    <div className="bg-white px-4 py-3 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded-full bg-blue-600 flex items-center justify-center">
                                <Building2 className="h-3 w-3 text-white" />
                            </div>
                            <span className="text-xs font-bold text-slate-800">Mamoru Infra</span>
                        </div>
                    </div>

                    {/* Step indicator */}
                    <div className="flex items-center justify-center gap-1 py-2 bg-slate-50 border-b border-slate-100">
                        {STEPS.map((s, i) => (
                            <div key={s.label} className="flex items-center gap-1">
                                <div
                                    className={`h-2 w-2 rounded-full transition-all duration-500 ${
                                        i <= step ? "bg-blue-600 scale-110" : "bg-slate-200"
                                    }`}
                                />
                                <span className={`text-[8px] font-medium transition-colors duration-500 ${
                                    i === step ? "text-blue-600" : "text-slate-400"
                                }`}>
                                    {s.label}
                                </span>
                                {i < STEPS.length - 1 && (
                                    <ArrowRight className="h-2 w-2 text-slate-300" />
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Animated content */}
                    <div className="px-4 py-4 min-h-[240px]">
                        {/* Step 0: 物件登録 */}
                        <div className={`space-y-2.5 transition-all duration-500 ${step === 0 ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4 absolute"}`}>
                            <div className="text-[11px] font-bold text-slate-700">物件情報の入力</div>
                            <div className="space-y-2">
                                <div>
                                    <div className="text-[9px] text-slate-400 mb-0.5">建物名</div>
                                    <div className="h-7 rounded-md border border-slate-200 bg-white px-2 flex items-center">
                                        <span className="text-[10px] text-slate-700 typing-animation">サンプルビル A棟</span>
                                    </div>
                                </div>
                                <div>
                                    <div className="text-[9px] text-slate-400 mb-0.5">所在地</div>
                                    <div className="h-7 rounded-md border border-slate-200 bg-white px-2 flex items-center">
                                        <span className="text-[10px] text-slate-700">東京都千代田区...</span>
                                    </div>
                                </div>
                                <div>
                                    <div className="text-[9px] text-slate-400 mb-0.5">点検設備</div>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[8px] font-medium text-blue-700">消火器</span>
                                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[8px] font-medium text-blue-700">屋内消火栓</span>
                                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[8px] font-medium text-slate-400">+ 追加</span>
                                    </div>
                                </div>
                            </div>
                            <div className="rounded-lg bg-blue-600 py-2 text-center text-[10px] font-bold text-white mt-3">
                                登録する
                            </div>
                        </div>

                        {/* Step 1: 点検入力 */}
                        <div className={`space-y-2.5 transition-all duration-500 ${step === 1 ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4 absolute"}`}>
                            <div className="text-[11px] font-bold text-slate-700">消火器の点検</div>
                            <div className="rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 p-3 text-white">
                                <div className="text-[10px] opacity-80">サンプルビル A棟</div>
                                <div className="mt-1.5 h-1.5 rounded-full bg-white/30">
                                    <div className="h-1.5 w-1/2 rounded-full bg-white transition-all duration-1000"></div>
                                </div>
                                <div className="text-[9px] mt-1 opacity-80">50% 完了</div>
                            </div>
                            <div className="space-y-1.5">
                                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-2 border border-emerald-100">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                    <div>
                                        <div className="text-[10px] font-semibold text-slate-700">設置状況</div>
                                        <div className="text-[9px] text-emerald-600">良</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 rounded-lg bg-blue-50 p-2 border border-blue-100">
                                    <PenLine className="h-4 w-4 text-blue-500" />
                                    <div>
                                        <div className="text-[10px] font-semibold text-slate-700">外観・表示</div>
                                        <div className="text-[9px] text-blue-600">入力中...</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Step 2: PDF出力 */}
                        <div className={`space-y-2.5 transition-all duration-500 ${step === 2 ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4 absolute"}`}>
                            <div className="text-[11px] font-bold text-slate-700">報告書の出力</div>
                            <div className="rounded-xl border-2 border-dashed border-emerald-200 bg-emerald-50 p-4 text-center">
                                <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                                <div className="text-[11px] font-bold text-emerald-700">点検完了！</div>
                                <div className="text-[9px] text-emerald-600 mt-0.5">全ての設備の入力が完了しました</div>
                            </div>
                            <div className="space-y-1.5 mt-2">
                                <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-2">
                                    <FileDown className="h-4 w-4 text-slate-500" />
                                    <span className="text-[10px] text-slate-600">別記様式第1.pdf</span>
                                    <span className="text-[8px] text-emerald-600 ml-auto font-medium">Ready</span>
                                </div>
                                <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-2">
                                    <FileDown className="h-4 w-4 text-slate-500" />
                                    <span className="text-[10px] text-slate-600">別記様式第2.pdf</span>
                                    <span className="text-[8px] text-emerald-600 ml-auto font-medium">Ready</span>
                                </div>
                            </div>
                            <div className="rounded-lg bg-emerald-600 py-2 text-center text-[10px] font-bold text-white flex items-center justify-center gap-1">
                                <FileDown className="h-3 w-3" />
                                PDFダウンロード
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            {/* Glow effect */}
            <div className="absolute -inset-4 -z-10 rounded-[3rem] bg-gradient-to-br from-blue-400/20 to-indigo-400/20 blur-2xl"></div>
        </div>
    )
}
