// =============================================================
// scripts/check-pdf-api-auth.mjs — PDF 生成の口（/api/generate-*）が、ログインしている人だけに開いていること
//
// ■ ★なぜ要るか（2026-09-23・先行利用の前・C3）
//   25 本のルートは本文をそのまま描画して返すだけで、認証を見ていなかった。本番で未ログインの
//   空 POST に 200・3.4MB の PDF が返った（2026-09-22 実測）。middleware で止めるようにした
//   （src/lib/pdf-api-guard.ts）。★止め方が崩れると黙って開く ―― 画面は困らないので誰も気づかない。
//
// ■ 見るもの（静的・サーバを立てない）
//   ①src/app/api の口が全部、止める接頭辞（/api/generate-）に入っている（★外れた口は素通り）
//   ②middleware の matcher が /api/generate-… を拾う（除外パターンに食われていない）
//   ③updateSession: 未ログインで 401 ／ 環境変数なしで 503 ／ getUser の例外で 401（この口だけ fail-closed）
//   ④src/proxy.ts（旧 src/middleware.ts）: 例外のときも、この口は 401（fail-open の next() に落とさない）
//   ⑤ルートの中では止めていない（★検査が POST を関数として直に呼ぶので、中で止めると検査が全部落ちる）
//   ⑥PDF 以外の口（例: /api/nameplate/read・2026-11-03 銘板の読み取り）は、接頭辞の外にある代わりに
//     ★ルートの中でログインを確かめ、ログインしていなければ先に返している（外れた口が素通りにならない）。
//     ★口は 1 段深い所にも置ける（api/nameplate/status/route.ts）ので、route.ts を下の階層まで探す
//
// 使い方: node scripts/check-pdf-api-auth.mjs [--self-test]
// =============================================================
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import ts from "typescript"

const ROOT = process.cwd()
const API = path.join(ROOT, "src", "app", "api")
const GUARD = path.join(ROOT, "src", "lib", "pdf-api-guard.ts")
const UPDATE = path.join(ROOT, "src", "lib", "supabase", "middleware.ts")
const MW = path.join(ROOT, "src", "proxy.ts")

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

async function importGuardFrom(text, tag) {
    const outDir = path.join(ROOT, "tmp", "pdf-api-auth")
    fs.mkdirSync(outDir, { recursive: true })
    const js = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }, fileName: GUARD }).outputText
    const out = path.join(outDir, `guard.${tag}.${Date.now()}.mjs`)
    fs.writeFileSync(out, js, "utf8")
    return import(pathToFileURL(out).href)
}

/** src/app/api の下の route.ts を全部（★1 段深い所も）。キーは api/ からの道（例: generate-pdf・nameplate/status） */
function findRoutes(dir, rel = "") {
    const out = {}
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!e.isDirectory()) continue
        const sub = rel ? `${rel}/${e.name}` : e.name
        const file = path.join(dir, e.name, "route.ts")
        if (fs.existsSync(file)) out[sub] = fs.readFileSync(file, "utf8")
        Object.assign(out, findRoutes(path.join(dir, e.name), sub))
    }
    return out
}

function load() {
    const all = findRoutes(API)
    return {
        apiDirs: Object.keys(all).sort(),
        routes: all,
        update: fs.readFileSync(UPDATE, "utf8"),
        mw: fs.readFileSync(MW, "utf8"),
    }
}

/** 接頭辞の外の口が、ルートの中でログインを確かめ、ログインしていなければ先に返しているか（401 か「使えない」） */
function selfGuarded(src) {
    const s = strip(src ?? "")
    return /auth\.getUser\(\)/.test(s) && /if \(!user\b[^\n]*\)\s*return\b/.test(s)
}

