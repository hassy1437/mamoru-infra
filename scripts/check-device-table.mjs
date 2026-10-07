// 測定機器の表（様式11の1・11の2）で、機器が紙の表の正しい行・列に載るかを検査する。
//
// ■ なぜ要るか（#23・2026-10-05 の通し確認）
//   この2様式は機器名が刷り込んである。以前は「機器名つき2行」を左列・右列の先頭に必ず描き、
//   機器名は描かなかった＝加煙試験器で測っても加熱試験器の行に載り、残りの機器は入力できなかった。
//   ★描かれるピクセル自体は正常なので、ベースラインでも他の検査でも出ない。
//
// ■ 検査すること（★セルは route の定数ではなく、雛形の罫線から測る＝写しを検査しない）
//   1. device_table の 10 行が、それぞれ表の該当セル（行×型式／校正年月日／製造者名）に載る
//   2. 空欄の行だけ機器名を描く。刷り込みの行に名前を入れても描かない
//   3. 古い保存（device1/device2）: 刷り込みの機器名と一致 → その行／一致しない名前 → 空欄の行に名前ごと／
//      名前が空 → 以前と同じ行（左列の先頭・右列の先頭）
//
// 使い方: node scripts/check-device-table.mjs [--self-test]
//   ★tmp/pdf-realistic の payload を土台にする（generate-realistic-route-tests.mjs / check-pdf-all --regen）
import { spawnSync } from "child_process"
import fs from "fs"
import path from "path"
import { runRoutePdf } from "./run-route-pdf.mjs"

const PY = process.platform === "win32" ? "python" : "python3"
// ★自己診断と本番で出力先を分ける（check-pdf-all は両方を並列に走らせ、同じ名前の PDF を書き合うと
//   書きかけを読みうる。check-merged-report-size.mjs は実際にそれで CI だけ落ちた・2026-10-07）
const OUT = path.join("tmp", process.argv.includes("--self-test") ? "device-table-selftest" : "device-table")
fs.mkdirSync(OUT, { recursive: true })

const FORMS = {
    bekki11_1: {
        route: "src/app/api/generate-jidou-kasai-houchi-bekki11-1-pdf/route.ts",
        base: "tmp/pdf-realistic/bekki11_1_test.payload.json",
        template: "public/PDF/s50_kokuji14_bekki11_1.pdf", page: 2,
        printed: ["加熱試験器", "加煙試験器", "外部試験器", "煙感知器用感度試験器", "減光フィルター",
                  "メーターリレー試験器", "炎感知器用作動試験器", null, null, null],
    },
    bekki11_2: {
        route: "src/app/api/generate-gas-leak-fire-alarm-bekki11-2-pdf/route.ts",
        base: "tmp/pdf-realistic/bekki11_2_test.payload.json",
        template: "public/PDF/s50_kokuji14_bekki11_2.pdf", page: 1,
        printed: ["加ガス試験器", null, null, null, null, null, null, null, null, null],
    },
}

