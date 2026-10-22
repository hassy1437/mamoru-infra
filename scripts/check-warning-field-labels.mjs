// PDF 出力の警告・エラーに、欄名が英語のキー（inspection_type・license_number 等）のまま出ないか（2026-10-22）。
//
// ■ なぜ要るか
//   警告・エラーの欄名は FIELD_LABELS（src/lib/pdf-fit-report.ts）を引き、無ければ payload のキーをそのまま出す。
//   表に足し忘れても何も落ちず、業者の画面に「inspection_typeの値「…」は選択肢と一致しません」
//   「license_number: 30文字（12文字超過）」と出る。全様式を動かして測ると約 50 欄が英語のままだった
//   （点検種別・設備方式・判定・容器の表・点検者一覧のほぼ全部など）。
//   ★PDF は正しく出るので、画像の検査やベースラインでは原理的に出ない種類。
//   ★check-field-labels.py は「表にある表記が画面と合うか」を見るだけで、「表に無い欄」は見ない。
//
// ■ 検査すること（全ルートを現実値セットの payload で実際に動かす）
//   1. 長い値: 文字の欄をすべて別々の長い値にする（数字だけの欄は長い数字。日付は書式を壊さないよう残す）
//      → 収まらない欄が 422 のエラーに並ぶ
//   2. 合わない値: 文字の欄をすべて別々の短い値にする → 選択肢の警告・縮小の警告が出る
//   どちらも、出た欄の表記がキーのままなら NG。点検者一覧は、どの点検者・どの免状の欄かも見る。
//   ★ルートが 1 本でも測れなければ NG（「測っていない」を「英語は 0 件」と取り違えない）
//
// 使い方: node scripts/check-warning-field-labels.mjs [--self-test]
import fs from "fs"
import path from "path"
import { pathToFileURL } from "url"
import ts from "typescript"
import { runRouteOutput } from "./run-route-pdf.mjs"

const ROOT = process.cwd()
const SELF_TEST = process.argv.includes("--self-test")
const OUT = path.join("tmp", SELF_TEST ? "warning-field-labels-selftest" : "warning-field-labels")
const LIB = "src/lib/pdf-fit-report.ts"
const ITIRAN = "src/app/api/generate-itiran-pdf/route.ts"
const REAL_DIR = path.join("tmp", "pdf-realistic")

