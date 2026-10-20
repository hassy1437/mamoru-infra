// 測定機器を 6 台（紙の 3 行 × 左右）まで入れて PDF に載るか（様式11の1・11の2 を除く 21 様式・2026-10-20）。
//
// ■ なぜ要るか（2026-10-20 の記入漏れの総点検）
//   21 様式の雛形の測定機器の表は 3 行 × 左右（6 台）あるのに、画面は「測定機器 1・2」の 2 台、
//   ルートは 1 行目の左右だけを描いていた＝3 台目からは書く手段が無かった。
//   ★2・3 行目が空のままでも描かれるピクセルは正常なので、ベースラインでも他の検査でも出ない。
//
// ■ 検査すること
//   1. lib/bekki-device-table.ts（plain）を実際に動かす: 6 行・古い保存は 1 行目の左右（名前に関係なく）・device_table が優先
//   2. pdf-form-helpers の drawShiftedDown を実際に動かす: 収まらなかった報告の位置もずらし、終わったら元に戻す
//      （報告は位置で重複を畳むので、ずらさないと 2・3 行目のあふれが 1 行目と同じ欄として消える）
//   3. 配線: 21 ルートが device_table を 3 行に描く／第1〜8 の画面と共通の画面（第9〜22）が 6 台の入力を出して保存する
//   4. 21 ルートを実際に動かす（tmp/pdf-realistic の payload が土台）:
//      ・印の 6 台: 機器名・型式・製造者名が、出力 PDF の罫線で区切られた「1 行目の下の行・その下の行」に左右そろって載る
//        （行は route の定数ではなく PDF の罫線から測る＝写しを検査しない）
//      ・長い 6 台（機器名 16 字・製造者名 15 字）: 422 にならず全文が 6 回載り、5pt 以上で、文字が行の中に収まる
//      ・2 行目と 3 行目の型式があふれたら、422 に 2 件とも載る
//
// 使い方: node scripts/check-device-rows.mjs [--self-test]
//   ★tmp/pdf-realistic の payload を土台にする（generate-realistic-route-tests.mjs / check-pdf-all --regen）
import { spawnSync } from "child_process"
import fs from "fs"
import path from "path"
import { pathToFileURL } from "url"
import ts from "typescript"
import { runRoutePdf } from "./run-route-pdf.mjs"

const ROOT = process.cwd()
const SELF_TEST = process.argv.includes("--self-test")
const PY = process.platform === "win32" ? "python" : "python3"
// ★自己診断と本番で出力先を分ける（check-pdf-all は両方を並列に走らせる）
const OUT = path.join(ROOT, "tmp", SELF_TEST ? "device-rows-selftest" : "device-rows")
const JOB_DIRS = ["tmp/pdf-test-bekki234", "tmp/pdf-test-bekki5678", "tmp/pdf-test-bekki9to12", "tmp/pdf-test-bekki13to22", "tmp/pdf-test-extra"]
const STEMS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22].map((n) => `bekki${n}_test`)
const STANDALONE_FORMS = ["shokaki-bekki1", "shokasen-bekki2", "sprinkler-bekki3", "water-spray-bekki4", "foam-bekki5", "inert-gas-bekki6", "halogen-bekki7", "powder-bekki8"]
    .map((n) => `src/components/${n}-form.tsx`)
const BASE = "src/components/bekki-result-form-base.tsx"
const INPUTS = "src/components/device-table-inputs.tsx"
const LIB = "src/lib/bekki-device-table.ts"
const HELPERS = "src/lib/pdf-form-helpers.ts"
const LONG = "株式会社サンプル防災機器製作所"   // 15 字（check-device-maker-wrap.mjs と同じ）
const LONG_NAME = "炎感知器用作動試験器（赤外線式）"   // 16 字。★LONG と 2 字以上の共通部分を持たない
const MIN_PT = 5.0
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8")
fs.mkdirSync(OUT, { recursive: true })

