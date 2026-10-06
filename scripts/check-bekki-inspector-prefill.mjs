// 別記様式の頭の「点検者」欄（氏名・所属会社・住所・TEL）が、点検者一覧の点検者1から初期値で入るかを検査する（#17・2026-10-06）。
//
// ■ なぜ要るか（2026-10-05 の通し確認）
//   別記のページは点検者1の★氏名だけを渡していて、所属会社・住所・TEL は空で始まっていた
//   ＝ 様式ごとに 3 欄ずつ打ち直し。★空欄は正常な見た目なので、画面でも PDF でも「壊れた」とは出ない種類。
//   値の作り方（bekkiInspectorInitial）は check-inspector-shape.mjs が見る。ここは★配線を見る:
//
// ■ 検査すること（★ページ・フォームは一覧を持たず、ファイルから拾う）
//   1. ページ: 別記のフォームを描くページは全部、bekkiInspectorInitial(itiran?.inspector1) を initial に spread する。
//      spread のあとで inspector_* を個別に上書きしない（上書きすると初期値が消える）。
//   2. フォーム: ページが描く別記のフォームは、次のどちらかに分類できること（★どちらでもなければ落ちる）
//      - 状態を持つ（useState で点検者の欄を持つ）: 所属会社・住所・TEL の useState と、下書きの復元が
//        initial.inspector_* を既定にしている
//      - 包むだけ（BekkiResultFormBase に {...props} を渡す）: 包む先が「状態を持つ」の条件を満たす
//   3. どのフォームも initial の型に inspector_company / inspector_address / inspector_tel がある
//      （★spread で渡す欄は型の余分チェックに掛からないので、型が嘘でも tsc は通る）
//
// ■ 点検期間（2026-10-07 に足した）
//   別記の期間が「点検年月日〜点検年月日」で始まり、総括表の期間（例 9/28〜10/6）と食い違っていた。
//   4. ページ: 総括表の inspection_period_start / inspection_period_end を select して initial に渡す
//   5. フォーム: initial の型に両方がある。状態を持つフォームは期間の useState と下書きの復元が
//      bekkiPeriodDefault(initial)（src/lib/bekki-period.ts）を既定にしている
//
// 使い方: node scripts/check-bekki-inspector-prefill.mjs [--self-test]
import fs from "fs"
import path from "path"

const ROOT = process.cwd()
const PAGES_DIR = "src/app/inspection/[id]/itiran/[itiranId]"
const BASE = "src/components/bekki-result-form-base.tsx"
const FIELDS = [
    { key: "inspector_company", setter: "setInspectorCompany" },
    { key: "inspector_address", setter: "setInspectorAddress" },
    { key: "inspector_tel", setter: "setInspectorTel" },
]
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8")

/** ページを拾う: 別記のフォーム（@/components/…-bekki…-form）を import しているページ。 */
function collect() {
    const files = {}
    const pageToForm = {}
    for (const d of fs.readdirSync(path.join(ROOT, PAGES_DIR), { withFileTypes: true })) {
        if (!d.isDirectory()) continue
        const page = `${PAGES_DIR}/${d.name}/page.tsx`
        if (!fs.existsSync(path.join(ROOT, page))) continue
        const src = read(page)
        const m = src.match(/from\s+"@\/components\/([a-z0-9-]*bekki[a-z0-9-]*-form)"/)
        if (!m) continue
        files[page] = src
        const form = `src/components/${m[1]}.tsx`
        pageToForm[page] = form
        files[form] = read(form)
    }
    files[BASE] = read(BASE)
    return { files, pageToForm }
}

/** `initial={{ … }}` の中身（ページ）。 */
function initialBlock(src) {
    const i = src.indexOf("initial={{")
    if (i < 0) return null
    const j = src.indexOf("}}", i)
    return j < 0 ? null : src.slice(i, j)
}

/** `initial: { … }` の型（フォーム）。 */
function initialType(src) {
    const m = src.match(/\binitial:\s*\{([\s\S]*?)\n\s*\}/)
    return m ? m[1] : null
}

function judgeStateful(name, src) {
    const problems = []
    for (const { key, setter } of FIELDS) {
        const init = new RegExp(`useState\\(coerceString\\(saved\\.${key}\\s*,\\s*initial\\.${key}\\s*\\?\\?\\s*""\\)\\)`)
        if (!init.test(src)) problems.push(`${name}: ${key} の初期状態が initial.${key} を既定にしていない`)
        // ★下書きの復元（ある様式だけ）。p.<key> を読む setter は全部既定つきであること
        const restores = [...src.matchAll(new RegExp(`${setter}\\(coerceString\\(p\\.${key}([^)]*)\\)\\)`, "g"))]
        for (const r of restores) {
            if (!new RegExp(`^\\s*,\\s*initial\\.${key}\\s*\\?\\?\\s*""$`).test(r[1])) {
                problems.push(`${name}: 下書きの復元で ${key} が initial.${key} を既定にしていない`)
            }
        }
    }
    return problems
}

