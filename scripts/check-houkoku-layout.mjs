// 報告書（様式第1）の値の置き場所を、実際に描いた PDF で測る（2026-10-07）。
//
// ■ なぜ要るか（2026-10-06 の印字テスト）
//   ・届出者の住所・氏名が、記入用の下線の右端（513.48）を越えて 528.5 まで描かれていた
//     （右の縦罫線 531.0 を基準に幅を決めていたため）。
//   ・所在地・名称・用途が高さ 34.5pt の欄の上の罫線に張りつき、欄の中央にある刷り込みラベルと段がずれていた。
//   ★報告書はどちらも別記用の検査（行ラベル・○の位置など）の外にあり、ピクセルの比較でも
//     「前と同じ」なら通ってしまう。
//
// ■ 検査すること（罫線・下線は雛形 public/PDF/bekki_houkoku.pdf から毎回測る。数値の写しは持たない）
//   1. 届出者の住所・氏名・電話番号: 描いた文字の右端が、その行の下線の右端を越えない（長い値で満杯にして見る）
//   2. 所在地・名称・用途: 値のかたまりの縦の中心が、欄（上下の横罫線）の中心から 2pt 以内（1 行・2 行の両方）
//   3. 宛名（2026-10-19・★2026-10-20 に刷り込みの行へ移した・録音 102）: 刷り込み「消防長（消防署長）（市町村長）」を
//      白で覆い、その行に描く。右端が「殿」の左端より 2pt 以上手前・7pt 以上の大きさ。★宛名が空なら覆わない（手書き用）
//      画面の上限（lib/soukatsu-cover.ts の FIRE_DEPARTMENT_NAME_MAX）いっぱいの全角で描いて測る
//
// 使い方: node scripts/check-houkoku-layout.mjs [--self-test]
import { spawnSync } from "child_process"
import fs from "fs"
import path from "path"
import { runRoutePdf } from "./run-route-pdf.mjs"

const PY = process.platform === "win32" ? "python" : "python3"
const ROUTE = "src/app/api/generate-pdf/route.ts"
const SELF_TEST = process.argv.includes("--self-test")
const OUT = path.join("tmp", SELF_TEST ? "houkoku-layout-selftest" : "houkoku-layout")
const COVER_LIB = "src/lib/soukatsu-cover.ts"
const NAME_MAX = Number(fs.readFileSync(COVER_LIB, "utf8").match(/FIRE_DEPARTMENT_NAME_MAX\s*=\s*(\d+)/)?.[1])
if (!NAME_MAX) throw new Error(`${COVER_LIB} に FIRE_DEPARTMENT_NAME_MAX が見つからない`)

const BASE = {
    report_date: "2026-10-07",
    // ★名前＋敬称（2026-10-20・録音 102・lib/soukatsu-cover.ts）
    fire_department_name: "大阪市北消防署長",
    notifier_phone: "06-1234-5678（内線204）",
    building_usage: "(1)イ",
    floor_above: "10",
    floor_below: "2",
    total_floor_area: "12000",
    equipment_types: ["消火器", "自動火災報知設備"],
}
// 1 行で収まる値と、満杯（下線いっぱいまで縮む）／2 行に折り返す値
const CASES = [
    ["短い値", { ...BASE, notifier_address: "大阪市北区梅田1-1-1", notifier_name: "検証防災株式会社", building_address: "大阪市北区梅田1-1-1", building_name: "検証ビル" }],
    ["長い値", { ...BASE,
        notifier_address: "大阪府大阪市北区梅田三丁目一番一号グランフロント大阪タワーＡ二十階",
        notifier_name: "特定非営利活動法人サンプル防火対象物管理組合連合会 理事長 山田太郎",
        notifier_phone: "06-1234-5678（内線2040）／携帯090-1234-5678（夜間・休日）",
        building_address: "大阪府大阪市北区梅田三丁目一番一号グランフロント大阪タワーＡ二十階から三十階まで全部",
        building_name: "グランフロント大阪タワーＡ北館・南館・うめきた広場",
        // ★画面で入れられるいちばん長い宛名（全角）
        fire_department_name: "消".repeat(NAME_MAX),
    }],
    // ★宛名が空（刷り込みのまま・手書き用）
    ["宛名なし", { ...BASE, notifier_address: "大阪市北区梅田1-1-1", notifier_name: "検証防災株式会社", building_address: "大阪市北区梅田1-1-1", building_name: "検証ビル", fire_department_name: "" }],
]

