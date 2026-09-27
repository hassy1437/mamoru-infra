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
// ■ ★自己診断は本物の src に書かない（2026-09-28）
//   陽性対照（一覧に無いファイル・部品の書き換え）は src の写し（OS の一時ディレクトリ）で回す。
//   以前は src/app に一時ファイルを置き、部品も書き換えていたので、check-pdf-all で並列に
//   src を列挙する検査（check-warning-consumers・この検査の本番）が「列挙した直後に消えた」
//   ENOENT で落ちた（2026-09-27・3 回中 1 回）。部品が _self に化けた瞬間を読む競合もあった。
//   ★写しを repo の tmp/ に置かないのは、tsconfig の include（**/*.tsx）が tmp/ を拾うから。
//
// 使い方: node scripts/check-map-link.mjs [--self-test]
// =============================================================
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import ts from "typescript"

const ROOT = process.cwd()
const LIB_REL = "src/lib/maps-link.ts"
const LIB = path.join(ROOT, LIB_REL)
const COMPONENT = "src/components/map-link.tsx"

/** ★使ってよい場所（理由つき）。一覧に無いファイルで使ったら落ちる。 */
const ALLOWED = new Map([
    ["src/components/property-search.tsx", "物件一覧（/properties・/inspection）。物件は RLS で本人だけ。現場へ向かうときに開く入口"],
    ["src/app/properties/[id]/page.tsx", "物件の詳細。同上。編集・複製・点検開始の前に住所を確かめる画面"],
])

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
    // ★pid も付ける。自己診断と本番が同じミリ秒に起動すると、片方が書き直している途中の
    //   ファイルをもう片方が import しうる（check-pdf-all は両方を並列に走らせる）
    const out = path.join(outDir, `maps-link.${process.pid}.${Date.now()}.mjs`)
    fs.writeFileSync(out, js, "utf8")
    return import(pathToFileURL(out).href)
}

/** root の下の src を見る。★自己診断は root に src の写しを渡す（本物の src に書かないため） */
function staticCheck(root = ROOT) {
    const problems = []
    const rel = (p) => path.relative(root, p).replace(/\\/g, "/")
    const users = walk(path.join(root, "src"))
        .filter((f) => rel(f) !== COMPONENT && rel(f) !== LIB_REL)
        .filter((f) => /<MapLink\b|googleMapsSearchUrl\(/.test(fs.readFileSync(f, "utf8")))
        .map(rel)
    for (const u of users) {
        if (!ALLOWED.has(u)) problems.push(`${u}: 地図リンクを使っているが、住所を見せてよい相手か決めていない（ALLOWED に理由つきで足すこと）`)
    }
    for (const a of ALLOWED.keys()) {
        if (!users.includes(a)) problems.push(`${a}: 一覧にあるのに使っていない（一覧が古い）`)
    }
    const comp = fs.readFileSync(path.join(root, COMPONENT), "utf8")
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
    // ★陽性①③は src の写しで回す（本物の src には書かない。理由は冒頭）
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "map-link-self-test-"))
    let copyOk = false, caught1 = false, caught3 = false
    try {
        fs.cpSync(path.join(ROOT, "src"), path.join(sandbox, "src"), { recursive: true })
        // ★写しが本物の代わりになること（写しでも陰性・使う場所が一致）。ずれた写しで陽性を取っても意味が無い
        const sc = staticCheck(sandbox)
        copyOk = sc.problems.length === 0 && sc.users.join("\n") === s0.users.join("\n")
        // ★陽性①: 一覧に無いファイルで使う
        const stray = path.join(sandbox, "src", "app", "_map-link-self-test.tsx")
        fs.writeFileSync(stray, 'export const x = "<MapLink";\n', "utf8")
        if (!fs.existsSync(stray)) throw new Error("注入が書き込まれていない")
        caught1 = staticCheck(sandbox).problems.some((p) => p.includes("_map-link-self-test.tsx") && p.includes("決めていない"))
        fs.rmSync(stray)
        // ★陽性③: 部品から target=_blank を消す
        const compPath = path.join(sandbox, COMPONENT)
        const original = fs.readFileSync(compPath, "utf8")
        if (!original.includes('target="_blank"')) throw new Error("注入先が無い")
        fs.writeFileSync(compPath, original.replace('target="_blank"', 'target="_self"'), "utf8")
        caught3 = staticCheck(sandbox).problems.some((p) => p.includes("_blank"))
    } finally {
        // ★判定（process.exit）はこの後。exit は finally を飛ばすので、中で exit すると写しが残る
        fs.rmSync(sandbox, { recursive: true, force: true })
    }
    if (!copyOk) { console.log("自己診断: src の写しが本物と一致しない（陽性対照の土台が成立しない）"); process.exit(1) }
    if (!caught1) { console.log("自己診断: 一覧に無いファイルで使っても落ちない"); process.exit(1) }
    // ★陽性②: URL にキーを足す／番地が無くても作る（挙動の検査を、壊した関数で回す）
    const withKey = { googleMapsSearchUrl: (p) => { const u = lib.googleMapsSearchUrl(p); return u ? u + "&key=abc" : u } }
    const noGuard = { googleMapsSearchUrl: (p) => lib.googleMapsSearchUrl({ ...p, address: p.address || "（空）" }) }
    if ((await behaviour(withKey)).length === 0) { console.log("自己診断: キーを足しても落ちない"); process.exit(1) }
    if ((await behaviour(noGuard)).length === 0) { console.log("自己診断: 番地が無くても作る版で落ちない"); process.exit(1) }
    if (!caught3) { console.log("自己診断: 新しいタブをやめても落ちない"); process.exit(1) }
    console.log(`  陰性対照: 使う場所 ${s0.users.length} 本が一覧と一致・部品・URL とも問題なし（src の写しでも同じ）`)
    console.log("  陽性対照①: 一覧に無いファイルで使う（src の写し） → 検出")
    console.log("  陽性対照②: URL にキーを足す／番地が無くても作る → 検出")
    console.log("  陽性対照③: 部品から target=_blank を消す（src の写し） → 検出")
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const s = staticCheck()
const b = await behaviour(lib)
console.log(`地図リンクを検査: 使う場所 ${s.users.length} 本 / 一覧 ${ALLOWED.size} 本`)
const problems = [...s.problems, ...b]
if (problems.length) { for (const p of problems) console.log(`  NG  ${p}`); console.log(`\n${problems.length} 件`); process.exit(1) }
console.log("MAP_LINK_OK")
