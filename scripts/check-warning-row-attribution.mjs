// PDF 出力の警告（選択肢の不一致・縮小・5pt 未満）が、実際に起きた行を指すか（2026-10-20・本番の通しチェック）。
//
// ■ なぜ要るか
//   これらの警告は値の文字列一致で欄を当てていた（FitCollector.resolve）。
//   「40個」「専用」「部品を交換予定」のように同じ値が何行にも並ぶ様式では、
//   「同じ値を持つ最初の行」を指し、業者は別の行を直しに行く。
//   本番の通しで、不活性ガスの 5pt 未満と鳴動方式の選択肢の警告が別の行を指した。
//   切り詰め（エラー）は描画位置で帰属させてあったが、警告の 3 種類は値のままだった。
//   ★PDF は正しく出るので、画像の検査やベースラインでは原理的に出ない種類。
//
// ■ 検査すること
//   1. src/lib/pdf-fit-report.ts を実際に動かす:
//      同じ値が前の行にもあるとき、警告が「描いた行」を指す（選択肢・縮小・5pt 未満）／
//      同じ値が 2 行で起きたら 1 件に畳み「ほか1か所」と書く／見出しの欄（行でない）は欄名で当てる／
//      位置の無い経路は従来どおり値で当てる／その欄の値でないもの（システムの整形値）は出さない
//   2. 配線: 各様式のルートが縮小・5pt 未満の報告と選択肢の○に描画位置を渡している
//
// 使い方: node scripts/check-warning-row-attribution.mjs [--self-test]
import fs from "fs"
import path from "path"
import { pathToFileURL } from "url"
import ts from "typescript"

const ROOT = process.cwd()
const SELF_TEST = process.argv.includes("--self-test")
// ★自己診断と本番で出力先を分ける（check-pdf-all は並列に走らせる）
const OUT = path.join(ROOT, "tmp", SELF_TEST ? "warning-row-attribution-selftest" : "warning-row-attribution")
const LIB = "src/lib/pdf-fit-report.ts"
const LABELS = "src/lib/bekki-row-labels.ts"
const HELPERS = "src/lib/pdf-form-helpers.ts"
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8")

const js = (src) => ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText

async function load(libSrc) {
    const dir = path.join(OUT, `${Date.now()}${Math.random().toString(36).slice(2, 6)}`)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, "bekki-row-labels.mjs"), js(read(LABELS)), "utf8")
    fs.writeFileSync(path.join(dir, "pdf-fit-report.mjs"), js(libSrc).replace(/from "\.\/bekki-row-labels"/, 'from "./bekki-row-labels.mjs"'), "utf8")
    return import(pathToFileURL(path.join(dir, "pdf-fit-report.mjs")).href)
}

const FORM = "bekki6"
const rows = (n, fill) => Array.from({ length: n }, (_, i) => ({ content: "40個", judgment: "良", bad_content: "", action_content: "", ...(fill[i] ?? {}) }))

