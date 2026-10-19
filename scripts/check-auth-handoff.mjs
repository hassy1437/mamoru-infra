// ログインの戻り先と、マッチング側から「ログインした状態で」入る口を検査する（2026-10-19・録音 101）。
//
// ■ なぜ要るか
//   ・/auth/callback は `${origin}${next}` で戻していて、next に「@evil.example」を入れると、よそのサイトへ飛ばせた。
//     /login の redirectTo もそのまま router.push していた。★どちらも画面には何も出ず、元に戻っても気付けない種類
//   ・新しい /auth/confirm（マッチング側の「点検アプリで開く」の着地）は、ログインそのものを作る口。
//     受け付ける type と戻り先を広げると、そのまま穴になる
//
// ■ 検査すること
//   1. src/lib/safe-next.ts を実際に動かす: このアプリの中の相対パスだけを通し、よそへ出る形は既定（/tool）に倒す
//   2. 配線: callback・login・confirm の 3 か所が戻り先を safeNextPath に通す／confirm は magiclink・email だけ・no-referrer
//
// 使い方: node scripts/check-auth-handoff.mjs [--self-test]
import fs from "fs"
import path from "path"
import { pathToFileURL } from "url"
import ts from "typescript"

const ROOT = process.cwd()
const SELF_TEST = process.argv.includes("--self-test")
const OUT = path.join(ROOT, "tmp", SELF_TEST ? "auth-handoff-selftest" : "auth-handoff")
const LIB = "src/lib/safe-next.ts"
const CALLBACK = "src/app/auth/callback/route.ts"
const LOGIN = "src/app/login/page.tsx"
const CONFIRM = "src/app/auth/confirm/route.ts"
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8")

async function load(src) {
    fs.mkdirSync(OUT, { recursive: true })
    const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
    const p = path.join(OUT, `safe-next.${Date.now()}${Math.random().toString(36).slice(2, 6)}.mjs`)
    fs.writeFileSync(p, js, "utf8")
    return import(pathToFileURL(p).href)
}

const PASS = ["/tool", "/properties", "/properties/0f8fad5b-d9cb-469f-a165-70867728950e", "/inspection/x?tab=1#a"]
const BLOCK = ["", "https://evil.example", "//evil.example", "/\\evil.example", "@evil.example", ".evil.example",
    "javascript:alert(1)", "/\tevil", "/a\\b", "evil", "/%0d%0aSet-Cookie:x"]

function behaviour(mod) {
    const problems = []
    const f = mod.safeNextPath
    if (typeof f !== "function") return ["safeNextPath が無い"]
    for (const p of PASS) if (f(p) !== p) problems.push(`通すはずの「${p}」が ${JSON.stringify(f(p))} になった`)
    for (const b of BLOCK) {
        const got = f(b)
        // ★%0d%0a は符号化されたままのパスとして通ってよい（改行にはならない）。ほかは既定へ
        if (b.startsWith("/%0d")) { if (!got.startsWith("/")) problems.push(`「${b}」が相対パスでない ${got}`); continue }
        if (got !== "/tool") problems.push(`よそへ出る「${b}」が ${JSON.stringify(got)} になった（/tool のはず）`)
    }
    // origin につないでも同じオリジンのまま
    for (const b of BLOCK) {
        const u = new URL(f(b), "https://app.mamoruinfra.com")
        if (u.host !== "app.mamoruinfra.com") problems.push(`「${b}」をつなぐと ${u.host} へ出る`)
    }
    return problems
}

