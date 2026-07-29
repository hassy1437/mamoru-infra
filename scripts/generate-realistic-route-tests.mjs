// 現実的な入力値で全様式のPDFを作る（既存のテストpayloadは「長文フィット確認用」のストレス版）。
//
// ■ なぜ2種類要るか（2026-07-24 に分かったこと）
//   既存 payload は全項目に意図的な長文を入れており、そのままだと
//   「テンプレートが 設定圧力 ___ MPa を印字しているため意図的に幅12ptにしたセル」に
//   「別記3-1 点検項目 1」を入れて切り詰めが出る、といった見かけ上の不良が計上される。
//   実測ではその手の artifact が欠落文字の 43/55 を占めていた。
//   ＝ ストレス版だけで品質を判定すると、実際に業者が出すPDFの姿が見えない。
//
//   長文セット   … レイアウトの限界を見るストレステスト（既存の generate-bekki*-route-tests）
//   現実値セット … 実際に提出される報告書の品質を見る（このスクリプト）。合否はこちらで見る。
//
// ■ 作り方
//   既存 payload をキー名で置換する。ゼロから書き起こすと様式ごとの構造差を取りこぼすため、
//   実際に使われている payload の形をそのまま流用して値だけ現実的にする。
//   数値欄（contentOverrides で幅を絞ってあるセル）はルート実装から行番号を読み取り、
//   その行だけ数値を入れる。＝どの行が数値欄かをこちらで二重管理しない。
//
// 使い方: node scripts/generate-realistic-route-tests.mjs
//   出力: tmp/pdf-realistic/<name>.pdf と同じ場所に payload.json
import fs from "fs"
import path from "path"
import { runRoutePdf } from "./run-route-pdf.mjs"

const OUT_DIR = path.join(process.cwd(), "tmp", "pdf-realistic")

// 実際の点検報告書に出てくる程度の値
const REALISTIC = {
    form_name: "サンプルビル",
    location: "東京都千代田区丸の内1-1-1",
    fire_manager: "山田太郎",
    witness: "佐藤花子",
    inspector_name: "鈴木一郎",
    inspector_company: "株式会社サンプル防災",
    inspector_address: "東京都港区芝公園4-2-8",
    inspector_tel: "03-1234-5678",
    notes: "特記事項なし",
    shoubou_notes: "特記事項なし",
    equipment_name: "屋内消火栓",
    // ★equipment_system は「設備の種類」ではなく設備方式の選択肢（全域・局所・移動）。
    //   フォームの既定値も "全域"。設備名を入れると○が付かず検証が空振りする。
    equipment_system: "全域",
    maker: "計測器製作所",
    model: "PG-9000",
    name: "圧力計",
    pump_maker: "ポンプ製造(株)",
    pump_model: "PMP-9000",
    motor_maker: "電機(株)",
    motor_model: "MTR-2026",
    foam_maker: "薬剤(株)",
    foam_model: "FM-12A",
    foam_type_no_from: "23",
    foam_type_no_to: "3",
    // ★総括表・点検者一覧は payload のキー名が他様式と違う（building_name / address 等）。
    //   ここを漏らすと、その2様式だけストレス値のまま「現実値セット」に混ざり、
    //   逸脱分布の上位を占めて閾値の判断を誤らせる（実測で発覚）。
    building_name: "サンプルビル",
    building_address: "東京都千代田区丸の内1-1-1",
    inspector_responsible: "鈴木一郎",
    bad_detail: "接続部緩み",
    action: "締め直し",
    company: "株式会社サンプル防災",
    address: "東京都港区芝公園4-2-8",
    phone: "03-1234-5678",
    equipment_names: "消火器,自動火災報知設備,誘導灯",
    license_number: "東京 第12345号",
}

// 点検項目の内容欄に入る典型的な文言
const CONTENTS = ["外形・設置状況", "表示", "機能", "変形・損傷の有無", "腐食・さび"]
const BAD = "変形あり"
const ACTION = "部品交換"
const NUMERIC = "0.45"

import { numericRowsByKey, applyChoiceRows } from "./lib-numeric-rows.mjs"

const realisticValue = (key, original) => {
    if (key in REALISTIC) return REALISTIC[key]
    if (key === "calibrated_at") return original
    return original
}

