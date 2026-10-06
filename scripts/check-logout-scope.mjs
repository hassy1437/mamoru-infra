// ログアウトが「この端末だけ」になっているかを検査する（#4・2026-10-06）。
//
// ■ なぜ要るか
//   supabase.auth.signOut() の既定は global（同じ口座の全セッションを切る）。点検アプリとマッチング側は
//   同じ Supabase の口座なので、片方でログアウトすると、もう片方まで切れていた（2026-10-05 の通し確認）。
//   ★画面には何も起きず、別の画面で突然ログインし直しになるだけなので、元に戻っても気付きにくい。
//
// 使い方: node scripts/check-logout-scope.mjs [--self-test]
import fs from "fs"
import path from "path"

const FILE = "src/components/logout-button.tsx"
const judge = (src) => {
    const problems = []
    if (!src.includes('signOut({ scope: "local" })')) problems.push(`${FILE}: ログアウトが scope: "local" でない`)
    if (/signOut\(\s*\)/.test(src)) problems.push(`${FILE}: 範囲を指定しない signOut()（既定は global）がある`)
    return problems
}
const src = fs.readFileSync(path.join(process.cwd(), FILE), "utf8")

if (process.argv.includes("--self-test")) {
    if (judge(src).length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        process.exit(1)
    }
    if (!judge(src.replace('signOut({ scope: "local" })', "signOut()")).length) {
        console.log("自己診断: 既定（global）に戻しても検出できない")
        process.exit(1)
    }
    console.log("  陰性対照: ログアウトはこの端末だけ")
    console.log("  陽性対照: signOut() に戻す → 検出")
    console.log("SELF_TEST_OK")
    process.exit(0)
}
const problems = judge(src)
console.log("ログアウトの範囲を検査")
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("LOGOUT_SCOPE_OK")
