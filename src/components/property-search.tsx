"use client"

import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"

interface PropertySearchProps<T> {
    items: T[]
    searchFields: (keyof T)[]
    children: (filtered: T[]) => React.ReactNode
    placeholder?: string
}

export default function PropertySearch<T>({
    items,
    searchFields,
    children,
    placeholder = "建物名・住所で検索...",
}: PropertySearchProps<T>) {
    const [query, setQuery] = useState("")

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase()
        if (!q) return items
        return items.filter((item) =>
            searchFields.some((field) => {
                const value = item[field]
                return typeof value === "string" && value.toLowerCase().includes(q)
            })
        )
    }, [items, query, searchFields])

    return (
        <>
            <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={placeholder}
                    className="pl-10"
                />
                {query && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                        {filtered.length}件
                    </span>
                )}
            </div>
            {children(filtered)}
        </>
    )
}
