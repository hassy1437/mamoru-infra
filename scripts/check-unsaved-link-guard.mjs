// 保存していない入力があるとき、画面の中のリンクで離れる前に確かめるか（2026-10-09・総点検 B13）。
//
// ■ なぜ要るか
//   入力が残っているかの見張り（useUnsavedChanges）は beforeunload だけだった。Next の <Link>
//   （「← 物件一覧に戻る」・ヘッダー）はページを読み直さずに移るので、総括表・物件・点検者一覧・点検者の
//   入力が黙って消えていた。★画面の見た目は正常なので、PDF の検査では出ない種類。
//
// ■ 検査すること
//   1. linkLeavesPage を実際に動かす（同じサイトの別のページ＝聞く／新しいタブ・修飾キー・中クリック・
//      ダウンロード・別のサイト・同じページの # だけ＝聞かない）
//   2. 見張りがクリックを捕捉（capture）で document に付け、断られたら preventDefault と stopPropagation で
//      止めている（★React はルート要素で受けるので、捕捉で止めないと <Link> の移動が先に走る）
//   3. 入力の多い 5 画面が見張りを使い、入力で markDirty している
//
// 使い方: node scripts/check-unsaved-link-guard.mjs [--self-test]
import fs from "fs"
import path from "path"
import { pathToFileURL } from "url"
import ts from "typescript"

const ROOT = process.cwd()
const SELF_TEST = process.argv.includes("--self-test")
// ★自己診断と本番で出力先を分ける（check-pdf-all は並列に走らせる）
const OUT = path.join(ROOT, "tmp", SELF_TEST ? "unsaved-link-guard-selftest" : "unsaved-link-guard")
const LIB = "src/lib/leave-guard.ts"
const HOOK = "src/hooks/use-unsaved-changes.ts"
const FORMS = [
    "src/components/soukatsu-form.tsx",
    "src/components/soukatsu-edit-form.tsx",
    "src/components/itiran-form.tsx",
    "src/components/property-form.tsx",
    "src/components/inspector-master-form.tsx",
]
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8")

async function loadLib(src) {
    fs.mkdirSync(OUT, { recursive: true })
    const tag = Date.now() + Math.random().toString(36).slice(2, 6)
    const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
    const file = path.join(OUT, `leave-guard.${tag}.mjs`)
    fs.writeFileSync(file, js, "utf8")
    return import(pathToFileURL(file).href)
}

const HERE = "https://app.mamoruinfra.com/inspection/abc/edit"
const CLICK = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false }
const LINK = { href: "/properties", target: "", download: false }
const CASES = [
    ["同じサイトの別のページ（相対）", CLICK, LINK, true],
    ["同じサイトの別のページ（絶対）", CLICK, { ...LINK, href: "https://app.mamoruinfra.com/" }, true],
    ["同じページで検索条件だけ違う", CLICK, { ...LINK, href: "/inspection/abc/edit?step=2" }, true],
    ["target=_self", CLICK, { ...LINK, target: "_self" }, true],
    ["同じページの # だけ", CLICK, { ...LINK, href: "#equipment" }, false],
    ["別のサイト", CLICK, { ...LINK, href: "https://mamoruinfra.com/" }, false],
    ["新しいタブ（target=_blank）", CLICK, { ...LINK, target: "_blank" }, false],
    ["ダウンロード", CLICK, { ...LINK, download: true }, false],
    ["Ctrl を押しながら", { ...CLICK, ctrlKey: true }, LINK, false],
    ["⌘ を押しながら", { ...CLICK, metaKey: true }, LINK, false],
    ["Shift を押しながら", { ...CLICK, shiftKey: true }, LINK, false],
    ["中クリック", { ...CLICK, button: 1 }, LINK, false],
    ["ほかの処理が既に止めた", { ...CLICK, defaultPrevented: true }, LINK, false],
]

