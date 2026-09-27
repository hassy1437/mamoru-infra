/**
 * 作業中の 1 分ごとの印（2026-09-27・先行利用で報告書の作成時間を実測するため）。
 *
 * ■ ★何を送るか（★これだけ）
 *   総括表の id か、（総括表がまだ無い新規の画面では）物件の id。
 *   ★人と時刻は DB が付ける（auth.uid()・サーバーの時計を分に切り捨て）。★入力した値・画面の中身は送らない。
 *
 * ■ ★いつ送るか
 *   60 秒ごとに見て、★直近 60 秒に操作（キー・入力・タップ）があったときだけ 1 回。
 *   ★画面が裏のとき・オフラインのときは送らない（★貯めて後で送らない＝その分、時間は短く出る）。
 *
 * ■ ★入力を絶対に止めない（最優先）
 *   ・送信は待たない（await しない）。失敗・通信切れ・DB のエラーは黙って捨てる
 *   ・ここで何が起きても例外を外に出さない（tick は必ず戻る）
 *   ★DB 側は inspection.mark_work_minute（mamoruinfra-web の 20261024090000）。
 *
 * ★このファイルは import を持たない（scripts/check-work-minute.mjs が Node でそのまま読む）。
 */

/** 直近この時間に操作があれば「作業中」 */
export const ACTIVE_WINDOW_MS = 60_000
/** 何ミリ秒ごとに見るか */
export const TICK_MS = 60_000

export type WorkMinuteTarget = { propertyId: string | null; soukatsuId: string | null }

export type WorkMinuteDeps = {
    /** 送る（★戻り値を待たない。Promise なら失敗を黙って捨てる） */
    send: (target: WorkMinuteTarget) => unknown
    now: () => number
    isVisible: () => boolean
    isOnline: () => boolean
}

export function createWorkMinuteMarker(target: WorkMinuteTarget, deps: WorkMinuteDeps) {
    let lastActivity = Number.NEGATIVE_INFINITY
    return {
        /** 操作があった */
        noteActivity(): void {
            try {
                lastActivity = deps.now()
            } catch {
                // 時計が読めなくても入力は止めない
            }
        },
        /** 60 秒ごとに呼ぶ。★送ったら true。★例外は外に出さない */
        tick(): boolean {
            try {
                if (!target.propertyId && !target.soukatsuId) return false
                if (!deps.isVisible() || !deps.isOnline()) return false
                if (deps.now() - lastActivity > ACTIVE_WINDOW_MS) return false
                const r = deps.send(target)
                if (r && typeof (r as PromiseLike<unknown>).then === "function") {
                    // ★待たない。★失敗は黙って捨てる
                    ;(r as PromiseLike<unknown>).then(undefined, () => undefined)
                }
                return true
            } catch {
                return false
            }
        },
    }
}
