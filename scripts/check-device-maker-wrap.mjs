// 測定機器の製造者名・機器名（と別記11/22 の点検設備の製造者名）が、ありそうな長さで PDF を止めず、5pt 未満に縮まないこと（2026-10-07）。
//
// ■ なぜ要るか（2026-10-07 実測・製造者名 15 字「株式会社サンプル防災機器製作所」）
//   ・別記1/14/17/18/19/21/22 は 3.5pt でも 1 行に入らず切り詰め＝422 で PDF が出なかった（一括出力・納品も止まる）
//   ・別記2/3/4/11の1/15/16/20 は 1 行のまま 3.5〜4pt まで縮んでいた
//   欄の高さには 2 行入る。各様式の 1 行の描き方は残し、1 行で 5pt を割るときだけ折り返す（drawOrWrapWhenTiny）。
//   ★#22（check-small-font-wrap.mjs）は社名など 4 様式の欄だけで、測定機器の製造者名は見ていなかった。
//   ★機器名も同じだった（16 字「炎感知器用作動試験器（赤外線式）」で 19 様式が 422・10 字「煙感知器用感度試験器」で 4.2〜5.4pt）
//
// ■ 検査すること（測定機器のある全様式・実際に PDF を作って測る）
//   1. 長い製造者名: 200 で PDF が出る・全文が載る（欄の数だけ）・測定機器の製造者名は 5pt 以上
//      ★別記11/22 の点検設備の製造者名（extra_fields の *_maker）は欄がもっと狭く（別記22 の空中線は 36.48×18pt）、
//        15 字は 5pt では 3 行に入らない（物理的な限界）。PDF が出て全文が載り、折り返しの下限 4.5pt を守ることだけ見る
//   2. 短い製造者名（現実値のまま）: 200 で、1 行で描かれる（収まる値の見た目を変えない）
//   3. 長い製造者名・機器名を 2 行にしたとき、字が測定機器の行の上下の罫線の間に収まる（罫線は雛形から測る）
//      ★2026-10-09 の本番の印字テストで、別記9・2 の測定機器の欄の定義（649／14）が上の罫線にかかっていて、
//        2 行にした 1 行目が罫線に触れた。1 行の値は真ん中に置くので、短い値では出ない
//
// 使い方: node scripts/check-device-maker-wrap.mjs [--self-test]
//   ★tmp/pdf-realistic の payload を土台にする（generate-realistic-route-tests.mjs / check-pdf-all --regen）
import { spawnSync } from "child_process"
import fs from "fs"
import path from "path"
import { runRoutePdf } from "./run-route-pdf.mjs"

const PY = process.platform === "win32" ? "python" : "python3"
const SELF_TEST = process.argv.includes("--self-test")
// ★自己診断と本番で出力先を分ける（check-pdf-all は両方を並列に走らせる）
const OUT = path.join("tmp", SELF_TEST ? "device-maker-wrap-selftest" : "device-maker-wrap")
const LONG = "株式会社サンプル防災機器製作所"   // 15 字（実在しない一般的な形）
const LONG_NAME = "炎感知器用作動試験器（赤外線式）"   // 機器名 16 字。★LONG・LONG_EXTRA と 2 字以上の共通部分を持たない
const LONG_EXTRA = "近畿電波通信機材販売協同組合"   // 点検設備の製造者名（14 字）。★LONG と 2 字以上の共通部分を持たない（折り返した行を取り違えない）
const MIN_PT = 5.0
const MIN_PT_EXTRA = 4.5   // WRAPPED_FIT_DEFAULTS.minFontSize
const JOB_DIRS = ["tmp/pdf-test-bekki234", "tmp/pdf-test-bekki5678", "tmp/pdf-test-bekki9to12", "tmp/pdf-test-bekki13to22", "tmp/pdf-test-extra"]

/** 測定機器のある様式: { stem, route, payload } */
function forms() {
    const out = []
    for (const d of JOB_DIRS) {
        if (!fs.existsSync(d)) continue
        for (const f of fs.readdirSync(d).filter((f) => f.endsWith(".job.json"))) {
            const stem = f.replace(".job.json", "")
            const real = `tmp/pdf-realistic/${stem}.payload.json`
            if (!fs.existsSync(real)) continue
            const payload = JSON.parse(fs.readFileSync(real, "utf8"))
            if (!payload.device1 && !payload.device2) continue
            out.push({ stem, route: JSON.parse(fs.readFileSync(path.join(d, f), "utf8")).routePath, payload })
        }
    }
    return out
}

