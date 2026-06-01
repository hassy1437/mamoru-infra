"use client"

import { useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Loader2 } from "lucide-react"

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("")
    const [loading, setLoading] = useState(false)
    const [sent, setSent] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            const supabase = createClient()
            // メールリンクの戻り先は /update-password に直接向ける。
            // ブラウザの createBrowserClient は detectSessionInUrl が既定ONで、
            // URL のトークン（?code= / #access_token=）を自動でリカバリーセッションに交換する。
            // （OAuth用の /auth/callback 経由＝server で exchangeCodeForSession は、PKCE の
            //  code_verifier がブラウザ localStorage にあり server から検証できず recovery と噛み合わないため使わない）
            await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${location.origin}/update-password`,
            })
        } catch {
            // ネットワークエラー等でも、メール存在の有無は明かさない（ユーザー列挙対策）。
        }

        // 成功・失敗にかかわらず同じ完了表示にする（列挙対策）。
        setSent(true)
        setLoading(false)
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <CardTitle className="text-2xl">パスワードの再設定</CardTitle>
                    <CardDescription>登録済みのメールアドレスに再設定用リンクを送信します</CardDescription>
                </CardHeader>
                <CardContent>
                    {sent ? (
                        <div className="space-y-4">
                            <div className="bg-emerald-50 text-emerald-700 p-3 rounded-md border border-emerald-200 text-sm">
                                入力したメールアドレスに再設定用のリンクを送信しました。メールをご確認ください。
                            </div>
                            <p className="text-center text-sm text-slate-600">
                                <Link href="/login" className="text-blue-600 hover:underline">
                                    ログインに戻る
                                </Link>
                            </p>
                        </div>
                    ) : (
                        <>
                            <form onSubmit={handleSubmit} className="space-y-4">
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
                                <Button type="submit" className="w-full" disabled={loading}>
                                    {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                    リセットメールを送信
                                </Button>
                            </form>
                            <p className="mt-4 text-center text-sm text-slate-600">
                                <Link href="/login" className="text-blue-600 hover:underline">
                                    ログインに戻る
                                </Link>
                            </p>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
