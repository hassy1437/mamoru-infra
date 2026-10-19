// 様式まるごとの「この様式の空欄をすべて良にする」（src/lib/bekki-bulk-good.ts）が、入れてよい行にだけ「良」を入れるかを検査する（2026-10-19・#101）。
//
// ■ なぜ要るか
//   ・★機器点検だけの点検で総合点検の行に「良」が入ると、していない点検に○が付いた法定書類になる。
//     ○は正常な見た目なので、PDF の検査では出ない種類
//   ・総合点検の行は行ラベルだけでは分からない様式がある（別記2 その3 の 29〜31 行目・別記3 その4/その5・
//     別記7/8 その4・別記12 その2・別記14 その3）。lib の SOGO_FROM_INDEX で補っている ＝ 行が増減すると黙ってずれる
//   ・ボタンは 23 様式に 1 つずつ（共通ベース 15 様式＋専用フォーム 8 本）。1 本でも配線が切れると、その様式だけ黙って無い
//
// ■ 検査すること（★関数を実際に動かす）
//   1. 点検種別の読み方: 「機器点検」だけが機器点検だけ（「機器・総合」「総合点検」・空欄は違う。PDF の○と同じ）
//   2. 総合点検の行: 様式・表ごとの行数（EXPECTED_SOGO）と、SOGO_FROM_INDEX の起点の行ラベル（SOGO_ANCHORS）
//      ★雛形から導く: 雛形に「総合点検」の見出しがある様式 ⇔ 総合点検の行がある様式。見出しのある頁の表から後ろだけが総合点検
//   3. 入れる行: 判定が空の行だけ・見出し行に入れない・畳んだ行に入れない・機器点検だけなら総合点検の行に入れない・
//      入力済みの良／否を変えない・適用の時点で空でない行も変えない
//   4. 配線: 23 様式すべての頭にボタンがあり、様式名・点検種別・全部の表・畳んだ行（共通ベース）を渡している
//
// 使い方: node scripts/check-bekki-bulk-good.mjs [--self-test]
import { spawnSync } from "child_process"
import fs from "fs"
import path from "path"
import { pathToFileURL } from "url"
import ts from "typescript"

const ROOT = process.cwd()
const PY = process.platform === "win32" ? "python" : "python3"
const SELF_TEST = process.argv.includes("--self-test")
// ★自己診断と本番で出力先を分ける（check-pdf-all は並列に走らせる）
const OUT = path.join(ROOT, "tmp", SELF_TEST ? "bekki-bulk-good-selftest" : "bekki-bulk-good")
const MODULES = ["bekki-bulk-good", "bekki-heading-row", "pdf-merge-config", "itiran-input-flow", "bekki-row-labels"]
const COMPONENTS = "src/components"
const BASE = "src/components/bekki-result-form-base.tsx"
const BUTTON = "src/components/bekki-bulk-good-button.tsx"
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8")

/**
 * 総合点検の行の数（様式・表ごと）。★実測して固定する（2026-10-19）。行ラベルが増減したら落ち、見直す動線になる。
 *   ここに無い様式（別記1・13・16・17・19・21・22）は 0 行（雛形も「機器」だけ）。
 */
const EXPECTED_SOGO = {
    "別記様式第2": { page3_rows: 10 },
    "別記様式第3": { page4_rows: 22, page5_rows: 11 },
    "別記様式第4": { page3_rows: 11 },
    "別記様式第5": { page4_rows: 22 },
    "別記様式第6": { page4_rows: 11 },
    "別記様式第7": { page4_rows: 11 },
    "別記様式第8": { page4_rows: 11 },
    "別記様式第9": { page3_rows: 10 },
    "別記様式第10": { page2_rows: 5 },
    "別記様式第11の1": { page3_rows: 4 },
    "別記様式第11の2": { page2_rows: 3 },
    "別記様式第12": { page2_rows: 4 },
    "別記様式第14": { page3_rows: 2 },
    "別記様式第15": { page2_rows: 3 },
    "別記様式第18": { page2_rows: 5 },
    "別記様式第20": { page3_rows: 3 },
}