/** 雛形の罫線から表のセルを測る: rows[0..4] = [上, 下]、cols[0..1] = {name, model, date, maker} の [左, 右] */
function measureGrid(template, page) {
    const code = String.raw`
import fitz, json, sys
p = fitz.open(sys.argv[1])[int(sys.argv[2])]
acc = {}
xs = set()
for d in p.get_drawings():
    for it in d["items"]:
        if it[0] == "l":
            a, b = it[1], it[2]
            if abs(a.y - b.y) < 0.6 and a.y > 450:
                acc[round(a.y, 1)] = acc.get(round(a.y, 1), 0) + abs(a.x - b.x)
            if abs(a.x - b.x) < 0.6 and max(a.y, b.y) > 560:
                xs.add(round(a.x, 1))
        elif it[0] == "re":
            r = it[1]
            if r.height < 1.5 and r.y0 > 450:
                y = round((r.y0 + r.y1) / 2, 1); acc[y] = acc.get(y, 0) + r.width
            if r.width < 1.5 and r.y1 > 560:
                xs.add(round(r.x0, 1))
ys = sorted(y for y, w in acc.items() if w > 300)
print(json.dumps({"ys": ys, "xs": sorted(xs)}))
`
    const r = spawnSync(PY, ["-c", code, template, String(page)], { encoding: "utf8" })
    if (r.status !== 0) throw new Error(`雛形を測れない: ${r.stderr}`)
    const { ys, xs } = JSON.parse(r.stdout.trim().split("\n").pop())
    const last = ys.slice(-6)   // 表の最後の 6 本＝データ 5 行の上下
    const rows = last.slice(0, 5).map((y, i) => [y, last[i + 1]])
    // 縦罫線: 左列 機器名|型式|校正|製造者| ‖ 右列 機器名|型式|校正|製造者（外枠 64.6 と 80.5 は「測定機器」の見出し列）
    const v = xs.filter((x) => x > 70)
    const col = (a) => ({ name: [v[a], v[a + 1]], model: [v[a + 1], v[a + 2]], date: [v[a + 2], v[a + 3]], maker: [v[a + 3], v[a + 4]] })
    // 中央の二重線（304.7 / 305.6）の右側から右列が始まる
    return { rows, cols: [col(0), col(5)], v }
}

/** PDF の page ページから「語 → 位置」を取る */
function wordsOf(pdf, page) {
    // ★日本語は \u で出す（Windows の標準出力は cp932 で、そのままだと JSON が壊れる）
    const code = "import fitz, json, sys\np = fitz.open(sys.argv[1])[int(sys.argv[2])]\nprint(json.dumps([[w[0], w[1], w[2], w[3], w[4]] for w in p.get_text('words')]))"
    const r = spawnSync(PY, ["-c", code, pdf, String(page)], { encoding: "utf8", maxBuffer: 1 << 24 })
    if (r.status !== 0) throw new Error(`PDF を読めない: ${r.stderr}`)
    return JSON.parse(r.stdout.trim().split("\n").pop())
}

async function render(form, devices, name) {
    const f = FORMS[form]
    const payload = { ...JSON.parse(fs.readFileSync(f.base, "utf8")), device1: undefined, device2: undefined, device_table: undefined, ...devices }
    const out = path.join(OUT, `${name}.pdf`)
    await runRoutePdf({ routePath: f.route, payload, outPdfPath: out })
    return wordsOf(out, f.page)
}

/** text を含む語が、行 row・列 col のセル field に載っているか */
function placedAt(words, grid, text, row, col, field) {
    const hits = words.filter((w) => w[4].includes(text))
    if (hits.length !== 1) return `「${text}」が ${hits.length} 回描かれた（1 回のはず）`
    const [x0, y0, x1, y1] = hits[0]
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
    const [top, bottom] = grid.rows[row]
    const [left, right] = grid.cols[col][field]
    if (cy < top || cy > bottom || cx < left || cx > right) {
        return `「${text}」が 行${row + 1}・${col ? "右" : "左"}列・${field} のセル（x ${left}〜${right}・y ${top}〜${bottom}）の外（中心 ${cx.toFixed(1)}, ${cy.toFixed(1)}）`
    }
    return null
}

