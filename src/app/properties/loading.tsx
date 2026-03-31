import { CardSkeleton, Skeleton } from "@/components/skeleton"

export default function Loading() {
    return (
        <main className="min-h-screen bg-gray-50 py-10">
            <div className="max-w-4xl mx-auto px-4">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <Skeleton className="h-4 w-32 mb-2" />
                        <Skeleton className="h-8 w-48" />
                        <Skeleton className="h-4 w-64 mt-2" />
                    </div>
                    <Skeleton className="h-10 w-32 rounded-lg" />
                </div>
                <Skeleton className="h-10 w-full mb-4" />
                <div className="space-y-4">
                    <CardSkeleton />
                    <CardSkeleton />
                    <CardSkeleton />
                </div>
            </div>
        </main>
    )
}
