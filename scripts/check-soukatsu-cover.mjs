// 表紙（報告書・様式第１）の「報告年月日」と「宛名」のつなぎを検査する（2026-10-19・録音 101）。
//
// ■ なぜ要るか
//   ・表紙の報告年月日に★点検日（inspection_date）を印字していた。報告年月日は消防署へ出す日で、点検日ではない。
//     点検日と同じ形の日付が正しく描かれるので、PDF を見ても、ピクセルの比較でも気付けない。
//   ・宛名は表紙に描く処理があったのに、入れる欄が無くいつも空欄だった。
//   ★どちらも「欄はあるのに保存していない」「保存しているのに表紙へ渡していない」と、画面には何も出ずに元に戻る種類。
//
// ■ 検査すること
//   1. 表紙へ渡す値（build-merged-report.ts）: report_date は総括表の report_date・宛名を渡す・点検日を渡さない
//   2. 作る画面・直す画面の両方: 欄を出し、保存に入れる
//   3. 作る画面: 報告年月日を空で始める（点検日や今日で埋めない）
//
// 使い方: node scripts/check-soukatsu-cover.mjs [--self-test]
import fs from "fs"
import path from "path"

const MERGE = "src/lib/build-merged-report.ts"
const NEW_FORM = "src/components/soukatsu-form.tsx"
const EDIT_FORM = "src/components/soukatsu-edit-form.tsx"
const read = (f) => fs.readFileSync(path.join(process.cwd(), f), "utf8")

const judge = (files) => {
    const problems = []
    const merge = files[MERGE]
    if (!/report_date:\s*input\.soukatsuData\.report_date\b/.test(merge))
        problems.push(`${MERGE}: 表紙の report_date に総括表の report_date を渡していない`)
    if (/report_date:\s*input\.soukatsuData\.inspection_date\b/.test(merge))
        problems.push(`${MERGE}: 表紙の報告年月日に点検日（inspection_date）を渡している`)
    if (!/fire_department_name:\s*input\.soukatsuData\.fire_department_name\b/.test(merge))
        problems.push(`${MERGE}: 表紙に宛名（fire_department_name）を渡していない`)
    for (const f of [NEW_FORM, EDIT_FORM]) {
        const src = files[f]
        if (!/<SoukatsuCoverInputs\b/.test(src)) problems.push(`${f}: 表紙の欄（SoukatsuCoverInputs）を出していない`)
        if (!/\.\.\.coverFieldsForSave\(reportDate, fireDepartmentName\)/.test(src))
            problems.push(`${f}: 保存に報告年月日・宛名（coverFieldsForSave）を入れていない`)
    }
    if (!/const \[reportDate, setReportDate\] = useState\(""\)/.test(files[NEW_FORM]))
        problems.push(`${NEW_FORM}: 報告年月日を空で始めていない（点検日や今日で埋めない）`)
    return problems
}

const files = Object.fromEntries([MERGE, NEW_FORM, EDIT_FORM].map((f) => [f, read(f)]))

if (process.argv.includes("--self-test")) {
    if (judge(files).length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of judge(files)) console.log("   ", p)
        process.exit(1)
    }
    const mutants = [
        ["表紙に点検日を渡す（直す前）", MERGE, "report_date: input.soukatsuData.report_date", "report_date: input.soukatsuData.inspection_date", "点検日"],
        ["宛名を渡さない", MERGE, "fire_department_name: input.soukatsuData.fire_department_name,", "", "宛名"],
        ["作る画面で保存しない", NEW_FORM, "...coverFieldsForSave(reportDate, fireDepartmentName),", "", `${NEW_FORM}: 保存に`],
        ["直す画面で保存しない", EDIT_FORM, "...coverFieldsForSave(reportDate, fireDepartmentName),", "", `${EDIT_FORM}: 保存に`],
        ["直す画面で欄を出さない", EDIT_FORM, "<SoukatsuCoverInputs", "<div", `${EDIT_FORM}: 表紙の欄`],
        ["報告年月日を点検日で始める", NEW_FORM, 'const [reportDate, setReportDate] = useState("")', "const [reportDate, setReportDate] = useState(initialInspectionDate)", "空で始めていない"],
    ]
    for (const [label, file, from, to, expect] of mutants) {
        if (!files[file].includes(from)) {
            console.log(`自己診断: 書き換える箇所が ${file} に無い: ${from}`)
            process.exit(1)
        }
        const r = judge({ ...files, [file]: files[file].replace(from, to) })
        if (!r.some((p) => p.includes(expect))) {
            console.log(`自己診断: ${label} → 検出できない`)
            process.exit(1)
        }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    console.log("  陰性対照: 表紙へ総括表の報告年月日・宛名を渡し、作る画面・直す画面の両方で保存する")
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const problems = judge(files)
console.log("表紙の報告年月日・宛名のつなぎを検査（表紙へ渡す値・作る画面・直す画面）")
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("SOUKATSU_COVER_OK")
