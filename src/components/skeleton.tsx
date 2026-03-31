import { cn } from "@/lib/utils"

export function Skeleton({ className }: { className?: string }) {
    return (
        <div className={cn("animate-pulse rounded-md bg-slate-200", className)} />
    )
}

export function CardSkeleton() {
    return (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
            <div className="flex gap-2 mt-2">
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-6 w-16 rounded-full" />
            </div>
        </div>
    )
}

export function FormSkeleton() {
    return (
        <div className="space-y-6 max-w-4xl mx-auto p-4">
            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                <Skeleton className="h-6 w-40" />
                <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                <Skeleton className="h-6 w-48" />
                <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                </div>
            </div>
        </div>
    )
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
    return (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            <Skeleton className="h-6 w-48" />
            <div className="space-y-2">
                {Array.from({ length: rows }).map((_, i) => (
                    <div key={i} className="flex gap-4 items-center py-2">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-8 w-24" />
                        <Skeleton className="h-8 w-16" />
                        <Skeleton className="h-8 w-32 flex-1" />
                    </div>
                ))}
            </div>
        </div>
    )
}
