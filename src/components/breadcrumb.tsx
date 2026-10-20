"use client"

import Link from "next/link"
import { ChevronRight, Home } from "lucide-react"

export type BreadcrumbItem = {
    label: string
    href?: string
}

interface BreadcrumbProps {
    items: BreadcrumbItem[]
}

// ★スマホでは押せる所を高さ 44px にする（文字のままだと 24px 未満で押し間違えた・2026-10-20 の iPhone 点検）
export default function Breadcrumb({ items }: BreadcrumbProps) {
    return (
        <nav aria-label="パンくずリスト" className="mb-4">
            <ol className="flex items-center flex-wrap gap-1 text-sm">
                <li className="flex items-center">
                    <Link
                        href="/tool"
                        aria-label="ホーム"
                        className="flex min-h-11 md:min-h-0 items-center gap-1 text-slate-500 hover:text-blue-600 hover:bg-slate-50 rounded px-1.5 py-1 transition-colors"
                    >
                        <Home className="w-4 h-4 shrink-0" />
                        <span>ホーム</span>
                    </Link>
                </li>
                {items.map((item, index) => (
                    <li key={index} className="flex items-center">
                        <ChevronRight className="w-3.5 h-3.5 text-slate-300 mx-1 shrink-0" />
                        {item.href ? (
                            <Link
                                href={item.href}
                                className="inline-flex min-h-11 md:min-h-0 items-center px-2 text-slate-500 hover:text-blue-600 transition-colors max-w-[160px]"
                            >
                                <span className="truncate">{item.label}</span>
                            </Link>
                        ) : (
                            <span className="text-slate-800 font-medium truncate max-w-[200px]">
                                {item.label}
                            </span>
                        )}
                    </li>
                ))}
            </ol>
        </nav>
    )
}
