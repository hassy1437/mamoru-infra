/**
 * ログインのあとの戻り先を、このアプリの中の相対パスだけに絞る（2026-10-19・録音 101 のログイン連携と同時に）。
 *
 * ■ なぜ要るか
 *   ・/auth/callback は `${origin}${next}` で戻していた。next に「@evil.example」や「.evil.example」を入れると
 *     https://app.mamoruinfra.com@evil.example（＝ evil.example）へ飛ばせた（よそのサイトへ送る穴）。
 *   ・/login の redirectTo はそのまま router.push していて、https://… を入れるとよそのサイトへ出た。
 *   ・新しく作る /auth/confirm（マッチング側からログインした状態で入る口）も next を受け取る。
 *
 * ■ 決めたこと: 「/」で始まり「//」「/\」で始まらず、制御文字・\ を含まず、組み立てても同じオリジンのものだけ。
 *   それ以外は fallback（既定 /tool）。★返すのは相対パス（path + query + hash）だけ。
 */
export const DEFAULT_AFTER_LOGIN = "/tool"

export function safeNextPath(raw: string | null | undefined, fallback: string = DEFAULT_AFTER_LOGIN): string {
    if (!raw) return fallback
    if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback
    if (/[\u0000-\u001f\u007f\\]/.test(raw)) return fallback
    try {
        const base = "https://app.invalid"
        const u = new URL(raw, base)
        if (u.origin !== base) return fallback
        return `${u.pathname}${u.search}${u.hash}`
    } catch {
        return fallback
    }
}
