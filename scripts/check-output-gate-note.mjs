// 出力の画面: 確定できない理由を PDF のボタンの前に出し、結合する PDF の一覧を綴じる順に並べるか（2026-10-20）。
//
// ■ なぜ要るか（2026-10-20 の本番の通しチェック）
//   ・業者登録の承認前（解約日を迎えた後も同じ）は確定できないのに、「PDF一括出力」は押せるように見え、
//     理由は押したあとにしか出なかった
//   ・一覧は入力の順（1→12〜22→2〜11）で、実際に綴じる順（様式番号の順・src/lib/build-merged-report.ts）と違った
//
// ■ 検査すること（配線）
//   ・確定できず、出力の画面で確定もできないとき（!canDownloadPdf && !needsFinalizeOnOutput）だけ、理由（pdfGateMessage）をボタンの前に出す
//   ・そのときボタンは押せなくし、理由の文とつなぐ（gateNoteId → disabled・aria-describedby）
//   ・一覧の別記は PDF_MERGE_CONFIG の formNo の順
//
// 使い方: node scripts/check-output-gate-note.mjs [--self-test]
import fs from "fs"
import path from "path"

const ROOT = process.cwd()
const SELF_TEST = process.argv.includes("--self-test")
const PAGE = "src/app/inspection/[id]/itiran/[itiranId]/output/page.tsx"
const BUTTON = "src/components/combined-pdf-button.tsx"
const MERGE = "src/lib/build-merged-report.ts"
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8")

function check(page, button, merge) {
    const problems = []
    const cond = "!canDownloadPdf(finalization) && !needsFinalizeOnOutput(finalization)"
    const note = page.indexOf(`{${cond} && (`)
    const btn = page.indexOf("<CombinedPdfButton")
    if (note < 0) problems.push(`${PAGE}: 確定できない理由をボタンの前に出していない`)
    else if (btn >= 0 && note > btn) problems.push(`${PAGE}: 理由がボタンの後ろにある（押す前に読めない）`)
    if (!/<p id="pdf-gate-note" role="note"[^>]*>[\s\S]{0,200}\{pdfGateMessage\(finalization\)\}/.test(page)) problems.push(`${PAGE}: 理由の文が pdfGateMessage ではない（解約日を迎えた業者に「確定してから」と言ってしまう）`)
    if (!page.includes(`gateNoteId={${cond} ? "pdf-gate-note" : undefined}`)) problems.push(`${PAGE}: ボタンに理由の文をつないでいない`)
    if (!/disabled=\{loading \|\| taskCount === 0 \|\| \(!canDownload && !!gateNoteId\)\}/.test(button)) problems.push(`${BUTTON}: 理由を先に出しているのにボタンが押せる（押すと同じ文がもう一度出る）`)
    if (!/aria-describedby=\{!canDownload && gateNoteId \? gateNoteId : undefined\}/.test(button)) problems.push(`${BUTTON}: 押せないボタンと理由の文をつないでいない`)
    if (!/\.sort\(\(a, b\) => PDF_MERGE_CONFIG\[a\.id\]\.formNo - PDF_MERGE_CONFIG\[b\.id\]\.formNo\)/.test(page)) problems.push(`${PAGE}: 一覧の別記が綴じる順（様式番号の順）になっていない`)
    if (!/\.sort\(\(a, b\) => a\.formNo - b\.formNo\)/.test(merge)) problems.push(`${MERGE}: 綴じる順が様式番号の順でない（一覧と合わせる相手が変わった）`)
    return problems
}

const page = read(PAGE), button = read(BUTTON), merge = read(MERGE)

if (SELF_TEST) {
    const neg = check(page, button, merge)
    if (neg.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of neg) console.log("   ", p)
        process.exit(1)
    }
    const mutants = [
        ["理由を出さない", page.replace("{!canDownloadPdf(finalization) && !needsFinalizeOnOutput(finalization) && (", "{false && ("), button, "理由をボタンの前に出していない"],
        ["ボタンを押せるままにする", page, button.replace(" || (!canDownload && !!gateNoteId)", ""), "ボタンが押せる"],
        ["一覧を入力の順に戻す", page.replace("[...applicableSteps].sort((a, b) => PDF_MERGE_CONFIG[a.id].formNo - PDF_MERGE_CONFIG[b.id].formNo)", "applicableSteps"), button, "綴じる順"],
    ]
    for (const [label, p, b, expect] of mutants) {
        if (p === page && b === button) { console.log(`自己診断: 書き換えられない: ${label}`); process.exit(1) }
        if (!check(p, b, merge).some((x) => x.includes(expect))) { console.log(`自己診断: ${label} → 検出できない`); process.exit(1) }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    console.log("  陰性対照: 理由の位置・文・ボタンとのつなぎ・一覧の順")
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const problems = check(page, button, merge)
console.log("出力の画面を検査: 確定できない理由を先に出す・一覧を綴じる順に")
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("OUTPUT_GATE_NOTE_OK")
