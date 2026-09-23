/**
 * PDF 生成の口（/api/generate-*）は、ログインしている人だけ（2026-09-23・先行利用の前・C3）。
 *
 * ■ ★なぜ要るか
 *   25 本のルートは本文（body）をそのまま描画して返すだけで、認証を見ていなかった。
 *   本番で未ログインのまま空の本文を POST すると 200・3.4MB の PDF が返った（2026-09-22 実測）。
 *   他人のデータは読めない（DB に触らない）が、★誰でも何度でも生成できる。点検アプリは Vercel にあり、
 *   使用量の上限に当たると先行利用の業者ごと止まりうる。
 *
 * ■ ★どこで止めるか … middleware（src/lib/supabase/middleware.ts・src/middleware.ts）
 *   ルートの中で止めると、PDF の検査（scripts/run-route-pdf.mjs が POST を関数として直に呼ぶ）が
 *   全部落ちる。middleware はブラウザからの HTTP だけを通るので、検査に影響しない。
 *   画面は同じオリジンの fetch（クッキー付き）で叩いているので、ログイン中はそのまま通る。
 *
 * ■ ★認証の仕組みが使えないときは通さない（この口だけ）
 *   middleware は画面については fail-open（失敗しても通す）。★この口は fail-closed:
 *   環境変数が無い → 503 / getUser が失敗 → 401 / middleware 自体が例外 → 401。
 *
 * scripts/check-pdf-api-auth.mjs が見張る（新しい口がこの接頭辞から外れたら落ちる）。
 */

export const PDF_API_PREFIX = "/api/generate-"

/** PDF 生成の口か */
export function isPdfApiPath(pathname: string): boolean {
    return pathname.startsWith(PDF_API_PREFIX)
}

/** 未ログイン（または確かめられない）ときの本文。★画面は 401 を「ログインし直す」と読む（pdf-request-error.ts） */
export const PDF_API_UNAUTHORIZED_BODY = { error: "unauthorized" } as const
export const PDF_API_NOT_CONFIGURED_BODY = { error: "auth_not_configured" } as const
