"use client"

import { Toaster as SonnerToaster } from "sonner"

export function Toaster() {
    return (
        <SonnerToaster
            position="top-center"
            richColors
            toastOptions={{
                duration: 3000,
                style: {
                    fontSize: "14px",
                },
            }}
        />
    )
}
