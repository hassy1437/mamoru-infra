// 消防庁（FDMA）の別記様式 正典を取得して reference/fdma/ に置く。
//
// ■ なぜコミットするか
//   Phase 0 以降は「手元テンプレートの版が正典と一致しているか」を問う作業になる。
//   比較の基準そのものが手元に固定されていないと、後から「どの版と照らしたのか」が
//   分からなくなる。＝ 対照群を固定するためのファイル。
//   ★.tmp/ には置かない（gitignore で消える）。public/ にも置かない（Web に配信される）。
//
// ■ URL 規則（N は 1〜22。11 だけ 11_1 と 11_2 に分かれる＝23件）
//   Word https://www.fdma.go.jp/mission/prevention/items/bekki{N}.doc
//   PDF  https://www.fdma.go.jp/laws/kokuji/items/s50_kokuji14_bekki{N}.pdf
//
// ■ ★「取得できた＝使える」ではない
//   落ちたことに気づかず空ファイルや HTML のエラーページを掴むと、以後ずっと
//   間違ったものを正典として扱うことになる（今日踏んだ「測定対象が古い」と同じ型）。
//   そこで取得後に必ず検査する:
//     - 0バイトでないか
//     - HTML を掴んでいないか（Content-Type と先頭バイトの両方で見る）
//     - .doc は OLE 複合ドキュメント（D0CF11E0）か / .pdf は %PDF- で始まるか
//     - 23件そろっているか
//
// 使い方:
//   node scripts/fetch-fdma-reference.mjs           # 取得＋検査
//   node scripts/fetch-fdma-reference.mjs --verify  # 取得済みファイルの検査だけ
import fs from "fs"
import path from "path"

const ROOT = process.cwd()
const BASE = path.join(ROOT, "reference", "fdma")
const DOC_DIR = path.join(BASE, "bekki")
const PDF_DIR = path.join(BASE, "bekki-pdf")
const VERIFY_ONLY = process.argv.includes("--verify")

/** 様式番号。11 は 11_1 / 11_2 に分かれるので、単純な 1..22 では 1件足りない */
const FORM_IDS = (() => {
    const ids = []
    for (let n = 1; n <= 22; n += 1) {
        if (n === 11) {
            ids.push("11_1", "11_2")
            continue
        }
        ids.push(String(n))
    }
    return ids
})()

const DOC_URL = (id) => `https://www.fdma.go.jp/mission/prevention/items/bekki${id}.doc`
const PDF_URL = (id) => `https://www.fdma.go.jp/laws/kokuji/items/s50_kokuji14_bekki${id}.pdf`

const download = async (url, dest) => {
    const res = await fetch(url, { redirect: "follow" })
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` }
    const buf = Buffer.from(await res.arrayBuffer())
    fs.writeFileSync(dest, buf)
    return { ok: true, bytes: buf.length, contentType: res.headers.get("content-type") ?? "" }
}

/** ★中身が本物か。拡張子ではなくマジックバイトで見る */
const inspect = (file, kind) => {
    if (!fs.existsSync(file)) return { ok: false, reason: "ファイルが無い" }
    const buf = fs.readFileSync(file)
    if (buf.length === 0) return { ok: false, reason: "0バイト" }
    const head = buf.subarray(0, 8)
    const asText = buf.subarray(0, 200).toString("latin1").toLowerCase()
    if (asText.includes("<html") || asText.includes("<!doctype")) {
        return { ok: false, reason: "HTML を掴んでいる（エラーページ）" }
    }
    if (kind === "doc") {
        // ★消防庁は bekki5 / bekki10 だけ .doc という名前で中身は .docx（ZIP）を配信している。
        //   拡張子で決めつけるとこの2件を「壊れている」と誤判定する（実測 2026-07-26）。
        //   どちらも正当なので、OLE2 と ZIP(docx) の両方を受け入れ、どちらかを記録する。
        const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
        const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04])
        if (head.equals(ole)) return { ok: true, bytes: buf.length, format: "doc(OLE2)" }
        if (head.subarray(0, 4).equals(zip)) return { ok: true, bytes: buf.length, format: "docx(ZIP)" }
        return { ok: false, reason: `doc でも docx でもない (${head.toString("hex")})` }
    } else {
        if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") {
            return { ok: false, reason: `PDF ではない (${head.toString("hex")})` }
        }
    }
    return { ok: true, bytes: buf.length, format: "pdf" }
}

fs.mkdirSync(DOC_DIR, { recursive: true })
fs.mkdirSync(PDF_DIR, { recursive: true })

const rows = []
for (const id of FORM_IDS) {
    const docFile = path.join(DOC_DIR, `bekki${id}.doc`)
    const pdfFile = path.join(PDF_DIR, `s50_kokuji14_bekki${id}.pdf`)
    if (!VERIFY_ONLY) {
        const d = await download(DOC_URL(id), docFile)
        const p = await download(PDF_URL(id), pdfFile)
        if (!d.ok) console.error(`  bekki${id} doc: ${d.reason}`)
        if (!p.ok) console.error(`  bekki${id} pdf: ${p.reason}`)
    }
    rows.push({ id, doc: inspect(docFile, "doc"), pdf: inspect(pdfFile, "pdf") })
}

console.log(`${"様式".padEnd(8)} ${"Word".padEnd(22)} PDF`)
console.log("-".repeat(58))
for (const r of rows) {
    const f = (x) => (x.ok ? `OK ${String(x.bytes).padStart(7)}B ${x.format ?? ""}` : `NG ${x.reason}`)
    console.log(`bekki${r.id.padEnd(4)} ${f(r.doc).padEnd(22)} ${f(r.pdf)}`)
}
console.log("-".repeat(58))

const docOk = rows.filter((r) => r.doc.ok).length
const pdfOk = rows.filter((r) => r.pdf.ok).length
console.log(`期待 ${FORM_IDS.length} 件 / Word ${docOk} 件 / PDF ${pdfOk} 件`)

if (docOk !== FORM_IDS.length || pdfOk !== FORM_IDS.length) {
    console.error("\n★そろっていない。11 が 11_1 / 11_2 に分かれる規則を落としていないか、")
    console.error("  取得に失敗して空ファイル・HTML を掴んでいないかを確認すること。")
    process.exit(1)
}
console.log("FDMA_REFERENCE_OK")