const PERIOD_KEYS = ["inspection_period_start", "inspection_period_end"]

/** 5. 期間の初期状態と下書きの復元が bekkiPeriodDefault(initial) を既定にしている */
function judgePeriod(name, src) {
    const problems = []
    for (const [field, part] of [["period_start", "start"], ["period_end", "end"]]) {
        const init = new RegExp(`useState\\(coerceString\\(saved\\.${field}\\s*,\\s*bekkiPeriodDefault\\(initial\\)\\.${part}\\)\\)`)
        if (!init.test(src)) problems.push(`${name}: ${field} の初期状態が総括表の期間（bekkiPeriodDefault）を既定にしていない`)
        // ★正規表現で括弧の入れ子を追わない。呼び出しの直後の文字列がそのとおりかで見る
        const head = `coerceString(p.${field}`
        const want = `, bekkiPeriodDefault(initial).${part})`
        for (let at = src.indexOf(head); at >= 0; at = src.indexOf(head, at + 1)) {
            if (!src.startsWith(want, at + head.length)) {
                problems.push(`${name}: 下書きの復元で ${field} が総括表の期間を既定にしていない`)
            }
        }
    }
    return problems
}

const isStateful = (src) => /const \[inspectorCompany, setInspectorCompany\] = useState\(/.test(src)
const isWrapper = (src) => /<BekkiResultFormBase\s+\{\.\.\.props\}/.test(src)

function judge({ files, pageToForm }) {
    const problems = []
    const pages = Object.keys(pageToForm)
    if (pages.length === 0) problems.push("別記のページが 1 枚も見つからない（拾い方が壊れている）")

    for (const page of pages) {
        const src = files[page]
        if (!/const inspector = bekkiInspectorInitial\(itiran\?\.inspector1\)/.test(src)) {
            problems.push(`${page}: bekkiInspectorInitial(itiran?.inspector1) を作っていない`)
        }
        const block = initialBlock(src)
        if (!block) {
            problems.push(`${page}: initial={{ … }} が見つからない`)
            continue
        }
        const at = block.indexOf("...inspector,")
        if (at < 0) problems.push(`${page}: initial に ...inspector を渡していない`)
        const override = block.match(/\binspector_(name|company|address|tel)\s*:/)
        if (override) problems.push(`${page}: initial で ${override[0].replace(/\s*:$/, "")} を個別に書いている（初期値を上書きする）`)
        // 4. 点検期間
        for (const key of PERIOD_KEYS) {
            if (!new RegExp(`\\.select\\("[^"]*\\b${key}\\b`).test(src)) problems.push(`${page}: 総括表の ${key} を select していない`)
            if (!new RegExp(`\\b${key}:\\s*soukatsu\\.${key}\\b`).test(block)) problems.push(`${page}: initial に ${key} を渡していない`)
        }
    }

    const forms = [...new Set([...Object.values(pageToForm), BASE])]
    let wrappers = 0
    let stateful = 0
    for (const form of forms) {
        const src = files[form]
        const type = initialType(src)
        if (!type) {
            problems.push(`${form}: initial の型が見つからない`)
        } else {
            for (const key of [...FIELDS.map((f) => f.key), ...PERIOD_KEYS]) {
                if (!new RegExp(`\\b${key}\\?:\\s*string\\s*\\|\\s*null`).test(type)) {
                    problems.push(`${form}: initial の型に ${key} が無い`)
                }
            }
        }
        if (form === BASE || isStateful(src)) {
            stateful++
            problems.push(...judgeStateful(form, src))
            problems.push(...judgePeriod(form, src))
        } else if (isWrapper(src)) {
            wrappers++
        } else {
            problems.push(`${form}: 状態を持つ／包むだけ のどちらにも分類できない（分類を足すこと）`)
        }
    }
    if (!isStateful(files[BASE])) problems.push(`${BASE}: 包む先なのに点検者の欄の状態を持っていない`)
    return { problems, pages: pages.length, forms: forms.length, wrappers, stateful }
}

/** ★注入: 置き換えが実際に入ったことを確かめてから使う。 */
function inject(files, file, from, to) {
    if (!files[file].includes(from)) throw new Error(`注入先が ${file} に無い: ${from}`)
    const next = { ...files, [file]: files[file].replace(from, to) }
    if (next[file] === files[file]) throw new Error(`注入が入っていない: ${file}`)
    return next
}

const collected = collect()

if (process.argv.includes("--self-test")) {
    const ok = judge(collected)
    if (ok.problems.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of ok.problems) console.log("   ", p)
        process.exit(1)
    }
    const shokakiPage = `${PAGES_DIR}/shokaki/page.tsx`
    const cases = [
        ["包む先の TEL の初期状態から既定を外す", BASE,
            'useState(coerceString(saved.inspector_tel, initial.inspector_tel ?? ""))', "useState(coerceString(saved.inspector_tel))",
            (p) => p.includes(`${BASE}: inspector_tel の初期状態`)],
        ["別記1 の下書きの復元で住所の既定を外す", "src/components/shokaki-bekki1-form.tsx",
            'setInspectorAddress(coerceString(p.inspector_address, initial.inspector_address ?? ""))', "setInspectorAddress(coerceString(p.inspector_address))",
            (p) => p.includes("下書きの復元で inspector_address")],
        ["ページで氏名だけ渡す形に戻す", shokakiPage,
            "...inspector,", "inspector_name: inspector.inspector_name,",
            (p) => p.startsWith(shokakiPage) && p.includes("...inspector を渡していない")],
        ["ページで spread のあとに TEL を空で上書き", shokakiPage,
            "...inspector,", '...inspector,\n                        inspector_tel: "",',
            (p) => p.startsWith(shokakiPage) && p.includes("inspector_tel を個別に書いている")],
        ["包むだけのフォームが props を渡さなくなる", "src/components/connected-sprinkler-bekki19-form.tsx",
            "{...props}", "initial={props.initial}",
            (p) => p.includes("connected-sprinkler-bekki19-form.tsx: 状態を持つ／包むだけ")],
        ["フォームの initial の型から所属会社を外す", "src/components/standpipe-bekki20-form.tsx",
            "inspector_company?: string | null", "",
            (p) => p.includes("standpipe-bekki20-form.tsx: initial の型に inspector_company が無い")],
        ["包む先の期間の始まりを点検年月日に戻す（2026-10-07 以前の形）", BASE,
            "coerceString(saved.period_start, bekkiPeriodDefault(initial).start)", 'coerceString(saved.period_start, initial.inspection_date ?? "")',
            (p) => p.includes(`${BASE}: period_start の初期状態`)],
        ["別記3 の期間の終わりを点検年月日に戻す", "src/components/sprinkler-bekki3-form.tsx",
            "coerceString(saved.period_end, bekkiPeriodDefault(initial).end)", 'coerceString(saved.period_end, initial.inspection_date ?? "")',
            (p) => p.includes("sprinkler-bekki3-form.tsx: period_end の初期状態")],
        ["包む先の下書きの復元で期間の始まりを点検年月日に戻す", BASE,
            "coerceString(p.period_start, bekkiPeriodDefault(initial).start)", 'coerceString(p.period_start, initial.inspection_date ?? "")',
            (p) => p.includes(`${BASE}: 下書きの復元で period_start`)],
        ["ページで期間を select しない", shokakiPage,
            ", inspection_period_start, inspection_period_end", "",
            (p) => p.startsWith(shokakiPage) && p.includes("inspection_period_start を select していない")],
    ]
    for (const [label, file, from, to, hit] of cases) {
        let mutated
        try {
            mutated = inject(collected.files, file, from, to)
        } catch (e) {
            console.log(`自己診断: ${label} ―― ${e.message}`)
            process.exit(1)
        }
        const r = judge({ files: mutated, pageToForm: collected.pageToForm })
        if (!r.problems.some(hit)) {
            console.log(`自己診断: ${label} → 検出できない`)
            for (const p of r.problems) console.log("   ", p)
            process.exit(1)
        }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    console.log(`  陰性対照: 別記のページ ${ok.pages} 枚・フォーム ${ok.forms} 本（状態を持つ ${ok.stateful}・包むだけ ${ok.wrappers}）で問題なし`)
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const r = judge(collected)
console.log(`別記の点検者の初期値を検査: ページ ${r.pages} 枚・フォーム ${r.forms} 本（状態を持つ ${r.stateful}・包むだけ ${r.wrappers}）`)
if (r.problems.length) {
    console.log("★NG:")
    for (const p of r.problems) console.log("   ", p)
    process.exit(1)
}
console.log("BEKKI_INSPECTOR_PREFILL_OK")