async function loadTs(src, name) {
    const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
    const p = path.join(OUT, `${name}.${Date.now()}${Math.random().toString(36).slice(2, 6)}.mjs`)
    fs.writeFileSync(p, js, "utf8")
    return import(pathToFileURL(p).href)
}

// ── 1. lib の振る舞い
function libBehaviour(mod) {
    const problems = []
    const eq = (got, want, label) => { if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`${LIB}: ${label}: ${JSON.stringify(got)}（期待 ${JSON.stringify(want)}）`) }
    const E = { name: "", model: "", calibrated_at: "", maker: "" }
    eq(mod.resolveDeviceTable({}, "plain"), [E, E, E, E, E, E], "空の保存は 6 行の空")
    // 古い保存は 1 行目の左右。★名前があっても空欄の行へ振り分けない（刷り込みの機器名が無い表）
    const legacy = mod.resolveDeviceTable({ device1: { name: "圧力計", model: "A" }, device2: { name: "回転計", maker: "B" } }, "plain")
    eq([legacy[0].name, legacy[3].name, legacy[3].maker], ["圧力計", "回転計", "B"], "古い保存の device1 は左の 1 行目・device2 は右の 1 行目")
    eq(legacy.filter((r) => r.name).length, 2, "古い保存は 2 台のまま")
    const table = Array.from({ length: 6 }, (_, i) => ({ name: `N${i}`, model: `M${i}`, calibrated_at: "", maker: `K${i}` }))
    eq(mod.resolveDeviceTable({ device_table: table, device1: { name: "古い" } }, "plain").map((r) => r.name), table.map((r) => r.name), "device_table があればそれ（古い device1 は読まない）")
    eq(mod.DEVICE_TABLE_ROWS_PER_COLUMN.plain, 3, "1 列 3 行")
    return problems
}

// ── 2. drawShiftedDown の振る舞い
async function helperBehaviour(mod) {
    const problems = []
    const { PDFDocument } = await import("pdf-lib")
    const page = (await PDFDocument.create()).addPage([200, 200])
    const seen = []
    const fit = { report: (text, fits, at) => seen.push(at?.cellTopFromTop) }
    const original = fit.report
    const at = { page: 1, cellX: 10, cellTopFromTop: 100, cellW: 10, cellH: 10 }
    mod.drawShiftedDown(page, 20, () => fit.report("x", 0, at), fit)
    fit.report("x", 0, at)
    if (seen[0] !== 120) problems.push(`${HELPERS}: drawShiftedDown の中の「収まらなかった」報告の位置がずれていない（${seen[0]}・期待 120）`)
    if (seen[1] !== 100 || fit.report !== original) problems.push(`${HELPERS}: drawShiftedDown の後で報告が元に戻っていない`)
    try { mod.drawShiftedDown(page, 20, () => { throw new Error("x") }, fit) } catch { /* 期待どおり */ }
    if (fit.report !== original) problems.push(`${HELPERS}: drawShiftedDown の中で例外が出ると報告が戻らない`)
    return problems
}

