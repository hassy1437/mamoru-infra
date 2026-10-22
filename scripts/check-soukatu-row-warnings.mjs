// 総括表の設備の行で出た警告・エラーが「どの設備の行か」を示すかを、ルートを実際に動かして見る（2026-10-22）。
//
// ■ なぜ要るか
//   総括表の設備の行（設備名・不良内容・措置内容・立会者）は描画位置（CellRef）を渡しておらず、
//   警告は「不良内容」「不良内容（ほか1か所）」とだけ出て、17 行あるうちのどの設備か分からなかった。
//   設備名の欄は英語のキー「name」のまま出ていた。
//   ★PDF は正しく出るので、画像の検査やベースラインでは原理的に出ない種類。
//   ★check-route-mechanisms.py はこの欠けを「未判定」として持っていた（CellRef が呼ばれていない
//     補助関数の型にしか無く、検査が死んだコードで満たされていた）。
//
// ■ 検査すること（すべてルートの応答を見る）
//   1. 4 欄（不良内容・措置内容・立会者・設備名）の警告が、描いた設備の名前で行を示す
//      ★前に「該当なし」の設備を置く（PDF には書かないので、PDF の何行目と payload の何件目がずれる）
//   2. 同じ値が 2 行で出たら、最初の設備＋「ほか1か所」
//   3. 収まらないとき（422）のエラーも、設備の名前で行を示す
//   4. 設備名の欄が英語のキー（name）のまま出ない
//
// 使い方: node scripts/check-soukatu-row-warnings.mjs [--self-test]
import fs from "fs"
import path from "path"
import { runRoutePdf } from "./run-route-pdf.mjs"

const ROUTE = "src/app/api/generate-soukatu-pdf/route.ts"
const SELF_TEST = process.argv.includes("--self-test")
const OUT = path.join("tmp", SELF_TEST ? "soukatu-row-warnings-selftest" : "soukatu-row-warnings")

const BASE = {
    building_name: "検証ビル",
    building_address: "大阪市北区梅田1-1-1",
    building_usage: "(1)イ",
    notifier_name: "検証防災",
    notifier_address: "大阪市北区",
    inspection_type: "機器点検",
}
const long = (n) => "感知器の一部に損傷があり交換が必要である".repeat(30).slice(0, n)
const WITNESS = "山田太郎".repeat(60).slice(0, 150)
const LONG_NAME = "テスト用の長い名前の消防用設備".repeat(6)
const eq = (name, extra = {}) => ({ name, result: "指摘なし", ...extra })

async function run(routePath, name, equipment) {
    const out = path.join(OUT, `${name}.pdf`)
    try {
        const r = await runRoutePdf({ routePath, payload: { ...BASE, equipment_results: equipment }, outPdfPath: out })
        const h = r.headers["x-fit-warnings"]
        const w = h ? JSON.parse(Buffer.from(h, "base64").toString("utf8")) : { items: [], belowMin: [] }
        return { status: 200, shrink: w.items, belowMin: w.belowMin, errors: [] }
    } catch (e) {
        if (!e.status) throw e
        return { status: e.status, shrink: [], belowMin: [], errors: JSON.parse(e.responseBody).items ?? [] }
    }
}