function behaviour(mod) {
    const problems = []
    const where = (row) => mod.rowLabelOf(FORM, "page1_rows", row) ?? `${row + 1}行目`

    // 1) 選択肢: 1 行目にも同じ値がある。○を描いたのは 24 行目
    {
        const c = mod.createFitCollector()
        c.reportChoiceMismatch("40個", ["一斉", "区分"], { rowsKey: "page1_rows", row: 23, column: "content" })
        c.resolve({ page1_rows: rows(30, {}) })
        const items = mod.buildChoiceWarning(FORM, c)
        if (items.length !== 1 || !items[0].label.includes(where(23))) problems.push(`選択肢の警告が 24 行目を指さない: ${JSON.stringify(items.map((i) => i.label))}`)
    }
    // 2) 5pt 未満: 3 行目と 13 行目に同じ不良内容。小さく描いたのは 13 行目だけ
    const LONG = "不活性ガス消火設備の一部に損傷あり"
    {
        const c = mod.createFitCollector()
        c.reportSmall(LONG, 4.6, { rowsKey: "page1_rows", row: 12, column: "bad_content" })
        c.resolve({ page1_rows: rows(20, { 2: { bad_content: LONG }, 12: { bad_content: LONG } }) })
        const items = mod.buildBelowMinWarning(FORM, c)
        if (items.length !== 1 || !items[0].label.includes(where(12))) problems.push(`5pt 未満の警告が 13 行目を指さない: ${JSON.stringify(items.map((i) => i.label))}`)
        if (items.some((i) => i.label.includes("ほか"))) problems.push(`1 か所なのに「ほか」が付いた: ${items[0].label}`)
    }
    // 3) 縮小: 2 行目と 6 行目に同じ値。縮んだのは 6 行目
    {
        const c = mod.createFitCollector()
        c.reportShrink("再調整し次回点検で確認（長い措置内容）", 7, 3.5, { rowsKey: "page1_rows", row: 5, column: "action_content" })
        c.resolve({ page1_rows: rows(10, { 1: { action_content: "再調整し次回点検で確認（長い措置内容）" }, 5: { action_content: "再調整し次回点検で確認（長い措置内容）" } }) })
        const w = mod.buildShrinkWarning(FORM, c)
        if (w?.items.length !== 1 || !w.items[0].label.includes(where(5))) problems.push(`縮小の警告が 6 行目を指さない: ${JSON.stringify(w?.items.map((i) => i.label))}`)
    }
    // 4) 同じ値が 2 行で 5pt 未満 → 1 件に畳み、最初の行＋「ほか1か所」（2 件目を黙って消さない）
    {
        const c = mod.createFitCollector()
        c.reportSmall(LONG, 4.6, { rowsKey: "page1_rows", row: 4, column: "bad_content" })
        c.reportSmall(LONG, 4.6, { rowsKey: "page1_rows", row: 12, column: "bad_content" })
        c.resolve({ page1_rows: rows(20, { 4: { bad_content: LONG }, 12: { bad_content: LONG } }) })
        const items = mod.buildBelowMinWarning(FORM, c)
        if (items.length !== 1 || !items[0].label.includes(where(4)) || !items[0].label.includes("ほか1か所")) problems.push(`2 行の 5pt 未満が「5 行目・ほか1か所」にならない: ${JSON.stringify(items.map((i) => i.label))}`)
    }
    // 5) 見出しの選択肢（行ではない）は欄名で当てる。同じ値の行があってもそちらを指さない
    {
        const c = mod.createFitCollector()
        c.reportChoiceMismatch("点検", ["機器", "総合"], { column: "inspection_type" })
        c.resolve({ inspection_type: "点検", page1_rows: rows(5, { 0: { content: "点検" } }) })
        const items = mod.buildChoiceWarning(FORM, c)
        if (items.length !== 1 || items[0].field !== "inspection_type" || /行目/.test(items[0].label)) problems.push(`見出しの選択肢が欄名で当たらない: ${JSON.stringify(items)}`)
    }
    // 6) 位置の無い経路は従来どおり値で当てる（古い呼び出しを壊さない）
    {
        const c = mod.createFitCollector()
        c.reportSmall("株式会社テスト防災サービス", 4.2)
        c.resolve({ inspector_company: "株式会社テスト防災サービス" })
        const items = mod.buildBelowMinWarning(FORM, c)
        if (items.length !== 1 || items[0].field !== "inspector_company") problems.push(`位置の無い 5pt 未満が値で当たらない: ${JSON.stringify(items)}`)
    }
    // 7) その欄の値でない（システムの整形値）→ 業者には出さない。別の行に同じ値があっても拾わない
    {
        const c = mod.createFitCollector()
        c.reportSmall("2026年10月20日", 4.4, { rowsKey: "page1_rows", row: 3, column: "content" })
        c.resolve({ page1_rows: rows(6, { 0: { content: "2026年10月20日" } }) })
        if (mod.buildBelowMinWarning(FORM, c).length) problems.push("その欄の値でないものが警告に出た（別の行の同じ値を拾った）")
    }
    // 8) 総括表の設備の行（2026-10-22）。payload のキーは equipment_results（_rows で終わらない）で、
    //    行に決まった見出しが無い。描いた側が渡す設備名（rowLabel）で行を示す。2 行目にも同じ値がある
    {
        const c = mod.createFitCollector()
        c.reportSmall(LONG, 4.3, { rowsKey: "equipment_results", row: 3, column: "bad_detail", rowLabel: "誘導灯" })
        c.resolve({ equipment_results: [
            { name: "消火器", result: "指摘なし" },
            { name: "自動火災報知設備", result: "要改善", bad_detail: LONG },
            { name: "屋内消火栓設備", result: "指摘なし" },
            { name: "誘導灯", result: "要改善", bad_detail: LONG },
        ] })
        const items = mod.buildBelowMinWarning("総括表", c)
        if (items.length !== 1 || items[0].label !== "不良内容（「誘導灯」の行）") problems.push(`総括表の設備の行の警告が「誘導灯」の行を指さない: ${JSON.stringify(items.map((i) => i.label))}`)
    }
    return problems
}

