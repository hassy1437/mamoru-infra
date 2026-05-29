"use client"

import { User, Phone, Building } from "lucide-react"
import type { Inspector } from "@/types/database"
import InspectorActionButtons from "@/components/inspector-action-buttons"

interface InspectorListProps {
    items: Inspector[]
}

export default function InspectorList({ items }: InspectorListProps) {
    return (
        <div className="space-y-4">
            {items.map((inspector) => {
                const data = inspector.inspector_data ?? {}
                // 表示名: label → name → 「（無題）」
                const displayName = inspector.label?.trim() || data.name?.trim() || "（無題）"
                return (
                    <div
                        key={inspector.id}
                        className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow"
                    >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                            <div className="min-w-0 sm:flex-1">
                                <h2 className="text-lg font-bold text-slate-900 truncate flex items-center gap-2">
                                    <User className="w-4 h-4 text-blue-600 shrink-0" />
                                    {displayName}
                                </h2>
                                <div className="mt-1.5 space-y-1 text-sm text-slate-500">
                                    {data.company && (
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <Building className="w-3.5 h-3.5 shrink-0" />
                                            <span className="truncate">{data.company}</span>
                                        </div>
                                    )}
                                    {data.phone && (
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <Phone className="w-3.5 h-3.5 shrink-0" />
                                            <span className="truncate">{data.phone}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="shrink-0 w-full sm:w-auto">
                                <InspectorActionButtons
                                    inspectorId={inspector.id}
                                    inspectorLabel={displayName}
                                />
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
