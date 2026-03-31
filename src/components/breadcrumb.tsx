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

export default function Breadcrumb({ items }: BreadcrumbProps) {
    return (
        <nav aria-label="パンくずリスト" className="mb-4">
            <ol className="flex items-center flex-wrap gap-1 text-sm">
                <li className="flex items-center">
                    <Link
                        href="/tool"
                        className="text-slate-400 hover:text-blue-600 transition-colors"
                        aria-label="ホーム"
                    >
                        <Home className="w-4 h-4" />
                    </Link>
                </li>
                {items.map((item, index) => (
                    <li key={index} className="flex items-center">
                        <ChevronRight className="w-3.5 h-3.5 text-slate-300 mx-1 shrink-0" />
                        {item.href ? (
                            <Link
                                href={item.href}
                                className="text-slate-500 hover:text-blue-600 transition-colors truncate max-w-[160px]"
                            >
                                {item.label}
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
