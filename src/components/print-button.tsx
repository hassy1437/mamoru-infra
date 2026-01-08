"use client"

import { Button } from "@/components/ui/button"
import { Printer } from "lucide-react"

export default function PrintButton() {
    return (
        <Button
            className="bg-gray-800 text-white"
            onClick={() => window.print()}
        >
            <Printer className="mr-2 h-4 w-4" />
            画面印刷
        </Button>
    )
}