/**
 * ★選択肢欄の行。一般の content 置換から外して、実際の選択肢の語を入れる。
 *
 *   値が選択肢のどれとも一致しないと ○ が1つも描かれず、修正を入れても
 *   「何も変わらない」ことに気づけない（equipment_system で実際に踏んだ）。
 *
 *   ★長文セットと現実値セットで違う語を割り当てる。行が2つしか無いので
 *     1セットでは2語までしか試せず、4語すべてを回帰で守れないため。
 *       長文  … 一斉 / 相互（generate-bekki13to22-route-tests.mjs 側）
 *       現実値 … 区分 / 再鳴動（下の表）
 *   どちらも鳴動方式として現実的な値なので、現実値セットの意味も壊れない。
 */
const CHOICE_ROWS = {
    "generate-emergency-alarm-bekki14-pdf": {
        page1_rows: { 23: "区分" },
        page2_rows: { 30: "再鳴動" },
    },
    // 「専用・兼用」は2択。長文セットに 専用 を割り当てているので、こちらは 兼用。
    "generate-shokasen-bekki2-pdf": { page2_rows: { 7: "兼用" }, page3_rows: { 13: "兼用" } },
    "generate-sprinkler-bekki3-pdf": { page2_rows: { 7: "兼用" } },
    "generate-water-spray-bekki4-pdf": { page2_rows: { 7: "兼用" } },
    "generate-foam-bekki5-pdf": { page2_rows: { 7: "兼用" } },
    "generate-inert-gas-bekki6-pdf": { page2_rows: { 17: "兼用" } },
    "generate-halogen-bekki7-pdf": { page2_rows: { 26: "兼用" } },
    "generate-powder-bekki8-pdf": { page2_rows: { 26: "兼用" } },
    "generate-okugai-shokasen-bekki9-pdf": { page2_rows: { 7: "兼用" } },
    "generate-standpipe-bekki20-pdf": { page2_rows: { 7: "兼用" } },
    // 3択・4択は2セットでも全語は踏めない。残りは定数の静的検算で担保する
    "generate-jidou-kasai-houchi-bekki11-1-pdf": {
        page2_rows: { 5: "熱アナログ", 9: "アナログ", 11: "紫外線", 22: "再鳴動" },
    },
}

const transform = (node, numericByKey, key = "", rowIndex = null, rowsKey = "") => {
    if (Array.isArray(node)) {
        const isRows = key.endsWith("_rows")
        return node.map((v, i) => transform(v, numericByKey, key, isRows ? i : rowIndex, isRows ? key : rowsKey))
    }
    if (node && typeof node === "object") {
        const out = {}
        for (const [k, v] of Object.entries(node)) out[k] = transform(v, numericByKey, k, rowIndex, rowsKey)
        return out
    }
    if (typeof node !== "string") return node
    if (key === "content") {
        // その rows配列 の、その行が数値欄なら数値を入れる（配列ごとに上書き対象が違う）
        if (rowIndex !== null && numericByKey.get(rowsKey)?.has(rowIndex)) return NUMERIC
        return CONTENTS[(rowIndex ?? 0) % CONTENTS.length]
    }
    if (key === "bad_content") return node ? BAD : node
    if (key === "action_content") return node ? ACTION : node
    return realisticValue(key, node)
}

fs.mkdirSync(OUT_DIR, { recursive: true })
const jobs = []
const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else if (e.name.endsWith(".job.json")) jobs.push(p)
    }
}
walk(path.join(process.cwd(), "tmp"))

for (const jobPath of jobs) {
    const { routePath } = JSON.parse(fs.readFileSync(jobPath, "utf8"))
    const payloadPath = jobPath.replace(/\.job\.json$/, ".payload.json")
    if (!fs.existsSync(payloadPath)) continue
    const name = path.basename(jobPath).replace(/\.job\.json$/, "")
    const numericByKey = numericRowsByKey(routePath)
    // routePath は "src/app/api/generate-xxx-pdf/route.ts" 形式。ディレクトリ名で引く
    const payload = transform(JSON.parse(fs.readFileSync(payloadPath, "utf8")), numericByKey)
    // ★選択肢欄は数値置換より後（選択肢の行も skipContentRows に載るため）。
    //   長文セットと同じ共有部品を通し、宣言と実装のズレはそこで落とす。
    applyChoiceRows(payload, routePath, CHOICE_ROWS[path.basename(path.dirname(routePath))])
    const outPdfPath = path.join(OUT_DIR, `${name}.pdf`)
    const result = await runRoutePdf({ routePath, payload, outPdfPath })
    fs.writeFileSync(outPdfPath.replace(/[.]pdf$/, ".payload.json"), JSON.stringify(payload))
    console.log(name, result.outPdfPath, result.bytes)
}
