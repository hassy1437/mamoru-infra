/**
 * Convert technical Supabase/API error messages to user-friendly Japanese messages.
 */
const ERROR_MAP: [RegExp, string][] = [
    [/duplicate key.*unique/i, "同じデータが既に登録されています。"],
    [/violates foreign key/i, "関連するデータが見つかりません。ページを再読み込みしてください。"],
    [/violates not-null/i, "必須項目が入力されていません。入力内容を確認してください。"],
    [/permission denied|row-level security/i, "この操作を行う権限がありません。ログインし直してください。"],
    [/JWT expired|invalid.*token/i, "セッションの有効期限が切れました。再ログインしてください。"],
    [/network|fetch|ECONNREFUSED|ERR_NETWORK/i, "ネットワークに接続できません。接続を確認してもう一度お試しください。"],
    [/timeout|ETIMEDOUT/i, "サーバーからの応答がタイムアウトしました。しばらく待ってからお試しください。"],
    [/rate limit/i, "リクエストが多すぎます。しばらく待ってからお試しください。"],
    [/body exceeded.*limit|payload too large/i, "データが大きすぎます。画像を減らすか、入力内容を短くしてください。"],
    [/relation.*does not exist/i, "データベースのテーブルが見つかりません。管理者に連絡してください。"],
]

export function friendlyError(error: unknown): string {
    const raw = error instanceof Error ? error.message : String(error ?? "")

    for (const [pattern, message] of ERROR_MAP) {
        if (pattern.test(raw)) return message
    }

    // If it's already in Japanese (no ASCII-heavy content), keep as-is
    if (raw && /^[^\x00-\x7F]/.test(raw)) return raw

    return "予期しないエラーが発生しました。しばらく待ってからもう一度お試しください。"
}
