// 総括表の「不良内容・措置内容・立会者」が、入力から PDF まで届くかを検査する（#28・2026-10-06）。
//
// ■ なぜ要るか
//   ルートは bad_detail / action / witness を描けるのに、画面に入力欄が無く、常に空欄だった。
//   ★空欄は正常なピクセルなので、ベースラインでも他の検査でも出ない。
//
// ■ 検査すること
//   1. 保存前の整理（cleanEquipmentItem）: 空の欄は持たない・要改善でない行の不良内容／措置内容は外す
//   2. 編集の保存（mergeEquipmentDetails）: ★設備名・判定・行の数・順番は DB のまま。3つの欄だけ重なる。
//      画面に無い設備の行は元のまま。DB が配列でなければ null（書かない）
//   3. PDF: 1枚目と2枚目の行に、不良内容 → 措置内容 → 立会者 が左から順に、その行の高さに載る
//
// 使い方: node scripts/check-soukatsu-details.mjs [--self-test]
import { spawnSync } from "child_process"
import fs from "fs"
import path from "path"
import ts from "typescript"
import { pathToFileURL } from "url"
import { runRoutePdf } from "./run-route-pdf.mjs"

const ROOT = process.cwd()
const PY = process.platform === "win32" ? "python" : "python3"

// ★本番の実体を読む（写しを検査しない）
async function loadLib(source) {
    const js = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText
    const out = path.join(ROOT, "tmp", `soukatsu-equipment.${Date.now()}.generated.mjs`)
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, js)
    try {
        return await import(pathToFileURL(out).href)
    } finally {
        fs.rmSync(out, { force: true })
    }
}

function judgeLogic(lib) {
    const problems = []
    const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
    // 1. 整理
    const c1 = lib.cleanEquipmentItem({ name: "消火器", result: "指摘なし", bad_detail: "残り", action: "残り", witness: " 立会 " })
    if (!eq(c1, { name: "消火器", result: "指摘なし", witness: "立会" })) problems.push(`整理: 指摘なしの行に不良内容／措置内容が残る・空白が残る ${JSON.stringify(c1)}`)
    const c2 = lib.cleanEquipmentItem({ name: "誘導灯", result: "要改善", bad_detail: "球切れ", action: "", witness: "" })
    if (!eq(c2, { name: "誘導灯", result: "要改善", bad_detail: "球切れ" })) problems.push(`整理: 空の欄を持っている ${JSON.stringify(c2)}`)
    // 2. 突き合わせ
    const db = [
        { name: "消火器", result: "指摘なし", extra: "keep" },
        { name: "誘導灯", result: "要改善", bad_detail: "古い" },
        { name: "避難器具", result: "指摘なし" },
    ]
    const edited = [
        { name: "誘導灯", result: "指摘なし", bad_detail: "球切れ", action: "交換", witness: "山田" },   // ★判定を変えて渡しても DB の判定のまま
        { name: "消火器", result: "要改善", bad_detail: "出ない", witness: "山田" },
        { name: "画面に無い設備", result: "要改善", bad_detail: "x" },
    ]
    const m = lib.mergeEquipmentDetails(db, edited)
    const want = [
        { name: "消火器", result: "指摘なし", extra: "keep", witness: "山田" },
        { name: "誘導灯", result: "要改善", bad_detail: "球切れ", action: "交換", witness: "山田" },
        { name: "避難器具", result: "指摘なし" },
    ]
    if (!eq(m, want)) problems.push(`突き合わせ: 設備名・判定・行が DB のまま、3つの欄だけ重なっていない\n      得た ${JSON.stringify(m)}\n      期待 ${JSON.stringify(want)}`)
    if (lib.mergeEquipmentDetails(null, edited) !== null) problems.push("突き合わせ: DB が配列でないのに書く値を返した")
    return problems
}

function wordsOf(pdf) {
    const code = "import fitz, json, sys\nd = fitz.open(sys.argv[1])\nprint(json.dumps([[i, w[0], w[1], w[2], w[3], w[4]] for i in range(d.page_count) for w in d[i].get_text('words')]))"
    const r = spawnSync(PY, ["-c", code, pdf], { encoding: "utf8", maxBuffer: 1 << 24 })
    if (r.status !== 0) throw new Error(`PDF を読めない: ${r.stderr}`)
    return JSON.parse(r.stdout.trim().split("\n").pop())
}

