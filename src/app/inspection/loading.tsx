import { CardSkeleton, Skeleton } from "@/components/skeleton"

export default function Loading() {
    return (
        <main className="min-h-screen bg-gray-50 py-10">
            <div className="max-w-4xl mx-auto px-4">
                <div className="mb-8">
                    <Skeleton className="h-4 w-32 mb-2" />
                    <Skeleton className="h-8 w-56" />
                    <Skeleton className="h-4 w-72 mt-2" />
                </div>
                <Skeleton className="h-10 w-full mb-4" />
                <div className="space-y-4">
                    <CardSkeleton />
                    <CardSkeleton />
                </div>
            </div>
        </main>
    )
}
