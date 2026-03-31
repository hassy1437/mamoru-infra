import { Skeleton } from "@/components/skeleton"

export default function Loading() {
    return (
        <div className="min-h-screen bg-gray-100 p-4 md:p-8">
            <div className="max-w-[210mm] mx-auto mb-6 space-y-4">
                <Skeleton className="h-4 w-48" />
                <div className="flex justify-between items-center gap-3">
                    <Skeleton className="h-4 w-32" />
                    <div className="flex gap-2">
                        <Skeleton className="h-10 w-32 rounded-lg" />
                        <Skeleton className="h-10 w-40 rounded-lg" />
                    </div>
                </div>
            </div>
            <div className="max-w-[210mm] mx-auto">
                <Skeleton className="h-[600px] w-full rounded-xl" />
            </div>
        </div>
    )
}