/** SOGO_FROM_INDEX の起点の行ラベル（★行が増減して起点がずれたら落とす）と、その 1 つ前の行（起点より前は機器点検） */
const SOGO_ANCHORS = {
    "別記様式第2": { page3_rows: ["総合点検 加圧送水装置", "耐震措置"] },
    "別記様式第3": { page4_rows: ["閉鎖型SP設備 ポンプ方式 加圧送水装置", null], page5_rows: ["補助散水栓 ポンプ方式 加圧送水装置", null] },
    "別記様式第7": { page4_rows: ["全域放出方式 / 警報装置", null] },
    "別記様式第8": { page4_rows: ["全域放出方式 / 警報装置", null] },
    "別記様式第12": { page2_rows: ["作動範囲（－％～＋％）", null] },
    "別記様式第14": { page3_rows: ["音響装置・スピーカーの音圧", null] },
}

/** src/lib の TS を JS にして、@/lib の import を同じフォルダの .mjs に向け直す（mutate で中身を差し替えられる） */
async function load(mutate = (name, src) => src) {
    fs.mkdirSync(OUT, { recursive: true })
    const tag = Date.now() + Math.random().toString(36).slice(2, 6)
    for (const name of MODULES) {
        const src = mutate(name, read(`src/lib/${name}.ts`))
        let js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
        js = js.replace(/from\s+"@\/lib\/([\w-]+)"/g, (_, m) => `from "./${m}.${tag}.mjs"`).replace(/from\s+"\.\/([\w-]+)"/g, (_, m) => `from "./${m}.${tag}.mjs"`)
        fs.writeFileSync(path.join(OUT, `${name}.${tag}.mjs`), js, "utf8")
    }
    const lib = await import(pathToFileURL(path.join(OUT, `bekki-bulk-good.${tag}.mjs`)).href)
    const labels = await import(pathToFileURL(path.join(OUT, `bekki-row-labels.${tag}.mjs`)).href)
    const merge = await import(pathToFileURL(path.join(OUT, `pdf-merge-config.${tag}.mjs`)).href)
    return { lib, LABELS: labels.BEKKI_ROW_LABELS, MERGE: merge.PDF_MERGE_CONFIG }
}

/** 雛形に「総合点検」の見出し（その行がこの 4 字だけ）がある頁（1 始まり）。様式名 → 頁 */
function templateSogoPages() {
    const code = [
        "import json, glob, os, pymupdf",
        "out = {}",
        "for p in sorted(glob.glob('public/PDF/s50_kokuji14_bekki*.pdf')):",
        "    n = os.path.basename(p)[len('s50_kokuji14_bekki'):-4]",
        "    d = pymupdf.open(p)",
        "    pages = []",
        "    for i, page in enumerate(d):",
        "        lines = {}",
        "        for w in page.get_text('words'):",
        "            lines.setdefault((w[5], w[6]), []).append(w[4])",
        "        if any(''.join(t).replace(' ', '') == '総合点検' for t in lines.values()): pages.append(i + 1)",
        "    out[n] = pages",
        "print(json.dumps(out))",
    ].join("\n")
    const r = spawnSync(PY, ["-c", code], { cwd: ROOT, encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } })
    if (r.status !== 0) throw new Error(`雛形を読めない: ${r.stderr}`)
    const raw = JSON.parse(r.stdout.trim().split(/\r?\n/).pop())
    return Object.fromEntries(Object.entries(raw).map(([n, pages]) => [`別記様式第${n.replace("_", "の")}`, pages]))
}

