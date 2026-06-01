"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Loader2 } from "lucide-react"

export default function UpdatePasswordPage() {
    const router = useRouter()

    // メールリンクのエラー（#error=...&error_code=otp_expired 等）は render 時に URL から
    // 一度だけ導出する（effect 内で setState しない＝set-state-in-effect 回避）。
    // implicit はフラグメント(#)、PKCE 系はクエリ(?)に来るため両方を見る。
    const [linkError] = useState<boolean>(() => {
        if (typeof window === "undefined") return false
        const hash = window.location.hash.replace(/^#/, "")
        const search = window.location.search.replace(/^\?/, "")
        const params = new URLSearchParams(`${hash}&${search}`)
        return Boolean(params.get("error") || params.get("error_code") || params.get("error_description"))
    })

    const [checking, setChecking] = useState(!linkError) // リンクエラーなら確認不要
    const [hasSession, setHasSession] = useState(false)
    const [password, setPassword] = useState("")
    const [passwordConfirm, setPasswordConfirm] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // メールのリンクから戻った後、リカバリーセッションが張られるのを待つ。
    // createBrowserClient は detectSessionInUrl が既定ON → URL のトークン
    // (?code= / #access_token=) を自動でセッションに交換する。これは非同期なので
    // getUser() の単発呼びだと交換完了前に「無し」と誤判定しうる。onAuthStateChange で待つ。
    useEffect(() => {
        if (linkError) return // URL にエラーが載っていればセッション確認不要

        const supabase = createClient()
        let resolved = false

        const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === "PASSWORD_RECOVERY" || session) {
                resolved = true
                setHasSession(true)
                setChecking(false)
            }
        })

        // フォールバック: 既にセッションがある場合（イベントが来ないケース）
        supabase.auth.getSession().then(({ data }) => {
            if (data.session) {
                resolved = true
                setHasSession(true)
                setChecking(false)
            } else {
                // 少し待ってもセッションが来なければ「無効」と判定（無限ローディング防止）
                setTimeout(() => {
                    if (!resolved) setChecking(false)
                }, 2000)
            }
        })

        return () => sub.subscription.unsubscribe()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        if (password !== passwordConfirm) {
            setError("パスワードが一致しません。")
            return
        }
        if (password.length < 6) {
            setError("パスワードは6文字以上で入力してください。")
            return
        }

        setLoading(true)

        const supabase = createClient()
        const { error: updateError } = await supabase.auth.updateUser({ password })

        if (updateError) {
            setError("パスワードの変更に失敗しました。リンクの期限が切れている可能性があります。再度お試しください。")
            setLoading(false)
            return
        }

        // 更新後は明示的に再ログインさせる（Q6）。
        router.push("/login")
        router.refresh()
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <CardTitle className="text-2xl">新しいパスワードの設定</CardTitle>
                    <CardDescription>新しいパスワードを入力してください</CardDescription>
                </CardHeader>
                <CardContent>
                    {checking ? (
                        <div className="flex justify-center py-6">
                            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                        </div>
                    ) : (linkError || !hasSession) ? (
                        <div className="space-y-4">
                            <div className="bg-red-50 text-red-600 p-3 rounded-md border border-red-200 text-sm">
                                {linkError
                                    ? "リンクの有効期限が切れているか、無効です。お手数ですが、もう一度パスワード再設定をお試しください。"
                                    : "リンクが無効か期限切れです。お手数ですが再度お試しください。"}
                            </div>
                            <p className="text-center text-sm text-slate-600">
                                <Link href="/forgot-password" className="text-blue-600 hover:underline">
                                    再度リクエストする
                                </Link>
                            </p>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {error && (
                                <div className="bg-red-50 text-red-600 p-3 rounded-md border border-red-200 text-sm">
                                    {error}
                                </div>
                            )}
                            <div className="space-y-1">
                                <Label htmlFor="password">新しいパスワード</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="6文字以上"
                                    required
                                    minLength={6}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="passwordConfirm">新しいパスワード（確認）</Label>
                                <Input
                                    id="passwordConfirm"
                                    type="password"
                                    value={passwordConfirm}
                                    onChange={(e) => setPasswordConfirm(e.target.value)}
                                    placeholder="もう一度入力"
                                    required
                                    minLength={6}
                                />
                            </div>
                            <Button type="submit" className="w-full" disabled={loading}>
                                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                パスワードを変更
                            </Button>
                        </form>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
