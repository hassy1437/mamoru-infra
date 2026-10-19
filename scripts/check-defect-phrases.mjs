// 不良内容・措置内容の候補（src/lib/defect-phrases.ts）が、短く・全部の入力欄に添えてあり・PDF の欄に収まるかを検査する（2026-10-19・#101）。
//
// ■ なぜ要るか
//   ・別記の不良内容・措置内容の欄は幅 65〜95pt・文字 5.9〜6.7pt しかない。候補が長いと、業者が選んだだけで
//     縮小の警告（⑨）や切り詰めの 422（⑧・PDF が出ず一括出力も納品も止まる）になる
//     ＝ 候補を足した人が PDF を見ないまま入る種類。字数の上限と、実際に PDF を作って確かめる
//   ・入力欄は別記 23 様式（共通ベース＋専用フォーム 8 本・それぞれ PC の表とスマホのカード）と総括表に散っている。
//     1 か所でも list 属性が抜けると、その欄だけ黙って候補が出ない
//
// ■ 検査すること
//   1. 候補: 空・前後の空白・重複が無い／DEFECT_PHRASE_MAX_CHARS（10）字以内／行頭・行末の禁則文字で始まり終わらない
//   2. 行ラベル → 候補の組: 代表の行で決めた組になる（「表示灯」が「表示」に吸われない等の順序）
//   3. 配線: src の不良内容・措置内容の <Input> は全部 list={defectPhraseListId(…)} を持ち、同じ画面に datalist がある
//   4. PDF（★実際に作って測る）: 別記 23 様式の全行と総括表の全設備に一番長い候補を入れて、
//      200 で返る・縮小／下限割れの警告が無い・1 行のまま 5.5pt 以上で全文が載る
//
// 使い方: node scripts/check-defect-phrases.mjs [--self-test]
//   ★tmp/pdf-realistic の payload を土台にする（generate-realistic-route-tests.mjs / check-pdf-all --regen）
import { spawnSync } from "child_process"
import fs from "fs"
import path from "path"
import { pathToFileURL } from "url"
import ts from "typescript"
import { runRoutePdf } from "./run-route-pdf.mjs"

const ROOT = process.cwd()
const PY = process.platform === "win32" ? "python" : "python3"
const SELF_TEST = process.argv.includes("--self-test")
// ★自己診断と本番で出力先を分ける（check-pdf-all は並列に走らせる）
const OUT = path.join(ROOT, "tmp", SELF_TEST ? "defect-phrases-selftest" : "defect-phrases")
const JOB_DIRS = ["tmp/pdf-test-bekki234", "tmp/pdf-test-bekki5678", "tmp/pdf-test-bekki9to12", "tmp/pdf-test-bekki13to22", "tmp/pdf-test-extra"]
const MIN_PT = 5.5
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8")

/** 行の禁則（scripts/check-kinsoku.mjs と同じ考え方）。候補が 2 行に折り返したときに崩れないよう、頭と尻だけ見る */
const NO_HEAD = /^[）」』、。・ー〜！？]/
const NO_TAIL = /[（「『]$/

/** 代表の行ラベル → 決めた組（★DEFECT_PHRASE_GROUPS の順序と区切り方を固定する） */
const GROUP_EXAMPLES = [
    ["受信機・中継器 / 表示灯", "lamp"],
    ["光源", "lamp"],
    ["加圧送水装置 外形", "outer"],
    ["外形（※※※非常電源）", "outer"],
    ["移動式 / ホース・ホース接続部", "hose"],
    ["配管等 管・管継手", "pipe"],
    ["受信機 ヒューズ類（Ａ）", "fuse"],
    ["加圧送水装置 予備品等", "spare"],
    ["加圧送水装置 接地", "earth"],
    ["加圧送水装置 結線接続", "wire"],
    ["指示圧力計", "pressure"],
    ["非常電源（内蔵型） / 端子電圧（Ｖ）", "battery"],
    ["消火栓箱 表示", "label"],
    ["外箱・表示面：視認障害等", "place"],
    ["設置場所", "place"],
    ["※総合作動", "operation"],
    ["耐震措置", "quake"],
    ["貯水槽 水量", "water"],
    ["消火薬剤量", "agent"],
    ["安全栓の封", "pin"],
    ["配管等 バルブ類", "valve"],
    ["音響装置 音圧等", "sound"],
    ["受信機 感度調整装置（mA）", null],
]