function behaviour({ lib, LABELS, MERGE }, tplPages) {
    const problems = []
    const need = ["isKikiOnlyInspection", "sogoRowIndexes", "planBulkGood", "applyBulkGood", "bekkiFormNameOfApiRoute", "bulkGoodConfirmText", "bulkGoodResultText"]
    for (const f of need) if (typeof lib[f] !== "function") problems.push(`${f} が無い`)
    if (problems.length) return problems

    // 1. 点検種別の読み方（PDF の○と同じ: 「機器」を含めば機器・「総合」を含めば総合）
    const kiki = [["機器点検", true], ["機器", true], ["総合点検", false], ["機器・総合", false], ["", false], [null, false], [undefined, false]]
    for (const [v, want] of kiki) {
        if (lib.isKikiOnlyInspection(v) !== want) problems.push(`点検種別 ${JSON.stringify(v)} を機器点検だけと${want ? "読まない" : "読む"}`)
    }

    // 2. 総合点検の行（固定した数・起点のラベル・雛形の見出し）
    const forms = Object.keys(LABELS)
    if (forms.length !== 23) problems.push(`行ラベル表の様式が ${forms.length}（23 のはず）`)
    for (const form of forms) {
        const sections = Object.entries(LABELS[form])
        const got = {}
        for (const [key, labels] of sections) {
            const sogo = [...lib.sogoRowIndexes(form, key, labels)].sort((a, b) => a - b)
            if (sogo.length) got[key] = sogo.length
            // 見出し行は総合点検の行に数えない（入れる行ではない）
            for (const i of sogo) if (labels[i].includes("見出し行")) problems.push(`${form} ${key}: 見出し行 ${i} を総合点検の行に数えた`)
            // 総合点検の行は表の終わりまで続く（雛形はどれも「総合点検」の見出しから下が総合点検）
            if (sogo.length && sogo[sogo.length - 1] !== labels.length - 1) problems.push(`${form} ${key}: 総合点検の行が表の終わりまで続かない（${sogo.join(",")}）`)
        }
        const want = EXPECTED_SOGO[form] ?? {}
        if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`${form}: 総合点検の行が ${JSON.stringify(want)} のはずが ${JSON.stringify(got)}`)

        // ★雛形から導く: 見出しのある頁の表から後ろだけが総合点検（それより前の表に総合点検の行は無い）
        const pages = tplPages[form]
        if (!pages) { problems.push(`${form}: 雛形が見つからない`); continue }
        const first = pages[0]
        if (!first && Object.keys(got).length) problems.push(`${form}: 雛形に「総合点検」の見出しが無いのに総合点検の行がある`)
        if (first) {
            if (!Object.keys(got).length) problems.push(`${form}: 雛形の ${first} 頁に「総合点検」の見出しがあるのに総合点検の行が無い`)
            for (const [key, labels] of sections) {
                const k = Number(key.match(/\d+/)[0])
                const n = got[key] ?? 0
                if (k < first && n) problems.push(`${form} ${key}: 雛形の見出し（${first} 頁）より前の表に総合点検の行がある`)
                if (k === first && !n) problems.push(`${form} ${key}: 雛形の見出しのある表なのに総合点検の行が無い`)
                const nonHeading = labels.filter((l) => !l.includes("見出し行")).length
                if (k > first && n !== nonHeading) problems.push(`${form} ${key}: 雛形の見出し（${first} 頁）より後ろの表なのに、総合点検の行が ${n}/${nonHeading}`)
            }
        }
    }
    for (const [form, byKey] of Object.entries(lib.SOGO_FROM_INDEX ?? {})) {
        for (const [key, from] of Object.entries(byKey)) {
            const labels = LABELS[form]?.[key]
            const anchor = SOGO_ANCHORS[form]?.[key]
            if (!labels) { problems.push(`SOGO_FROM_INDEX ${form} ${key}: その表が行ラベル表に無い`); continue }
            if (!anchor) { problems.push(`SOGO_FROM_INDEX ${form} ${key}: 検査の SOGO_ANCHORS に起点が登録されていない`); continue }
            if (labels[from] !== anchor[0]) problems.push(`SOGO_FROM_INDEX ${form} ${key}: 起点 ${from} 行目が「${anchor[0]}」でない（「${labels[from]}」）＝ 行が増減してずれた`)
            if (anchor[1] !== null && labels[from - 1] !== anchor[1]) problems.push(`SOGO_FROM_INDEX ${form} ${key}: 起点の 1 つ前が「${anchor[1]}」でない（「${labels[from - 1]}」）`)
        }
    }
    for (const [form, byKey] of Object.entries(SOGO_ANCHORS)) {
        for (const key of Object.keys(byKey)) if (lib.SOGO_FROM_INDEX?.[form]?.[key] === undefined) problems.push(`SOGO_FROM_INDEX から ${form} ${key} が消えた`)
    }

    // 3. 入れる行（全様式で、空の行だけ・見出し行なし・機器点検だけなら総合点検の行なし）
    for (const form of forms) {
        const sections = Object.entries(LABELS[form]).map(([key, labels]) => ({ key, labels, rows: labels.map(() => ({ judgment: "" })) }))
        const heading = sections.reduce((n, s) => n + s.labels.filter((l) => l.includes("見出し行")).length, 0)
        const all = sections.reduce((n, s) => n + s.labels.length, 0) - heading
        const sogo = Object.values(EXPECTED_SOGO[form] ?? {}).reduce((a, b) => a + b, 0)
        const k = lib.planBulkGood(form, "機器点検", sections)
        if (k.count !== all - sogo || k.skippedSogo !== sogo) problems.push(`${form}: 機器点検だけで ${all - sogo} 行（総合点検 ${sogo} 行を残す）のはずが ${k.count} 行（残す ${k.skippedSogo}）`)
        for (const s of sections) {
            for (const i of k.targets[s.key] ?? []) {
                if (s.labels[i].includes("見出し行")) problems.push(`${form} ${s.key}: 見出し行 ${i} に入れる`)
                if (lib.sogoRowIndexes(form, s.key, s.labels).has(i)) problems.push(`${form} ${s.key}: 機器点検だけなのに総合点検の行 ${i} に入れる`)
            }
        }
        for (const t of ["総合点検", "機器・総合", ""]) {
            const p = lib.planBulkGood(form, t, sections)
            if (p.count !== all || p.skippedSogo !== 0) problems.push(`${form}: 点検種別 ${JSON.stringify(t)} で全 ${all} 行のはずが ${p.count} 行（残す ${p.skippedSogo}）`)
        }
    }
    // 入力済み・畳んだ行・適用の時点
    {
        const form = "別記様式第2"
        const labels = LABELS[form].page3_rows
        const rows = labels.map((_, i) => ({ judgment: i === 0 ? "否" : i === 1 ? "良" : "" }))
        const hiddenRow = (_l, i) => i === 2
        const p = lib.planBulkGood(form, "機器点検", [{ key: "page3_rows", labels, rows, hiddenRow }])
        const t = p.targets.page3_rows
        if (t.includes(0) || t.includes(1)) problems.push("入力済みの良・否の行に入れる")
        if (t.includes(2)) problems.push("画面で畳んでいる行（hiddenRow）に入れる")
        if (p.count !== 22 - 3 || p.skippedSogo !== 10) problems.push(`別記2 その3（否 1・良 1・畳む 1・総合 10）で 19 行／残す 10 のはずが ${p.count}／${p.skippedSogo}`)
        const applied = lib.applyBulkGood(rows.map((r, i) => ({ ...r, judgment: i === 3 ? "否" : r.judgment })), t)
        if (applied[0].judgment !== "否" || applied[1].judgment !== "良") problems.push("適用で入力済みの良・否を変えた")
        if (applied[3].judgment !== "否") problems.push("確認の間に入れた「否」を適用で「良」に上書きした")
        if (applied[4].judgment !== "良") problems.push("空の行が「良」にならない")
        if (applied[2].judgment !== "") problems.push("畳んだ行が「良」になった")
        if (applied[25].judgment !== "") problems.push("機器点検だけなのに総合点検の行が「良」になった")
        if (lib.applyBulkGood(rows, []) !== rows) problems.push("入れる行が無いのに配列を作り直した（無駄な再描画）")
        const msg = lib.bulkGoodConfirmText(p)
        if (!msg.includes(`${p.count} 行`) || !msg.includes(`総合点検の ${p.skippedSogo} 行`)) problems.push(`確認の文言に行数・総合点検の行数が無い: ${msg}`)
        if (!lib.bulkGoodResultText(p).includes(`${p.count} 行`)) problems.push("入れたあとの知らせに行数が無い")
        if (!lib.bulkGoodResultText({ ...p, count: 0 }).includes("ありません")) problems.push("0 行のときの知らせが無い")
    }
    // route → 様式名（共通ベースは apiPath しか持たない）
    for (const c of Object.values(MERGE)) {
        const form = lib.bekkiFormNameOfApiRoute(c.apiRoute)
        if (!form || !LABELS[form]) problems.push(`${c.apiRoute} の様式名が引けない（${form}）`)
    }
    return problems
}

