/**
 * 別記様式の頭の「点検年月日」（期間）の初期値（2026-10-07）。
 *
 * ■ なぜ要るか（2026-10-07 のフル印字テストで実測）
 *   別記のページは総括表の★点検年月日（1 日）だけを渡していて、別記の期間は「点検年月日〜点検年月日」で始まっていた。
 *   総括表で期間を 9/28〜10/6 と入れても、別記 23 様式は 10/6〜10/6 になり、総括表と別記の期間が食い違う
 *   （業者が 23 様式すべてを手で直さない限り）。
 *
 * ■ 決めたこと
 *   総括表の期間（inspection_period_start / inspection_period_end）を引き継ぐ。無い欄は点検年月日にする（今までどおり）。
 *   ★保存済みの別記（payload.period_start / period_end）があればそちらが先（呼ぶ側の coerceString が決める）。
 */
export type BekkiPeriodInitial = {
    inspection_date?: string | null
    inspection_period_start?: string | null
    inspection_period_end?: string | null
}

export function bekkiPeriodDefault(initial: BekkiPeriodInitial): { start: string; end: string } {
    const day = initial.inspection_date ?? ""
    return {
        start: initial.inspection_period_start || day,
        end: initial.inspection_period_end || day,
    }
}