const ROUTES_DIR = "src/app/api"
function routeFiles() {
    const out = {}
    for (const d of fs.readdirSync(path.join(ROOT, ROUTES_DIR))) {
        const f = path.join(ROUTES_DIR, d, "route.ts")
        if (fs.existsSync(path.join(ROOT, f))) out[f] = read(f)
    }
    return out
}

/** 呼び出しの引数を数える（括弧の深さを見て、最上位のカンマで区切る） */
function callArgs(src, name) {
    const out = []
    let i = 0
    while ((i = src.indexOf(`${name}(`, i)) >= 0) {
        const line = src.slice(0, i).split("\n").length
        let j = i + name.length + 1, depth = 1, args = 1, any = false
        for (; depth > 0 && j < src.length; j++) {
            const ch = src[j]
            if ("([{".includes(ch)) depth++
            else if (")]}".includes(ch)) depth--
            else if (ch === "," && depth === 1) { args++; any = false; continue }
            if (depth > 0 && !/\s/.test(ch)) any = true
        }
        // 末尾のカンマ（引数なし）は数えない
        if (!any) args--
        out.push({ line, args })
        i = j
    }
    return out
}

function wiring(files, helpers) {
    const problems = []
    let shrink = 0, small = 0, choice = 0
    for (const [f, s] of Object.entries(files)) {
        for (const c of callArgs(s, "fonts.fit?.reportShrink")) { shrink++; if (c.args < 4) problems.push(`${f}:${c.line}: 縮小の報告に描画位置が無い（警告が同じ値の最初の行を指す）`) }
        for (const c of callArgs(s, "reportIfBelowMinSize")) { small++; if (c.args < 5) problems.push(`${f}:${c.line}: 5pt 未満の報告に描画位置が無い`) }
        for (const c of callArgs(s, "drawChoiceCircle")) { choice++; if (c.args < 7) problems.push(`${f}:${c.line}: 選択肢の○に欄（at）を渡していない`) }
    }
    if (!/fonts\.fit\.reportSmall\(value, size, at\)/.test(helpers)) problems.push(`${HELPERS}: reportIfBelowMinSize が描画位置を reportSmall に渡していない`)
    if (!/reportChoiceMismatch\(text, choices\.map\(\(c\) => c\.label\), at\)/.test(helpers)) problems.push(`${HELPERS}: drawChoiceCircle が欄を reportChoiceMismatch に渡していない`)
    for (const c of callArgs(helpers, "fonts.fit?.reportShrink").filter((c) => c.args < 4)) {
        // 右寄せ（drawRightAt）は日付などシステムの整形値だけ。行の欄は通らない
        const ctx = helpers.split("\n").slice(Math.max(0, c.line - 40), c.line).join("\n")
        if (!/export const drawRightAt/.test(ctx)) problems.push(`${HELPERS}:${c.line}: 縮小の報告に描画位置が無い`)
    }
    return { problems, counts: { shrink, small, choice } }
}

const lib = read(LIB)
const helpers = read(HELPERS)
const files = routeFiles()