/** フォームの file → route の buildFitError("別記様式第N")（scripts/generate-row-labels.mjs と同じ対応） */
function formNameOfComponent(file) {
    const stem = path.basename(file).replace(/-form\.tsx$/, "")
    const route = path.join(ROOT, "src", "app", "api", `generate-${stem}-pdf`, "route.ts")
    if (!fs.existsSync(route)) return null
    return fs.readFileSync(route, "utf8").match(/buildFitError\(\s*"([^"]+)"/)?.[1] ?? null
}

function loadSources() {
    const forms = fs.readdirSync(path.join(ROOT, COMPONENTS))
        .filter((f) => /bekki.*-form\.tsx$/.test(f))
        .map((f) => [`${COMPONENTS}/${f}`, read(`${COMPONENTS}/${f}`)])
    return { forms, base: read(BASE), button: read(BUTTON) }
}

function wiring({ lib }, { forms, base, button }) {
    const problems = []
    const RET = 'return (\n        <div className="space-y-6">\n'
    const atTop = (name, src) => {
        const lf = src.replace(/\r\n/g, "\n")
        const at = lf.indexOf(RET)
        if (at < 0) return problems.push(`${name}: 画面の頭（<div className="space-y-6">）が見つからない`)
        const head = lf.slice(at + RET.length)
        const b = head.indexOf("<BekkiBulkGoodButton")
        const c = head.indexOf("<Card")
        if (b < 0 || (c >= 0 && c < b)) problems.push(`${name}: 「この様式の空欄をすべて良にする」が様式の頭（最初のカードより前）に無い`)
    }
    // 共通ベース（15 様式）
    if (!base.includes("form={bekkiFormNameOfApiRoute(apiPath) ?? apiPath}")) problems.push("共通ベース: 様式名を apiPath から渡していない")
    if (!base.includes("inspectionType={inspectionType}")) problems.push("共通ベース: 点検種別を渡していない（機器点検だけでも総合点検の行に入る）")
    if (!base.includes("hiddenRow: s.hiddenRow")) problems.push("共通ベース: 畳んだ行（hiddenRow）を渡していない（見ていない行に○が付く）")
    if (!/sections=\{sections\.map\(\(s\) => \(\{ key: s\.key, labels: s\.labels, rows: rowsByKey\[s\.key\]/.test(base)) problems.push("共通ベース: 全部の表を渡していない")
    if (!/for \(const section of sections\) next\[section\.key\] = applyBulkGood\(prev\[section\.key\], targets\[section\.key\]\)/.test(base)) problems.push("共通ベース: 全部の表に適用していない")
    atTop("共通ベース", base)

    let n = 0
    for (const [name, src] of forms) {
        const form = formNameOfComponent(name)
        if (!form) { problems.push(`${name}: route から様式名が引けない`); continue }
        const usesBase = /<BekkiResultFormBase\b/.test(src)
        if (usesBase) {
            const api = src.match(/apiPath="([^"]+)"/)?.[1]
            if (lib.bekkiFormNameOfApiRoute(api ?? "") !== form) problems.push(`${name}: apiPath（${api}）から様式名「${form}」が引けない（共通ベースのボタンが総合点検の行を見分けられない）`)
            n += 1
            continue
        }
        if (!src.includes("<BekkiBulkGoodButton")) { problems.push(`${name}: 「この様式の空欄をすべて良にする」が無い`); continue }
        n += 1
        if (!src.includes(`form="${form}"`)) problems.push(`${name}: 様式名「${form}」を渡していない`)
        const hasType = /const \[inspectionType, setInspectionType\]/.test(src)
        if (hasType && !src.includes("inspectionType={inspectionType}")) problems.push(`${name}: 点検種別を渡していない（機器点検だけでも総合点検の行に入る）`)
        const pages = [...src.matchAll(/^const PAGE(\d)_ITEMS = \[/gm)].map((m) => m[1])
        if (!pages.length) problems.push(`${name}: PAGE{n}_ITEMS が見つからない`)
        for (const k of pages) {
            if (!src.includes(`{ key: "page${k}_rows", labels: PAGE${k}_ITEMS, rows: page${k}Rows }`)) problems.push(`${name}: その${k} の表を渡していない`)
            if (!src.includes(`setPage${k}Rows((prev) => applyBulkGood(prev, targets.page${k}_rows))`)) problems.push(`${name}: その${k} の表に適用していない`)
        }
        atTop(name, src)
    }
    if (n !== 23) problems.push(`ボタンのある様式が ${n}（23 のはず）`)
    // 確認と知らせ（★確認は window.confirm で統一されている）
    if (!/window\.confirm\(bulkGoodConfirmText\(plan\)\)/.test(button)) problems.push("ボタン: 入れる前に確認していない")
    if (!/toast\.success\(bulkGoodResultText\(plan\)\)/.test(button)) problems.push("ボタン: 入れたあとに行数を知らせていない")
    if (!button.includes("{BULK_GOOD_BUTTON_LABEL}") || !lib.BULK_GOOD_BUTTON_LABEL?.includes("この様式の空欄をすべて良にする")) problems.push("ボタン: 文言が「この様式の空欄をすべて良にする」でない")
    if (!/\bmin-h-11\b/.test(button)) problems.push("ボタン: 押す所の高さが 44px 未満（min-h-11 が無い）")
    return problems
}

const tplPages = templateSogoPages()
const sources = loadSources()

if (SELF_TEST) {
    const mod = await load()
    const neg = [...behaviour(mod, tplPages), ...wiring(mod, sources)]
    if (neg.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of neg) console.log("   ", p)
        process.exit(1)
    }
    const lib = (name, s, from, to) => (name === "bekki-bulk-good" ? s.replace(from, to) : s)
    const mutants = [
        ["機器点検だけでも総合点検の行に入れる", (n, s) => lib(n, s, "if (kikiOnly && sogo.has(i)) {", "if (false) {"), "別記様式第2: 機器点検だけで"],
        ["別記7 その4 を総合点検と見ない（SOGO_FROM_INDEX から外す）", (n, s) => lib(n, s, '"別記様式第7": { page4_rows: 0 },', ""), "別記様式第7: 総合点検の行が"],
        ["見出し「総合点検」の下を見ない", (n, s) => lib(n, s, "if (inSogo || ", "if ("), "別記様式第5: 総合点検の行が"],
        ["見出し行にも入れる", (n, s) => lib(n, s, "if (isBekkiHeadingLabel(label)) return\n            if (s.hiddenRow", "if (s.hiddenRow"), "別記様式第4 page3_rows: 見出し行"],
        ["「総合点検」を含めば機器点検だけと読む", (n, s) => lib(n, s, 'return t.includes("機器") && !t.includes("総合")', 'return t.includes("機器")'), "点検種別 \"機器・総合\""],
        ["適用で入力済みを上書きする", (n, s) => lib(n, s, 'set.has(i) && row.judgment === ""', "set.has(i)"), "確認の間に入れた"],
    ]
    for (const [label, mutate, expect] of mutants) {
        const r = behaviour(await load(mutate), tplPages)
        if (!r.some((p) => p.startsWith(expect))) {
            console.log(`自己診断: ${label} → 検出できない`)
            for (const p of r) console.log("   ", p)
            process.exit(1)
        }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    // 雛形から導く側: 別記12 の見出しの頁を 1 頁にずらすと、その1 に総合点検の行が無いことで落ちる
    {
        const r = behaviour(mod, { ...tplPages, "別記様式第12": [1] })
        if (!r.some((p) => p.startsWith("別記様式第12 page1_rows: 雛形の見出しのある表"))) { console.log("自己診断: 雛形の見出しの頁と食い違っても検出できない"); process.exit(1) }
        console.log("  陽性対照: 雛形の「総合点検」の見出しの頁と食い違う → 検出")
    }
    // 配線
    const halogen = "src/components/halogen-bekki7-form.tsx"
    const wmut = [
        ["専用フォーム（別記7）が点検種別を渡さない", halogen, "                inspectionType={inspectionType}\n", "", `${halogen}: 点検種別を渡していない`],
        ["専用フォーム（別記7）がその4 の表を渡さない", halogen, '                    { key: "page4_rows", labels: PAGE4_ITEMS, rows: page4Rows },\n', "", `${halogen}: その4 の表を渡していない`],
        ["専用フォーム（別記7）からボタンが消える", halogen, "<BekkiBulkGoodButton", "<SomethingElse", `${halogen}: 「この様式の空欄をすべて良にする」が無い`],
        ["共通ベースが畳んだ行を渡さない", BASE, ", hiddenRow: s.hiddenRow", "", "共通ベース: 畳んだ行"],
    ]
    for (const [label, file, from, to, expect] of wmut) {
        const src = file === BASE ? sources.base : sources.forms.find(([n]) => n === file)?.[1]
        if (!src || !src.includes(from)) { console.log(`自己診断: 注入先が無い（${label}）`); process.exit(1) }
        const mutated = file === BASE
            ? { ...sources, base: src.replace(from, to) }
            : { ...sources, forms: sources.forms.map(([n, s]) => [n, n === file ? s.replace(from, to) : s]) }
        if (!wiring(mod, mutated).some((p) => p.startsWith(expect))) { console.log(`自己診断: ${label} → 検出できない`); process.exit(1) }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    console.log("  陰性対照: 23 様式の総合点検の行・入れる行・配線とも問題なし")
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const mod = await load()
const problems = [...behaviour(mod, tplPages), ...wiring(mod, sources)]
console.log(`様式まるごとの「すべて良」を検査: 23 様式（総合点検の行がある ${Object.keys(EXPECTED_SOGO).length} 様式・雛形の見出しと照合）`)
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("BEKKI_BULK_GOOD_OK")
