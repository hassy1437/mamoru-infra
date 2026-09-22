// =============================================================
// scripts/check-map-link.mjs — Google マップのリンクが「住所を見せてよい画面」にだけあること
//
// ■ ★なぜ要るか（2026-09-22）
//   地図のリンクは URL に住所がそのまま入る。★住所を見せてよい相手の画面にしか出してはいけない。
//   点検アプリの物件は RLS で本人しか読めないが、★将来 別の相手に見せる画面（共有・運営の閲覧）が
//   増えたとき、そこに黙ってリンクが付くのを止める。＝ 使ってよい場所を★理由つきの一覧で固定する
//   （mamoruinfra-web の lib/promise-copy.test.ts と同じ形）。
//
// ■ 見るもの
//   ①静的: <MapLink / googleMapsSearchUrl( を使うファイルが全部一覧にある／一覧のファイルが全部使っている
//   ②部品: target=_blank ＋ rel=noopener ／ address が無ければ描かない
//   ③挙動: URL の形（maps/search/?api=1&query=・キー無し）／番地が無ければ null
//
// 使い方: node scripts/check-map-link.mjs [--self-test]
// =============================================================
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import ts from "typescript"

const ROOT = process.cwd()
const SRC = path.join(ROOT, "src")
const LIB = path.join(SRC, "lib", "maps-link.ts")
const COMPONENT = "src/components/map-link.tsx"

/** ★使ってよい場所（理由つき）。一覧に無いファイルで使ったら落ちる。 */
const ALLOWED = new Map([
    ["src/components/property-search.tsx", "物件一覧（/properties・/inspection）。物件は RLS で本人だけ。現場へ向かうときに開く入口"],
    ["src/app/properties/[id]/page.tsx", "物件の詳細。同上。編集・複製・点検開始の前に住所を確かめる画面"],
])

const rel = (p) => path.relative(ROOT, p).replace(/\\/g, "/")

function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) walk(p, out)
        else if (/\.tsx?$/.test(e.name)) out.push(p)
    }
    return out
}

async function importLib() {
    const outDir = path.join(ROOT, "tmp", "map-link")
    fs.mkdirSync(outDir, { recursive: true })
    const js = ts.transpileModule(fs.readFileSync(LIB, "utf8"), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
        fileName: LIB,
    }).outputText
    const out = path.join(outDir, `maps-link.${Date.now()}.mjs`)
    fs.writeFileSync(out, js, "utf8")
    return import(pathToFileURL(out).href)
}

