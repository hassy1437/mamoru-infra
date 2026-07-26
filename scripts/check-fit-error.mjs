// ⑧「枠に収まらない項目があればPDFを返さず一覧を返す」の回帰検査。
//
// ■ なぜベースラインと別に要るか
//   長文セットのベースラインは「収まる範囲の値」で撮る（そうしないとPDFが出ず
//   ピクセル退行検知ができない）。するとエラー経路は誰も守らなくなる。
//   そこでエラー経路だけを意図的に超過させた値で固定する。
//   3層構成: 現実値ベースライン=出荷品質 / 長文ベースライン=フィッティング動作 /
//            これ=エラー経路。
//
// 検査すること:
//   1. 正常な入力では 200 で PDF が返る（誤って止めない）
//   2. 明らかに長すぎる入力では 422 で FIT_FAILED が返る
//   3. その中身が業者の役に立つ形をしている
//      （様式名 / 画面と同じ項目表記 / 入力字数・収まる字数・超過字数 / 対処）
//   4. 超過しているのに漏れなく報告される（項目を増やすと件数も増える）
//   6. ★様式の行数を超えた分を黙って捨てない（総括表の設備欄は17行）
//      落ちるのは equipment_results の順序で決まるので、一般的な設備でも消えうる。
//      縮小＝警告 / データが消える＝エラー、の線引きに従いエラーで止める。
//
//   5. ★既知の限界を固定する: 幅の広いセル（名称など）は縮小だけで「収まる」ため
//      止まらない。判読しづらい大きさになっても現状はエラーにできない
//      （絶対下限を課すと、設計上そもそも極小のセルを持つ正常な出力まで止まるため）。
//      この振る舞いを検査に書いておき、将来「設計値からの逸脱」を実装したら見直す。
//
// 使い方: node scripts/check-fit-error.mjs
import fs from "fs"
import path from "path"
import { runRoutePdf } from "./run-route-pdf.mjs"

const ROUTE = "src/app/api/generate-shokasen-bekki2-pdf/route.ts"
const BASE = "tmp/pdf-realistic/bekki2_test.payload.json"
// ★2項目を試すときは必ず別々の文字列にすること。同じ値を入れると
//   由来の照合（値→payloadキー）が先に見つかった方に畳まれ、1件しか報告されない。
//   これはテストの作り方の問題で、実装の取りこぼしではない（実際に踏んだ）。
const LONG_NAME = "超長文テスト用の防火対象物名称であり枠に到底収まらないことを意図した非常に長い文字列でありこれ以上は不要です"
const LONG_COMPANY = "株式会社きわめて長い名前の消防設備保守点検サービスセンター日本総合ビルメンテナンス統括本部"

const problems = []
const check = (ok, message) => {
    if (!ok) problems.push(message)
}

const run = async (payload, outName) => {
    try {
        await runRoutePdf({ routePath: ROUTE, payload, outPdfPath: path.join("tmp", outName) })
        return { status: 200, body: null }
    } catch (e) {
        if (e.status) return { status: e.status, body: JSON.parse(e.responseBody) }
        throw e
    }
}

if (!fs.existsSync(BASE)) {
    console.error(`${BASE} が無い。先に node scripts/generate-realistic-route-tests.mjs を実行すること`)
    process.exit(2)
}
const base = JSON.parse(fs.readFileSync(BASE, "utf8"))

// 1. 正常な入力
const ok = await run(structuredClone(base), "_fit_ok.pdf")
check(ok.status === 200, `正常な入力が ${ok.status} で止められた（誤検出）`)