/** 製造者名の欄（測定機器 2 つ・extra_fields の *_maker）に値を入れ、入れた欄の数を返す */
function withMakers(payload, value, extraValue = value, nameValue = null) {
    const p = structuredClone(payload)
    let n = 0, x = 0
    for (const k of ["device1", "device2"]) { p[k] = { ...(p[k] ?? {}), name: nameValue ?? (p[k]?.name || "圧力計"), maker: value }; n++ }
    if (p.extra_fields) for (const k of Object.keys(p.extra_fields)) if (k.endsWith("_maker")) { p.extra_fields[k] = extraValue; x++ }
    return { payload: p, fields: n, extraFields: x }
}

const MEASURE = String.raw`
import fitz, json, sys
pdf, value = sys.argv[1], sys.argv[2]
d = fitz.open(pdf)
full = 0; sizes = []; lines = 0
for page in d:
    full += "".join(page.get_text().split()).count(value)
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                t = s["text"].strip()
                if t and ("Noto" in s["font"] or "Helvetica" in s["font"]) and len(t) >= 2 and t in value:
                    sizes.append(round(s["size"], 2)); lines += 1
print(json.dumps({"full": full, "min": min(sizes) if sizes else None, "lines": lines}))
`

// 長い値の字のかたまりが、雛形の行（上下の横罫線の間）に収まるか。字の枠からインクの目安を出す（上 12%・下 30% は字の外の余白）
const BAND = String.raw`
import fitz, json, sys
pdf, tpl, values = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])
od, td = fitz.open(pdf), fitz.open(tpl)
bad = []
for pi in range(od.page_count):
    spans = [s for b in od[pi].get_text("dict")["blocks"] for l in b.get("lines", []) for s in l["spans"]
             if len(s["text"].strip()) >= 2 and any(s["text"].strip() in v for v in values)]
    if not spans: continue
    tp = td[min(pi, td.page_count - 1)]
    rules = [it[1] for dr in tp.get_drawings() for it in dr["items"] if it[0] == "re" and it[1].height < 1.3 and it[1].width > 20]
    # 同じ列（x）で、縦に続く行（間が 3pt 以下）だけを 1 つのかたまりにする（別記11 の表は同じ列に複数の機器が並ぶ）
    cols = {}
    for s in spans: cols.setdefault(round(s["bbox"][0] / 20), []).append(s)
    groups = []
    for c in cols.values():
        c.sort(key=lambda s: s["bbox"][1])
        cur = [c[0]]
        for s in c[1:]:
            if s["bbox"][1] - max(t["bbox"][3] for t in cur) > 3 - s["size"] * 0.42: groups.append(cur); cur = [s]
            else: cur.append(s)
        groups.append(cur)
    for g in groups:
        x = (g[0]["bbox"][0] + g[0]["bbox"][2]) / 2
        top = min(s["bbox"][1] + s["size"] * 0.12 for s in g); bot = max(s["bbox"][3] - s["size"] * 0.3 for s in g)
        mid = (top + bot) / 2
        col = [r for r in rules if r.x0 <= x <= r.x1]
        above = [r.y1 for r in col if r.y1 <= mid]; below = [r.y0 for r in col if r.y0 >= mid]
        if above and top < max(above) - 0.05: bad.append(f"p{pi+1} x{x:.0f}: 字の上 {top:.2f} が上の罫線 {max(above):.2f} にかかる")
        if below and bot > min(below) + 0.05: bad.append(f"p{pi+1} x{x:.0f}: 字の下 {bot:.2f} が下の罫線 {min(below):.2f} にかかる")
print(json.dumps(bad, ensure_ascii=False))
`

