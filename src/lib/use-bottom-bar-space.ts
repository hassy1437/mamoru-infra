"use client"
import { useCallback, useRef } from "react"

/**
 * 画面の下に固定した帯の高さを、相談のチャットの丸いボタンに伝える（2026-11-11・打ち合わせの指摘）。
 *   ★右下の丸いボタンが、見取り図の設備のボタンや点検票の操作の帯に重なっていた。
 *   帯の高さを CSS の変数（--mamoru-bottom-bar）に入れ、丸いボタン・チャットの窓・吹き出しをその分だけ上げる
 *   （src/app/layout.tsx・src/components/chatbot-hint.tsx）。帯が無い画面・隠れている幅（md 以上など）では 0。
 *   使い方: const barRef = useBottomBarSpace(); <div ref={barRef} className="fixed bottom-0 …">
 *   ★帯があとから出る画面（見取り図を撮ったあと）でも効くよう、コールバックの ref にする。
 */
export const BOTTOM_BAR_VAR = "--mamoru-bottom-bar"

export function bottomBarHeight(el: HTMLElement): number {
    const cs = getComputedStyle(el)
    if (cs.display === "none" || cs.visibility === "hidden") return 0
    return Math.ceil(el.getBoundingClientRect().height)
}

export function useBottomBarSpace() {
    const cleanup = useRef<(() => void) | null>(null)
    return useCallback((el: HTMLElement | null) => {
        cleanup.current?.()
        cleanup.current = null
        if (!el) return
        const root = document.documentElement
        const apply = () => root.style.setProperty(BOTTOM_BAR_VAR, `${bottomBarHeight(el)}px`)
        apply()
        const ro = new ResizeObserver(apply)
        ro.observe(el)
        window.addEventListener("resize", apply)
        cleanup.current = () => {
            ro.disconnect()
            window.removeEventListener("resize", apply)
            root.style.removeProperty(BOTTOM_BAR_VAR)
        }
    }, [])
}