// 2-3. 1項目だけ超過させる
const one = structuredClone(base)
one.inspector_company = LONG_COMPANY
const bad = await run(one, "_fit_ng1.pdf")
check(bad.status === 422, `超過しているのに ${bad.status} が返った`)
if (bad.body) {
    check(bad.body.error === "FIT_FAILED", `error が ${bad.body.error}`)
    check(typeof bad.body.form === "string" && bad.body.form.length > 0, "様式名が無い")
    const it = bad.body.items?.find((i) => i.field === "inspector_company")
    check(Boolean(it), "inspector_company の項目が報告されていない")
    if (it) {
        check(it.label === "点検者所属会社", `項目表記が入力画面と違う: ${it.label}`)
        check(it.input === LONG_COMPANY.length, `入力字数が合わない: ${it.input} != ${LONG_COMPANY.length}`)
        check(it.fits > 0 && it.fits < it.input, `収まる字数が不正: ${it.fits}`)
        check(it.over === it.input - it.fits, `超過字数が合わない: ${it.over}`)
        check(typeof it.hint === "string" && it.hint.length > 0, "対処の提示が無い")
    }
}

// 4. 2項目に増やしたら2件報告される（1件目で止めない）
const two = structuredClone(base)
two.inspector_company = LONG_COMPANY
two.witness = LONG_NAME
const bad2 = await run(two, "_fit_ng2.pdf")
check(bad2.status === 422, `2項目超過で ${bad2.status}`)
const fields = new Set((bad2.body?.items ?? []).map((i) => i.field))
check(fields.has("inspector_company") && fields.has("witness"), `2項目のうち報告されたのは ${[...fields]}`)

// 5. 既知の限界: 幅の広いセル（点検者住所）は長くても縮小で収まるので止まらない
const wide = structuredClone(base)
wide.inspector_address = LONG_NAME
const wideRes = await run(wide, "_fit_wide.pdf")
check(
    wideRes.status === 200,
    `点検者住所の長文が ${wideRes.status} になった。挙動が変わったなら check-fit-error.mjs の想定も見直すこと`,
)

// 6. 様式の行数を超えたらエラー（総括表）。両方向を確かめる
const SOUKATSU_ROUTE = "src/app/api/generate-soukatu-pdf/route.ts"
const soukatsuBase = {
    building_name: "検証ビル",
    building_address: "大阪市北区",
    building_usage: "特定防火対象物",
    notifier_name: "検証防災",
    notifier_address: "大阪市北区",
    inspection_type: "機器・総合",
    equipment_results: [],
}
const runSoukatsu = async (n, outName) => {
    const p = structuredClone(soukatsuBase)
    p.equipment_results = Array.from({ length: n }, (_, i) => ({ name: `設備${i + 1}`, result: "指摘なし" }))
    try {
        await runRoutePdf({ routePath: SOUKATSU_ROUTE, payload: p, outPdfPath: path.join("tmp", outName) })
        return { status: 200, items: [] }
    } catch (e) {
        if (!e.status) throw e
        const body = JSON.parse(e.responseBody)
        return { status: e.status, items: (body.items ?? []).filter((i) => i.field === "equipment_results") }
    }
}
const rowsOk = await runSoukatsu(17, "_fit_rows17.pdf")
check(rowsOk.status === 200, `設備17件（上限ちょうど）が ${rowsOk.status} で止まった`)
const rowsNg = await runSoukatsu(20, "_fit_rows20.pdf")
check(rowsNg.status === 422, `設備20件（上限超過）が ${rowsNg.status}。黙って捨てていないか`)
check(rowsNg.items.length === 3, `落ちた件数の報告が ${rowsNg.items.length} 件（20-17=3のはず）`)
check(
    rowsNg.items.every((i) => /17/.test(i.hint)),
    "エラー文言に上限件数(17)が入っていない＝業者が何件に減らせばよいか分からない",
)

for (const f of ["_fit_ok.pdf", "_fit_ng1.pdf", "_fit_ng2.pdf", "_fit_wide.pdf", "_fit_rows17.pdf", "_fit_rows20.pdf"]) {
    try { fs.unlinkSync(path.join("tmp", f)) } catch {}
}

if (problems.length) {
    console.error("FIT_ERROR_CHECK_FAILED")
    for (const p of problems) console.error(`  - ${p}`)
    process.exit(1)
}
console.log(`FIT_ERROR_CHECK_OK（正常=200 / 1項目超過=422:1件 / 2項目超過=422:${fields.size}件）`)