function bandCheck(pdf, stem, values) {
    const tpl = path.join("public", "PDF", `s50_kokuji14_${stem.split("__")[0].replace("_test", "")}.pdf`)
    const r = spawnSync(PY, ["-c", BAND, pdf, tpl, JSON.stringify(values)], { encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } })
    if (r.status !== 0) throw new Error(`罫線を測れない: ${r.stderr}`)
    return JSON.parse(r.stdout.trim().split(/\r?\n/).pop())
}

async function render(route, payload, out) {
    try {
        await runRoutePdf({ routePath: route, payload, outPdfPath: out })
        return { status: 200 }
    } catch (e) {
        if (!e.status) throw e
        return { status: e.status, body: e.responseBody }
    }
}

function measure(pdf, value) {
    const r = spawnSync(PY, ["-c", MEASURE, pdf, value], { encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } })
    if (r.status !== 0) throw new Error(`測れない: ${r.stderr}`)
    return JSON.parse(r.stdout.trim().split("\n").pop())
}

async function inspect(list, routeOf = (f) => f.route) {
    fs.mkdirSync(OUT, { recursive: true })
    const problems = []
    for (const f of list) {
        const long = withMakers(f.payload, LONG, LONG_EXTRA, LONG_NAME)
        const outLong = path.join(OUT, `${f.stem}_long.pdf`)
        const r = await render(routeOf(f), long.payload, outLong)
        if (r.status !== 200) {
            problems.push(`${f.stem}: 長い値（製造者名 ${LONG.length} 字・機器名 ${LONG_NAME.length} 字）で ${r.status}（PDF が出ない）${(r.body ?? "").slice(0, 120)}`)
            continue
        }
        const m = measure(outLong, LONG)
        if (m.full < long.fields) problems.push(`${f.stem}: 測定機器の製造者名 ${long.fields} 欄のうち全文が載ったのは ${m.full} 欄`)
        if (m.min !== null && m.min < MIN_PT) problems.push(`${f.stem}: 測定機器の製造者名が ${m.min}pt（${MIN_PT}pt 未満）`)
        const mn = measure(outLong, LONG_NAME)
        if (mn.full < long.fields) problems.push(`${f.stem}: 測定機器の機器名 ${long.fields} 欄のうち全文が載ったのは ${mn.full} 欄`)
        if (mn.min !== null && mn.min < MIN_PT) problems.push(`${f.stem}: 測定機器の機器名が ${mn.min}pt（${MIN_PT}pt 未満）`)
        for (const b of bandCheck(outLong, f.stem, [LONG, LONG_NAME])) problems.push(`${f.stem}: 測定機器の欄で罫線の外にはみ出す（${b}）`)
        if (long.extraFields) {
            const mx = measure(outLong, LONG_EXTRA)
            if (mx.full < long.extraFields) problems.push(`${f.stem}: 点検設備の製造者名 ${long.extraFields} 欄のうち全文が載ったのは ${mx.full} 欄`)
            if (mx.min !== null && mx.min < MIN_PT_EXTRA) problems.push(`${f.stem}: 点検設備の製造者名が ${mx.min}pt（${MIN_PT_EXTRA}pt 未満）`)
        }
        // 短い値（現実値の製造者名）: 1 行のまま
        const shortVal = f.payload.device1?.maker || "計測器製作所"
        const short = withMakers(f.payload, shortVal)
        const outShort = path.join(OUT, `${f.stem}_short.pdf`)
        const rs = await render(routeOf(f), short.payload, outShort)
        if (rs.status !== 200) { problems.push(`${f.stem}: 短い製造者名「${shortVal}」で ${rs.status}`); continue }
        const ms = measure(outShort, shortVal)
        const shortFields = short.fields + short.extraFields
        if (ms.full < shortFields) problems.push(`${f.stem}: 短い製造者名「${shortVal}」が ${shortFields} 欄のうち ${ms.full} 欄しか載っていない`)
        if (ms.lines > shortFields) problems.push(`${f.stem}: 短い製造者名「${shortVal}」が折り返された（${ms.lines} 行・${shortFields} 欄）＝収まる値の見た目が変わる`)
    }
    return problems
}

