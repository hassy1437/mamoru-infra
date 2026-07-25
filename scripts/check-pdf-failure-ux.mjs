// PDF生成が失敗したとき、業者に何が見えるかを検査する。
//
// ■ なぜ要るか
//   静的検査（check-pdf-error-handling.py）は「ヘルパーを通しているか」しか見ない。
//   通していても文言が役に立たなければ意味がないので、実際に組み立てた文言を確認する。
//   ★特に 422（業者が直せる）と 5xx/通信断（直せない）が区別されていること。
//   区別しないと業者は「自分が直すのか待つのか」を判断できない。
//
// 検査すること:
//   1. 422 … どの項目を何文字短くすればよいかが文言に入る
//   2. 5xx … 入力の修正では直らないことが伝わり、422の文言と混ざらない
//   3. 本文が壊れた422 … 「PDF generation failed」に戻らず、収まらない旨は伝わる
//   4. 通信断（fetch自体の失敗）… 通信エラーの可能性が伝わる
//   5. 納品 … fit failure のときは「それ以外を結合して納品」を提示しない
//
// 使い方: node scripts/check-pdf-failure-ux.mjs
import fs from "fs"
import path from "path"
import { pathToFileURL } from "url"
import ts from "typescript"

const problems = []
const check = (ok, message) => {
    if (!ok) problems.push(message)
}

// TS のまま実行できないので、この検査用にトランスパイルして読み込む
const load = async (tsPath) => {
    const js = ts.transpileModule(fs.readFileSync(tsPath, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText
    const out = path.join(process.cwd(), "tmp", `${path.basename(tsPath, ".ts")}.uxcheck.mjs`)
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, js)
    const mod = await import(pathToFileURL(out).href)
    fs.unlinkSync(out)
    return mod
}

const { describePdfFailure, pdfErrorText, PdfRequestError, isFitFailure } = await load(
    "src/lib/pdf-request-error.ts",
)

const resp = (status, body) =>
    new Response(body === undefined ? null : body, {
        status,
        headers: { "Content-Type": "application/json" },
    })

// 1. 422（業者が直せる）
const fit = await describePdfFailure(
    resp(
        422,
        JSON.stringify({
            error: "FIT_FAILED",
            form: "別記様式第2",
            items: [
                { field: "form_name", label: "名称", input: 42, fits: 28, over: 14, hint: "入力を短くしてください", text: "…" },
            ],
        }),
    ),
)
check(fit.kind === "fit", `422 の分類が ${fit.kind}`)
check(fit.message.includes("名称"), "422 の文言に項目名が無い")
check(fit.message.includes("14文字超過"), "422 の文言に超過文字数が無い")
check(fit.message.includes("別記様式第2"), "422 の文言に様式名が無い")
check(fit.items.length === 1, "422 の items が運ばれていない")

// 2. 5xx（業者には直せない）
const srv = await describePdfFailure(resp(500, "{}"))
check(srv.kind === "server", `5xx の分類が ${srv.kind}`)
check(srv.message.includes("入力の修正では直りません"), "5xx で「直せない」ことが伝わらない")
check(!srv.message.includes("短くして"), "5xx なのに入力を短くしろと言っている（分類の混線）")

// 3. 本文が壊れた422（分類は保つ）
const broken = await describePdfFailure(resp(422, "not-json"))
check(broken.kind === "fit", `壊れた422 の分類が ${broken.kind}`)
check(broken.message.includes("枠に収まらない"), "壊れた422 で収まらない旨が伝わらない")
check(!/PDF generation failed/.test(broken.message), "汎用文言に戻っている")

// 4. 通信断（fetch 自体が失敗＝PdfRequestError ではない例外）
const netText = pdfErrorText(new TypeError("Failed to fetch"), "PDFダウンロードに失敗しました。")
check(netText.includes("通信エラー"), "通信断で通信エラーの可能性が伝わらない")
check(netText.includes("PDFダウンロード"), "呼び出し側の文脈が消えている")

// pdfErrorText は分類済みならその文言を優先する
check(
    pdfErrorText(new PdfRequestError(fit), "既定文言").includes("名称"),
    "分類済みの文言が既定文言に上書きされている",
)
check(isFitFailure(new PdfRequestError(fit)), "isFitFailure が fit を判定できない")
check(!isFitFailure(new PdfRequestError(srv)), "isFitFailure が server を fit と誤判定")

// 5. 納品は fit failure で止まる（「それ以外を結合して納品」を出さない）
const deliver = fs.readFileSync("src/components/deliver-report-button.tsx", "utf8")
const fitBlock = deliver.match(/if \(fitFailures\.length > 0\)\s*\{([\s\S]*?)\n            \}/)
check(Boolean(fitBlock), "納品ボタンに fitFailures の分岐が無い")
if (fitBlock) {
    check(!/window\.confirm/.test(fitBlock[1]), "fit failure なのに納品可否を選ばせている")
    check(/return/.test(fitBlock[1]), "fit failure で納品を止めていない")
    check(/納品できません/.test(fitBlock[1]), "納品を止めた理由が文言に無い")
}
// 5xx 側は従来どおり選ばせてよい（業者には直せないため）
check(
    /if \(failedLabels\.length > 0\)[\s\S]{0,200}window\.confirm/.test(deliver),
    "サーバ障害時の「それ以外を結合」の選択肢が失われている",
)

if (problems.length) {
    console.error("PDF_FAILURE_UX_CHECK_FAILED")
    for (const p of problems) console.error(`  - ${p}`)
    process.exit(1)
}
console.log("PDF_FAILURE_UX_CHECK_OK（422/5xx/壊れた本文/通信断 を区別・納品は fit で停止）")
