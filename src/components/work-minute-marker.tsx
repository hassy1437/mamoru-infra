"use client"

import { Component, useEffect, type ReactNode } from "react"
import { createClient } from "@/lib/supabase/client"
import { createWorkMinuteMarker, TICK_MS } from "@/lib/work-minute"

/**
 * 作業中の 1 分ごとの印（★画面には何も出さない）。中身の決まりは src/lib/work-minute.ts。
 *
 * ■ ★入力を絶対に止めない（最優先）
 *   ・送信は待たない。失敗・通信切れ・DB のエラーは黙って捨てる
 *   ・この部品が落ちても、点検の画面は何事もなく動く（★下の Quiet が受け止めて何も描かない）
 *   ・操作の検知は window に置くだけ（★入力欄には何も付けない・値も読まない）
 *
 * ■ 置き場所
 *   /inspection/new（総括表がまだ無い → 物件の id）と、/inspection/[id]/ 以下（layout・総括表の id）。
 */

type Props = { propertyId?: string | null; soukatsuId?: string | null }

/** ★操作とみなすもの（値は読まない。起きたことだけ） */
const ACTIVITY_EVENTS = ["keydown", "input", "change", "pointerdown"] as const

function Marker({ propertyId, soukatsuId }: Props) {
    useEffect(() => {
        let cleanup: (() => void) | undefined
        try {
            const supabase = createClient()
            const marker = createWorkMinuteMarker(
                { propertyId: propertyId ?? null, soukatsuId: soukatsuId ?? null },
                {
                    // ★待たない。★成否も見ない（then の両方で捨てる）
                    send: (t) =>
                        supabase
                            .rpc("mark_work_minute", { p_property_id: t.propertyId, p_soukatsu_id: t.soukatsuId })
                            .then(() => undefined, () => undefined),
                    now: () => Date.now(),
                    isVisible: () => document.visibilityState === "visible",
                    isOnline: () => navigator.onLine,
                },
            )
            const onActivity = () => marker.noteActivity()
            for (const e of ACTIVITY_EVENTS) window.addEventListener(e, onActivity, { capture: true, passive: true })
            const timer = window.setInterval(() => {
                marker.tick()
            }, TICK_MS)
            cleanup = () => {
                window.clearInterval(timer)
                for (const e of ACTIVITY_EVENTS) window.removeEventListener(e, onActivity, { capture: true })
            }
        } catch {
            // ★印が付けられなくても、画面はそのまま動かす
        }
        return () => {
            try {
                cleanup?.()
            } catch {
                // 片付けに失敗しても画面は止めない
            }
        }
    }, [propertyId, soukatsuId])
    return null
}

/** ★この部品の中で何が起きても、外（点検の画面）へは伝えない */
class Quiet extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false }
    static getDerivedStateFromError() {
        return { failed: true }
    }
    componentDidCatch() {
        // ★黙って捨てる（印が 1 つ欠けるだけ）
    }
    render() {
        return this.state.failed ? null : this.props.children
    }
}

export default function WorkMinuteMarker(props: Props) {
    return (
        <Quiet>
            <Marker {...props} />
        </Quiet>
    )
}
