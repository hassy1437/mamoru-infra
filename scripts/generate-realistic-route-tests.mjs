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
    equipment_system: "屋内消火栓設備",
    maker: "計測器製作所",
    model: "PG-9000",
    name: "圧力計",
    pump_maker: "ポンプ製造(株)",
    pump_model: "PMP-9000",
    motor_maker: "電機(株)",
    motor_model: "MTR-2026",
    foam_maker: "薬剤(株)",
    foam_model: "FM-12A",
}

// 点検項目の内容欄に入る典型的な文言
const CONTENTS = ["外形・設置状況", "表示", "機能", "変形・損傷の有無", "腐食・さび"]
const BAD = "変形あり"
const ACTION = "部品交換"
const NUMERIC = "0.45"

/** 括弧の対応を見て drawResultRows(...) の引数列を丸ごと取り出す */
const callArgs = (src, start) => {
    let depth = 0
    for (let i = start; i < src.length; i += 1) {
        const c = src[i]
        if (c === "(") depth += 1
        else if (c === ")") {
            depth -= 1
            if (depth === 0) return src.slice(start + 1, i)
        }
    }
    return ""
}

/**
 * ルート実装から「数値欄（幅を絞ったセル）」の行番号を rows配列ごとに読む。
 *
 * ★contentOverrides という語は関数シグネチャにも出るので、そこを拾ってはいけない。
 *   最初はシグネチャ側の `= {}` を掴んでしまい、置換が黙って効かず、
 *   現実値セットに存在しないはずの切り詰めが6件出ていた（＝合否判定が狂う）。
 *   呼び出し側の実引数を括弧の対応で取り出し、最後のオブジェクトリテラルから読む。
 */
const numericRowsByKey = (routePath) => {
    const src = fs.readFileSync(path.join(process.cwd(), routePath), "utf8")
    const map = new Map() // payloadのキー -> Set<行番号>
    let idx = src.indexOf("drawResultRows(")
    while (idx !== -1) {
        const args = callArgs(src, idx + "drawResultRows".length)
        const rowsExpr = args.split(",")[2] ?? ""
        // rows が局所変数なら const 宣言をたどって body.pageN_rows を解決する
        let key = rowsExpr.match(/page\d+_rows/)?.[0]
        if (!key) {
            const local = rowsExpr.trim().match(/^[A-Za-z_$][\w$]*/)?.[0]
            if (local) {
                const decl = src.match(new RegExp(`const\\s+${local}\\s*=([^\\n]*)`))
                key = decl?.[1].match(/page\d+_rows/)?.[0]
            }
        }
        const indexes = new Set()
        // (a) contentOverrides: 幅を絞ったセル
        for (const m of args.matchAll(/(\d+):\s*\{\s*x:\s*[\d.]+\s*,\s*w:\s*[\d.]+\s*\}/g)) {
            indexes.add(Number(m[1]))
        }
        // (b) skip集合 new Set([...]): 汎用描画から外して専用コードが描く行。
        //     bekki10 の「ホース・ノズル等」のように content が長さ(m)＝数値を意味する。
        // ★skip集合は複数行＋行コメント付きで書かれる。コメントを外してから数字を拾う
        //   （カンマ分割だと "// …" を含む要素が NaN になり、その行番号を取りこぼす）
        const skip = args.match(/new Set\(\[([\s\S]*?)\]\)/)
        if (skip) {
            const cleaned = skip[1].replace(/\/\/.*/g, "")
                for (const m of cleaned.matchAll(/\d+/g)) indexes.add(Number(m[0]))
        }
        if (key && indexes.size) {
            const cur = map.get(key) ?? new Set()
            for (const v of indexes) cur.add(v)
            map.set(key, cur)
        }
        idx = src.indexOf("drawResultRows(", idx + 1)
    }
    return map
}

const realisticValue = (key, original) => {
    if (key in REALISTIC) return REALISTIC[key]
    if (key === "calibrated_at") return original
    return original
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
    const payload = transform(JSON.parse(fs.readFileSync(payloadPath, "utf8")), numericByKey)
    const outPdfPath = path.join(OUT_DIR, `${name}.pdf`)
    const result = await runRoutePdf({ routePath, payload, outPdfPath })
    fs.writeFileSync(outPdfPath.replace(/[.]pdf$/, ".payload.json"), JSON.stringify(payload))
    console.log(name, result.outPdfPath, result.bytes)
}
