"use client"

import { useEffect, useRef, useState } from "react"

interface FormProgressProps {
    sections: string[]
}

export default function FormProgress({ sections }: FormProgressProps) {
    const [activeIndex, setActiveIndex] = useState(0)
    const observerRef = useRef<IntersectionObserver | null>(null)

    useEffect(() => {
        // Observe all Card elements (sections) inside the form
        const cards = document.querySelectorAll("form > div.space-y-8 > div, form > .space-y-8 > div")
        // Fallback: find CardHeader elements directly
        const headers = cards.length >= sections.length
            ? cards
            : document.querySelectorAll("[data-section]")

        if (headers.length === 0) return

        const visibleSet = new Set<number>()

        observerRef.current = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    const idx = Number(entry.target.getAttribute("data-section-index"))
                    if (!Number.isNaN(idx)) {
                        if (entry.isIntersecting) {
                            visibleSet.add(idx)
                        } else {
                            visibleSet.delete(idx)
                        }
                    }
                }
                if (visibleSet.size > 0) {
                    setActiveIndex(Math.min(...visibleSet))
                }
            },
            { rootMargin: "-20% 0px -60% 0px", threshold: 0 }
        )

        headers.forEach((el, i) => {
            el.setAttribute("data-section-index", String(i))
            observerRef.current?.observe(el)
        })

        return () => observerRef.current?.disconnect()
    }, [sections.length])

    if (sections.length <= 1) return null

    const progress = Math.round(((activeIndex + 1) / sections.length) * 100)

    return (
        <div className="sticky top-0 z-30 bg-white/90 backdrop-blur-sm border-b border-slate-200 -mx-4 px-4 py-2">
            <div className="flex items-center gap-3 max-w-4xl mx-auto">
                <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                    <div
                        className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                    />
                </div>
                <span className="text-xs text-slate-500 whitespace-nowrap shrink-0">
                    {activeIndex + 1} / {sections.length}
                </span>
            </div>
            <p className="text-xs text-slate-600 font-medium mt-0.5 max-w-4xl mx-auto truncate">
                {sections[activeIndex]}
            </p>
        </div>
    )
}
