// 総括表の入力画面の「総合判定・備考は印字されません」が、実際の帳票と食い違っていないかを検査する（2026-10-07）。
//
// ■ なぜ要るか
//   総合判定・備考は入力欄があるのに紙に出ず、画面にも書かれていなかった（2026-10-06 の印字テスト）。
//   知らせを足したので、今度は「知らせが嘘になる」ことを見張る:
//   ・入力画面（新規・編集）の両方が知らせを出している
//   ・帳票の route（src/app/api/generate-*）と一括出力（build-merged-report）が総合判定を読んでいない
//   ・報告書・総括表の route が総括表の備考（body.notes）を読んでいない（別記の備考は別記の payload なので対象外）
//   ★印字するようにしたら、src/lib/soukatsu-not-printed.ts の文言と一緒にこの検査も直すこと。
//
// 使い方: node scripts/check-soukatsu-not-printed.mjs [--self-test]
import fs from "fs"
import path from "path"

const ROOT = process.cwd()
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8")
const FORMS = ["src/components/soukatsu-form.tsx", "src/components/soukatsu-edit-form.tsx"]
const API = "src/app/api"
const routes = () => fs.readdirSync(path.join(ROOT, API)).filter((d) => d.startsWith("generate-"))
    .map((d) => `${API}/${d}/route.ts`).filter((p) => fs.existsSync(path.join(ROOT, p)))
const SOUKATSU_ROUTES = [`${API}/generate-soukatu-pdf/route.ts`, `${API}/generate-pdf/route.ts`]

function inspect(src) {
    const problems = []
    for (const f of FORMS) {
        const s = src(f)
        if (!s.includes('from "@/lib/soukatsu-not-printed"') || !s.includes("{SOUKATSU_NOT_PRINTED_NOTE}"))
            problems.push(`${f}: 「総合判定・備考は印字されません」の知らせを出していない`)
    }
    for (const r of [...routes(), "src/lib/build-merged-report.ts"]) {
        if (/overall_judgment/.test(src(r))) problems.push(`${r}: 総合判定（overall_judgment）を読んでいる＝印字するなら知らせの文言を直す`)
    }
    for (const r of SOUKATSU_ROUTES) {
        if (/body\.notes\b/.test(src(r))) problems.push(`${r}: 総括表の備考（body.notes）を読んでいる＝印字するなら知らせの文言を直す`)
    }
    return problems
}

if (process.argv.includes("--self-test")) {
    const neg = inspect(read)
    if (neg.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of neg) console.log("   ", p)
        process.exit(1)
    }
    const mutants = [
        ["編集画面から知らせを外す", (p) => p === FORMS[1] ? read(p).replace("{SOUKATSU_NOT_PRINTED_NOTE}", "") : read(p), "soukatsu-edit-form.tsx: 「総合判定"],
        ["総括表 route が総合判定を描く", (p) => p === SOUKATSU_ROUTES[0] ? read(p) + "\nconst j = body.overall_judgment\n" : read(p), "総合判定（overall_judgment）を読んでいる"],
        ["報告書 route が備考を描く", (p) => p === SOUKATSU_ROUTES[1] ? read(p) + "\nconst n = body.notes\n" : read(p), "総括表の備考（body.notes）"],
    ]
    for (const [label, src, expect] of mutants) {
        if (!inspect(src).some((p) => p.includes(expect))) {
            console.log(`自己診断: ${label} → 検出できない`)
            process.exit(1)
        }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    console.log("  陰性対照: 現状（入力画面 2 つが知らせを出し、帳票は総合判定・備考を読まない）→ 0 件")
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const problems = inspect(read)
console.log(`総合判定・備考の知らせと帳票の突き合わせ: 入力画面 ${FORMS.length}・帳票 route ${routes().length}＋一括出力`)
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("SOUKATSU_NOT_PRINTED_OK")
