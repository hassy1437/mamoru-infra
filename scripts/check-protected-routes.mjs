// 画面（src/app の page.tsx）が「ログインの確認の対象」か「公開でよい」のどちらかに必ず入っているかを検査する。
//
// ■ なぜ要るか（2026-10-22）
//   ログインの確認（src/lib/supabase/middleware.ts の protectedPaths）に /inspectors が無く、
//   ★未ログインでも「点検者の登録」画面（/inspectors/new）が開いていた。保存は RLS で止まるが、
//   入力し終わってから保存で失敗する（入れた内容が無駄になる）。
//   一覧と編集は画面側の getAuthenticatedClient() で止まっていたので、新規だけが抜けていた。
//   ★画面を足すたびに protectedPaths へ足すのを忘れうる。忘れても誰も気づかない種類。
//
// ■ 検査すること
//   1. src/app 直下の画面（page.tsx を持つフォルダ）が、protectedPaths か PUBLIC のどちらか一方に入っている
//   2. protectedPaths・PUBLIC に、もう無い画面が残っていない
//   ★api/・auth/ は画面ではない（route.ts だけ）。PDF の口は src/lib/pdf-api-guard.ts が別に守る。
//
// 使い方: node scripts/check-protected-routes.mjs [--self-test]
import fs from "fs"
import path from "path"

/** ログインしていなくても開いてよい画面（理由つき） */
const PUBLIC = {
    "/": "トップ（紹介）",
    "/login": "ログイン",
    "/signup": "新規登録",
    "/forgot-password": "パスワードを忘れたとき",
    "/update-password": "再設定メールのリンクから開く（その時点ではまだログインの途中）",
    "/contact": "問い合わせ",
    "/privacy": "プライバシーポリシー",
    "/terms": "利用規約",
    "/offline": "オフライン時の案内",
}

/** 画面の一覧と protectedPaths・PUBLIC を突き合わせ、問題の一覧を返す */
export function findProblems(routes, protectedPaths, publicPaths) {
    const problems = []
    for (const r of routes) {
        const isProtected = protectedPaths.includes(r)
        const isPublic = publicPaths.includes(r)
        if (!isProtected && !isPublic) problems.push(`${r} がログインの確認の対象にも、公開でよい画面にも入っていない`)
        if (isProtected && isPublic) problems.push(`${r} がログインの確認の対象と公開の両方に入っている`)
    }
    for (const p of protectedPaths) {
        if (!routes.includes(p)) problems.push(`protectedPaths の ${p} に当たる画面が無い（消した画面が残っている）`)
    }
    for (const p of publicPaths) {
        if (!routes.includes(p)) problems.push(`PUBLIC の ${p} に当たる画面が無い（消した画面が残っている）`)
    }
    return problems
}

function selfTest() {
    const cases = [
        { routes: ["/", "/tool", "/inspectors"], prot: ["/tool"], pub: ["/"], expect: 1, why: "対象に入れ忘れた画面を拾う" },
        { routes: ["/", "/tool"], prot: ["/tool"], pub: ["/"], expect: 0, why: "そろっていれば通す" },
        { routes: ["/", "/tool"], prot: ["/tool", "/old"], pub: ["/"], expect: 1, why: "消した画面の残りを拾う" },
        { routes: ["/", "/tool"], prot: ["/tool"], pub: ["/", "/tool"], expect: 1, why: "両方に入っているのを拾う" },
    ]
    for (const c of cases) {
        const got = findProblems(c.routes, c.prot, c.pub).length
        if (got !== c.expect) {
            console.log(`自己診断 NG: ${c.why}（期待 ${c.expect} 件・実際 ${got} 件）`)
            process.exit(1)
        }
    }
    console.log("SELF_TEST_OK")
}

if (process.argv.includes("--self-test")) {
    selfTest()
    process.exit(0)
}

const ROOT = process.cwd()
const APP = path.join(ROOT, "src", "app")
const MIDDLEWARE = path.join(ROOT, "src", "lib", "supabase", "middleware.ts")

const hasPage = (dir) => fs.readdirSync(dir, { withFileTypes: true }).some((e) =>
    (e.isFile() && e.name === "page.tsx") || (e.isDirectory() && hasPage(path.join(dir, e.name))))

const routes = [
    ...(fs.existsSync(path.join(APP, "page.tsx")) ? ["/"] : []),
    ...fs.readdirSync(APP, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !e.name.startsWith("(") && !e.name.startsWith("_"))
        .filter((e) => hasPage(path.join(APP, e.name)))
        .map((e) => `/${e.name}`),
]

const mw = fs.readFileSync(MIDDLEWARE, "utf8")
const m = mw.match(/const protectedPaths = \[([^\]]*)\]/)
if (!m) {
    console.log(`★ ${path.relative(ROOT, MIDDLEWARE)} から protectedPaths を読めない（書き方が変わった可能性）`)
    process.exit(1)
}
const protectedPaths = [...m[1].matchAll(/'([^']+)'|"([^"]+)"/g)].map((x) => x[1] ?? x[2])

const problems = findProblems(routes, protectedPaths, Object.keys(PUBLIC))
if (routes.length < 10) problems.push(`画面が ${routes.length} 件しか見つからない（読み方が壊れている可能性）`)

if (problems.length) {
    console.log("★ログインの確認の対象に漏れ・残りがある:")
    for (const p of problems) console.log(`  - ${p}`)
    console.log("  → 画面を足したら src/lib/supabase/middleware.ts の protectedPaths か、この検査の PUBLIC に足す")
    process.exit(1)
}
console.log(`画面 ${routes.length} 件: ログインの確認の対象 ${protectedPaths.length} ・公開 ${Object.keys(PUBLIC).length}`)
console.log("PROTECTED_ROUTES_OK")
