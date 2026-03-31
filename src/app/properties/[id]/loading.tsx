import { Skeleton } from "@/components/skeleton"

export default function Loading() {
    return (
        <main className="min-h-screen bg-gray-50 py-10">
            <div className="max-w-4xl mx-auto px-4 space-y-6">
                <div>
                    <Skeleton className="h-4 w-32 mb-2" />
                    <Skeleton className="h-8 w-64" />
                    <Skeleton className="h-4 w-48 mt-2" />
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                    <Skeleton className="h-6 w-24" />
                    <div className="grid md:grid-cols-2 gap-4">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="space-y-1">
                                <Skeleton className="h-4 w-16" />
                                <Skeleton className="h-5 w-32" />
                            </div>
                        ))}
                    </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                    <Skeleton className="h-6 w-24" />
                    <div className="space-y-3">
                        {[1, 2, 3].map((i) => (
                            <Skeleton key={i} className="h-16 w-full rounded-lg" />
                        ))}
                    </div>
                </div>
            </div>
        </main>
    )
}
