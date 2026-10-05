// 点検アプリで「本人がパスワードを決めた印」を付けているかを検査する（#1・2026-10-06）。
//
// ■ なぜ要るか
//   マッチング側のダッシュボードの「点検アプリのパスワードを設定してください」は、public.password_marks の印で
//   出し分ける（20261027090000）。点検アプリでパスワードでログインできたとき・再設定したときに印を付けないと、
//   パスワードで使っている業者にも案内が出続ける。★画面には何も起きないので、消えても誰も気付かない。
//
// ■ 検査すること
//   1. ログイン: signInWithPassword が成功したあと、画面を移る前に markMyPasswordSet(supabase, "app-login")
//   2. 再設定: updateUser が成功したあと、signOut の前に markMyPasswordSet(supabase, "app-reset")
//   3. 印の口は public スキーマで呼ぶ（この client の既定は NEXT_PUBLIC_SUPABASE_SCHEMA）
//
// 使い方: node scripts/check-password-mark.mjs [--self-test]
import fs from "fs"
import path from "path"

const ROOT = process.cwd()
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8")

function judge(files) {
    const problems = []
    const login = files["src/app/login/page.tsx"]
    const i1 = login.indexOf("signInWithPassword(")
    const m1 = login.indexOf('markMyPasswordSet(supabase, "app-login")')
    const p1 = login.indexOf("router.push(redirectTo)")
    if (!(i1 > 0 && m1 > i1 && p1 > m1)) problems.push("ログイン: 成功のあと・画面を移る前に app-login の印を付けていない")

    const reset = files["src/app/update-password/page.tsx"]
    const i2 = reset.indexOf("auth.updateUser({ password })")
    const m2 = reset.indexOf('markMyPasswordSet(supabase, "app-reset")')
    const s2 = reset.indexOf("auth.signOut()", i2)
    if (!(i2 > 0 && m2 > i2 && s2 > m2)) problems.push("再設定: 成功のあと・signOut の前に app-reset の印を付けていない")

    const lib = files["src/lib/password-mark.ts"]
    if (!lib.includes('.schema("public").rpc("mark_my_password_set"')) problems.push("印の口を public スキーマで呼んでいない")
    return problems
}

const NAMES = ["src/app/login/page.tsx", "src/app/update-password/page.tsx", "src/lib/password-mark.ts"]
const files = Object.fromEntries(NAMES.map((n) => [n, read(n)]))

if (process.argv.includes("--self-test")) {
    const ok = judge(files)
    if (ok.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of ok) console.log("   ", p)
        process.exit(1)
    }
    const mutated = { ...files, "src/app/login/page.tsx": files["src/app/login/page.tsx"].replace('await markMyPasswordSet(supabase, "app-login")', "") }
    if (!judge(mutated).some((p) => p.startsWith("ログイン"))) {
        console.log("自己診断: ログインの印を消しても検出できない")
        process.exit(1)
    }
    console.log("  陰性対照: ログイン・再設定とも印を付け、public スキーマで呼ぶ")
    console.log("  陽性対照: ログインの印を消す → 検出")
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const problems = judge(files)
console.log("パスワードを決めた印を検査: ログイン・再設定")
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("PASSWORD_MARK_OK")