// ── 3. 配線
function wiring(files) {
    const problems = []
    for (const stem of STEMS) {
        const route = routeOf(stem)
        const src = files[route]
        if (!/const deviceTable = resolveDeviceTable\(body, "plain"\)/.test(src)) problems.push(`${route}: device_table を読んでいない`)
        const m = src.match(/const DEVICE_ROW_SHIFTS = \[([^\]]*)\]/)
        const shifts = m ? m[1].split(",").map(Number) : []
        if (shifts.length !== 3 || shifts[0] !== 0 || !(shifts[1] > 10 && shifts[2] > shifts[1] + 10)) problems.push(`${route}: 3 行のずらし幅が無い（${m?.[1] ?? "なし"}）`)
        if (!/DEVICE_ROW_SHIFTS\.forEach\(\(shift, r\) => drawShiftedDown\(page\d+, shift, \(\) => \{\n\s*const device1 = deviceTable\[r\]\n\s*const device2 = deviceTable\[DEVICE_TABLE_ROWS_PER_COLUMN\.plain \+ r\]/.test(src)) problems.push(`${route}: 測定機器を 3 行 × 左右に描いていない`)
        if (!/\n\s*\}, fonts\.fit\)\)\n/.test(src)) problems.push(`${route}: drawShiftedDown に fonts.fit を渡していない（2・3 行目のあふれが 1 行目と同じ欄として消える）`)
        if (/body\.device[12]\b/.test(src)) problems.push(`${route}: まだ body.device1/device2 を直接読んでいる`)
    }
    for (const f of STANDALONE_FORMS) {
        const src = files[f]
        if (!src.includes('<DeviceTableInputs kind="plain" rows={deviceTableRows} onChange={updateDeviceTableRow} />')) problems.push(`${f}: 測定機器の入力が 6 台の表でない`)
        if (!src.includes('useState<DeviceTableRow[]>(() => resolveDeviceTable(saved, "plain"))')) problems.push(`${f}: 保存から測定機器の表を読んでいない`)
        if (!/\n\s*device_table: deviceTableRows,\n/.test(src)) problems.push(`${f}: 測定機器の表を保存していない`)
        if (/setDevice1|device1\.name/.test(src)) problems.push(`${f}: まだ「測定機器 1・2」の 2 台で入れている`)
    }
    const base = files[BASE]
    if (!/\n\s*deviceTable = "plain",\n/.test(base)) problems.push(`${BASE}: 測定機器の表の既定が plain でない（第9〜22 が 2 台のまま）`)
    if (!base.includes("<DeviceTableInputs kind={deviceTable} rows={deviceTableRows} onChange={updateDeviceTableRow} />")) problems.push(`${BASE}: 測定機器の入力が表でない`)
    if (!/\n\s*device_table: deviceTableRows,\n/.test(base)) problems.push(`${BASE}: 測定機器の表を保存していない`)
    const inputs = files[INPUTS]
    if (!/const slots = Array\.from\(\{ length: lines \}, \(_, line\) => \[line, perColumn \+ line\]\)\.flat\(\)/.test(inputs)) problems.push(`${INPUTS}: 紙の行ごとに左 → 右で並べていない`)
    if (!/Math\.max\(linesShown, lastFilledLine \+ 1\)/.test(inputs)) problems.push(`${INPUTS}: 入れてある行を隠しうる（古い保存の 2 台目・下書きの復元）`)
    return problems
}

// ── 4. ルートを動かす
const jobs = {}
function routeOf(stem) {
    if (jobs[stem]) return jobs[stem]
    for (const d of JOB_DIRS) {
        const j = path.join(ROOT, d, `${stem}.job.json`)
        if (fs.existsSync(j)) return (jobs[stem] = JSON.parse(fs.readFileSync(j, "utf8")).routePath)
    }
    throw new Error(`${stem} の job が無い（check-pdf-all --regen を走らせること）`)
}
const basePayload = (stem) => JSON.parse(fs.readFileSync(path.join(ROOT, "tmp/pdf-realistic", `${stem}.payload.json`), "utf8"))

const ANALYZE = String.raw`
import fitz, json, sys
marker, pdfs = sys.argv[1], sys.argv[2:]
out = {}
for pdf in pdfs:
    d = fitz.open(pdf)
    res = None
    for pno, p in enumerate(d):
        joined = "".join(p.get_text().split())
        if marker not in joined: continue
        words = [[w[0], w[1], w[2], w[3], w[4]] for w in p.get_text("words")]
        hs = []
        for dr in p.get_drawings():
            for it in dr["items"]:
                if it[0] == "l":
                    a, b = it[1], it[2]
                    if abs(a.y - b.y) < 0.6 and abs(a.x - b.x) > 3: hs.append([(a.y + b.y) / 2, min(a.x, b.x), max(a.x, b.x)])
                elif it[0] == "re":
                    r = it[1]
                    if r.width > 3:
                        if r.height < 1.5: hs.append([(r.y0 + r.y1) / 2, r.x0, r.x1])
                        else: hs += [[r.y0, r.x0, r.x1], [r.y1, r.x0, r.x1]]
        sizes = []
        for b in p.get_text("dict")["blocks"]:
            for l in b.get("lines", []):
                for s in l["spans"]:
                    sizes.append([s["text"].strip(), s["size"]])
        res = {"page": pno, "words": words, "hs": hs, "sizes": sizes, "joined": joined}
        break
    out[pdf] = res
print(json.dumps(out))
`
function analyze(pdfs, marker) {
    const r = spawnSync(PY, ["-c", ANALYZE, marker, ...pdfs], { encoding: "utf8", maxBuffer: 1 << 28 })
    if (r.status !== 0) throw new Error(`PDF を読めない: ${r.stderr}`)
    return JSON.parse(r.stdout.trim().split("\n").pop())
}