async function loadLib(mutate = (src) => src) {
    fs.mkdirSync(OUT, { recursive: true })
    const tag = Date.now() + Math.random().toString(36).slice(2, 6)
    const out = {}
    for (const name of ["defect-phrases", "bekki-row-labels"]) {
        const src = name === "defect-phrases" ? mutate(read(`src/lib/${name}.ts`)) : read(`src/lib/${name}.ts`)
        const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
        const file = path.join(OUT, `${name}.${tag}.mjs`)
        fs.writeFileSync(file, js, "utf8")
        out[name] = await import(pathToFileURL(file).href)
    }
    return { lib: out["defect-phrases"], LABELS: out["bekki-row-labels"].BEKKI_ROW_LABELS }
}

function phraseChecks({ lib, LABELS }) {
    const problems = []
    if (!(lib.DEFECT_PHRASE_MAX_CHARS <= 10)) problems.push(`字数の上限が ${lib.DEFECT_PHRASE_MAX_CHARS}（10 以下のはず）`)
    for (const kind of ["bad", "action"]) {
        const all = lib.allDefectPhrases(kind)
        if (all.length < 5) problems.push(`${kind}: 候補が ${all.length} 個しか無い`)
        for (const p of all) {
            const n = [...p].length
            if (!p || p !== p.trim() || /\s/.test(p)) problems.push(`${kind}: 空・空白を含む候補「${p}」`)
            if (n > lib.DEFECT_PHRASE_MAX_CHARS) problems.push(`${kind}: 「${p}」が ${n} 字（${lib.DEFECT_PHRASE_MAX_CHARS} 字まで。PDF の欄で縮む・切れる）`)
            if (NO_HEAD.test(p) || NO_TAIL.test(p)) problems.push(`${kind}: 「${p}」が禁則文字で始まる・終わる`)
        }
        for (const list of [lib.GENERAL_DEFECT_PHRASES[kind], ...lib.DEFECT_PHRASE_GROUPS.map((g) => g[kind])]) {
            if (new Set(list).size !== list.length) problems.push(`${kind}: 同じ組の中に重複がある（${list.join("・")}）`)
        }
    }
    const ids = lib.DEFECT_PHRASE_GROUPS.map((g) => g.id)
    if (new Set(ids).size !== ids.length || ids.some((id) => !/^[a-z]+$/.test(id) || id === "general")) problems.push(`組の id が重複・英小文字でない・general と重なる: ${ids.join(",")}`)
    for (const g of lib.DEFECT_PHRASE_GROUPS) if (!g.bad.length || !g.action.length || !g.keywords.length) problems.push(`組 ${g.id}: 語・不良内容・措置内容のどれかが空`)
    for (const [label, want] of GROUP_EXAMPLES) {
        const got = lib.defectPhraseGroupOf(label)?.id ?? null
        if (got !== want) problems.push(`「${label}」の組が ${want} のはずが ${got}`)
    }
    // list 属性の id と datalist の id は同じ関数を通る（全様式の全行で、描く datalist のどれかに当たる）
    const rendered = new Set(["bad", "action"].flatMap((k) => [null, ...lib.DEFECT_PHRASE_GROUPS].map((g) => lib.defectPhraseGroupListId(k, g))))
    let rows = 0, specific = 0
    for (const sections of Object.values(LABELS)) {
        for (const labels of Object.values(sections)) {
            for (const label of labels) {
                if (label.includes("見出し行")) continue
                rows += 1
                if (lib.defectPhraseGroupOf(label)) specific += 1
                for (const k of ["bad", "action"]) if (!rendered.has(lib.defectPhraseListId(k, label))) problems.push(`「${label}」の list の id ${lib.defectPhraseListId(k, label)} を描く datalist が無い`)
            }
        }
    }
    return { problems, rows, specific }
}

/** src の .tsx を全部（不良内容・措置内容の入力欄がどこに増えても拾う） */
function loadSources() {
    const out = []
    const walk = (d) => {
        for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
            const p = `${d}/${e.name}`
            if (e.isDirectory()) walk(p)
            else if (p.endsWith(".tsx")) out.push([p, read(p)])
        }
    }
    walk("src")
    return out
}

