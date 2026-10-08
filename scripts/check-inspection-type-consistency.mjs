// 総括表と別記で点検種別の○が食い違う別記を、出力画面と納品の確認で知らせるか（2026-10-08・総点検 A2 の残り）。
//
// ■ なぜ要るか
//   別記を開いたあとで総括表の種別を変えたとき・前回の報告書を複製したときに、同じ提出物の中で
//   総括表は「機器点検」・別記は「総合」に○、のような書類ができる。本番でも 27 行が食い違っている（修正前の分）。
//   ★○は正常な見た目なので、PDF の検査では出ない。
//
// ■ 検査すること（★関数を実際に動かす）
//   1. 食い違い・一致・空欄（route と同じく「機器・総合」に倒す）・総括表が空・○の無い様式 の各場合
//   2. 「○がある様式」の一覧（BEKKI_STEPS_WITH_TYPE_CHOICE）が、雛形から導く一覧
//      （scripts/check-inspection-type-circle.py の judge）と同じ
//   3. その 16 様式の route が、空欄を「機器・総合」に倒している（関数の前提）
//   4. 出力画面と納品ボタンが使っている
//
// 使い方: node scripts/check-inspection-type-consistency.mjs [--self-test]
import { spawnSync } from "child_process"
import fs from "fs"
import path from "path"
import { pathToFileURL } from "url"
import ts from "typescript"

const ROOT = process.cwd()
const PY = process.platform === "win32" ? "python" : "python3"
const SELF_TEST = process.argv.includes("--self-test")
// ★自己診断と本番で出力先を分ける（check-pdf-all は並列に走らせる）
const OUT = path.join(ROOT, "tmp", SELF_TEST ? "inspection-type-consistency-selftest" : "inspection-type-consistency")
const MODULES = ["inspection-type-consistency", "pdf-merge-config", "bekki-inspection-type", "itiran-input-flow"]
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8")

async function load(mutate = (name, src) => src) {
    fs.mkdirSync(OUT, { recursive: true })
    const tag = Date.now() + Math.random().toString(36).slice(2, 6)
    for (const name of MODULES) {
        const src = mutate(name, read(`src/lib/${name}.ts`))
        let js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
        js = js.replace(/from\s+"@\/lib\/([\w-]+)"/g, (_, m) => `from "./${m}.${tag}.mjs"`).replace(/from\s+"\.\/([\w-]+)"/g, (_, m) => `from "./${m}.${tag}.mjs"`)
        fs.writeFileSync(path.join(OUT, `${name}.${tag}.mjs`), js, "utf8")
    }
    return import(pathToFileURL(path.join(OUT, `inspection-type-consistency.${tag}.mjs`)).href)
}

function behaviour(mod) {
    const f = mod.findInspectionTypeMismatches
    if (typeof f !== "function") return ["findInspectionTypeMismatches が無い"]
    const problems = []
    const steps = ["foam", "shokaki"]
    const cases = [
        ["総括表は機器点検・別記は機器・総合", "機器点検", { foam: { inspection_type: "機器・総合" } }, ["foam:機器・総合/機器"]],
        ["総括表は機器点検・別記は総合点検", "機器点検", { foam: { inspection_type: "総合点検" } }, ["foam:総合/機器"]],
        ["一致（機器点検と機器点検）", "機器点検", { foam: { inspection_type: "機器点検" } }, []],
        ["一致（総合点検と総合）", "総合点検", { foam: { inspection_type: "総合" } }, []],
        ["別記が空欄（route は機器・総合に倒す）", "機器点検", { foam: { inspection_type: "" } }, ["foam:機器・総合/機器"]],
        ["総括表が空", "", { foam: { inspection_type: "総合" } }, []],
        ["○の無い様式（別記1）は食い違っても出さない", "機器点検", { shokaki: { inspection_type: "総合" } }, []],
    ]
    for (const [label, s, payloads, want] of cases) {
        const got = f(s, payloads, steps).map((m) => `${m.stepId}:${m.bekki}/${m.soukatsu}`)
        if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`${label}: ${JSON.stringify(want)} のはずが ${JSON.stringify(got)}`)
    }
    const one = f("機器点検", { foam: { inspection_type: "総合" } }, ["foam"])[0]
    if (one && one.form !== "別記様式第5") problems.push(`様式名が「別記様式第5」でない（${one.form}）`)
    return problems
}

