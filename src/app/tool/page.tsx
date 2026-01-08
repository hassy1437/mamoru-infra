import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gray-50">
      <div className="text-center space-y-6 max-w-2xl">
        <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl text-gray-900">
          Fire Safety Inspection Reports
        </h1>
        <p className="text-xl text-muted-foreground">
          Efficiently create, manage, and submit Fire Safety Equipment Inspection Result Reports (Form 1).
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/reports/new">
            <Button size="lg" className="text-lg px-8 py-6">
              Create New Report
            </Button>
          </Link>
        </div>
      </div>
    </main>
  )
}
