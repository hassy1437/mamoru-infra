"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { markMyPasswordSet } from "@/lib/password-mark"
import { safeNextPath } from "@/lib/safe-next"
import { Button } from "@/components/ui/button"
import { ACTION_BUTTON_FULL } from "@/lib/action-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Loader2 } from "lucide-react"

function LoginForm() {
    const router = useRouter()
    const searchParams = useSearchParams()
    // ★戻り先はこのアプリの中の相対パスだけ（https://… を入れると、よそのサイトへ出ていた・src/lib/safe-next.ts）
    const redirectTo = safeNextPath(searchParams.get("redirectTo"))
    // ★マッチング側の「点検アプリで開く」から来て、ワンタイムのリンクが使えなかった（src/app/auth/confirm/route.ts）
    const linkInvalid = searchParams.get("error") === "link_invalid"

    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        const supabase = createClient()
        const { error: authError } = await supabase.auth.signInWithPassword({
            email,
            password,
        })

        if (authError) {
            setError("メールアドレスまたはパスワードが正しくありません。")
            setLoading(false)
            return
        }

        // ★パスワードでログインできた＝本人がパスワードを知っている印（マッチング側の案内の出し分け・#1）
        await markMyPasswordSet(supabase, "app-login")

        router.push(redirectTo)
        router.refresh()
    }

    return (
        <Card className="w-full max-w-md">
            <CardHeader className="text-center">
                <CardTitle className="text-2xl">ログイン</CardTitle>
                <CardDescription>Mamoru Infra にログイン</CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleLogin} className="space-y-4">
                    {linkInvalid && !error && (
                        <div role="status" className="bg-amber-50 text-amber-800 p-3 rounded-md border border-amber-200 text-sm">
                            自動でログインできませんでした（リンクの期限が切れたか、すでに使われています）。
                            マッチングの画面からもう一度「点検アプリで開く」を押すか、ここでログインしてください。
                        </div>
                    )}
                    {error && (
                        <div className="bg-red-50 text-red-600 p-3 rounded-md border border-red-200 text-sm">
                            {error}
                        </div>
                    )}
                    <div className="space-y-1">
                        <Label htmlFor="email">メールアドレス</Label>
                        <Input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="example@example.com"
                            required
                        />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="password">パスワード</Label>
                        <Input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="パスワード"
                            required
                        />
                    </div>
                    <p className="text-right text-sm">
                        <Link href="/forgot-password" className="text-blue-600 hover:underline">
                            パスワードをお忘れの方
                        </Link>
                    </p>
                    <Button type="submit" className={ACTION_BUTTON_FULL} disabled={loading}>
                        {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        ログイン
                    </Button>
                </form>
                <p className="mt-4 text-center text-sm text-slate-600">
                    アカウントをお持ちでない方は{" "}
                    <Link href="/signup" className="text-blue-600 hover:underline">
                        新規登録
                    </Link>
                </p>
            </CardContent>
        </Card>
    )
}

export default function LoginPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
            <Suspense>
                <LoginForm />
            </Suspense>
        </div>
    )
}