/** 語の中心をはさむ横罫線（語の x を横切るもの）＝その語が載っている行 */
function bandOf(hs, w) {
    const cx = (w[0] + w[2]) / 2, cy = (w[1] + w[3]) / 2
    const across = hs.filter(([, x0, x1]) => x0 - 0.5 <= cx && cx <= x1 + 0.5).map(([y]) => y)
    const above = Math.max(...across.filter((y) => y <= cy))
    const below = Math.min(...across.filter((y) => y >= cy))
    return { top: above, bottom: below, cx, cy }
}

const markerTable = () => Array.from({ length: 6 }, (_, i) => ({ name: `QZN${i}`, model: `QZM${i}`, calibrated_at: "", maker: `QZK${i}` }))
const longTable = () => Array.from({ length: 6 }, () => ({ name: LONG_NAME, model: "PG-9000", calibrated_at: "2026-01-31", maker: LONG }))

function judgeMarkers(stem, a) {
    const problems = []
    if (!a) return [`${stem}: 測定機器の印が PDF のどの頁にも無い`]
    const at = {}
    for (let i = 0; i < 6; i++) {
        for (const [f, field] of [["QZN", "機器名"], ["QZM", "型式"], ["QZK", "製造者名"]]) {
            const hits = a.words.filter((w) => w[4].includes(`${f}${i}`))
            if (hits.length !== 1) { problems.push(`${stem}: ${i + 1} 台目の${field}「${f}${i}」が ${hits.length} 回描かれた（1 回のはず）`); continue }
            at[`${f}${i}`] = bandOf(a.hs, hits[0])
        }
    }
    if (problems.length) return problems
    const side = (i) => (i < 3 ? "左" : "右")
    const h0 = at.QZM0.bottom - at.QZM0.top
    for (let r = 0; r < 3; r++) {
        for (const i of [r, 3 + r]) {
            const b = at[`QZM${i}`]
            if (!Number.isFinite(b.top) || !Number.isFinite(b.bottom)) { problems.push(`${stem}: ${side(i)}の ${r + 1} 行目の型式の上下に罫線が無い`); continue }
            if (r > 0) {
                const prev = at[`QZM${i - 1}`]
                if (Math.abs(b.top - prev.bottom) > 1.0) problems.push(`${stem}: ${side(i)}の ${r + 1} 行目が ${r} 行目のすぐ下の行に無い（行 ${b.top.toFixed(1)}〜${b.bottom.toFixed(1)}・${r} 行目 ${prev.top.toFixed(1)}〜${prev.bottom.toFixed(1)}）`)
                const h = b.bottom - b.top
                if (h < h0 * 0.7 || h > h0 * 1.3) problems.push(`${stem}: ${side(i)}の ${r + 1} 行目の行の高さ ${h.toFixed(1)} が 1 行目（${h0.toFixed(1)}）と違いすぎる（表の外に出た）`)
                if (Math.abs(b.cx - at[`QZM${i - r}`].cx) > 2) problems.push(`${stem}: ${side(i)}の ${r + 1} 行目の型式が 1 行目と同じ列に無い`)
            }
            for (const f of ["QZN", "QZK"]) {
                const o = at[`${f}${i}`]
                if (Math.abs(o.top - b.top) > 1.0 || Math.abs(o.bottom - b.bottom) > 1.0) problems.push(`${stem}: ${side(i)}の ${r + 1} 行目の${f === "QZN" ? "機器名" : "製造者名"}が型式と同じ行に無い`)
            }
        }
        const L = at[`QZM${r}`], R = at[`QZM${3 + r}`]
        if (Math.abs(L.top - R.top) > 1.0 || !(R.cx > L.cx + 100)) problems.push(`${stem}: ${r + 1} 行目の右の機器が左と同じ行の右に無い`)
    }
    return problems
}