async function inspect(src) {
    const problems = []
    let lib
    try {
        lib = await loadLib(src(LIB))
    } catch (e) {
        return [`${LIB} を読み込めない: ${e.message}`]
    }
    if (typeof lib.linkLeavesPage !== "function") problems.push("linkLeavesPage が無い")
    else {
        for (const [label, click, link, want] of CASES) {
            const got = lib.linkLeavesPage(click, link, HERE)
            if (got !== want) problems.push(`判定が違う: ${label} → ${got}（期待 ${want}）`)
        }
    }
    if (!/離れ/.test(lib.LEAVE_CONFIRM_MESSAGE ?? "")) problems.push("確かめる文（LEAVE_CONFIRM_MESSAGE）が無い")

    const hook = src(HOOK)
    if (!/document\.addEventListener\("click", onClick, true\)/.test(hook)) problems.push("見張りがクリックを捕捉（capture）で document に付けていない＝<Link> の移動が先に走る")
    if (!/linkLeavesPage\(/.test(hook)) problems.push("見張りが linkLeavesPage で判定していない")
    if (!/window\.confirm\(LEAVE_CONFIRM_MESSAGE\)/.test(hook)) problems.push("見張りが確かめる文を出していない")
    const cancel = hook.match(/if \(window\.confirm\(LEAVE_CONFIRM_MESSAGE\)\) \{[\s\S]*?\}\s*([\s\S]*?)\n\s*\}\s*\n\s*document\.addEventListener/)?.[1] ?? ""
    if (!/e\.preventDefault\(\)/.test(cancel) || !/e\.stopPropagation\(\)/.test(cancel)) problems.push("断られたときに preventDefault と stopPropagation の両方で止めていない＝移動してしまう")
    if (!/if \(!isDirty\.current\) return/.test(hook.slice(hook.indexOf("const onClick")))) problems.push("入力が無いときもリンクで聞いてしまう")

    for (const f of FORMS) {
        const s = src(f)
        if (!/useUnsavedChanges\(\)/.test(s)) problems.push(`${f} が見張り（useUnsavedChanges）を使っていない`)
        if (!/addEventListener\("input", handler\)/.test(s) || !/markDirty\(\)/.test(s)) problems.push(`${f} が入力で markDirty していない`)
    }
    return problems
}

if (SELF_TEST) {
    const neg = await inspect(read)
    if (neg.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of neg) console.log("   ", p)
        process.exit(1)
    }
    const mutants = [
        ["別のサイトでも聞く", (p) => p === LIB ? read(p).replace("if (to.origin !== from.origin) return false", "") : read(p), "別のサイト"],
        ["修飾キーを見ない", (p) => p === LIB ? read(p).replace("click.metaKey || click.ctrlKey || click.shiftKey || click.altKey", "false") : read(p), "Ctrl"],
        ["# だけでも聞く", (p) => p === LIB ? read(p).replace("if (to.pathname === from.pathname && to.search === from.search) return false", "") : read(p), "# だけ"],
        ["捕捉で付けない", (p) => p === HOOK ? read(p).replace('document.addEventListener("click", onClick, true)', 'document.addEventListener("click", onClick)') : read(p), "捕捉"],
        ["断っても止めない", (p) => p === HOOK ? read(p).replace("e.stopPropagation()\n", "\n") : read(p), "止めていない"],
        ["物件の画面が見張りを使わない", (p) => p === FORMS[3] ? read(p).replace("useUnsavedChanges()", "({ markDirty: () => {}, markClean: () => {} })") : read(p), "property-form"],
    ]
    for (const [label, src, expect] of mutants) {
        if (!(await inspect(src)).some((p) => p.includes(expect))) {
            console.log(`自己診断: ${label} → 検出できない`)
            process.exit(1)
        }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    console.log(`  陰性対照: 現状（判定 ${CASES.length} 通り・捕捉で止める・5 画面）→ 0 件`)
    fs.rmSync(OUT, { recursive: true, force: true })
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const problems = await inspect(read)
fs.rmSync(OUT, { recursive: true, force: true })
console.log(`保存していない入力の見張りを検査: リンクの判定 ${CASES.length} 通り・捕捉で止める・入力の多い ${FORMS.length} 画面`)
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("UNSAVED_LINK_GUARD_OK")
