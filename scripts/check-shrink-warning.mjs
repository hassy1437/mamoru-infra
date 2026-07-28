// ⑨「設計値から大きく縮んだ項目を警告する」の回帰検査。
//
// ■ この指標が言えること / 言えないこと
//   言える: 通常運用で観測された範囲（現実値セットの最大 23.7%）の外にある
//   言えない: 印刷して判読できるか。それを言うには 300dpi 印刷での判読実験が要る
//
// 検査すること:
//   1. 現実値セットで警告0件（正常な出力を妨げない）
//   2. 極端に長い値を入れると警告が出て、内容が正しい
//   3. 警告が出てもPDFは返る（切り詰めと違い止めない）
//   4. 重複が畳まれている（同じ値が何行にも出るため、生で渡すと読めない）
//   5. 陽性対照（両方向）: 閾値を下げれば現実値でも出る＝検出力がある／
//                          既定では出ない＝誤検出しない
//
// 使い方: node scripts/check-shrink-warning.mjs
import fs from "fs"
import path from "path"
import { runRoutePdf } from "./run-route-pdf.mjs"

import { execFileSync } from "child_process"

const REAL_DIR = path.join(process.cwd(), "tmp", "pdf-realistic")
// 幅の広いセル（縮小だけで収まる＝⑧では止まらない）に長い値を入れる。⑨が埋めるのはここ。
const LONG = "特定非営利活動法人きわめて長い名称の防火対象物管理組合連合会西日本総合ビルディング"

const problems = []
const check = (ok, message) => {
    if (!ok) problems.push(message)
}

// runRoutePdf は headers を素のオブジェクトで返す（Headers ではない）。
// fetch 経由では小文字化されるのでキーは大小どちらも見る。
const readWarning = (headers) => {
    const b64 = headers?.["x-fit-warnings"] ?? headers?.["X-Fit-Warnings"] ?? null
    if (!b64) return null
    const body = JSON.parse(Buffer.from(b64, "base64").toString("utf8"))
    // ★X-Fit-Warnings には縮小(items)以外に選択肢不一致(choices)も載る。
    //   ヘッダの有無で縮小を判定すると、縮小0でも「警告あり」になり現実値セットが
    //   全滅する（choices を足した直後に実際に10様式が誤検出になった）。
    //   この検査が見るのは縮小だけなので、items が空なら警告なしとして扱う。
    if (!Array.isArray(body?.items) || body.items.length === 0) return null
    return body
}

const run = async (routePath, payload, outName) => {
    try {
        const res = await runRoutePdf({ routePath, payload, outPdfPath: path.join("tmp", outName) })
        return { status: 200, warning: readWarning(res.headers), bytes: res.bytes }
    } catch (e) {
        if (e.status) return { status: e.status, warning: null, bytes: 0 }
        throw e
    }
}

// ★陽性対照は別プロセスで走らせる。ESM のモジュールキャッシュがあるため、
//   同一プロセス内で pdf-fit-report.ts を書き換えても反映されず、
//   「検出できない」という誤った結論になる（実際に踏んだ）。
if (process.env.SHRINK_PROBE) {
    // ★対照に使う様式は「現実値でも縮小が起きる」ものを選ぶこと。
    //   bekki2 は現実値ではほとんど縮まず、閾値を下げても何も出ないので対照にならない
    //   （＝検出力が無いのか対象が悪いのか区別できない。実際に踏んだ）。
    //   bekki6 は現実値で入力由来の縮小が118件あり、閾値を下げれば必ず出る。
    const probeBase = JSON.parse(
        fs.readFileSync(path.join(REAL_DIR, "bekki6_test.payload.json"), "utf8"),
    )
    const r = await run(
        "src/app/api/generate-inert-gas-bekki6-pdf/route.ts",
        probeBase,
        "_warn_probe.pdf",
    )
    console.log(`PROBE:${r.warning ? 1 : 0}`)
    try { fs.unlinkSync(path.join("tmp", "_warn_probe.pdf")) } catch {}
    process.exit(0)
}

