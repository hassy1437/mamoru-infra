// 「次に進む方法が分かりにくい」所を直したのが保たれているか（2026-10-21）。
//
// ■ なぜ要るか（どれも PDF の検査・画像の照合では出ない）
//   ・ホームの主なボタンが iPhone の最初の画面に入らず、名前も「物件基本情報の入力」（実際は一覧）・「消防設備点検スタート」だった
//   ・物件を登録すると一覧に戻り、物件の画面では「点検を始める」が 2 画面目にあった。一覧のカードは赤い「削除」がいちばん目立っていた
//   ・最近の点検・報告書一覧・点検履歴は総括表の確認画面へ飛ぶだけで、どこまで進んだかも分からなかった
//   ・点検者一覧表の入力画面は、もう作ってあっても毎回まっさらの欄を出し、保存すると 2 つ目ができた
//   ・保存ボタンの名前（「点検結果を保存する」「保存してプレビューへ」）が、押したあとに着く画面と違った
//   ・点検票の一覧（別記ハブ）に見出しが無く、同じ画面を「別記ハブ」「点検者」「別記」と 3 つの名前で呼んでいた
//   ・点検票は開くだけで初期値つきで保存されるので、開いて閉じただけで ✓（完了）になり、主のボタンが飛ばしていた
//   ・いつ確定するかが分からなかった（上の 1〜5 に確定が無い）。確定しても何も知らせず、納品のあとの次の一歩
//     （マッチングサイトで結果を報告する）へのリンクも無かった
//
// 使い方: node scripts/check-next-step-clarity.mjs [--self-test]
import fs from "fs"
import path from "path"
import { pathToFileURL } from "url"
import ts from "typescript"

const ROOT = process.cwd()
const SELF_TEST = process.argv.includes("--self-test")
const OUT = path.join(ROOT, "tmp", SELF_TEST ? "next-step-selftest" : "next-step")
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8")
const F = {
    tool: "src/app/tool/page.tsx", resume: "src/lib/report-resume.ts", resumeList: "src/components/resume-reports.tsx",
    propForm: "src/components/property-form.tsx", propPage: "src/app/properties/[id]/page.tsx", propEdit: "src/app/properties/[id]/edit/page.tsx",
    propButtons: "src/components/property-action-buttons.tsx", start: "src/app/inspection/page.tsx",
    sForm: "src/components/soukatsu-form.tsx", confirm: "src/app/inspection/[id]/page.tsx",
    itiranPage: "src/app/inspection/[id]/itiran/page.tsx", itiranForm: "src/components/itiran-form.tsx",
    hub: "src/app/inspection/[id]/itiran/[itiranId]/page.tsx", progress: "src/lib/inspection-progress.ts", nav: "src/components/itiran-form-nav.tsx",
    output: "src/app/inspection/[id]/itiran/[itiranId]/output/page.tsx", finalize: "src/components/finalize-soukatsu-button.tsx",
    deliver: "src/components/deliver-report-button.tsx", finalization: "src/lib/finalization.ts", steps: "src/lib/inspection-steps.ts",
    reports: "src/app/reports/page.tsx", reportList: "src/components/report-list.tsx",
}

// ── src/lib の行き先を実際に動かす
fs.mkdirSync(OUT, { recursive: true })
async function loadResume(src) {
    const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
    const p = path.join(OUT, `report-resume.${Date.now()}${Math.random().toString(36).slice(2, 6)}.mjs`)
    fs.writeFileSync(p, js, "utf8")
    return import(pathToFileURL(p).href)
}
async function behaviour(files) {
    const problems = []
    const m = await loadResume(files[F.resume])
    const a = m.resumeTarget("s1", null), b = m.resumeTarget("s1", "i1")
    if (a.href !== "/inspection/s1/itiran") problems.push(`${F.resume}: 点検者一覧表が無い報告書の続きが点検者一覧表の入力でない（${a.href}）`)
    if (b.href !== "/inspection/s1/itiran/i1") problems.push(`${F.resume}: 点検者一覧表がある報告書の続きが点検票の一覧でない（${b.href}）`)
    return problems
}