const MEASURE = String.raw`
import fitz, json, sys
tpl = fitz.open("public/PDF/bekki_houkoku.pdf")[0]
thin = []
for dr in tpl.get_drawings():
    for it in dr["items"]:
        if it[0] == "re" and it[1].height < 1.2:
            thin.append(it[1])
# 届出者の下線（ラベル「住 所」等の下・x0≈262）と、防火対象物の欄の横罫線（右端 531 まで）
underlines = sorted([r for r in thin if 140 < r.y0 < 200 and 255 < r.x0 < 270], key=lambda r: r.y0)
rules = sorted({round(r.y0, 1) for r in thin if 250 < r.y0 < 400 and r.x1 > 530})
tpl_spans = {(round(s["bbox"][0], 1), round(s["bbox"][1], 1)) for b in tpl.get_text("dict")["blocks"] for l in b.get("lines", []) for s in l["spans"]}
out = fitz.open(sys.argv[1])[0]
spans = [s for b in out.get_text("dict")["blocks"] for l in b.get("lines", []) for s in l["spans"]
         if s["text"].strip() and (round(s["bbox"][0], 1), round(s["bbox"][1], 1)) not in tpl_spans]
# 行の数。★同じ行でも和文と英数字（別のフォント）で上端が 1pt ほど違うので、4pt 以内は同じ行とみなす
def lines_of(cell):
    ys = sorted(s["bbox"][1] for s in cell)
    return 1 + sum(1 for a, b in zip(ys, ys[1:]) if b - a > 4)
res = {"underlines": [], "cells": []}
# 宛名（2026-10-20・録音 102）: 刷り込み「消防長（消防署長）（市町村長）」の行に描き、刷り込みは白で覆う。「殿」は残す
# ★雛形の文字は取り出すと化ける（ToUnicode が無い）ので、文字ではなく位置で見つける: 宛名の行の刷り込みの左＝敬称、右＝「殿」
#   ★span は行ひとまとまり（先頭の空白から「殿」まで）なので、語（words）で分ける
tline = sorted([w for w in tpl.get_text("words") if 104 < (w[1] + w[3]) / 2 < 124 and w[0] < 300], key=lambda w: w[0])
pb = tuple(tline[0][:4]) if len(tline) >= 2 else None
tono_left = round(tline[-1][0], 2) if len(tline) >= 2 else 0
line = [s for s in spans if 104 < (s["bbox"][1] + s["bbox"][3]) / 2 < 124 and s["bbox"][0] < 268]
res["name"] = {"right": round(max((s["bbox"][2] for s in line), default=0), 2),
               "size": round(min((s["size"] for s in line), default=0), 2),
               "text": "".join(s["text"] for s in line)[:12]}
res["tonoLeft"] = tono_left
# 白で覆っているか（塗りが白の矩形が刷り込みの文字の範囲をすべて含む）
covered = False
if pb:
    for dr in out.get_drawings():
        fill = dr.get("fill")
        if fill and all(c > 0.99 for c in fill):
            r = dr["rect"]
            if r.x0 <= pb[0] + 0.5 and r.y0 <= pb[1] + 0.5 and r.x1 >= pb[2] - 0.5 and r.y1 >= pb[3] - 0.5:
                covered = True
res["covered"] = covered
res["printedFound"] = bool(pb)
for u in underlines:
    row = [s for s in spans if s["bbox"][0] > 311 and u.y0 - 16 < s["bbox"][3] < u.y0 + 3]
    res["underlines"].append({"y": round(u.y0, 2), "end": round(u.x1, 2),
                              "right": round(max((s["bbox"][2] for s in row), default=0), 2),
                              "text": "".join(s["text"] for s in row)[:20]})
for top, bottom in zip(rules[:3], rules[1:4]):
    cell = [s for s in spans if 140 < s["bbox"][0] < 520 and top < (s["bbox"][1] + s["bbox"][3]) / 2 < bottom]
    if not cell:
        res["cells"].append({"top": top, "bottom": bottom, "center": None}); continue
    y0 = min(s["bbox"][1] for s in cell); y1 = max(s["bbox"][3] for s in cell)
    res["cells"].append({"top": top, "bottom": bottom, "center": round((y0 + y1) / 2, 2),
                         "lines": lines_of(cell), "text": "".join(s["text"] for s in cell)[:20]})
print(json.dumps(res, ensure_ascii=False))
`