async function measure(routePath) {
    fs.mkdirSync(OUT, { recursive: true })
    const problems = []
    const labels = (items) => JSON.stringify(items.map((i) => i.label))

    // 1) 4 欄。誘導灯は payload の 4 件目・PDF の 3 行目（2 件目が「該当なし」）
    {
        const r = await run(routePath, "columns", [
            eq("消火器"),
            eq("屋内消火栓設備", { result: "該当なし" }),
            eq("自動火災報知設備", { result: "要改善", bad_detail: "変形あり" }),
            eq("誘導灯", { result: "要改善", bad_detail: long(100), action: long(200), witness: WITNESS }),
            eq(LONG_NAME),
        ])
        for (const [field, label] of [["bad_detail", "不良内容"], ["action", "措置内容"], ["witness", "立会者"]]) {
            const hit = r.belowMin.filter((i) => i.field === field)
            if (hit.length !== 1) { problems.push(`${label}: 5pt 未満の警告が 1 件でない（${hit.length} 件・${labels(r.belowMin)}）`); continue }
            if (hit[0].label !== `${label}（「誘導灯」の行）`) problems.push(`${label}: 警告が誘導灯の行を指さない: ${hit[0].label}`)
        }
        const name = r.shrink.filter((i) => i.text === LONG_NAME)
        if (name.length !== 1) problems.push(`設備名: 縮小の警告が 1 件でない（${labels(r.shrink)}）`)
        else {
            if (name[0].field !== "equipment_row_name" || !name[0].label.startsWith("設備名（「")) problems.push(`設備名: 表記が「設備名」でない（英語のキーのまま）: ${name[0].field} / ${name[0].label}`)
            if (name[0].label.length > 40) problems.push(`設備名: 長い設備名がそのまま 2 度並ぶ: ${name[0].label}`)
        }
    }
    // 2) 同じ値が 2 行 → 最初の設備＋「ほか1か所」
    {
        const r = await run(routePath, "same", [
            eq("自動火災報知設備", { result: "要改善", bad_detail: long(100) }),
            eq("誘導灯", { result: "要改善", bad_detail: long(100) }),
        ])
        const hit = r.belowMin.filter((i) => i.field === "bad_detail")
        if (hit.length !== 1 || hit[0].label !== "不良内容（「自動火災報知設備」の行・ほか1か所）") problems.push(`同じ値の 2 行が「自動火災報知設備・ほか1か所」にならない: ${labels(hit)}`)
    }
    // 3) 収まらない（422）
    {
        const r = await run(routePath, "overflow", [
            eq("消火器"),
            eq("屋内消火栓設備", { result: "該当なし" }),
            eq("自動火災報知設備", { result: "要改善", bad_detail: "変形あり" }),
            eq("誘導灯", { result: "要改善", bad_detail: long(300) }),
        ])
        if (r.status !== 422) problems.push(`不良内容 300 字が 422 にならない（${r.status}）`)
        else if (r.errors.length !== 1 || r.errors[0].label !== "不良内容（「誘導灯」の行）") problems.push(`収まらないエラーが誘導灯の行を指さない: ${labels(r.errors)}`)
    }
    return problems
}

/** route の写しを tmp に置いて 1 か所だけ変える（@/ の import は run-route-pdf が src に向ける） */
function mutatedRoute(from, to) {
    const src = fs.readFileSync(ROUTE, "utf8")
    if (!src.includes(from)) throw new Error(`自己診断: 書き換える箇所が route に無い: ${from}`)
    fs.mkdirSync(OUT, { recursive: true })
    const p = path.join(OUT, `route.${Date.now()}.ts`)
    fs.writeFileSync(p, src.split(from).join(to), "utf8")
    return p
}

if (SELF_TEST) {
    const neg = await measure(ROUTE)
    if (neg.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of neg) console.log("   ", p)
        process.exit(1)
    }
    // ★直す前の形に 1 か所ずつ戻す
    const mutants = [
        ["不良内容に行の位置を渡さない（直す前）", ', at: rowAt("bad_detail")', "", "不良内容: 警告が誘導灯の行を指さない"],
        ["行の番号を「該当なし」を飛ばした後の番号にする", "row: allResults.indexOf(item),", "row: rowIndex,", "1 件でない"],
        ["行の見出し（設備名）を渡さない", "rowLabel: normalizeText(item?.name) || undefined,", "", "誘導灯の行を指さない"],
        ["設備名の表記キーを外す（英語の name に戻る）", 'rowAt("name", "equipment_row_name")', 'rowAt("name")', "英語のキーのまま"],
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
    console.log("  陰性対照: 4 欄・同じ値の 2 行・収まらないエラーが、すべて設備の名前で行を示す")
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const problems = await measure(ROUTE)
console.log("総括表の設備の行の警告・エラーを検査: 4 欄（「該当なし」を挟む）・同じ値の 2 行・収まらないエラー")
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("SOUKATU_ROW_WARNINGS_OK")