/** ルートと現実値セットの payload の組（tmp/pdf-test-*\/*.job.json がルートを持つ） */
function cases() {
    const out = []
    for (const d of fs.readdirSync("tmp").filter((d) => d.startsWith("pdf-test-"))) {
        for (const f of fs.readdirSync(path.join("tmp", d)).filter((f) => f.endsWith(".job.json"))) {
            const name = f.replace(/\.job\.json$/, "")
            const payload = path.join(REAL_DIR, `${name}.payload.json`)
            if (!fs.existsSync(payload)) continue
            out.push({ name, route: JSON.parse(fs.readFileSync(path.join("tmp", d, f), "utf8")).routePath, payload })
        }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
}

const isDate = (v) => /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(v)
const isNum = (v) => /^[\d.,-]+$/.test(v.trim())
/** 文字の欄を 1 つずつ別の値に置き換える（日付は残す。make が null を返した欄も元のまま） */
function fill(node, make) {
    let i = 0
    const walk = (n) => Array.isArray(n) ? n.map(walk)
        : n && typeof n === "object" ? Object.fromEntries(Object.entries(n).map(([k, v]) => [k, walk(v)]))
        : typeof n === "string" && n.trim() && !isDate(n) ? make(i++, isNum(n)) ?? n : n
    return walk(node)
}
const MODES = {
    長い値: (i, num) => num ? `${i}`.padStart(4, "0") + "9".repeat(60) : `欄${i}：` + "長い値のテスト".repeat(17),
    合わない値: (i, num) => num ? null : `Z${i}`,
}

const decode = (h) => h ? JSON.parse(Buffer.from(h, "base64").toString("utf8")) : null

/** 1 ルート × 1 通りを動かし、出た警告・エラーの { field, label } を集める */
async function run(c, mode, routePath = c.route) {
    const payload = fill(JSON.parse(fs.readFileSync(c.payload, "utf8")), MODES[mode])
    fs.mkdirSync(OUT, { recursive: true })
    try {
        const r = await runRouteOutput({ routePath, payload, outPath: path.join(OUT, `${c.name}.pdf`) })
        const w = decode(r.headers["x-fit-warnings"])
        return [...(w?.items ?? []), ...(w?.belowMin ?? []), ...(w?.choices ?? [])]
    } catch (e) {
        if (e.status === 422) return JSON.parse(e.responseBody).items ?? []
        throw new Error(`${c.name}（${mode}）が ${e.status ?? "例外"} になった: ${String(e.responseBody ?? e.message).slice(0, 200)}`)
    }
}

/** 表記がキーのまま（＝表に無い）か */
const isRawKey = (it) => /^[a-z][a-z0-9_]*$/.test(it.field) && it.label.startsWith(it.field)

async function measure({ itiranRoute = ITIRAN, only } = {}) {
    const all = cases().filter((c) => !only || only.includes(c.route))
    const problems = []
    const seen = [] // { form, field }（自己診断で表を変えたときに引き直す）
    const routes = fs.readdirSync(path.join(ROOT, "src/app/api"))
        .filter((d) => /^generate-[A-Za-z0-9_-]*pdf$/.test(d)).map((d) => `src/app/api/${d}/route.ts`)
    const missing = routes.filter((r) => !all.some((c) => c.route === r))
    if (!only && missing.length) problems.push(`現実値セットの payload が無く測れないルート: ${missing.join(", ")}`)
    let items = 0
    for (const c of all) {
        for (const mode of Object.keys(MODES)) {
            const got = await run(c, mode, c.route === ITIRAN ? itiranRoute : c.route)
            items += got.length
            for (const it of got) seen.push({ name: c.name, field: it.field, label: it.label })
            const raw = [...new Set(got.filter(isRawKey).map((it) => it.field))]
            if (raw.length) problems.push(`${c.name}（${mode}）: 欄名が英語のキーのまま出る: ${raw.join(", ")}`)
            // 点検者一覧は、同じ欄が 2 人 × 免状 11 行ある。どの点検者・どの免状かも出す
            if (c.route === ITIRAN && mode === "長い値") {
                const lic = got.filter((it) => it.field === "license_number")
                if (!lic.length) problems.push("点検者一覧（長い値）: 交付番号のエラーが 1 件も出ない（測れていない）")
                else if (!lic.every((it) => /点検者[12]・(消防設備士|消防設備点検資格者) /.test(it.label))) {
                    problems.push(`点検者一覧: 交付番号のエラーが、どの点検者・どの免状かを示さない: ${lic[0].label}`)
                }
            }
        }
    }
    return { problems, seen, routes: all.length, items }
}

/** 表（FIELD_LABELS・FORM_FIELD_LABELS）だけを変えた版で、集めた欄を引き直す（ルートは動かさない） */
async function relabel(libSrc, seen) {
    const js = ts.transpileModule(libSrc, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
    const dir = path.join(OUT, `lib-${Date.now()}${Math.random().toString(36).slice(2, 6)}`)
    fs.mkdirSync(dir, { recursive: true })
    const labels = ts.transpileModule(fs.readFileSync("src/lib/bekki-row-labels.ts", "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
    fs.writeFileSync(path.join(dir, "bekki-row-labels.mjs"), labels, "utf8")
    fs.writeFileSync(path.join(dir, "pdf-fit-report.mjs"), js.replace(/from "\.\/bekki-row-labels"/, 'from "./bekki-row-labels.mjs"'), "utf8")
    const mod = await import(pathToFileURL(path.join(dir, "pdf-fit-report.mjs")).href)
    const FORM = { itiran_test: "点検者一覧", soukatu_test: "総括表", houkoku_test: "報告書" }
    const formOf = (name) => FORM[name.replace(/__.*/, "")] ?? `別記様式第${name.match(/^bekki(\d+(?:_\d)?)_/)?.[1]?.replace("_", "の")}`
    return [...new Set(seen.filter((s) => mod.fieldLabelOf(formOf(s.name), s.field) === s.field).map((s) => `${s.name}: ${s.field}`))]
}

if (SELF_TEST) {
    // ★自己診断は代表の 3 様式だけ動かす（全様式は本番の実行が見る。両方で全様式を動かすと 7 分を超える）。
    //   点検者一覧（様式ごとの表・場所）・第14（点検種別・判定）・第6（容器の表・設備方式）
    const neg = await measure({ only: [ITIRAN, "src/app/api/generate-emergency-alarm-bekki14-pdf/route.ts", "src/app/api/generate-inert-gas-bekki6-pdf/route.ts"] })
    if (neg.problems.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of neg.problems) console.log("   ", p)
        process.exit(1)
    }
    const lib = fs.readFileSync(LIB, "utf8")
    if (await relabel(lib, neg.seen).then((r) => r.length)) { console.log("自己診断: 表を変えずに引き直しても英語が出る（引き直しが本番と合っていない）"); process.exit(1) }
    // ★直す前の形に 1 か所ずつ戻す（表から外す → 英語に戻る）
    const libMutants = [
        ["判定の表記を外す", '    judgment: "判定",\n', "", "judgment"],
        ["点検種別の表記を外す", '    inspection_type: "点検種別",\n', "", "inspection_type"],
        ["点検者一覧の表記を外す（様式ごとの表）", '        license_number: "交付番号",\n', "", "license_number"],
        ["様式ごとの表を引かない", "FORM_FIELD_LABELS[form]?.[field] ?? FIELD_LABELS[field] ?? field", "FIELD_LABELS[field] ?? field", "address"],
    ]
    for (const [label, from, to, expect] of libMutants) {
        if (!lib.includes(from)) { console.log(`自己診断: 書き換える箇所が ${LIB} に無い: ${from.trim()}`); process.exit(1) }
        const r = await relabel(lib.replace(from, to), neg.seen)
        if (!r.some((p) => p.endsWith(`: ${expect}`))) { console.log(`自己診断: ${label} → 検出できない`); process.exit(1) }
        console.log(`  陽性対照: ${label} → 検出（${r.length} 欄）`)
    }
    // 点検者一覧の場所を外す（ルートの写しを動かす）
    const src = fs.readFileSync(ITIRAN, "utf8")
    const from = 'at: at("license_number", place)'
    if (!src.includes(from)) { console.log(`自己診断: 書き換える箇所が ${ITIRAN} に無い: ${from}`); process.exit(1) }
    fs.mkdirSync(OUT, { recursive: true })
    const mutated = path.join(OUT, `itiran.${Date.now()}.ts`)
    fs.writeFileSync(mutated, src.replace(from, 'at: at("license_number")'), "utf8")
    const pos = await measure({ itiranRoute: mutated, only: [ITIRAN] })
    if (!pos.problems.some((p) => p.includes("どの点検者・どの免状か"))) { console.log("自己診断: 点検者一覧の免状の場所を外す → 検出できない"); process.exit(1) }
    console.log("  陽性対照: 点検者一覧の免状の場所を外す → 検出")
    console.log(`  陰性対照: ${neg.routes} 通り × 2（長い値・合わない値）で ${neg.items} 件の警告・エラー、英語のキー 0`)
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const { problems, routes, items } = await measure()
console.log(`警告・エラーの欄名を検査: ${routes} 通り × 2（長い値・合わない値）・警告とエラー ${items} 件`)
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    console.log("  → src/lib/pdf-fit-report.ts の FIELD_LABELS（様式で表記が違えば FORM_FIELD_LABELS）に、入力画面の表記で足す")
    process.exit(1)
}
console.log("WARNING_FIELD_LABELS_OK")