async function measure(routePath) {
    fs.mkdirSync(OUT, { recursive: true })
    const problems = []
    for (const [label, payload] of CASES) {
        const pdf = path.join(OUT, `houkoku_${label}.pdf`)
        await runRoutePdf({ routePath, payload, outPdfPath: pdf })
        const r = spawnSync(PY, ["-c", MEASURE, pdf], { encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } })
        if (r.status !== 0) throw new Error(`測れない: ${r.stderr}`)
        const m = JSON.parse(r.stdout.trim().split("\n").pop())
        if (m.underlines.length !== 3) problems.push(`${label}: 届出者の下線が 3 本見つからない（${m.underlines.length} 本）`)
        if (m.cells.length !== 3) problems.push(`${label}: 所在地・名称・用途の欄が 3 つ見つからない（${m.cells.length}）`)
        const names = ["住所", "氏名", "電話番号"]
        m.underlines.forEach((u, i) => {
            if (!u.right) problems.push(`${label}: 届出者の${names[i]}が描かれていない`)
            else if (u.right > u.end + 0.5) problems.push(`${label}: 届出者の${names[i]}が下線の右端 ${u.end} を越えて ${u.right} まで描かれている「${u.text}」`)
        })
        const cellNames = ["所在地", "名称", "用途"]
        m.cells.forEach((c, i) => {
            if (c.center === null) { problems.push(`${label}: ${cellNames[i]}が描かれていない`); return }
            const mid = (c.top + c.bottom) / 2
            if (Math.abs(c.center - mid) > 2) problems.push(`${label}: ${cellNames[i]}（${c.lines} 行）の縦の中心 ${c.center} が欄の中心 ${mid.toFixed(2)} から ${(c.center - mid).toFixed(2)}pt ずれている「${c.text}」`)
        })
        if (!m.printedFound || !m.tonoLeft) problems.push(`${label}: 雛形の宛名の刷り込み（敬称・殿）が見つからない`)
        else if (label === "宛名なし") {
            if (m.covered) problems.push("宛名が空なのに刷り込みを白で覆っている（手書きできない）")
            if (m.name.right) problems.push(`宛名が空なのに宛名の行に何か描いている「${m.name.text}」`)
        } else if (!m.name.right) problems.push(`${label}: 宛名が描かれていない`)
        else {
            if (!m.covered) problems.push(`${label}: 刷り込み「消防長（消防署長）（市町村長）」を白で覆っていない（宛名と重なる）`)
            if (m.name.right > m.tonoLeft - 2) problems.push(`${label}: 宛名の右端 ${m.name.right} が「殿」の左端 ${m.tonoLeft} に重なる・近すぎる「${m.name.text}」`)
            if (m.name.size < 7) problems.push(`${label}: 宛名が ${m.name.size}pt まで縮んでいる（下限 7pt）「${m.name.text}」`)
        }
        if (label === "長い値" && m.cells[0]?.lines !== 2) problems.push(`長い値: 所在地が 2 行に折り返されていない（${m.cells[0]?.lines} 行）＝ 2 行の中央寄せを見られていない`)
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
    const mutants = [
        ["届出者の住所を右の縦罫線まで描く（直す前の幅）", "drawNotifier(toText(body.notifier_address), 151.7, 513.48)", "drawNotifier(toText(body.notifier_address), 151.7, 531.0)", "届出者の住所が下線の右端"],
        ["宛名の幅を決めない（「殿」まで描く）", "draw(fireDepartment, 70.4, ADDRESSEE_BASELINE, 12, FIRE_DEPARTMENT_RIGHT_X - 70.4)", "draw(fireDepartment, 70.4, ADDRESSEE_BASELINE, 12)", "宛名の右端"],
        ["刷り込みを白で覆わない（直す前）", "firstPage.drawRectangle({", "void ({", "白で覆っていない"],
        ["宛名が空でも覆う（手書きできない）", "if (fireDepartment) {", "if (true) {", "宛名が空なのに刷り込みを白で覆っている"],
        ["所在地・名称・用途を上寄せに戻す", 'verticalAlign: "center" | "top" = "center"', 'verticalAlign: "center" | "top" = "top"', "所在地（1 行）の縦の中心"],
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
    console.log("  陰性対照: 短い値・長い値の両方で、届出者は下線の内側・所在地等は欄の中央・宛名は刷り込みを覆って「殿」の手前・宛名なしは刷り込みのまま")
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const problems = await measure(ROUTE)
console.log(`報告書の値の置き場所を検査: 届出者 3 行（下線の右端）・所在地/名称/用途（縦の中央）・宛名（刷り込みを覆い「殿」の手前・全角 ${NAME_MAX} 字・空なら覆わない）× 短い値・長い値・宛名なし`)
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("HOUKOKU_LAYOUT_OK")