function judgeLong(stem, a, bands) {
    const problems = []
    if (!a) return [`${stem}: 長い機器名・製造者名が PDF のどの頁にも無い`]
    for (const [v, label] of [[LONG, "製造者名"], [LONG_NAME, "機器名"]]) {
        const n = a.joined.split(v).length - 1
        if (n !== 6) problems.push(`${stem}: 長い${label}（${v.length} 字）が ${n} 回しか全文で載っていない（6 台・6 回のはず）`)
    }
    const small = a.sizes.filter(([t, s]) => t && (LONG.includes(t) || LONG_NAME.includes(t)) && s < MIN_PT - 0.05)
    if (small.length) problems.push(`${stem}: 測定機器が ${MIN_PT}pt 未満（${small.map(([t, s]) => `${t} ${s.toFixed(2)}pt`).join("・")}）`)
    // 文字が行の中に収まる（折り返した行も、行の罫線をまたがない）
    // ★長い値の断片（2 字以上）だけを見る。表の左の「測定機器」の見出しの列の字（機・器）を拾わない
    const fragments = a.words.filter((w) => w[4].length >= 2 && (LONG.includes(w[4]) || LONG_NAME.includes(w[4])) && w[0] >= bands.left - 1)
    if (fragments.length < 12) problems.push(`${stem}: 長い値の断片が表の中に ${fragments.length} 個しか見つからない（12 個以上のはず）`)
    for (const w of fragments) {
        const cy = (w[1] + w[3]) / 2
        if (cy < bands.top - 0.5 || cy > bands.bottom + 0.5) continue   // 表の外（ほかの欄）
        const b = bandOf(a.hs, w)
        const inRow = bands.rows.some(([t, btm]) => Math.abs(b.top - t) <= 1.0 && Math.abs(b.bottom - btm) <= 1.0)
        if (!inRow) problems.push(`${stem}: 「${w[4]}」が測定機器の行の罫線をまたぐ（${b.top.toFixed(1)}〜${b.bottom.toFixed(1)}）`)
    }
    return problems
}

async function routes(stems, routeFor = routeOf, tag = "") {
    const problems = []
    const markerPdfs = {}, longPdfs = {}
    for (const stem of stems) {
        const base = basePayload(stem)
        const strip = { ...base, device1: undefined, device2: undefined }
        const m = path.join(OUT, `${stem}${tag}-markers.pdf`)
        const l = path.join(OUT, `${stem}${tag}-long.pdf`)
        try {
            await runRoutePdf({ routePath: routeFor(stem), payload: { ...strip, device_table: markerTable() }, outPdfPath: m })
            markerPdfs[stem] = m
        } catch (e) { problems.push(`${stem}: 印の 6 台で PDF が出ない（${String(e.message).slice(0, 200)}）`) }
        try {
            await runRoutePdf({ routePath: routeFor(stem), payload: { ...strip, device_table: longTable() }, outPdfPath: l })
            longPdfs[stem] = l
        } catch (e) { problems.push(`${stem}: 長い 6 台で PDF が出ない（${String(e.message).slice(0, 200)}）`) }
    }
    const am = analyze(Object.values(markerPdfs), "QZM0")
    const al = analyze(Object.values(longPdfs), LONG)
    for (const stem of stems) {
        if (!markerPdfs[stem]) continue
        const a = am[markerPdfs[stem]]
        const pm = judgeMarkers(stem, a)
        problems.push(...pm)
        if (pm.length || !longPdfs[stem]) continue
        const rowOf = (i) => { const w = a.words.find((x) => x[4].includes(`QZM${i}`)); const b = bandOf(a.hs, w); return [b.top, b.bottom] }
        const rows = [0, 1, 2].map(rowOf)
        const left = a.words.find((x) => x[4].includes("QZN0"))[0] - 4
        problems.push(...judgeLong(stem, al[longPdfs[stem]], { rows, top: rows[0][0], bottom: rows[2][1], left }))
    }
    return { problems, longPdfs: Object.values(longPdfs) }
}

