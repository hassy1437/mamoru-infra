"use client"

import { useEffect, useRef } from "react"

/**
 * 点検票の自動保存（2026-10-20・23 様式で共通）。
 * ・入力が止まって 5 秒たったら保存する（以前は第1 と共通の画面＝第9〜22 だけで、第2〜8 は「保存」を押すか
 *   画面の中で別の画面へ移るまで保存しなかった）
 * ・★別のアプリ（カメラ・電話など）に切り替えた瞬間・タブを閉じる瞬間にも、まだ保存していない入力があれば保存する。
 *   iPhone の Safari は裏に回したタブを捨てることがあり、5 秒を待たずに切り替えると直前の入力が消えうる
 * ・画面の中で別の画面へ移るときは、各様式のアンマウント時の保存が受け持つ（ここでは扱わない）
 * ・最初の描画（保存済みの値を読んだだけ）では保存しない
 */
export function useAutoSave(payload: unknown, save: () => Promise<boolean>, onSaved: () => void, delayMs = 5000) {
    const saveRef = useRef(save)
    const onSavedRef = useRef(onSaved)
    useEffect(() => {
        saveRef.current = save
        onSavedRef.current = onSaved
    })
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const first = useRef(true)

    useEffect(() => {
        if (first.current) {
            first.current = false
            return
        }
        timer.current = setTimeout(() => {
            timer.current = null
            saveRef.current().then((ok) => { if (ok) onSavedRef.current() })
        }, delayMs)
        return () => {
            if (timer.current) clearTimeout(timer.current)
            timer.current = null
        }
    }, [payload, delayMs])

    useEffect(() => {
        const flush = () => {
            if (!timer.current) return
            clearTimeout(timer.current)
            timer.current = null
            saveRef.current().then((ok) => { if (ok) onSavedRef.current() })
        }
        const onVisibility = () => { if (document.visibilityState === "hidden") flush() }
        document.addEventListener("visibilitychange", onVisibility)
        window.addEventListener("pagehide", flush)
        return () => {
            document.removeEventListener("visibilitychange", onVisibility)
            window.removeEventListener("pagehide", flush)
        }
    }, [])
}