if (SELF_TEST) {
    // 陰性対照: 代表 2 様式（drawInCell 型の別記17・drawDeviceMaker 型の別記15）は現状で通る
    const pick = forms().filter((f) => ["bekki17_test", "bekki15_test"].includes(f.stem))
    if (pick.length !== 2) { console.log("自己診断: 代表の様式（別記15/17）の payload が無い"); process.exit(2) }
    const neg = await inspect(pick)
    if (neg.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of neg) console.log("   ", p)
        process.exit(1)
    }
    // 陽性対照: 折り返しを止めた共有部品（drawOrWrapWhenTiny が常に 1 行で描く）に差し替えると、両方とも落ちる
    const libSrc = fs.readFileSync("src/lib/pdf-form-helpers.ts", "utf8")
    const marker = "    if (wrapGivesLargerSize(single, wrapped.size)) {\n        drawWrappedTextInCell({\n            page: args.page, pageHeight: args.pageHeight, fonts: args.fonts, text: value,"
    const lf = libSrc.replace(/\r\n/g, "\n")
    if (!lf.includes(marker)) { console.log("自己診断: drawOrWrapWhenTiny の分岐が見つからない（陽性対照を作れない）"); process.exit(2) }
    const mutDir = path.join(OUT, "mut")
    fs.mkdirSync(mutDir, { recursive: true })
    fs.writeFileSync(path.join(mutDir, "pdf-form-helpers.mut.ts"),
        lf.replace(marker, marker.replace("if (wrapGivesLargerSize(single, wrapped.size)) {", "if (false && wrapGivesLargerSize(single, wrapped.size)) {"))
            .replace('from "./pdf-fit-report"', 'from "@/lib/pdf-fit-report"'), "utf8")
    const routeOf = (f) => {
        const p = path.join(mutDir, `${f.stem}.route.ts`)
        fs.writeFileSync(p, fs.readFileSync(f.route, "utf8").replace('from "@/lib/pdf-form-helpers"', 'from "./pdf-form-helpers.mut"'), "utf8")
        return p
    }
    const pos = await inspect(pick, routeOf)
    for (const stem of ["bekki17_test", "bekki15_test"]) {
        if (!pos.some((p) => p.startsWith(stem))) {
            console.log(`自己診断: 折り返しを止めても ${stem} で検出できない`)
            for (const p of pos) console.log("   ", p)
            process.exit(1)
        }
        console.log(`  陽性対照: 折り返しを止める → ${pos.find((p) => p.startsWith(stem))}`)
    }
    // 陽性対照 2: 別記9 の測定機器の欄を直す前の定義（649／14・上の罫線にかかる）に戻すと、罫線の外として落ちる
    const b9 = forms().find((f) => f.stem === "bekki9_test")
    const b9src = fs.readFileSync(b9.route, "utf8")
    if (!b9src.includes("const DEV_ROW = { top: 650.88, h: 20.04 }")) { console.log("自己診断: 別記9 の測定機器の欄の定義が見つからない"); process.exit(2) }
    if ((await inspect([b9])).length) { console.log("自己診断: 別記9 の現状が既にNG"); process.exit(1) }
    const b9mut = path.join(mutDir, "bekki9.devrow.route.ts")
    fs.writeFileSync(b9mut, b9src.replace("const DEV_ROW = { top: 650.88, h: 20.04 }", "const DEV_ROW = { top: 649, h: 14 }"), "utf8")
    const pos2 = await inspect([b9], () => b9mut)
    if (!pos2.some((p) => p.includes("罫線の外"))) { console.log("自己診断: 別記9 の欄を上の罫線にかかる定義に戻しても検出できない"); for (const p of pos2) console.log("   ", p); process.exit(1) }
    console.log(`  陽性対照: 別記9 の欄を直す前の定義に戻す → ${pos2.find((p) => p.includes("罫線の外"))}`)
    console.log("  陰性対照: 別記15/17/9 の現状で、長い製造者名・機器名は 5pt 以上・全文・罫線の内側、短い製造者名は 1 行")
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const list = forms()
const problems = await inspect(list)
console.log(`測定機器の製造者名・機器名を検査: ${list.length} 様式 × 長い値（製造者名 ${LONG.length} 字・機器名 ${LONG_NAME.length} 字）・短い値`)
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("DEVICE_MAKER_WRAP_OK")
