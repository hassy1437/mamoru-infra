"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Loader2 } from "lucide-react"

export default function SignupPage() {
    const router = useRouter()

    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [passwordConfirm, setPasswordConfirm] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleSignup = async (e: React.FormEvent) => {
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
        const { error: authError } = await supabase.auth.signUp({
            email,
            password,
        })

        if (authError) {
            setError("アカウント作成に失敗しました。別のメールアドレスをお試しください。")
            setLoading(false)
            return
        }

        router.push("/tool")
        router.refresh()
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <CardTitle className="text-2xl">新規登録</CardTitle>
                    <CardDescription>Mamoru Infra のアカウントを作成</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSignup} className="space-y-4">
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
                                placeholder="6文字以上"
                                required
                                minLength={6}
                            />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="passwordConfirm">パスワード（確認）</Label>
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
                            アカウントを作成
                        </Button>
                    </form>
                    <p className="mt-4 text-center text-sm text-slate-600">
                        既にアカウントをお持ちの方は{" "}
                        <Link href="/login" className="text-blue-600 hover:underline">
                            ログイン
                        </Link>
                    </p>
                </CardContent>
            </Card>
        </div>
    )
}