function wiring(files) {
    const problems = []
    const has = (f, re, msg) => { if (!re.test(files[f])) problems.push(`${f}: ${msg}`) }
    // ★「無いこと」はコメントを落としてから見る（直した理由のコメントに以前の言葉が書いてある）
    const code = (f) => files[f].replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
    const hasNot = (f, re, msg) => { if (re.test(code(f))) problems.push(`${f}: ${msg}`) }
    const order = (f, list, msg) => {
        const at = list.map((s) => files[f].indexOf(s))
        if (at.some((i) => i < 0) || at.some((i, k) => k > 0 && i < at[k - 1])) problems.push(`${f}: ${msg}`)
    }
    // ホーム
    order(F.tool, ["① 物件を登録する", "② 点検を始める", "<ResumeReports />", "{/* Summary Cards */}"], "はじめに押すボタン（① 物件を登録する・② 点検を始める）と「続きから」が件数より上に無い")
    hasNot(F.tool, /物件基本情報の入力|消防設備点検スタート/, "ホームのボタンの名前が以前のまま（何をする所か分からない）")
    // 物件
    has(F.propForm, /router\.push\(savedId \? `\/properties\/\$\{savedId\}` : "\/properties"\)/, "物件を保存したあと、その物件の画面へ行かない（一覧に戻る）")
    has(F.propForm, /\.insert\(\{ \.\.\.payload, user_id: user\?\.id \}\)\s*\.select\("id"\)\s*\.single\(\)/, "新しく登録した物件の id を受け取っていない")
    order(F.propPage, ["新しい点検を始める", "{/* 物件情報 */}"], "物件の画面で「新しい点検を始める」が物件情報より下にある（iPhone で 2 画面目）")
    has(F.propPage, /href=\{resumeTarget\(inspection\.id as string, itiranIds\.get\(inspection\.id as string\)\)\.href\}/, "点検履歴が止まった所へ行かない")
    has(F.propEdit, /href=\{`\/properties\/\$\{id\}`\}[^>]*>\s*← 物件に戻る/, "物件の編集から物件へ戻れない（一覧に戻る）")
    order(F.propButtons, ["点検開始", "編集", "複製"], "物件のカードで「点検開始」がいちばん上でない")
    hasNot(F.propButtons, /bg-red-600/, "物件のカードの「削除」がいちばん目立つ赤のまま")
    // 点検を始める・報告書一覧
    has(F.start, /<ResumeReports limit=\{3\} \/>/, "点検を始める画面に作りかけの報告書の続きが無い（同じ物件の報告書を 2 つ作る）")
    hasNot(F.start, /消防設備点検スタート|ツール選択に戻る/, "点検を始める画面の名前・戻るが以前のまま")
    has(F.reportList, /href=\{resumeTarget\(r\.id, r\.itiran_id\)\.href\}/, "報告書一覧が止まった所へ行かない")
    hasNot(F.reports, /ツール選択に戻る|label: "ツール"/, "報告書一覧の戻る・パンくずに「ツール」（ホームと同じ画面）が残っている")
    has(F.resumeList, /resumeTarget\(r\.id, itiranIds\.get\(r\.id\)\)/, "「続きから」が止まった所へ行かない")
    // 総括表・点検者一覧表
    has(F.sForm, /"総括表を保存して次へ"/, "総括表の保存ボタンが「総括表を保存して次へ」でない")
    hasNot(F.sForm, /点検結果を保存する/, "総括表の保存ボタンが「点検結果を保存する」のまま")
    has(F.itiranPage, /const existing = await pickMainItiranId\(supabase, id\)\s*if \(existing\) redirect\(`\/inspection\/\$\{id\}\/itiran\/\$\{existing\}`\)/, "点検者一覧表がもうあるのに、まっさらの入力欄を出す（保存すると 2 つ目ができる）")
    has(F.itiranForm, /"保存して点検票の入力へ"/, "点検者一覧表の保存ボタンが着く画面（点検票の入力）の名前でない")
    hasNot(F.itiranForm, /保存してプレビューへ/, "点検者一覧表の保存ボタンが「保存してプレビューへ」のまま（実際はプレビューへ行かない）")
    has(F.confirm, /const nextItiranId = await pickMainItiranId\(supabase, id\)/, "総括表の確認画面と点検者一覧表の入力画面で、本命の点検者一覧表の選び方が別々")
    has(F.confirm, /確定はいつでも、ここか最後の「結果出力」の画面で行えます。/, "総括表の確認画面に、いつ確定するかの案内が無い")
    has(F.confirm, /report\.property_id \? "物件に戻る" : "物件選択に戻る"/, "総括表の確認画面から物件へ戻れない")
    hasNot(F.confirm, /次へ: 点検者一覧表を確認/, "総括表の確認画面の「次へ」が着く画面（点検票の入力）の名前でない")
    // 点検票の一覧・点検票
    has(F.hub, /<h1 className="mt-4 text-2xl font-bold text-slate-900">点検票（別記様式）の入力<\/h1>/, "点検票の一覧に見出しが無い")
    has(F.hub, /progressSteps\.find\(\(s\) => !s\.ready \|\| s\.unconfirmed \|\| s\.defaulted\)/, "判定が初期値のままの点検票を、主のボタンが飛ばす")
    has(F.hub, />\s*初期値のまま\s*</, "点検票の一覧で、判定が初期値のままの様式を見分けられない")
    has(F.progress, /\.select\("id, defaulted:payload->judgments_defaulted"\)/, "点検票の進み具合が判定の初期値の印を読んでいない")
    has(F.progress, /filter\(\(s\) => s\.ready && !s\.defaulted && !s\.unconfirmed\)\.length/, "開いただけの点検票を「完了」に数える")
    for (const f of [F.hub, F.nav, F.output]) hasNot(f, /別記ハブに戻る|label: "別記入力"|label: "別記", href/, "同じ画面を「別記ハブ」「別記入力」「別記」と呼んでいる")
    has(F.steps, /\{ label: "点検票" \},\s*\{ label: "出力・確定" \}/, "上の 1〜5 の名前が画面の名前とそろっていない（確定がどこか分からない）")
    // 結果出力・確定・納品
    has(F.output, /(←|&larr;) 点検票の一覧に戻る/, "結果出力の画面から点検票の一覧へ戻るリンクが無い")
    has(F.finalize, /toast\.success\("確定しました。PDF の出力と納品ができるようになりました"\)/, "確定しても何も知らせない")
    has(F.finalize, /notContracted && \([\s\S]*?MATCHING_VENDOR_HOME_URL/, "業者登録の承認が要る案内に、マッチングサイトへのリンクが無い")
    has(F.deliver, /phase === "done" && \([\s\S]*?MATCHING_VENDOR_HOME_URL/, "納品のあと、次の一歩（マッチングサイトで結果を報告する）へのリンクが無い")
    hasNot(F.finalization, /下の「プレビュー」/, "PDF の案内が「下の『プレビュー』」のまま（結果出力の画面では下にプレビューが無い）")
    return problems
}

const files = Object.fromEntries(Object.values(F).map((f) => [f, read(f)]))

if (SELF_TEST) {
    const neg = [...await behaviour(files), ...wiring(files)]
    if (neg.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of neg) console.log("   ", p)
        process.exit(1)
    }
    const mut = (f, from, to) => {
        const next = files[f].replace(from, to)
        if (next === files[f]) { console.log(`自己診断: 書き換えられない: ${f} ${String(from).slice(0, 50)}`); process.exit(1) }
        return { ...files, [f]: next }
    }
    const cases = [
        ["ホームのボタンを件数の下に戻す", mut(F.tool, "<ResumeReports />", "{/* Summary Cards */}<ResumeReports />"), "続きから"],
        ["物件の保存のあと一覧に戻す", mut(F.propForm, 'router.push(savedId ? `/properties/${savedId}` : "/properties")', 'router.push("/properties")'), "その物件の画面へ行かない"],
        ["点検者一覧表の入力画面の行き先を外す", mut(F.itiranPage, "if (existing) redirect(", "if (false) redirect("), "2 つ目ができる"],
        ["保存ボタンを「保存してプレビューへ」に戻す", mut(F.itiranForm, '"保存して点検票の入力へ"', '"保存してプレビューへ"'), "プレビューへ"],
        ["初期値のままを主のボタンが飛ばす", mut(F.hub, " || s.defaulted)", ")"), "飛ばす"],
        ["開いただけを完了に数える", mut(F.progress, "s.ready && !s.defaulted && !s.unconfirmed", "s.ready"), "完了"],
        ["戻るを「別記ハブ」に戻す", mut(F.nav, "&larr; 点検票の一覧に戻る", "&larr; 別記ハブに戻る"), "と呼んでいる"],
        ["確定の知らせを外す", mut(F.finalize, 'toast.success("確定しました。PDF の出力と納品ができるようになりました")', ""), "何も知らせない"],
        ["報告書一覧を総括表の確認画面へ戻す", mut(F.reportList, "href={resumeTarget(r.id, r.itiran_id).href}", "href={`/inspection/${r.id}`}"), "止まった所"],
    ]
    for (const [label, m, expect] of cases) {
        if (!wiring(m).some((x) => x.includes(expect))) { console.log(`自己診断: ${label} → 検出できない`); process.exit(1) }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    const bm = mut(F.resume, "href: `/inspection/${soukatsuId}/itiran/${itiranId}`", "href: `/inspection/${soukatsuId}`")
    if (!(await behaviour(bm)).some((x) => x.includes("点検票の一覧でない"))) { console.log("自己診断: 続きの行き先を総括表の確認画面に戻す → 検出できない"); process.exit(1) }
    console.log("  陽性対照: 続きの行き先を総括表の確認画面に戻す → 検出")
    console.log("  陰性対照: ホーム・物件・点検を始める・報告書一覧・総括表・点検者一覧表・点検票の一覧・結果出力・確定・納品")
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const problems = [...await behaviour(files), ...wiring(files)]
console.log("次に進む方法の分かりにくい所を検査: ホーム・物件・続きから・保存ボタンの名前・点検票の一覧・確定・納品")
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("NEXT_STEP_CLARITY_OK")