function staticCheck() {
    const problems = []
    const users = walk(SRC)
        .filter((f) => rel(f) !== COMPONENT && rel(f) !== rel(LIB))
        .filter((f) => /<MapLink\b|googleMapsSearchUrl\(/.test(fs.readFileSync(f, "utf8")))
        .map(rel)
    for (const u of users) {
        if (!ALLOWED.has(u)) problems.push(`${u}: 地図リンクを使っているが、住所を見せてよい相手か決めていない（ALLOWED に理由つきで足すこと）`)
    }
    for (const a of ALLOWED.keys()) {
        if (!users.includes(a)) problems.push(`${a}: 一覧にあるのに使っていない（一覧が古い）`)
    }
    const comp = fs.readFileSync(path.join(ROOT, COMPONENT), "utf8")
    if (!/target="_blank"/.test(comp)) problems.push(`${COMPONENT}: target="_blank" が無い（新しいタブで開く）`)
    if (!/rel="noopener/.test(comp)) problems.push(`${COMPONENT}: rel="noopener…" が無い`)
    if (!/if \(!href\) return null/.test(comp)) problems.push(`${COMPONENT}: address が無いときに描かない分岐が無い`)
    return { problems, users }
}

async function behaviour(lib) {
    const problems = []
    const url = lib.googleMapsSearchUrl({ prefecture: null, municipality: null, address: "大阪府大阪市北区天神西町8-19 法研ビル" })
    const want = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("大阪府大阪市北区天神西町8-19 法研ビル")
    if (url !== want) problems.push(`URL の形が違う: ${url}`)
    if (url && /[?&]key=/.test(url)) problems.push("URL に API キーのパラメータがある")
    if (lib.googleMapsSearchUrl({ prefecture: "大阪府", municipality: "大阪市", address: null }) !== null) problems.push("番地が無いのに URL を作っている（null）")
    if (lib.googleMapsSearchUrl({ prefecture: "大阪府", municipality: "大阪市", address: "  " }) !== null) problems.push("番地が空白なのに URL を作っている")
    return problems
}

const lib = await importLib()

if (process.argv.includes("--self-test")) {
    // ★陰性: いまの実装で問題なし
    const s0 = staticCheck(); const b0 = await behaviour(lib)
    if (s0.problems.length || b0.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of [...s0.problems, ...b0]) console.log("   ", p)
        process.exit(1)
    }
    // ★陽性①: 一覧に無いファイルで使う（一時ファイルを src に置き、必ず消す）
    const stray = path.join(SRC, "app", "_map-link-self-test.tsx")
    let caught1 = false
    try {
        fs.writeFileSync(stray, 'export const x = "<MapLink";\n', "utf8")
        if (!fs.existsSync(stray)) throw new Error("注入が書き込まれていない")
        caught1 = staticCheck().problems.some((p) => p.includes("_map-link-self-test.tsx") && p.includes("決めていない"))
    } finally {
        fs.rmSync(stray, { force: true })
    }
    if (!caught1) { console.log("自己診断: 一覧に無いファイルで使っても落ちない"); process.exit(1) }
    // ★陽性②: URL にキーを足す／番地が無くても作る（挙動の検査を、壊した関数で回す）
    const withKey = { googleMapsSearchUrl: (p) => { const u = lib.googleMapsSearchUrl(p); return u ? u + "&key=abc" : u } }
    const noGuard = { googleMapsSearchUrl: (p) => lib.googleMapsSearchUrl({ ...p, address: p.address || "（空）" }) }
    if ((await behaviour(withKey)).length === 0) { console.log("自己診断: キーを足しても落ちない"); process.exit(1) }
    if ((await behaviour(noGuard)).length === 0) { console.log("自己診断: 番地が無くても作る版で落ちない"); process.exit(1) }
    // ★陽性③: 部品から target=_blank を消す（実ファイルを書き換え、必ず戻す）
    const compPath = path.join(ROOT, COMPONENT)
    const original = fs.readFileSync(compPath, "utf8")
    let caught3 = false
    try {
        if (!original.includes('target="_blank"')) throw new Error("注入先が無い")
        fs.writeFileSync(compPath, original.replace('target="_blank"', 'target="_self"'), "utf8")
        caught3 = staticCheck().problems.some((p) => p.includes("_blank"))
    } finally {
        fs.writeFileSync(compPath, original, "utf8")
    }
    if (!caught3) { console.log("自己診断: 新しいタブをやめても落ちない"); process.exit(1) }
    console.log(`  陰性対照: 使う場所 ${s0.users.length} 本が一覧と一致・部品・URL とも問題なし`)
    console.log("  陽性対照①: 一覧に無いファイルで使う → 検出")
    console.log("  陽性対照②: URL にキーを足す／番地が無くても作る → 検出")
    console.log("  陽性対照③: 部品から target=_blank を消す → 検出")
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const s = staticCheck()
const b = await behaviour(lib)
console.log(`地図リンクを検査: 使う場所 ${s.users.length} 本 / 一覧 ${ALLOWED.size} 本`)
const problems = [...s.problems, ...b]
if (problems.length) { for (const p of problems) console.log(`  NG  ${p}`); console.log(`\n${problems.length} 件`); process.exit(1) }
console.log("MAP_LINK_OK")
