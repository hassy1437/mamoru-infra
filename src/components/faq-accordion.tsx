"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"

interface FaqItem {
    q: string
    a: string
}

const FAQ_ITEMS: FaqItem[] = [
    {
        q: "どの消防設備点検に対応していますか？",
        a: "消火器（別記様式第1）から不活性ガス消火設備（別記様式第6）、ハロゲン化物消火設備（別記様式第7）、粉末消火設備（別記様式第8）まで主要な別記様式に対応しています。順次対応範囲を拡大中です。",
    },
    {
        q: "スマートフォンだけで使えますか？",
        a: "はい。ブラウザで動作するため、iPhone・Androidどちらでもお使いいただけます。PCやタブレットからもアクセス可能です。",
    },
    {
        q: "オフラインでも使えますか？",
        a: "はい。PWA対応のため、電波の届きにくい現場でもオフラインで入力可能です。入力データはローカルに保存され、オンライン復帰時に同期できます。",
    },
    {
        q: "作成したPDFはそのまま消防署に提出できますか？",
        a: "はい。消防庁が定める公式の別記様式レイアウトに準拠したPDFを出力するため、印刷してそのまま提出可能です。",
    },
    {
        q: "データのセキュリティは大丈夫ですか？",
        a: "データは暗号化された通信（HTTPS）で送受信され、ユーザーごとにデータが分離されています。他のユーザーのデータにアクセスすることはできません。",
    },
]

export default function FaqAccordion() {
    const [openIndex, setOpenIndex] = useState<number | null>(null)

    return (
        <div className="divide-y divide-slate-200">
            {FAQ_ITEMS.map((item, i) => (
                <div key={i}>
                    <button
                        type="button"
                        onClick={() => setOpenIndex(openIndex === i ? null : i)}
                        className="flex w-full items-center justify-between py-5 text-left"
                    >
                        <span className="text-base font-semibold text-slate-900 pr-4">{item.q}</span>
                        <ChevronDown
                            className={`h-5 w-5 shrink-0 text-slate-600 transition-transform duration-200 ${openIndex === i ? "rotate-180" : ""}`}
                        />
                    </button>
                    <div
                        className={`overflow-hidden transition-all duration-300 ${openIndex === i ? "max-h-40 pb-5" : "max-h-0"}`}
                    >
                        <p className="text-sm leading-relaxed text-slate-600">{item.a}</p>
                    </div>
                </div>
            ))}
        </div>
    )
}