/** 2 行目と 3 行目の型式があふれたら、422 に 2 件とも載る（報告の位置が 1 行目と同じだと 1 件に畳まれる） */
async function overflowBoth(stem = "bekki17_test", route = routeOf(stem)) {
    const table = markerTable()
    table[1].model = "OVA-" + "8".repeat(60)
    table[2].model = "OVB-" + "9".repeat(60)
    try {
        await runRoutePdf({ routePath: route, payload: { ...basePayload(stem), device1: undefined, device2: undefined, device_table: table }, outPdfPath: path.join(OUT, `${stem}-overflow.pdf`) })
        return [`${stem}: 2・3 行目の型式があふれても 422 にならない`]
    } catch (e) {
        const body = String(e.responseBody ?? "")
        const miss = ["OVA-", "OVB-"].filter((k) => !body.includes(k))
        return miss.length ? [`${stem}: 2・3 行目の型式があふれたのに 422 に ${miss.join("・")} が無い（1 行目と同じ欄として畳まれた）`] : []
    }
}

function overflowScript(pdfs) {
    const r = spawnSync(PY, ["scripts/check-overflow.py", ...pdfs], { encoding: "utf8", maxBuffer: 1 << 26 })
    return r.status === 0 && r.stdout.includes("OVERFLOW_NONE") ? [] : [`check-overflow.py が長い 6 台の PDF ではみ出しを見つけた:\n${r.stdout.slice(-1500)}`]
}

const files = Object.fromEntries([...STANDALONE_FORMS, BASE, INPUTS, ...STEMS.map(routeOf)].map((f) => [f, read(f)]))

async function judgeAll() {
    const problems = []
    problems.push(...libBehaviour(await loadTs(read(LIB), "device-table")))
    problems.push(...await helperBehaviour(await loadTs(read(HELPERS), "pdf-form-helpers")))
    problems.push(...wiring(files))
    const r = await routes(STEMS)
    problems.push(...r.problems)
    problems.push(...await overflowBoth())
    if (r.longPdfs.length) problems.push(...overflowScript(r.longPdfs))
    return problems
}

