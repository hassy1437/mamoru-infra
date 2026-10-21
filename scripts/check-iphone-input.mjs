// iPhone での入力のしやすさ（2026-10-20 の iPhone 点検で直した所）が保たれているか。
//
// ■ なぜ要るか
//   iPhone 幅で点検アプリの全 40 画面を測ると、次のことが分かった（PDF の検査では一切出ない種類）:
//     1. 入力欄 約 4,250 個のうち 16px 以上は 33 個だけ → iPhone の Safari は押すたびに画面を拡大する
//     2. 数字の欄（その5 の値・V/A/MPa など 100 余り）と電話番号で、数字・電話のキーボードが出ない
//     3. その5 の仕様を容器ごとに打ち直す・第1 の種別（A〜F）を約 35 行それぞれタップ
//     4. 点検票が最長 47 画面ぶんあり、保存・プレビューが一番下にしか無い
//     5. 判定がプルダウン（開く・選ぶ・閉じるの 3 操作）で約 1,370 か所
//     6. 点検写真のカードの見出しが 1 文字ずつ縦に折れる
//     7. パンくず・「← 戻る」が 24px 未満
//     8. 第2〜8 は 5 秒の自動保存が無く、どの様式も別のアプリに切り替える瞬間に保存しない／型式・番号の欄で自動の大文字・修正
//
// ■ 検査すること（配線。どれも見た目では気づきにくく、1 か所戻すと黙って元に戻る）
//   上の 1〜8 がそれぞれの部品・23 様式の画面に入っていること
//
// 使い方: node scripts/check-iphone-input.mjs [--self-test]
import fs from "fs"
import path from "path"

const ROOT = process.cwd()
const SELF_TEST = process.argv.includes("--self-test")
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8")
const FORMS = ["bekki-result-form-base", "shokaki-bekki1-form", "shokasen-bekki2-form", "sprinkler-bekki3-form", "water-spray-bekki4-form",
    "foam-bekki5-form", "inert-gas-bekki6-form", "halogen-bekki7-form", "powder-bekki8-form"].map((n) => `src/components/${n}.tsx`)
const CYLINDER_FORMS = ["inert-gas-bekki6-form", "halogen-bekki7-form", "powder-bekki8-form"].map((n) => `src/components/${n}.tsx`)
const CSS = "src/app/globals.css"
const JUDGE = "src/components/judgment-buttons.tsx"
const BAR = "src/components/form-action-bar.tsx"
const AUTO = "src/hooks/use-auto-save.ts"
const CAMERA = "src/components/camera-input.tsx"
const CRUMB = "src/components/breadcrumb.tsx"
const NAV = "src/components/itiran-form-nav.tsx"
const MEASURE = "src/components/measure-header-inputs.tsx"
const ITIRAN = "src/components/itiran-form.tsx"
const DEVICE = "src/components/device-table-inputs.tsx"
const LICENSE = "src/components/license-editor.tsx"
const SHOKAKI = "src/components/shokaki-bekki1-form.tsx"
const SOUKATSU = "src/components/soukatsu-form.tsx"
const CHOICE = "src/components/bekki-choice-checkboxes.tsx"
const NUMERIC_PLACEHOLDERS = ["吐出量(L/min)", "吐出圧力(MPa)", "電流(A)", "電圧(V)", "設定圧力(MPa)", "作動圧力(MPa)", "長さ(m)", "長さ", "口径(mm)", "口径",
    "空質量", "全質量", "ガス質量", "本数", "番号", "例: 67.2", "例: 14.7"]
const FORM_PAGES = fs.readdirSync(path.join(ROOT, "src/app/inspection/[id]/itiran/[itiranId]"), { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(ROOT, "src/app/inspection/[id]/itiran/[itiranId]", d.name, "page.tsx")))
    .map((d) => `src/app/inspection/[id]/itiran/[itiranId]/${d.name}/page.tsx`)
const ALL = [...new Set([...FORMS, CSS, JUDGE, BAR, AUTO, CAMERA, CRUMB, NAV, MEASURE, ITIRAN, DEVICE, LICENSE, SOUKATSU, CHOICE, ...FORM_PAGES])]

/** <Input ... /> を 1 つずつ（属性に => があるので正規表現の [^>] では切れない） */
const inputsOf = (src) => {
    const out = []
    let i = 0
    for (;;) {
        const a = src.indexOf("<Input", i)
        if (a < 0) return out
        const b = src.indexOf("/>", a)
        out.push(src.slice(a, b + 2))
        i = b + 2
    }
}