async function judge(forms = Object.keys(FORMS)) {
    const problems = []
    for (const form of forms) {
        const f = FORMS[form]
        const grid = measureGrid(f.template, f.page)
        if (grid.rows.length !== 5 || grid.v.length < 10) {
            problems.push(`${form}: 雛形の表を測れない（行 ${grid.rows.length}・縦罫線 ${grid.v.length}）`)
            continue
        }
        // 1・2. device_table の 10 行（刷り込みの行にも名前を入れて、描かれないことを見る）
        const table = f.printed.map((p, i) => ({
            name: p ? `NG${i}` : `FN${i}`, model: `MD${i}`, calibrated_at: "", maker: `MK${i}`,
        }))
        const w1 = await render(form, { device_table: table }, `${form}-table`)
        f.printed.forEach((p, i) => {
            const row = i % 5, col = Math.floor(i / 5)
            for (const [text, field] of [[`MD${i}`, "model"], [`MK${i}`, "maker"]]) {
                const e = placedAt(w1, grid, text, row, col, field)
                if (e) problems.push(`${form} device_table: ${e}`)
            }
            if (p) {
                if (w1.some((w) => w[4].includes(`NG${i}`))) problems.push(`${form} device_table: 刷り込みの行${i + 1}（${p}）に入れた名前を描いた`)
            } else {
                const e = placedAt(w1, grid, `FN${i}`, row, col, "name")
                if (e) problems.push(`${form} device_table: ${e}`)
            }
        })
        // 3. 古い保存
        const firstPrinted2 = f.printed.findIndex((p, i) => p && i > 0)
        const freeRows = f.printed.map((p, i) => (p ? -1 : i)).filter((i) => i >= 0)
        const legacyCases = [
            // 刷り込みの機器名と一致（11の1 は加煙試験器・11の2 は刷り込みが 1 つなので加ガス試験器）
            { d: { device1: { name: f.printed[firstPrinted2 > 0 ? firstPrinted2 : 0], model: "LGA" } }, at: firstPrinted2 > 0 ? firstPrinted2 : 0, label: "一致" },
            // 一致しない名前 → 最初の空欄の行に名前ごと
            { d: { device2: { name: "PRS", model: "LGB" } }, at: freeRows[0], label: "不一致", name: "PRS" },
            // 名前が空 → 以前と同じ行（device1 は左列の先頭・device2 は右列の先頭）
            { d: { device1: { model: "LGC" }, device2: { model: "LGD" } }, at: [0, 5], label: "名前なし" },
        ]
        for (const [k, c] of legacyCases.entries()) {
            const w = await render(form, c.d, `${form}-legacy${k}`)
            const ats = Array.isArray(c.at) ? c.at : [c.at]
            const models = Object.values(c.d).map((d) => d.model)
            ats.forEach((at, j) => {
                const e = placedAt(w, grid, models[j], at % 5, Math.floor(at / 5), "model")
                if (e) problems.push(`${form} 古い保存（${c.label}）: ${e}`)
            })
            if (c.name) {
                const e = placedAt(w, grid, c.name, c.at % 5, Math.floor(c.at / 5), "name")
                if (e) problems.push(`${form} 古い保存（${c.label}）: 機器名 ${e}`)
            }
        }
    }
    return problems
}

if (process.argv.includes("--self-test")) {
    const ok = await judge()
    if (ok.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of ok) console.log("   ", p)
        process.exit(1)
    }
    // 陽性対照: 判定が「隣の行」を拾うか（雛形の 1 行目に載った語を 2 行目として問う）
    const f = FORMS.bekki11_1
    const grid = measureGrid(f.template, f.page)
    const w = wordsOf(path.join(OUT, "bekki11_1-table.pdf"), f.page)
    if (!placedAt(w, grid, "MD0", 1, 0, "model") || !placedAt(w, grid, "MD0", 0, 1, "model") || !placedAt(w, grid, "MD0", 0, 0, "date")) {
        console.log("自己診断: 隣の行・列・欄に載っても検出できない")
        process.exit(1)
    }
    console.log("  陰性対照: 2 様式 × 表 10 行と古い保存 3 通りが、雛形のセルどおりに載る")
    console.log("  陽性対照: 1 行目の型式を「2 行目」「右列」「校正年月日の欄」として問う → すべて外れと判定")
    console.log("SELF_TEST_OK")
    process.exit(0)
}

for (const f of Object.values(FORMS)) {
    if (!fs.existsSync(f.base)) {
        console.log(`★NG: ${f.base} が無い（generate-realistic-route-tests.mjs を走らせること）`)
        process.exit(1)
    }
}
const problems = await judge()
console.log("測定機器の表を検査: 様式11の1・11の2（表 10 行・古い保存 3 通り）")
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("DEVICE_TABLE_OK")
