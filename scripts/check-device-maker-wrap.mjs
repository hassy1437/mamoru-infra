// 測定機器の製造者名（と別記11/22 の点検設備の製造者名）が、ありそうな長さで PDF を止めず、5pt 未満に縮まないこと（2026-10-07）。
//
// ■ なぜ要るか（2026-10-07 実測・製造者名 15 字「株式会社サンプル防災機器製作所」）
//   ・別記1/14/17/18/19/21/22 は 3.5pt でも 1 行に入らず切り詰め＝422 で PDF が出なかった（一括出力・納品も止まる）
//   ・別記2/3/4/11の1/15/16/20 は 1 行のまま 3.5〜4pt まで縮んでいた
//   欄の高さには 2 行入る。各様式の 1 行の描き方は残し、1 行で 5pt を割るときだけ折り返す（drawOrWrapWhenTiny）。
//   ★#22（check-small-font-wrap.mjs）は社名など 4 様式の欄だけで、測定機器の製造者名は見ていなかった。
//
// ■ 検査すること（測定機器のある全様式・実際に PDF を作って測る）
//   1. 長い製造者名: 200 で PDF が出る・全文が載る（欄の数だけ）・測定機器の製造者名は 5pt 以上
//      ★別記11/22 の点検設備の製造者名（extra_fields の *_maker）は欄がもっと狭く（別記22 の空中線は 36.48×18pt）、
//        15 字は 5pt では 3 行に入らない（物理的な限界）。PDF が出て全文が載り、折り返しの下限 4.5pt を守ることだけ見る
//   2. 短い製造者名（現実値のまま）: 200 で、1 行で描かれる（収まる値の見た目を変えない）
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
function withMakers(payload, value, extraValue = value) {
    const p = structuredClone(payload)
    let n = 0, x = 0
    for (const k of ["device1", "device2"]) { p[k] = { ...(p[k] ?? {}), name: p[k]?.name || "圧力計", maker: value }; n++ }
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
        const long = withMakers(f.payload, LONG, LONG_EXTRA)
        const outLong = path.join(OUT, `${f.stem}_long.pdf`)
        const r = await render(routeOf(f), long.payload, outLong)
        if (r.status !== 200) {
            problems.push(`${f.stem}: 製造者名 ${LONG.length} 字で ${r.status}（PDF が出ない）${(r.body ?? "").slice(0, 120)}`)
            continue
        }
        const m = measure(outLong, LONG)
        if (m.full < long.fields) problems.push(`${f.stem}: 測定機器の製造者名 ${long.fields} 欄のうち全文が載ったのは ${m.full} 欄`)
        if (m.min !== null && m.min < MIN_PT) problems.push(`${f.stem}: 測定機器の製造者名が ${m.min}pt（${MIN_PT}pt 未満）`)
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
    console.log("  陰性対照: 別記15/17 の現状で、長い製造者名は 5pt 以上・全文、短い製造者名は 1 行")
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const list = forms()
const problems = await inspect(list)
console.log(`測定機器の製造者名を検査: ${list.length} 様式 × 長い値（${LONG.length} 字）・短い値`)
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("DEVICE_MAKER_WRAP_OK")