// 1. 現実値セット全体で警告0件
const jobs = []
for (const f of fs.readdirSync(REAL_DIR)) {
    if (!f.endsWith(".payload.json")) continue
    const name = f.replace(/\.payload\.json$/, "")
    const jobFile = [...findJobs()].find((j) => path.basename(j).startsWith(name + "."))
    if (jobFile) jobs.push({ name, routePath: JSON.parse(fs.readFileSync(jobFile, "utf8")).routePath })
}
function* findJobs(dir = path.join(process.cwd(), "tmp")) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) yield* findJobs(p)
        else if (e.name.endsWith(".job.json")) yield p
    }
}

let warned = 0
for (const job of jobs) {
    const payload = JSON.parse(fs.readFileSync(path.join(REAL_DIR, `${job.name}.payload.json`), "utf8"))
    const r = await run(job.routePath, payload, "_warn_real.pdf")
    if (r.status !== 200) {
        check(false, `現実値 ${job.name} が ${r.status}`)
        continue
    }
    if (r.warning) {
        warned += 1
        check(false, `現実値 ${job.name} で警告: ${r.warning.items.map((i) => `${i.label} ${i.deviation}%`).join(", ")}`)
    }
}
check(warned === 0, `現実値セットで警告 ${warned} 様式（誤検出）`)

// 2-4. 極端に長い値を入れる
const ROUTE = "src/app/api/generate-shokasen-bekki2-pdf/route.ts"
const base = JSON.parse(fs.readFileSync(path.join(REAL_DIR, "bekki2_test.payload.json"), "utf8"))
const long = structuredClone(base)
long.form_name = LONG
const res = await run(ROUTE, long, "_warn_long.pdf")

check(res.status === 200, `警告のケースでPDFが返らなかった（${res.status}）。縮小は止めない方針のはず`)
check(res.bytes > 0, "PDFが空")
check(Boolean(res.warning), "極端に長い値なのに警告が出ない")
if (res.warning) {
    const it = res.warning.items.find((i) => i.field === "form_name")
    check(Boolean(it), `form_name の警告が無い: ${res.warning.items.map((i) => i.field)}`)
    if (it) {
        check(it.label === "名称", `項目表記が入力画面と違う: ${it.label}`)
        check(it.deviation >= 30, `逸脱率が閾値未満: ${it.deviation}`)
        check(it.design > it.actual, `設計値と実描画が不整合: ${it.design} → ${it.actual}`)
    }
    // 4. 重複が畳まれている（同じ項目・同じ値が2件以上出ない）
    const keys = res.warning.items.map((i) => `${i.field}/${i.text}`)
    check(new Set(keys).size === keys.length, `重複が畳まれていない: ${keys.length}件`)
}

// 5. 陽性対照（下向き）: 閾値を下げれば現実値でも検出できる＝検出力がある
const src = fs.readFileSync("src/lib/pdf-fit-report.ts", "utf8")
const m = src.match(/SHRINK_WARN_THRESHOLD = (\d+)/)
check(Boolean(m), "SHRINK_WARN_THRESHOLD を読み取れない")
if (m) {
    check(Number(m[1]) === 30, `閾値が 30 から変わっている: ${m[1]}。キャリブレーションをやり直すこと`)
    const lowered = src.replace(/SHRINK_WARN_THRESHOLD = \d+/, "SHRINK_WARN_THRESHOLD = 5")
    fs.writeFileSync("src/lib/pdf-fit-report.ts", lowered)
    let probeOut = ""
    try {
        probeOut = execFileSync("node", ["scripts/check-shrink-warning.mjs"], {
            env: { ...process.env, SHRINK_PROBE: "1" },
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        })
    } finally {
        fs.writeFileSync("src/lib/pdf-fit-report.ts", src)
    }
    check(
        /PROBE:1/.test(probeOut),
        "閾値を5%に下げても現実値で警告が出ない＝検出経路が働いていない（配線ミス）",
    )
}

for (const f of ["_warn_real.pdf", "_warn_long.pdf", "_warn_ctrl.pdf"]) {
    try { fs.unlinkSync(path.join("tmp", f)) } catch {}
}

if (problems.length) {
    console.error("SHRINK_WARNING_CHECK_FAILED")
    for (const p of problems) console.error(`  - ${p}`)
    process.exit(1)
}
console.log(
    `SHRINK_WARNING_CHECK_OK（現実値${jobs.length}様式=警告0 / 長文=警告${res.warning?.items.length ?? 0}件かつPDF返却 / 陽性対照OK）`,
)
