"use client"

import { useEffect, useRef, useCallback } from "react"

/**
 * Warns the user before leaving the page with unsaved changes.
 * Call markDirty() when the form state changes, markClean() after save.
 */
export function useUnsavedChanges() {
    const isDirty = useRef(false)

    const markDirty = useCallback(() => {
        isDirty.current = true
    }, [])

    const markClean = useCallback(() => {
        isDirty.current = false
    }, [])

    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            if (!isDirty.current) return
            e.preventDefault()
        }
        window.addEventListener("beforeunload", handler)
        return () => window.removeEventListener("beforeunload", handler)
    }, [])

    return { markDirty, markClean, isDirty }
}