function check(files) {
    const problems = []
    // 1. 16px（タッチ端末・レイヤーの外）
    const css = files[CSS]
    const rule = css.match(/@media \(pointer: coarse\) \{\s*input:not\(\[type="checkbox"\]\)[^{]*select,\s*textarea \{\s*font-size: 16px;/)
    if (!rule) problems.push(`${CSS}: タッチ端末で入力欄を 16px にしていない（iPhone が押すたびに拡大する）`)
    else if (/@layer[^{]*\{[^}]*@media \(pointer: coarse\)/.test(css)) problems.push(`${CSS}: 16px の指定がレイヤーの中にある（text-sm などのユーティリティに負ける）`)
    // 2. キーボード
    for (const [f, src] of Object.entries(files)) {
        if (!f.endsWith(".tsx")) continue
        for (const el of inputsOf(src)) {
            const ph = el.match(/placeholder="([^"]*)"/)?.[1]
            if (ph && NUMERIC_PLACEHOLDERS.includes(ph) && !/inputMode="(decimal|numeric)"/.test(el)) problems.push(`${f}: 数字の欄「${ph}」で数字のキーボードが出ない`)
            if (/value=\{inspectorTel\}/.test(el) && !/type="tel"/.test(el)) problems.push(`${f}: 点検者の TEL で電話のキーボードが出ない`)
        }
    }
    if (!/placeholder="電話番号を入力"\n\s*type="tel"/.test(files[ITIRAN])) problems.push(`${ITIRAN}: 点検者一覧表の電話番号で電話のキーボードが出ない`)
    if (!/type="date"\n\s*value=\{toDateInputValue\(h\.date\)\}/.test(files[MEASURE])) problems.push(`${MEASURE}: 測定ごとの点検年月日が日付を選ぶ欄でない（「/」まで打つ）`)
    // 3. 繰り返し
    for (const f of CYLINDER_FORMS) {
        const src = files[f]
        if (!/const copySpecFromPrevious = /.test(src) || !/onClick=\{\(\) => copySpecFromPrevious\(idx\)\}/.test(src)) problems.push(`${f}: その5 に「前の容器と同じ仕様」が無い`)
        if (!/\{\/\* 測定 1-[46][^*]*2 列に並べる[^*]*\*\/\}\n\s*<div className="grid grid-cols-2 gap-x-2 gap-y-3">/.test(src)) problems.push(`${f}: その5 の測定の値を 2 列に並べていない（縦に長い）`)
    }
    if (!/const applyBulkMarks = /.test(files[SHOKAKI]) || !/onClick=\{applyBulkMarks\}/.test(files[SHOKAKI])) problems.push(`${SHOKAKI}: 種別（A〜F）をまとめて付けられない`)
    // 4・5・8. 帯・判定のボタン・自動保存（23 様式の 9 部品）
    for (const f of FORMS) {
        const src = files[f]
        if (!/<FormActionBar onSave=\{handleSave\} onPreview=\{handlePreview\}[^\n]*error=\{error\} \/>/.test(src)) problems.push(`${f}: 画面下の帯（保存・プレビュー・表へ移動）が無い`)
        if (!/<div className="space-y-6" data-form-action-root>/.test(src)) problems.push(`${f}: 帯の「表へ移動」が表の見出しを探す範囲（data-form-action-root）が無い`)
        if (/<select\n\s*className="w-full h-9 border border-input rounded-md bg-background px-2 text-sm"\n\s*value=\{[^\n]*\}\n\s*onChange=\{\(e\) => [^\n]*"judgment"/.test(src)) problems.push(`${f}: スマホの判定がプルダウンのまま`)
        if (!/<JudgmentButtons\n/.test(src)) problems.push(`${f}: スマホの判定のボタンが無い`)
        if (!/useAutoSave\(payload, \(\) => persistDraftRef\.current\(false\), /.test(src)) problems.push(`${f}: 自動保存（5 秒後・別のアプリに切り替えた瞬間）が無い`)
        for (const h of ["handleSave", "handlePreview", "handleDownload"]) {
            if (!src.includes(`<Button type="button" onClick={${h}} disabled={busy} className="min-h-11 md:min-h-0 `)) problems.push(`${f}: 一番下のボタン（${h}）がスマホで 44px 未満`)
        }
    }
    const judge = files[JUDGE]
    if (!/onClick=\{\(\) => onChange\(pressed \? "" : o\.v\)\}/.test(judge) || !/v: "良"/.test(judge) || !/v: "否"/.test(judge)) problems.push(`${JUDGE}: 良・否のボタンの値が今までと違う（"" / 良 / 否）`)
    if (!/className=\{`h-11 /.test(judge)) problems.push(`${JUDGE}: 判定のボタンが 44px 未満`)
    const auto = files[AUTO]
    if (!/addEventListener\("visibilitychange", onVisibility\)/.test(auto) || !/addEventListener\("pagehide", flush\)/.test(auto)) problems.push(`${AUTO}: 別のアプリに切り替えた瞬間に保存しない`)
    if (!/document\.visibilityState === "hidden"/.test(auto)) problems.push(`${AUTO}: 画面に戻ったときにも保存してしまう（隠れたときだけ）`)
    const bar = files[BAR]
    if (!/className="fixed inset-x-0 bottom-0 [^"]*md:hidden"/.test(bar)) problems.push(`${BAR}: 帯が画面下に固定されていない（またはパソコンにも出る）`)
    // ★帯の高さぶんの余白は、ページのいちばん下の「次へ」（ItiranFormNavBottom）が取る（2026-10-20・録音 102）
    if (!/export function ItiranFormNavBottom[\s\S]*?className="[^"]*\bpb-24\b[^"]*md:pb-0/.test(files[NAV])) problems.push(`${NAV}: いちばん下の「次へ」が帯の高さぶんの余白を取っていない（最後の欄・次へが帯に隠れる）`)
    for (const [f, src] of Object.entries(files)) {
        if (!f.startsWith("src/app/inspection/")) continue
        if (/<ItiranFormNav\n/.test(src) && !/<ItiranFormNavBottom\n/.test(src)) problems.push(`${f}: いちばん下に「次へ」が無い（上にしか無い・帯の余白も無い）`)
    }
    // 6・7
    if (!/<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">\n\s*<h3/.test(files[CAMERA])) problems.push(`${CAMERA}: 点検写真の見出しとボタンがスマホでも横並び（見出しが縦に折れる）`)
    if ((files[CRUMB].match(/min-h-11 md:min-h-0/g) ?? []).length < 2) problems.push(`${CRUMB}: パンくずが 44px 未満`)
    // ★上と下の 2 か所（下は 2026-10-20 から）。どちらも 44px
    const backLinks = [...files[NAV].matchAll(/<Link href=\{hubHref\} className="([^"]*)"/g)].map((m) => m[1])
    if (backLinks.length < 2 || backLinks.some((c) => !/\bmin-h-11\b/.test(c))) problems.push(`${NAV}: 「← 点検票の一覧に戻る」が 44px 未満（上・下）`)
    if (!/className=\{`inline-flex min-h-11 md:min-h-0 items-center gap-1 px-3 py-1\.5 text-xs font-medium rounded-full/.test(files[SOUKATSU])) problems.push(`${SOUKATSU}: 総括表の「指摘なし・要改善」がスマホで 44px 未満`)
    if (!/<label key=\{opt\.value\} className="inline-flex min-h-11 md:min-h-8 /.test(files[CHOICE])) problems.push(`${CHOICE}: 選ぶ欄（専用・兼用など）がスマホで 44px 未満`)
    // 8. 英数字の欄
    for (const [f, re, label] of [[DEVICE, /<Input \{\.\.\.CODE_INPUT_PROPS\} placeholder="型式"/g, "測定機器の型式"], [LICENSE, /<Input \{\.\.\.CODE_INPUT_PROPS\}[^\n]*placeholder="交付番号"/g, "交付番号"]]) {
        if ((files[f].match(re) ?? []).length < 2) problems.push(`${f}: ${label}の欄で自動の大文字・修正を切っていない`)
    }
    for (const f of CYLINDER_FORMS) if (!/<Input\s+\{\.\.\.CODE_INPUT_PROPS\}[^/]{0,400}placeholder="容器番号"/.test(files[f])) problems.push(`${f}: 容器番号の欄で自動の大文字・修正を切っていない`)
    return problems
}

const files = Object.fromEntries(ALL.map((f) => [f, read(f)]))

if (SELF_TEST) {
    const neg = check(files)
    if (neg.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of neg) console.log("   ", p)
        process.exit(1)
    }
    const mut = (f, from, to) => {
        const next = files[f].replace(from, to)
        if (next === files[f]) { console.log(`自己診断: 書き換えられない: ${f} ${String(from).slice(0, 40)}`); process.exit(1) }
        return { ...files, [f]: next }
    }
    const base = FORMS[0], inert = CYLINDER_FORMS[0]
    const mutants = [
        ["16px をやめる", mut(CSS, "font-size: 16px;", "font-size: 14px;"), "16px にしていない"],
        ["16px をレイヤーの中へ", mut(CSS, "@media (pointer: coarse) {", "@layer base { @media (pointer: coarse) {"), "レイヤーの中"],
        ["その5 の値の数字キーボードを外す", mut(inert, 'placeholder="例: 67.2" inputMode="decimal"', 'placeholder="例: 67.2"'), "数字のキーボードが出ない"],
        ["点検者の TEL を文字の欄に戻す", mut(base, '<Input type="tel" autoComplete="tel" value={inspectorTel}', "<Input value={inspectorTel}"), "電話のキーボード"],
        ["測定の日付を文字の欄に戻す", mut(MEASURE, 'type="date"\n', ""), "日付を選ぶ欄でない"],
        ["前の容器と同じ仕様を外す", mut(inert, "onClick={() => copySpecFromPrevious(idx)}", "onClick={() => {}}"), "前の容器と同じ仕様"],
        ["種別のまとめ付けを外す", mut(SHOKAKI, "onClick={applyBulkMarks}", "onClick={() => {}}"), "まとめて付けられない"],
        ["帯を外す", mut(base, "<FormActionBar onSave", "<div data-x onSave"), "画面下の帯"],
        ["判定をプルダウンに戻す", mut(base, "<JudgmentButtons\n", "<JudgmentButtonsX\n"), "判定のボタンが無い"],
        ["判定の未入力に戻せない", mut(JUDGE, 'onChange(pressed ? "" : o.v)', "onChange(o.v)"), "値が今までと違う"],
        ["第3 の自動保存を外す", mut(FORMS[3], "useAutoSave(payload, () => persistDraftRef.current(false), ", "void (payload, () => persistDraftRef.current(false), "), "自動保存"],
        ["切り替えた瞬間の保存を外す", mut(AUTO, 'window.addEventListener("pagehide", flush)', ""), "切り替えた瞬間"],
        ["帯の余白を外す", mut(NAV, "pb-24 sm:flex-row", "sm:flex-row"), "余白を取っていない"],
        ["第6 の下の「次へ」を外す", mut(FORM_PAGES.find((f) => f.includes("/inert-gas/")), "<ItiranFormNavBottom\n", "<ItiranFormNavBottomX\n"), "いちばん下に「次へ」が無い"],
        ["写真の見出しを横並びに戻す", mut(CAMERA, '<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">', '<div className="flex items-center justify-between">'), "縦に折れる"],
        ["戻るリンクを小さく戻す", mut(NAV, 'className="inline-flex min-h-11 items-center text-blue-600', 'className="text-blue-600'), "点検票の一覧に戻る"],
        ["一番下の保存ボタンを小さく戻す", mut(FORMS[5], '<Button type="button" onClick={handleSave} disabled={busy} className="min-h-11 md:min-h-0 ', '<Button type="button" onClick={handleSave} disabled={busy} className="'), "一番下のボタン（handleSave）"],
        ["総括表の指摘なし・要改善を小さく戻す", mut(SOUKATSU, "inline-flex min-h-11 md:min-h-0 items-center gap-1 px-3", "inline-flex items-center gap-1 px-3"), "指摘なし・要改善"],
        ["型式の自動修正を戻す", mut(DEVICE, '<Input {...CODE_INPUT_PROPS} placeholder="型式"', '<Input placeholder="型式"'), "測定機器の型式"],
    ]
    for (const [label, m, expect] of mutants) {
        if (!check(m).some((x) => x.includes(expect))) { console.log(`自己診断: ${label} → 検出できない`); process.exit(1) }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    console.log("  陰性対照: 16px・キーボード・繰り返し・帯・判定のボタン・自動保存・写真・タップの大きさ・英数字の欄")
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const problems = check(files)
console.log("iPhone での入力のしやすさを検査: 16px・キーボード・繰り返し・帯・判定・自動保存・写真・タップ・英数字")
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("IPHONE_INPUT_OK")
