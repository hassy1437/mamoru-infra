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

    const [checking, setChecking] = useState(true)
    const [hasSession, setHasSession] = useState(false)
    const [password, setPassword] = useState("")
    const [passwordConfirm, setPasswordConfirm] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // メールのリンク（/auth/callback 経由）でリカバリーセッションが張られているか確認。
    // 直アクセス等でセッションが無ければ「リンクが無効」を表示する。
    useEffect(() => {
        const supabase = createClient()
        supabase.auth.getUser().then(({ data: { user } }) => {
            setHasSession(!!user)
            setChecking(false)
        })
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
                    ) : !hasSession ? (
                        <div className="space-y-4">
                            <div className="bg-red-50 text-red-600 p-3 rounded-md border border-red-200 text-sm">
                                リンクが無効か期限切れです。お手数ですが再度お試しください。
                            </div>
                            <p className="text-center text-sm text-slate-600">
                                <Link href="/forgot-password" className="text-blue-600 hover:underline">
                                    パスワードの再設定をやり直す
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