function check(guard, f) {
    const problems = []
    // ① 口が全部接頭辞に入っている（⑥ 外の口は、ルートの中でログインを確かめて 401 を返す）
    const pdfDirs = f.apiDirs.filter((d) => guard.isPdfApiPath(`/api/${d}`))
    for (const d of f.apiDirs) {
        if (guard.isPdfApiPath(`/api/${d}`)) continue
        if (!selfGuarded(f.routes[d])) problems.push(`src/app/api/${d}: 止める接頭辞（${guard.PDF_API_PREFIX}）に入っておらず、中でもログインを確かめていない＝未ログインで叩ける`)
    }
    if (pdfDirs.length < 25) problems.push(`口の数が想定より少ない（${pdfDirs.length}）。走査が空振りしていないか`)
    // ② matcher が拾う
    const m = f.mw.match(/matcher:\s*\[\s*'([^']+)'/)
    if (!m) problems.push("src/proxy.ts: matcher を読み取れない")
    else {
        const re = new RegExp("^" + m[1].replace(/\\\\/g, "\\") + "$")
        for (const d of pdfDirs.slice(0, 3)) if (!re.test(`/api/${d}`)) problems.push(`matcher が /api/${d} を拾わない（middleware を通らない）`)
    }
    // ③ updateSession
    const u = strip(f.update)
    if (!/const pdfApi = isPdfApiPath\(request\.nextUrl\.pathname\)/.test(u)) problems.push("updateSession: PDF 生成の口かを見ていない")
    if (!/if \(pdfApi && !user\) \{\s*return NextResponse\.json\(PDF_API_UNAUTHORIZED_BODY, \{ status: 401 \}\)/.test(u)) problems.push("updateSession: 未ログインで 401 を返していない")
    if (!/if \(!supabaseUrl \|\| !supabaseAnonKey\) \{[\s\S]*?if \(pdfApi\) return NextResponse\.json\(PDF_API_NOT_CONFIGURED_BODY, \{ status: 503 \}\)/.test(u)) problems.push("updateSession: 環境変数が無いとき、PDF 生成の口を通している（503 にしていない）")
    if (!/\} catch \{[\s\S]*?if \(pdfApi\) return NextResponse\.json\(PDF_API_UNAUTHORIZED_BODY, \{ status: 401 \}\)/.test(u)) problems.push("updateSession: getUser の例外のとき、PDF 生成の口を通している")
    // ④ middleware の例外
    const w = strip(f.mw)
    if (!/catch \{[\s\S]*?isPdfApiPath\(request\.nextUrl\.pathname\)[\s\S]*?status: 401[\s\S]*?return NextResponse\.next\(\)/.test(w)) problems.push("src/proxy.ts: 例外のとき、PDF 生成の口を next() で通している")
    // ⑤ PDF の口はルートの中では止めていない
    for (const [d, src] of Object.entries(f.routes)) {
        if (!guard.isPdfApiPath(`/api/${d}`)) continue
        if (/auth\.getUser\(\)|getAuthenticatedClient\(/.test(strip(src))) problems.push(`src/app/api/${d}: ルートの中で認証している（PDF の検査が POST を直に呼ぶので全部落ちる）`)
    }
    return problems
}

const guardText = fs.readFileSync(GUARD, "utf8")
const files = load()

if (process.argv.includes("--self-test")) {
    const g0 = await importGuardFrom(guardText, "neg")
    const p0 = check(g0, files)
    if (p0.length) { console.log("自己診断: 現状が既にNG（陰性対照が成立しない）"); for (const p of p0) console.log("   ", p); process.exit(1) }
    // ★陽性①: 接頭辞から外れた口が増える
    const p1 = check(g0, { ...files, apiDirs: [...files.apiDirs, "export-report-pdf"], routes: { ...files.routes, "export-report-pdf": "export async function POST() { return new Response('x') }" } })
    if (!p1.some((p) => p.includes("export-report-pdf"))) { console.log("自己診断: 接頭辞から外れた口を検出できない"); process.exit(1) }
    // ★陽性②: 未ログインの 401 を消す（直す前の形）
    const u2 = files.update.replace(/if \(pdfApi && !user\) \{\s*return NextResponse\.json\(PDF_API_UNAUTHORIZED_BODY, \{ status: 401 \}\)\s*\}/, "")
    if (u2 === files.update) { console.log("自己診断: 注入先（401 の分岐）が無い"); process.exit(1) }
    if (!check(g0, { ...files, update: u2 }).some((p) => p.includes("401 を返していない"))) { console.log("自己診断: 401 を消しても落ちない"); process.exit(1) }
    // ★陽性③: middleware の例外を fail-open に戻す（直す前の形）
    const w3 = files.mw.replace(/if \(isPdfApiPath\(request\.nextUrl\.pathname\)\) \{[\s\S]*?\}\s*\n/, "")
    if (w3 === files.mw) { console.log("自己診断: 注入先（例外の分岐）が無い"); process.exit(1) }
    if (!check(g0, { ...files, mw: w3 }).some((p) => p.includes("next() で通している"))) { console.log("自己診断: 例外を fail-open に戻しても落ちない"); process.exit(1) }
    // ★陽性④: 接頭辞を別の文字にする（全口が外れる）
    const g4 = await importGuardFrom(guardText.replace('"/api/generate-"', '"/api/pdf-"'), "pos4")
    if (check(g4, files).filter((p) => p.includes("接頭辞")).length < 25) { console.log("自己診断: 接頭辞を変えても全口を検出できない"); process.exit(1) }
    // ★陽性⑥: 接頭辞の外の口から、中のログインの確かめを消す（1 段深い口でも拾う）
    const outer = files.apiDirs.filter((d) => !g0.isPdfApiPath(`/api/${d}`))
    if (outer.length === 0) { console.log("自己診断: 接頭辞の外の口が無い（陽性⑥を作れない）"); process.exit(1) }
    const r6 = { ...files.routes, [outer[0]]: files.routes[outer[0]].replace(/if \(!user\b/g, "if (!ignored") }
    if (!check(g0, { ...files, routes: r6 }).some((p) => p.includes(outer[0]) && p.includes("中でもログインを確かめていない"))) { console.log("自己診断: 接頭辞の外の口の認証を消しても落ちない"); process.exit(1) }
    // ★陽性⑤: ルートの中で認証する
    const first = files.apiDirs.find((d) => g0.isPdfApiPath(`/api/${d}`))
    const r5 = { ...files.routes, [first]: files.routes[first] + "\nconst x = async (s) => s.auth.getUser()\n" }
    if (!check(g0, { ...files, routes: r5 }).some((p) => p.includes("ルートの中で認証"))) { console.log("自己診断: ルートの中の認証を検出できない"); process.exit(1) }
    console.log(`  陰性対照: 口 ${files.apiDirs.length} 本すべて接頭辞の中か中で認証・matcher が拾う・401/503/例外の分岐あり`)
    console.log("  陽性対照①: 接頭辞から外れた口 → 検出")
    console.log("  陽性対照②: 未ログインの 401 を消す → 検出")
    console.log("  陽性対照③: 例外を fail-open に戻す → 検出")
    console.log("  陽性対照④: 接頭辞を変える → 全口を検出")
    console.log("  陽性対照⑤: ルートの中で認証する → 検出")
    console.log(`  陽性対照⑥: 接頭辞の外の口（${outer[0]}）の認証を消す → 検出`)
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const guard = await importGuardFrom(guardText, "run")
const problems = check(guard, files)
console.log(`PDF 生成の口の認証を検査: 口 ${files.apiDirs.length} 本`)
if (problems.length) { for (const p of problems) console.log(`  NG  ${p}`); console.log(`\n${problems.length} 件`); process.exit(1) }
console.log("PDF_API_AUTH_OK")
