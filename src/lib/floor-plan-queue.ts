import type { FloorPlanKind } from "@/lib/floor-plan-kinds"

/**
 * 電波の無い所（地下など）で置いた見取り図の印を、端末に覚えておいて、電波が戻ったら送る
 * （地図などの改善 6 の続き・2026-11-11 橋本さん「おすすめで」）。
 *
 * ■ 決まり
 *   - 覚えるのは「まだ送れていない印」だけ（種類・位置・不良の目印）。写真は覚えない（撮るのは電波のある所で）
 *   - ブラウザの localStorage（この端末だけ・送れたら消す）。キーは見取り図ごと
 *   - 送るのは: 電波が戻ったとき（online）・画面を開いたとき・「いま送る」を押したとき
 *   - ★送れなかった理由が電波でない（見取り図が消された・権限が無い）ときは、覚えたものを捨てて知らせる
 * ■ 読めない・書けない（プライベートブラウズなど）ときは、何もしない（印は「電波のある所でもう一度」に戻る）
 */
export type PendingPin = {
    tempId: string
    planId: string
    kind: FloorPlanKind
    x: number
    y: number
    defect: boolean
}

const PREFIX = "mamoru:floor-plan-pending:"
export const PENDING_EVENT = "mamoru-floor-plan-pending"

const keyOf = (planId: string) => PREFIX + planId

export function readPending(planId: string): PendingPin[] {
    try {
        const raw = window.localStorage.getItem(keyOf(planId))
        const list = raw ? (JSON.parse(raw) as PendingPin[]) : []
        return Array.isArray(list) ? list.filter((p) => p && p.planId === planId && typeof p.x === "number" && typeof p.y === "number") : []
    } catch {
        return []
    }
}

/** 覚えた印を書き替える（空なら消す）。★書けたら true */
export function writePending(planId: string, list: PendingPin[]): boolean {
    try {
        if (list.length === 0) window.localStorage.removeItem(keyOf(planId))
        else window.localStorage.setItem(keyOf(planId), JSON.stringify(list))
        window.dispatchEvent(new Event(PENDING_EVENT))
        return true
    } catch {
        return false
    }
}

/** 画面で使う「覚えている印」の写し（useSyncExternalStore 用・同じ中身なら同じ文字列） */
export function pendingSnapshot(planIds: readonly string[]): string {
    try {
        return JSON.stringify(planIds.map((id) => window.localStorage.getItem(keyOf(id)) ?? ""))
    } catch {
        return "[]"
    }
}

export function subscribePending(onChange: () => void): () => void {
    window.addEventListener(PENDING_EVENT, onChange)
    window.addEventListener("storage", onChange)
    return () => {
        window.removeEventListener(PENDING_EVENT, onChange)
        window.removeEventListener("storage", onChange)
    }
}

/** 送れなかった理由が電波（通信が届かない）か */
export function isOfflineError(error: unknown): boolean {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return true
    const msg = String((error as { message?: unknown } | null)?.message ?? error ?? "")
    return /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(msg)
}