if (SELF_TEST) {
    const neg = [...behaviour(await load(lib)), ...wiring(files, helpers).problems]
    if (neg.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of neg) console.log("   ", p)
        process.exit(1)
    }
    const libMutants = [
        ["選択肢を値で当てる（直す前）", "const hit = locate(entries, c.text, c.at, true)", "const hit = locate(entries, c.text, undefined, true)", "選択肢の警告が 24 行目を指さない"],
        ["縮小・5pt 未満を値で当てる（直す前）", "const hit = locate(entries, f.text, f.at, false)", "const hit = locate(entries, f.text, undefined, false)", "5pt 未満の警告が 13 行目を指さない"],
        ["5pt 未満を値で畳む（2 行目が消える）", "if (!t || smalls.some((s) => sameCell(s.at, at, s.text, t))) return", "if (!t || smalls.some((s) => s.text === t)) return", "ほか1か所"],
        ["総括表の設備の行を行として数えない（直す前）", 'key.endsWith("_rows") || key === "equipment_results"', 'key.endsWith("_rows")', "「誘導灯」の行を指さない"],
        ["行の見出し（設備名）を使わない", "    if (rowLabel) return", "    if (false) return", "「誘導灯」の行を指さない"],
        ["畳んだ件数を書かない", "label: withRow(fieldLabelOf(form, s.field!), form, s.rowsKey, s.row, more, s.at?.rowLabel, s.at?.place),\n            size", "label: withRow(fieldLabelOf(form, s.field!), form, s.rowsKey, s.row, 0, s.at?.rowLabel, s.at?.place),\n            size", "ほか1か所"],
    ]
    for (const [label, from, to, expect] of libMutants) {
        if (!lib.includes(from)) { console.log(`自己診断: 書き換える箇所が ${LIB} に無い: ${from}`); process.exit(1) }
        const r = behaviour(await load(lib.replace(from, to)))
        if (!r.some((p) => p.includes(expect))) { console.log(`自己診断: ${label} → 検出できない`); for (const p of r) console.log("   ", p); process.exit(1) }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    const INERT = `${ROUTES_DIR}/generate-inert-gas-bekki6-pdf/route.ts`
    const ALARM = `${ROUTES_DIR}/generate-emergency-alarm-bekki14-pdf/route.ts`
    const wireMutants = [
        ["ルートの縮小の報告から位置を外す", INERT, "fonts.fit?.reportShrink(normalized, designSize, currentSize, options?.at)", "fonts.fit?.reportShrink(normalized, designSize, currentSize)", "縮小の報告に描画位置が無い"],
        ["ルートの 5pt 未満の報告から位置を外す", INERT, "reportIfBelowMinSize(fonts, normalized, currentSize, maxWidth, options?.at)", "reportIfBelowMinSize(fonts, normalized, currentSize, maxWidth)", "5pt 未満の報告に描画位置が無い"],
        ["鳴動方式の○から欄を外す", ALARM, ', undefined, { rowsKey: "page1_rows", row: 23, column: "content" })', ")", "選択肢の○に欄（at）を渡していない"],
    ]
    for (const [label, file, from, to, expect] of wireMutants) {
        if (!files[file]?.includes(from)) { console.log(`自己診断: 書き換える箇所が ${file} に無い: ${from}`); process.exit(1) }
        const r = wiring({ ...files, [file]: files[file].replace(from, to) }, helpers).problems
        if (!r.some((p) => p.includes(expect))) { console.log(`自己診断: ${label} → 検出できない`); process.exit(1) }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    {
        const r = wiring(files, helpers.replace("fonts.fit.reportSmall(value, size, at)", "fonts.fit.reportSmall(value, size)")).problems
        if (!r.some((p) => p.includes("reportIfBelowMinSize が描画位置を"))) { console.log("自己診断: 共有の 5pt 未満から位置を外す → 検出できない"); process.exit(1) }
        console.log("  陽性対照: 共有の 5pt 未満から位置を外す → 検出")
    }
    const { counts } = wiring(files, helpers)
    console.log(`  陰性対照: 帰属 8 通り・ルート ${Object.keys(files).length} 本（縮小 ${counts.shrink}・5pt 未満 ${counts.small}・選択肢 ${counts.choice} か所）に位置あり`)
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const { problems: wireProblems, counts } = wiring(files, helpers)
const problems = [...behaviour(await load(lib)), ...wireProblems]
console.log(`警告の行の帰属を検査: 帰属 8 通り・ルート ${Object.keys(files).length} 本（縮小 ${counts.shrink}・5pt 未満 ${counts.small}・選択肢 ${counts.choice} か所）`)
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("WARNING_ROW_ATTRIBUTION_OK")