if (SELF_TEST) {
    const neg = await judgeAll()
    if (neg.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of neg) console.log("   ", p)
        process.exit(1)
    }
    const expectHit = (problems, expect, label) => {
        if (!problems.some((p) => p.includes(expect))) { console.log(`自己診断: ${label} → 検出できない`); for (const p of problems) console.log("   ", p); process.exit(1) }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    // lib: plain の古い保存を名前で振り分ける（11の1 と同じ扱い）に戻す
    const lib = read(LIB)
    const libMut = lib.replace("if (name && anyPrinted) {", "if (name) {")
    if (libMut === lib) { console.log("自己診断: lib を書き換えられない"); process.exit(1) }
    expectHit(libBehaviour(await loadTs(libMut, "device-table-mut")), "古い保存の device1 は左の 1 行目", "古い保存の 2 台目を名前で空欄の行へ振り分ける")
    // helper: 報告の位置をずらさない
    const hp = read(HELPERS)
    const hpMut = hp.replace("    if (fit && report) fit.report = (text, fits, at) => report(text, fits, at && { ...at, cellTopFromTop: at.cellTopFromTop + dy })\n", "")
    if (hpMut === hp) { console.log("自己診断: helper を書き換えられない"); process.exit(1) }
    expectHit(await helperBehaviour(await loadTs(hpMut, "pdf-form-helpers-mut")), "報告の位置がずれていない", "drawShiftedDown が報告の位置をずらさない")
    // 配線
    const f17 = routeOf("bekki17_test")
    const wMut = (file, from, to) => { const m = { ...files, [file]: files[file].replace(from, to) }; if (m[file] === files[file]) { console.log(`自己診断: 書き換えられない: ${file}`); process.exit(1) } return wiring(m) }
    expectHit(wMut(f17, "}, fonts.fit))", "}))"), "fonts.fit を渡していない", "ルートが fonts.fit を渡さない")
    expectHit(wMut(STANDALONE_FORMS[0], '<DeviceTableInputs kind="plain" rows={deviceTableRows} onChange={updateDeviceTableRow} />', "{null}"), "6 台の表でない", "第1 の画面が 6 台の入力を出さない")
    expectHit(wMut(BASE, 'deviceTable = "plain",', "deviceTable,"), "既定が plain でない", "共通の画面の既定を外す")
    expectHit(wMut(INPUTS, "Math.max(linesShown, lastFilledLine + 1)", "linesShown"), "入れてある行を隠しうる", "入れてある行を隠す")
    // ルート: ずらし幅を 0 にする（3 行とも 1 行目に重なる）・1 行飛ばす
    const src17 = read(f17)
    const shifts = src17.match(/const DEVICE_ROW_SHIFTS = \[([^\]]*)\]/)[1]
    const [, s1, s2] = shifts.split(",").map(Number)
    for (const [label, to, expect] of [
        ["2・3 行目を 1 行目に重ねる", "0, 0, 0", "2 行目が 1 行目のすぐ下の行に無い"],
        ["1 行飛ばして描く", `0, ${s2}, ${s1 + s2}`, "すぐ下の行に無い"],
    ]) {
        const dir = path.join(OUT, "mut-route")
        fs.mkdirSync(dir, { recursive: true })
        const p = path.join(dir, `route-${to.replace(/[^0-9]/g, "_")}.ts`)
        fs.writeFileSync(p, src17.replace(`const DEVICE_ROW_SHIFTS = [${shifts}]`, `const DEVICE_ROW_SHIFTS = [${to}]`), "utf8")
        const r = await routes(["bekki17_test"], () => path.relative(ROOT, p), `-mut${to.replace(/[^0-9]/g, "_")}`)
        expectHit(r.problems, expect, label)
    }
    // ルート: fonts.fit を渡さない → 2・3 行目のあふれが 1 件に畳まれる
    {
        const p = path.join(OUT, "mut-route", "route-nofit.ts")
        fs.writeFileSync(p, src17.replace("}, fonts.fit))", "}))"), "utf8")
        expectHit(await overflowBoth("bekki17_test", path.relative(ROOT, p)), "1 行目と同じ欄として畳まれた", "ルートが fonts.fit を渡さずに描く（422 の件数）")
    }
    console.log("  陰性対照: lib・drawShiftedDown・配線（21 ルート・第1〜8・共通の画面）・21 様式の印の 6 台と長い 6 台・2/3 行目のあふれ")
    console.log("SELF_TEST_OK")
    process.exit(0)
}

for (const stem of STEMS) {
    if (!fs.existsSync(path.join(ROOT, "tmp/pdf-realistic", `${stem}.payload.json`))) {
        console.log(`★NG: tmp/pdf-realistic/${stem}.payload.json が無い（generate-realistic-route-tests.mjs を走らせること）`)
        process.exit(1)
    }
}
const problems = await judgeAll()
console.log("測定機器 6 台（3 行 × 左右）を検査: 21 様式の lib・配線・PDF の行と列・長い値・あふれの報告")
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("DEVICE_ROWS_OK")