function wiring(files) {
    const problems = []
    const cb = files[CALLBACK], login = files[LOGIN], confirm = files[CONFIRM]
    if (!/safeNextPath\(searchParams\.get\('next'\)\)/.test(cb)) problems.push(`${CALLBACK}: 戻り先を safeNextPath に通していない`)
    if (/\$\{origin\}\$\{next\}/.test(cb)) problems.push(`${CALLBACK}: \`\${origin}\${next}\` で戻している（@evil.example でよそへ出る）`)
    if (!/safeNextPath\(searchParams\.get\("redirectTo"\)\)/.test(login)) problems.push(`${LOGIN}: redirectTo を safeNextPath に通していない`)
    if (!/safeNextPath\(searchParams\.get\('next'\)\)/.test(confirm)) problems.push(`${CONFIRM}: 戻り先を safeNextPath に通していない`)
    const types = confirm.match(/ALLOWED_TYPES[^=]*=\s*new Set<EmailOtpType>\(\[([^\]]*)\]\)/)?.[1]
    const list = types ? [...types.matchAll(/'(\w+)'/g)].map((m) => m[1]).sort() : null
    if (JSON.stringify(list) !== JSON.stringify(["email", "magiclink"])) problems.push(`${CONFIRM}: 受け付ける type が magiclink・email だけでない（${JSON.stringify(list)}）`)
    if (!/ALLOWED_TYPES\.has\(type\)/.test(confirm)) problems.push(`${CONFIRM}: type を確かめずに verifyOtp している`)
    if (!/'Referrer-Policy': 'no-referrer'/.test(confirm)) problems.push(`${CONFIRM}: token_hash 入りの URL を行き先に渡さない（no-referrer）が無い`)
    if (!/'Cache-Control': 'no-store'/.test(confirm)) problems.push(`${CONFIRM}: 応答を残さない（no-store）が無い`)
    return problems
}

const files = Object.fromEntries([CALLBACK, LOGIN, CONFIRM].map((f) => [f, read(f)]))
const lib = read(LIB)

if (SELF_TEST) {
    const neg = [...behaviour(await load(lib)), ...wiring(files)]
    if (neg.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of neg) console.log("   ", p)
        process.exit(1)
    }
    // ★門は二重（先頭の形・組み立てたオリジン）。片方だけ外しても、もう片方が止めるので、両方を外した形で見る
    const libMutants = [
        ["素通しに戻す（直す前）", [["if (!raw) return fallback", "return raw || fallback"]], "https://evil.example"],
        ["// の門とオリジンの確認を両方外す", [['raw.startsWith("//") || ', ""], ["if (u.origin !== base) return fallback", ""]], "//evil.example"],
    ]
    for (const [label, edits, expect] of libMutants) {
        let src = lib
        for (const [from, to] of edits) {
            if (!src.includes(from)) { console.log(`自己診断: 書き換える箇所が ${LIB} に無い: ${from}`); process.exit(1) }
            src = src.replace(from, to)
        }
        const r = behaviour(await load(src))
        if (!r.some((p) => p.includes(`「${expect}」`))) { console.log(`自己診断: ${label} → 検出できない`); for (const p of r) console.log("   ", p); process.exit(1) }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    const wireMutants = [
        ["callback を直す前に戻す", CALLBACK, "return NextResponse.redirect(new URL(next, origin))", "return NextResponse.redirect(`${origin}${next}`)", "`${origin}${next}`"],
        ["login の redirectTo を素通しにする", LOGIN, 'safeNextPath(searchParams.get("redirectTo"))', 'searchParams.get("redirectTo") || "/tool"', "redirectTo を"],
        ["confirm で recovery も受ける", CONFIRM, "['magiclink', 'email']", "['magiclink', 'email', 'recovery']", "受け付ける type"],
        ["confirm の no-referrer を外す", CONFIRM, "'Referrer-Policy': 'no-referrer'", "'X-Dummy': 'x'", "no-referrer"],
    ]
    for (const [label, file, from, to, expect] of wireMutants) {
        if (!files[file].includes(from)) { console.log(`自己診断: 書き換える箇所が ${file} に無い: ${from}`); process.exit(1) }
        const r = wiring({ ...files, [file]: files[file].replace(from, to) })
        if (!r.some((p) => p.includes(expect))) { console.log(`自己診断: ${label} → 検出できない`); process.exit(1) }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    console.log("  陰性対照: 戻り先はこのアプリの中の相対パスだけ・3 か所が通している・confirm は magiclink/email だけ")
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const problems = [...behaviour(await load(lib)), ...wiring(files)]
console.log(`ログインの戻り先と、ログインした状態で入る口を検査: 通す ${PASS.length}・止める ${BLOCK.length}・配線 3 か所`)
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("AUTH_HANDOFF_OK")
