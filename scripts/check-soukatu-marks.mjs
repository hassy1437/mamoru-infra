// 総括表の○と日付が、刷り込みの字・罫線に触れていないかを、実際に描いた PDF の画素で測る（2026-10-07）。
//
// ■ なぜ要るか（2026-10-06 の印字テスト・1200dpi 実測）
//   ・点検種別の総合点検の○が 8.1pt 左に寄り「・総合点」を囲んでいた。機器点検の○は左の縦罫線を越えていた
//   ・期間の月「10」が刷り込み「年」に 0.06pt まで寄っていた（月・日を右端そろえにしていたため）
//   ・判定「良」の○が右の刷り込み「・」に 0.06pt まで寄っていた（17 個）
//   ★どれも「重なり」にはならない近さで、重なりの検査（check-printed-overlap）では出ず、
//     ピクセルの比較も「前と同じ」なら通る。
//
// ■ 検査すること（刷り込みの位置は雛形 public/PDF/bekki_soukatu.pdf から毎回測る）
//   1. 期間の年・月・日の数字（1 桁・2 桁の 3 通り）: 左右の刷り込みの字まで 0.8pt 以上
//   2. 判定「良」の○: 右の「・」まで 0.8pt 以上
//   3. 点検種別の○: 横の中心が語（機器点検／総合点検）の中心から 0.6pt 以内・左の縦罫線の内側
//
// 使い方: node scripts/check-soukatu-marks.mjs [--self-test]
import { spawnSync } from "child_process"
import fs from "fs"
import path from "path"
import { runRoutePdf } from "./run-route-pdf.mjs"

const PY = process.platform === "win32" ? "python" : "python3"
const ROUTE = "src/app/api/generate-soukatu-pdf/route.ts"
const SELF_TEST = process.argv.includes("--self-test")
const OUT = path.join("tmp", SELF_TEST ? "soukatu-marks-selftest" : "soukatu-marks")
const MIN_GAP = 0.8

const BASE = {
    building_name: "検証ビル",
    building_address: "大阪市北区梅田1-1-1",
    building_usage: "(1)イ",
    notifier_name: "検証防災",
    notifier_address: "大阪市北区",
    equipment_results: [
        { name: "消火器", result: "指摘なし" },
        { name: "自動火災報知設備", result: "要是正", bad_detail: "感知器の未警戒", action: "増設" },
        { name: "誘導灯", result: "指摘なし" },
    ],
}
// [点検種別, 始め, 終わり]（1 桁・2 桁・「1」で始まる 2 桁）
const CASES = [
    ["機器点検", "2026-10-28", "2026-12-31"],
    ["総合点検", "2026-01-01", "2026-09-09"],
    ["総合点検", "2026-11-11", "2026-10-10"],
]

const MEASURE = String.raw`
import fitz, json, sys
DPI = 1200; Z = DPI / 72
tp = fitz.open("public/PDF/bekki_soukatu.pdf")[0]
op = fitz.open(sys.argv[1])[0]
def grab(page, clip):
    pm = page.get_pixmap(dpi=DPI, clip=clip, colorspace=fitz.csGRAY)
    return pm.width, pm.height, pm.samples
def chars(pred):
    for b in tp.get_text("rawdict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                t = "".join(c["c"] for c in s["chars"])
                if pred(t): yield s
res = {"date": [], "good": [], "type": None}
# 1. 期間の行（刷り込み「年」のある行・左の縦罫線 290.52 より右）
nen = [w for w in tp.get_text("words") if w[4] == "年" and 280 < w[1] < 320]
y0 = min(w[1] for w in nen) - 1; y1 = max(w[3] for w in nen) + 1
clip = fitz.Rect(292, y0, 528, y1)
W, H, T = grab(tp, clip); _, _, O = grab(op, clip)
tcol = [any(T[y*W+x] < 128 for y in range(H)) for x in range(W)]
dcol = [any(O[y*W+x] < 128 and T[y*W+x] >= 128 for y in range(H)) for x in range(W)]
# ★「11」の 1 と 1 はインクが 3.3pt 離れる。かたまりの間には刷り込みの字（約 10pt）があるので 4.5pt まではつなぐ
x = 0; gapjoin = int(4.5 * Z)
while x < W:
    if not dcol[x]: x += 1; continue
    a = x; last = x
    while x < W and (x - last) <= gapjoin:
        if dcol[x]: last = x
        x += 1
    b = last
    l = a - 1
    while l >= 0 and not tcol[l]: l -= 1
    r = b + 1
    while r < W and not tcol[r]: r += 1
    res["date"].append({"x": round(292 + a / Z, 2), "left": None if l < 0 else round((a - l) / Z, 2), "right": None if r >= W else round((r - b) / Z, 2)})
# 2. 判定「良」の○と右の「・」
for s in chars(lambda t: t.startswith("良") and "不良" in t):
    dot = s["chars"][1]["bbox"]
    clip = fitz.Rect(160, s["bbox"][1] - 6, (dot[0] + dot[2]) / 2, s["bbox"][3] + 6)
    W, H, T = grab(tp, clip); _, _, O = grab(op, clip)
    dot_l = min((x for x in range(W) for y in range(H) if 160 + x / Z > dot[0] and T[y*W+x] < 128), default=None)
    ell = [x for x in range(W) for y in range(H) if O[y*W+x] < 128 and T[y*W+x] >= 128]
    if ell and dot_l is not None:
        res["good"].append(round((dot_l - max(ell)) / Z, 2))
# 3. 点検種別の○（1 行目の語の中心と、左の縦罫線）
s = next(chars(lambda t: t.startswith("機器点検")))
cs = s["chars"]
kiki = ((cs[0]["bbox"][0] + cs[3]["bbox"][2]) / 2)
sougou = ((cs[5]["bbox"][0] + cs[8]["bbox"][2]) / 2)
rule = max(it[1].x1 for dr in tp.get_drawings() for it in dr["items"]
           if it[0] == "re" and it[1].width < 1.2 and it[1].height > 20 and 100 < it[1].x0 < cs[0]["bbox"][0] and it[1].y0 < s["bbox"][1] < it[1].y1)
clip = fitz.Rect(rule - 4, s["bbox"][1] - 8, 226, s["bbox"][3] + 8)
W, H, T = grab(tp, clip); _, _, O = grab(op, clip)
xs = [x for x in range(W) for y in range(H) if O[y*W+x] < 128 and T[y*W+x] >= 128]
if xs:
    res["type"] = {"center": round(clip.x0 + (min(xs) + max(xs)) / 2 / Z, 2), "left": round(clip.x0 + min(xs) / Z, 2),
                   "kiki": round(kiki, 2), "sougou": round(sougou, 2), "rule": round(rule, 2)}
print(json.dumps(res, ensure_ascii=False))
`