async function judgePdf(items, outName) {
    const problems = []
    const payload = {
        building_name: "検証ビル", building_address: "京都市", building_usage: "(15)", notifier_name: "検証防災",
        notifier_address: "京都市", inspection_type: "機器点検", inspection_date: "2026-10-06", equipment_results: items,
    }
    const out = path.join("tmp", outName)
    await runRoutePdf({ routePath: "src/app/api/generate-soukatu-pdf/route.ts", payload, outPdfPath: out })
    const words = wordsOf(out)
    // 行 0（1枚目）と行 7（2枚目）に入れた印が、同じ頁・同じ高さで 不良 → 措置 → 立会 の順に載る
    for (const [k, page] of [[0, 0], [7, 1]]) {
        const find = (t) => words.filter((w) => w[5].includes(t))
        const name = find(`EQ${k}`), bad = find(`BD${k}`), act = find(`AC${k}`), wit = find(`WT${k}`)
        for (const [label, hit] of [["設備名", name], ["不良内容", bad], ["措置内容", act], ["立会者", wit]]) {
            if (hit.length !== 1 || hit[0][0] !== page) problems.push(`行${k}: ${label} が ${page + 1} 枚目に 1 回載っていない（${hit.length} 回）`)
        }
        if (problems.length) continue
        const cy = (w) => (w[2] + w[4]) / 2
        if ([bad, act, wit].some((h) => Math.abs(cy(h[0]) - cy(name[0])) > 20)) problems.push(`行${k}: 設備名と違う行の高さに載った`)
        if (!(name[0][1] < bad[0][1] && bad[0][1] < act[0][1] && act[0][1] < wit[0][1])) problems.push(`行${k}: 左から 設備名 → 不良内容 → 措置内容 → 立会者 の順でない`)
    }
    return problems
}

const items = Array.from({ length: 9 }, (_, k) => ({
    name: `EQ${k}`, result: "要改善", bad_detail: `BD${k}`, action: `AC${k}`, witness: `WT${k}`,
}))
const libSrc = fs.readFileSync(path.join(ROOT, "src", "lib", "soukatsu-equipment.ts"), "utf8")

if (process.argv.includes("--self-test")) {
    const lib = await loadLib(libSrc)
    const okLogic = judgeLogic(lib)
    // ★自己診断は本番の検査と別の名前で作る（check-pdf-all は両方を並列に走らせる。
    //   同じ名前だと片方が消した直後にもう片方が読み、「PDF を読めない」で落ちた・2026-10-06）
    const okPdf = await judgePdf(items, "_soukatsu_details_selftest.pdf")
    if (okLogic.length || okPdf.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of [...okLogic, ...okPdf]) console.log("   ", p)
        process.exit(1)
    }
    // 陽性対照1: 突き合わせで判定を画面の値で上書きする形に壊す
    const broken = await loadLib(libSrc.replace("result: db.result as SoukatsuEquipmentResult", "result: edited[idx].result"))
    if (!judgeLogic(broken).some((p) => p.startsWith("突き合わせ"))) {
        console.log("自己診断: 判定を上書きする形に壊しても検出できない")
        process.exit(1)
    }
    // 陽性対照2: 3つの欄を持たない行（以前の画面の保存）では PDF の検査が落ちる
    const bare = await judgePdf(items.map(({ name, result }) => ({ name, result })), "_soukatsu_details_bare.pdf")
    if (!bare.length) {
        console.log("自己診断: 不良内容などが空でも PDF の検査が通ってしまう")
        process.exit(1)
    }
    for (const f of ["_soukatsu_details_selftest.pdf", "_soukatsu_details_bare.pdf"]) fs.rmSync(path.join("tmp", f), { force: true })
    console.log("  陰性対照: 整理・突き合わせ・PDF（1枚目と2枚目）すべて約束どおり")
    console.log("  陽性対照1: 突き合わせで判定を画面の値で上書きする → 検出")
    console.log("  陽性対照2: 3つの欄が空の行（以前の画面の保存）→ PDF の検査が検出")
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const lib = await loadLib(libSrc)
const problems = [...judgeLogic(lib), ...(await judgePdf(items, "_soukatsu_details.pdf"))]
fs.rmSync(path.join("tmp", "_soukatsu_details.pdf"), { force: true })
console.log("総括表の不良内容・措置内容・立会者を検査: 整理・突き合わせ・PDF（1枚目と2枚目）")
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("SOUKATSU_DETAILS_OK")