const DEFECT_INPUT = /"bad_content"|"action_content"|"bad_detail"|onChange\("action"/

function wiring(sources) {
    const problems = []
    let inputs = 0
    const files = []
    for (const [name, src] of sources) {
        const elements = src.match(/<Input\b[\s\S]*?\/>/g) ?? []
        const defect = elements.filter((e) => DEFECT_INPUT.test(e))
        if (!defect.length) continue
        files.push(name)
        inputs += defect.length
        for (const e of defect) {
            if (!/list=\{defectPhraseListId\("(bad|action)", /.test(e)) {
                problems.push(`${name}: 不良内容・措置内容の入力欄に候補（list={defectPhraseListId(…)}）が無い: ${e.replace(/\s+/g, " ").slice(0, 120)}`)
                continue
            }
            const kind = e.match(/defectPhraseListId\("(bad|action)"/)[1]
            const isBad = /"bad_content"|"bad_detail"/.test(e)
            if ((kind === "bad") !== isBad) problems.push(`${name}: 不良内容と措置内容の候補が逆: ${e.replace(/\s+/g, " ").slice(0, 120)}`)
        }
        const lists = (src.match(/<DefectPhraseDatalists\b[^>]*\/>/g) ?? [])
        if (lists.length !== 1) problems.push(`${name}: 候補の datalist（<DefectPhraseDatalists />）が ${lists.length} か所（1 か所のはず）`)
        // 1 画面に何度も出る部品は prefix を分ける（同じ id が並ぶと後の datalist は使われない）
        if (lists[0]?.includes("prefix=") && !/defectPhraseListId\("(bad|action)", [^,]+, phrasePrefix\)/.test(src)) problems.push(`${name}: datalist の prefix と入力欄の list の prefix が違う`)
    }
    const bekki = files.filter((f) => /\/[^/]*bekki[^/]*\.tsx$/.test(f))
    if (bekki.length !== 9) problems.push(`別記の入力欄のある部品が ${bekki.length} 本（共通ベース＋専用フォーム 8 本＝9 のはず）`)
    if (!files.includes("src/components/soukatsu-equipment-details.tsx")) problems.push("総括表の「要改善」の不良内容・措置内容に候補が無い")
    // 9 本 × (PC 2 欄＋スマホ 2 欄) ＋ 総括表 2 欄
    if (inputs !== 9 * 4 + 2) problems.push(`不良内容・措置内容の入力欄が ${inputs} 個（38 のはず）＝ 拾い方が壊れたか、欄が増えた`)
    return { problems, inputs, files: files.length }
}

// ── PDF（実際に作って測る） ───────────────────────────────────────
function jobs() {
    const out = []
    for (const d of JOB_DIRS) {
        if (!fs.existsSync(path.join(ROOT, d))) continue
        for (const f of fs.readdirSync(path.join(ROOT, d)).filter((f) => f.endsWith(".job.json"))) {
            const stem = f.replace(".job.json", "")
            if (!/^(bekki[\d_]+|soukatu)_test$/.test(stem)) continue
            const real = path.join(ROOT, "tmp", "pdf-realistic", `${stem}.payload.json`)
            if (!fs.existsSync(real)) continue
            out.push({ stem, route: JSON.parse(fs.readFileSync(path.join(ROOT, d, f), "utf8")).routePath, payload: JSON.parse(fs.readFileSync(real, "utf8")) })
        }
    }
    return out.sort((a, b) => a.stem.localeCompare(b.stem, "en", { numeric: true }))
}

/** 全部の行（判定を持つ行）に候補を入れる。総括表は全設備を「要改善」にして入れる */
function withPhrases(payload, bad, action) {
    const p = structuredClone(payload)
    let n = 0
    for (const [k, v] of Object.entries(p)) {
        if (!/^page\d_rows$/.test(k) || !Array.isArray(v)) continue
        for (const row of v) if (row && typeof row === "object" && "judgment" in row) { row.bad_content = bad; row.action_content = action; n += 1 }
    }
    if (Array.isArray(p.equipment_results)) {
        for (const item of p.equipment_results) { item.result = "要改善"; item.bad_detail = bad; item.action = action; n += 1 }
    }
    return { payload: p, rows: n }
}

const readWarnings = (headers) => {
    const b64 = headers?.["x-fit-warnings"] ?? headers?.["X-Fit-Warnings"] ?? null
    return b64 ? JSON.parse(Buffer.from(b64, "base64").toString("utf8")) : null
}

const MEASURE = String.raw`
import json, sys, pymupdf
jobs = json.loads(sys.stdin.read())
out = []
for pdf, phrases in jobs:
    d = pymupdf.open(pdf)
    res = {}
    for ph in phrases:
        full = 0; sizes = []; wrapped = 0
        for page in d:
            full += "".join(page.get_text().split()).count(ph)
            for b in page.get_text("dict")["blocks"]:
                for l in b.get("lines", []):
                    for s in l["spans"]:
                        t = s["text"].strip()
                        if ph in t: sizes.append(round(s["size"], 2))
                        elif len(t) >= 2 and ph.startswith(t): wrapped += 1
        res[ph] = {"full": full, "min": min(sizes) if sizes else None, "wrapped": wrapped}
    out.append(res)
print(json.dumps(out, ensure_ascii=False))
`

async function pdfChecks(list, bad, action) {
    fs.mkdirSync(OUT, { recursive: true })
    const problems = []
    const made = []
    for (const j of list) {
        const { payload, rows } = withPhrases(j.payload, bad, action)
        if (!rows) { problems.push(`${j.stem}: 候補を入れる行が無い（payload の形が変わった）`); continue }
        const pdf = path.join(OUT, `${j.stem}.pdf`)
        try {
            const res = await runRoutePdf({ routePath: j.route, payload, outPdfPath: pdf })
            const w = readWarnings(res.headers)
            const mine = (xs) => (xs ?? []).filter((x) => x.text === bad || x.text === action)
            for (const x of mine(w?.items)) problems.push(`${j.stem}: 「${x.text}」が ${x.design}→${x.actual}pt に縮む（${x.label}）`)
            for (const x of mine(w?.belowMin)) problems.push(`${j.stem}: 「${x.text}」が下限割れの ${x.size}pt（${x.label}）`)
            made.push([j.stem, pdf])
        } catch (e) {
            if (!e.status) throw e
            problems.push(`${j.stem}: 一番長い候補（「${bad}」「${action}」）を入れると ${e.status}（PDF が出ない）${String(e.responseBody ?? "").slice(0, 160)}`)
        }
    }
    if (made.length) {
        const r = spawnSync(PY, ["-c", MEASURE], { cwd: ROOT, input: JSON.stringify(made.map(([, pdf]) => [pdf, [bad, action]])), encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } })
        if (r.status !== 0) throw new Error(`PDF を測れない: ${r.stderr}`)
        const res = JSON.parse(r.stdout.trim().split(/\r?\n/).pop())
        made.forEach(([stem], i) => {
            for (const ph of [bad, action]) {
                const m = res[i][ph]
                if (!m.full) problems.push(`${stem}: 「${ph}」が 1 か所も全文で載っていない`)
                if (m.wrapped) problems.push(`${stem}: 「${ph}」が折り返された（${m.wrapped} か所）＝ 欄の幅に 1 行で入らない`)
                if (m.min !== null && m.min < MIN_PT) problems.push(`${stem}: 「${ph}」が ${m.min}pt（${MIN_PT}pt 未満）`)
            }
        })
    }
    return { problems, made: made.length }
}

const longest = (xs) => xs.reduce((a, b) => ([...b].length > [...a].length ? b : a), "")

const sources = loadSources()

if (SELF_TEST) {
    const neg = phraseChecks(await loadLib())
    const negW = wiring(sources)
    if (neg.problems.length || negW.problems.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of [...neg.problems, ...negW.problems]) console.log("   ", p)
        process.exit(1)
    }
    const libMutants = [
        ["長い候補を足す", (s) => s.replace('        "変形・損傷あり",\n        "腐食あり",', '        "変形・損傷あり",\n        "消火器の本体容器に著しい腐食あり",\n        "腐食あり",'), "bad: 「消火器の本体容器に著しい腐食あり」が"],
        // ★点灯の組の語を「表示」にすると、「消火栓箱 表示」が点灯の組に吸われる（順序で決まる）
        ["点灯の組が「表示」まで拾う", (s) => s.replace('keywords: ["表示灯", "常夜灯", "標識灯", "光源", "点灯"]', 'keywords: ["表示", "常夜灯", "標識灯", "光源", "点灯"]'), "「消火栓箱 表示」の組が label"],
    ]
    for (const [label, mutate, expect] of libMutants) {
        const r = phraseChecks(await loadLib(mutate))
        if (!r.problems.some((p) => p.startsWith(expect))) {
            console.log(`自己診断: ${label} → 検出できない`)
            for (const p of r.problems) console.log("   ", p)
            process.exit(1)
        }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    const wMutants = [
        ["共通ベースのスマホの不良内容から候補が抜ける", "src/components/bekki-result-form-base.tsx", '                                            className="h-9 text-sm"\n                                            list={defectPhraseListId("bad", label)}\n', '                                            className="h-9 text-sm"\n', "src/components/bekki-result-form-base.tsx: 不良内容・措置内容の入力欄に候補"],
        ["総括表の措置内容から候補が抜ける", "src/components/soukatsu-equipment-details.tsx", '                            list={defectPhraseListId("action", "", phrasePrefix)}\n', "", "src/components/soukatsu-equipment-details.tsx: 不良内容・措置内容の入力欄に候補"],
        ["専用フォーム（別記2）が datalist を描かない", "src/components/shokasen-bekki2-form.tsx", "            <DefectPhraseDatalists />\n", "", "src/components/shokasen-bekki2-form.tsx: 候補の datalist"],
        ["不良内容に措置内容の候補を付ける", "src/components/halogen-bekki7-form.tsx", 'list={defectPhraseListId("bad", label)}', 'list={defectPhraseListId("action", label)}', "src/components/halogen-bekki7-form.tsx: 不良内容と措置内容の候補が逆"],
    ]
    for (const [label, file, from, to, expect] of wMutants) {
        const src = sources.find(([n]) => n === file)?.[1]
        if (!src || !src.includes(from)) { console.log(`自己診断: 注入先が無い（${label}）`); process.exit(1) }
        const r = wiring(sources.map(([n, s]) => [n, n === file ? s.replace(from, to) : s]))
        if (!r.problems.some((p) => p.startsWith(expect))) {
            console.log(`自己診断: ${label} → 検出できない`)
            for (const p of r.problems) console.log("   ", p)
            process.exit(1)
        }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    // PDF: 狭い欄の代表（別記17 不良内容 68.28pt・別記7 措置内容 65.34pt）で、いまの一番長い候補は通り、長すぎる値は落ちる
    const pick = jobs().filter((j) => ["bekki17_test", "bekki7_test"].includes(j.stem))
    if (pick.length !== 2) { console.log("自己診断: 代表の様式（別記7/17）の payload が無い（check-pdf-all --regen で作る）"); process.exit(2) }
    const { lib } = await loadLib()
    const okRun = await pdfChecks(pick, longest(lib.allDefectPhrases("bad")), longest(lib.allDefectPhrases("action")))
    if (okRun.problems.length) {
        console.log("自己診断: いまの候補で代表の様式が既にNG")
        for (const p of okRun.problems) console.log("   ", p)
        process.exit(1)
    }
    const ngRun = await pdfChecks(pick, "消火器の本体容器に著しい腐食あり", "次回点検時に部品を交換予定")
    for (const stem of ["bekki17_test", "bekki7_test"]) {
        if (!ngRun.problems.some((p) => p.startsWith(stem))) { console.log(`自己診断: 長すぎる候補を ${stem} で検出できない`); process.exit(1) }
    }
    console.log("  陽性対照: 長すぎる候補（16 字・13 字）→ 別記7・17 の PDF で検出")
    console.log(`  陰性対照: 候補・組・配線（入力欄 ${negW.inputs} 個）・代表 2 様式の PDF とも問題なし`)
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const mod = await loadLib()
const ph = phraseChecks(mod)
const w = wiring(sources)
const list = jobs()
const bad = longest(mod.lib.allDefectPhrases("bad"))
const action = longest(mod.lib.allDefectPhrases("action"))
if (list.length !== 24) {
    console.log(`★現実値の payload が ${list.length} 様式（別記 23＋総括表＝24 のはず）。node scripts/check-pdf-all.mjs --regen で作り直すこと`)
    process.exit(2)
}
const pdf = await pdfChecks(list, bad, action)
const problems = [...ph.problems, ...w.problems, ...pdf.problems]
console.log(`不良内容・措置内容の候補を検査: 不良内容 ${mod.lib.allDefectPhrases("bad").length}・措置内容 ${mod.lib.allDefectPhrases("action").length} 個`
    + `（組つきの行 ${ph.specific}/${ph.rows}）・入力欄 ${w.inputs} 個・PDF ${pdf.made} 様式（一番長い「${bad}」「${action}」）`)
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("DEFECT_PHRASES_OK")