/** 雛形から導く「○がある様式」（check-inspection-type-circle.py の judge）を stepId で返す */
function templateSteps() {
    const code = [
        "import importlib.util, io, json",
        "spec = importlib.util.spec_from_file_location('c', 'scripts/check-inspection-type-circle.py')",
        "m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)",
        "need, _, _ = m.judge({r: io.open(r, encoding='utf-8').read() for r in m.ROUTES})",
        "print(json.dumps(sorted(need)))",
    ].join("\n")
    const r = spawnSync(PY, ["-c", code], { encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } })
    if (r.status !== 0) throw new Error(`雛形の一覧を導けない: ${r.stderr}`)
    const dirs = JSON.parse(r.stdout.trim().split(/\r?\n/).pop())
    const cfg = read("src/lib/pdf-merge-config.ts")
    return dirs.map((d) => {
        const m = cfg.match(new RegExp(`^\\s*"?([\\w-]+)"?:\\s*\\{\\s*apiRoute:\\s*"/api/${d}"`, "m"))
        return m ? m[1] : `（${d} の stepId が引けない）`
    }).sort()
}

function staticChecks(list) {
    const problems = []
    const fromTemplate = templateSteps()
    const mine = [...list].sort()
    if (JSON.stringify(mine) !== JSON.stringify(fromTemplate))
        problems.push(`○がある様式の一覧が雛形と違う: 関数側 ${mine.join(",")} ／ 雛形 ${fromTemplate.join(",")}`)
    const cfg = read("src/lib/pdf-merge-config.ts")
    for (const id of fromTemplate) {
        const m = cfg.match(new RegExp(`^\\s*"?${id}"?:\\s*\\{\\s*apiRoute:\\s*"(/api/[\\w-]+)"`, "m"))
        if (!m) continue
        const src = read(`src/app${m[1]}/route.ts`)
        if (!src.includes('"機器・総合"')) problems.push(`${id}: route が空欄を「機器・総合」に倒していない（関数の前提が崩れる）`)
    }
    const out = read("src/app/inspection/[id]/itiran/[itiranId]/output/page.tsx")
    const deliver = read("src/components/deliver-report-button.tsx")
    if (!out.includes("findInspectionTypeMismatches(soukatsu.inspection_type, bekkiPayloads, applicableStepIds)")) problems.push("出力画面が点検種別の食い違いを知らせていない")
    if (!deliver.includes("findInspectionTypeMismatches(inspectionType, bekkiPayloads, applicableStepIds)")) problems.push("納品ボタンが点検種別の食い違いを知らせていない")
    if (!/typeMismatches\.length > 0\)/.test(deliver)) problems.push("納品ボタンが食い違いだけのときに確認を出さない")
    return problems
}

if (SELF_TEST) {
    const mod = await load()
    const neg = [...behaviour(mod), ...staticChecks(mod.BEKKI_STEPS_WITH_TYPE_CHOICE)]
    if (neg.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of neg) console.log("   ", p)
        process.exit(1)
    }
    const lib = (name, s, from, to) => (name === "inspection-type-consistency" ? s.replace(from, to) : s)
    const mutants = [
        ["空欄を「機器・総合」に倒さない", (n, s) => lib(n, s, "|| BEKKI_INSPECTION_TYPE_FALLBACK", ""), "別記が空欄"],
        ["○の無い様式も比べる", (n, s) => lib(n, s, "if (!BEKKI_STEPS_WITH_TYPE_CHOICE.includes(id)) continue", ""), "○の無い様式"],
    ]
    for (const [label, mutate, expect] of mutants) {
        const r = behaviour(await load(mutate))
        if (!r.some((p) => p.startsWith(expect))) { console.log(`自己診断: ${label} → 検出できない`); process.exit(1) }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    const short = mod.BEKKI_STEPS_WITH_TYPE_CHOICE.filter((s) => s !== "standpipe")
    if (!staticChecks(short).some((p) => p.includes("雛形と違う"))) { console.log("自己診断: 一覧から 1 様式を落としても検出できない"); process.exit(1) }
    console.log("  陽性対照: ○がある様式の一覧から別記20 を落とす → 検出")
    console.log("  陰性対照: 7 通りの場合・16 様式の一覧・route の既定・出力画面と納品ボタン")
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const mod = await load()
const problems = [...behaviour(mod), ...staticChecks(mod.BEKKI_STEPS_WITH_TYPE_CHOICE)]
console.log(`点検種別の食い違いの知らせを検査: 7 通り・○がある ${mod.BEKKI_STEPS_WITH_TYPE_CHOICE.length} 様式・呼び出し 2 か所`)
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("INSPECTION_TYPE_CONSISTENCY_OK")