async function measure(routePath) {
    fs.mkdirSync(OUT, { recursive: true })
    const problems = []
    for (const [type, start, end] of CASES) {
        const label = `${type} ${start}〜${end}`
        const pdf = path.join(OUT, `soukatu_${start}_${end}.pdf`)
        await runRoutePdf({ routePath, payload: { ...BASE, inspection_type: type, inspection_date: start, inspection_period_start: start, inspection_period_end: end }, outPdfPath: pdf })
        const r = spawnSync(PY, ["-c", MEASURE, pdf], { encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } })
        if (r.status !== 0) throw new Error(`測れない: ${r.stderr}`)
        const m = JSON.parse(r.stdout.trim().split("\n").pop())
        // 年・月・日 × 2 = 6 かたまり
        if (m.date.length !== 6) problems.push(`${label}: 期間の数字のかたまりが 6 つでない（${m.date.length}）`)
        for (const d of m.date) {
            for (const side of ["left", "right"]) {
                if (d[side] !== null && d[side] < MIN_GAP) problems.push(`${label}: 期間の数字（x=${d.x}）の${side === "left" ? "左" : "右"}の刷り込みまで ${d[side]}pt（${MIN_GAP}pt 未満）`)
            }
        }
        if (m.good.length !== 2) problems.push(`${label}: 判定「良」の○が 2 個見つからない（${m.good.length}）`)
        for (const g of m.good) if (g < MIN_GAP) problems.push(`${label}: 判定「良」の○から右の「・」まで ${g}pt（${MIN_GAP}pt 未満）`)
        if (!m.type) { problems.push(`${label}: 点検種別の○が描かれていない`); continue }
        const want = type === "機器点検" ? m.type.kiki : m.type.sougou
        if (Math.abs(m.type.center - want) > 0.6) problems.push(`${label}: 点検種別の○の横の中心 ${m.type.center} が語「${type}」の中心 ${want} から ${(m.type.center - want).toFixed(2)}pt ずれている`)
        if (m.type.left <= m.type.rule) problems.push(`${label}: 点検種別の○の左端 ${m.type.left} が左の縦罫線（${m.type.rule}）にかかる`)
    }
    return problems
}

/** route の写しを tmp に置いて 1 か所だけ変える（@/ の import は run-route-pdf が src に向ける） */
function mutatedRoute(from, to) {
    const src = fs.readFileSync(ROUTE, "utf8")
    if (!src.includes(from)) throw new Error(`自己診断: 書き換える箇所が route に無い: ${from}`)
    fs.mkdirSync(OUT, { recursive: true })
    const p = path.join(OUT, `route.${Date.now()}.ts`)
    fs.writeFileSync(p, src.replace(from, to), "utf8")
    return p
}

if (SELF_TEST) {
    const neg = await measure(ROUTE)
    if (neg.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of neg) console.log("   ", p)
        process.exit(1)
    }
    // ★直す前の値に 1 か所ずつ戻す
    const mutants = [
        ["月を右端そろえに戻す（始めの月 367）", "anchors.monthCenter - monthW / 2", "(anchors.monthCenter === (358.76 + 370.22) / 2 ? 367 - monthW : anchors.monthCenter - monthW / 2)", "左の刷り込みまで"],
        ["「良」の○を横 9 に戻す", "isGood ? 8.0 : 13", "isGood ? 9 : 13", "右の「・」まで"],
        ["総合点検の○を x=176 に戻す", "sougou: { cx: (165.73 + 202.46) / 2 }", "sougou: { cx: 176 }", "語「総合点検」の中心"],
        ["機器点検の○を x=136 に戻す", "kiki: { cx: (119.76 + 156.37) / 2 }", "kiki: { cx: 136 }", "語「機器点検」の中心"],
    ]
    for (const [label, from, to, expect] of mutants) {
        const r = await measure(mutatedRoute(from, to))
        if (!r.some((p) => p.includes(expect))) {
            console.log(`自己診断: ${label} → 検出できない`)
            for (const p of r) console.log("   ", p)
            process.exit(1)
        }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    console.log("  陰性対照: 3 通りの期間・2 通りの点検種別で、数字と○が刷り込みから離れ、○が語の中心にある")
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const problems = await measure(ROUTE)
console.log(`総括表の○と日付を画素で検査: 期間 3 通り × 年月日・判定「良」の○・点検種別の○（隙間 ${MIN_GAP}pt 以上）`)
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("SOUKATU_MARKS_OK")
