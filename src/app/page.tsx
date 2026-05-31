import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

// トップ（/）は入口。LP は廃止し、認証状態で振り分ける（案C-server）:
//   ログイン済み → /tool（ダッシュボード） / 未ログイン → /login
// 認証ガード（middleware）・/login・/signup・logout は一切変更しない。
// 旧 LP の JSX は git 履歴に残す（将来作り直す際は新規設計）。
export default async function Home() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    redirect(user ? "/tool" : "/login")
}
