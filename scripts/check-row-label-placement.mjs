// 入力画面の行（BEKKI_ROW_LABELS）が、紙の同じ名前の行に印字されるかを、別記 23 様式の全行で検査する。
//
// ■ なぜ要るか（2026-10-07 のフル印字テスト）
//   別記13 で、画面の「起動機能」（雛形では 2 行をまとめる見出しセル）を 1 行として数えていたため、
//   「連動起動機能」から 8 行が 1 行下に印字されていた（画面の「連動起動機能＝否」が紙の「優先通報機能」に載る）。
//   ★行数が偶然そろっていたので、route は i 番目の値を i 番目の帯に黙って描き、どの検査にも出なかった:
//     ・ベースライン … 描かれるピクセルは正常（行が違うだけ）
//     ・check-row-labels … 画面とラベル表が一致しているかを見るだけで、雛形の刷り込みとは突き合わせない
//
// ■ 検査すること（★行の位置は route の定数ではなく、実際に描かれた位置で見る＝写しを検査しない）
//   各様式の全行に「判定＝否・不良内容＝その行の印（Q{ページ}{行2桁}）」を入れて route で PDF を作り、
//   印が描かれた高さの左側にある雛形の刷り込み（行ラベル）に、画面の行ラベルの末尾（「 / 」の最後）が含まれるか。
//   ★見出し行（ラベルに「見出し行」）は描かない作りなので、印が無いことを確かめる。
//
// 使い方: node scripts/check-row-label-placement.mjs [--self-test]
//   ★tmp/pdf-realistic の payload を土台にする（generate-realistic-route-tests.mjs / check-pdf-all --regen）
import { spawnSync } from "child_process"
import fs from "fs"
import path from "path"
import { runRoutePdf } from "./run-route-pdf.mjs"

const PY = process.platform === "win32" ? "python" : "python3"
// ★自己診断と本番は check-pdf-all が並列に走らせるので、作る PDF の置き場所を分ける（同じ名前を同時に書くと読めない）
const OUT = path.join("tmp", process.argv.includes("--self-test") ? "row-label-placement-selftest" : "row-label-placement")
fs.mkdirSync(OUT, { recursive: true })

/** 行ラベル表（src/lib/bekki-row-labels.ts・生成物）を読む */
function loadRowLabels() {
    const ts = fs.readFileSync("src/lib/bekki-row-labels.ts", "utf8")
    const body = ts.slice(ts.indexOf("= {") + 2, ts.lastIndexOf("}") + 1).replace(/readonly string\[\]/g, "")
    return Function(`return (${body})`)()
}

/** 様式名 → route（src/lib/pdf-merge-config.ts）と土台の payload */
function loadForms() {
    const src = fs.readFileSync("src/lib/pdf-merge-config.ts", "utf8")
    const re = /apiRoute:\s*"([^"]+)",\s*formNo:\s*([\d.]+)/g
    const byNo = {}
    let m
    while ((m = re.exec(src))) byNo[m[2]] = m[1]
    const labels = loadRowLabels()
    return Object.keys(labels).map((form) => {
        const no = form.replace("別記様式第", "").replace("の", ".")
        const file = `bekki${no.replace(".", "_")}_test.payload.json`
        return {
            form,
            route: path.join("src", "app", byNo[no].replace(/^\//, ""), "route.ts"),
            base: path.join("tmp", "pdf-realistic", file),
            labels: labels[form],
        }
    })
}

const marker = (page, i) => `Q${page}${String(i).padStart(2, "0")}`
const norm = (s) => s.normalize("NFKC").replace(/\s+/g, "").replace(/[・･、,，]/g, "")
/** 画面ラベルの末尾から、刷り込みと照らす芯を取る（括弧の中・※・単位の注記は様式と書き方が違うので外す） */
function core(label) {
    // ★括弧は区切る前に外す（「圧力スイッチ（設定圧力 MPa）」の空白で切らない）
    const noParen = label.normalize("NFKC").replace(/[（(][^）)]*[）)]/g, "").replace(/※/g, "")
    // ★区切りは様式によって「 / 」・空白・「：」がある（例: 「補助散水栓 ポンプ方式 放水量」「周囲の状況：開口部」）
    const leaf = noParen.split(/\s*\/\s*|\s+|：|:/).filter(Boolean).pop() ?? noParen
    return norm(leaf) || norm(label)
}
/** 2 つの文字列の最長の共通部分の長さ */
function lcs(a, b) {
    let best = 0
    for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
        let k = 0
        while (a[i + k] && a[i + k] === b[j + k]) k++
        if (k > best) best = k
    }
    return best
}
/**
 * その行の刷り込みが、画面の行ラベルと別物か。
 *   ★様式と画面で書き方が違う行（縦書きの見出しの字が混ざる・「可動部外形」と「外形」等）があるので、
 *     「含まれない」だけでは外れにしない。次のどちらかのときだけ外れ:
 *     ・共通部分が 1 字以下（まったく別の行）
 *     ・前後 2 行の別のラベルのほうが含まれる（＝1〜2 行ずれ。2026-10-07 の別記13 の型）
 */
/** a の字が、この順で b に現れるか（縦書きの見出しの字が間に挟まる刷り込み: 「外」「置」「形」） */
function subsequence(a, b) {
    let k = 0
    for (const ch of b) if (ch === a[k]) k++
    return k === a.length
}
/** 括弧の中身（「外形（1号）」の「1号」）。様式は括弧の中身のほうを行の名前として刷っていることがある */
const parenCores = (label) =>
    [...label.normalize("NFKC").matchAll(/[（(]([^）)]*)[）)]/g)].map((m) => norm(m[1]).replace(/\//g, "")).filter((s) => s.length >= 2)

function mismatched(text, rows, i, expectLabel) {
    const own = core(expectLabel)
    if (subsequence(own, text)) return false
    if (parenCores(expectLabel).some((p) => subsequence(p, text))) return false
    // 2 行に分かれて刷られた名前の、括弧の行だけが窓に入った（「…（排圧栓を含む。）」）
    //   ★括弧つきに限る。括弧の無い語（「安全装置」）で許すと、画面の上位の見出しに含まれるだけで通ってしまう
    if (/[(（]/.test(text) && text.length >= 4 && norm(expectLabel).includes(text.replace(/[^\p{L}\p{N}()（）。]/gu, ""))) return false
    if (lcs(own, text) < 2) return true
    for (let j = i - 2; j <= i + 2; j++) {
        if (j === i || j < 0 || j >= rows.length || rows[j] === expectLabel) continue
        const other = core(rows[j])
        if (other.length >= 3 && text.includes(other) && !own.includes(other)) return true
    }
    return false
}

/** PDF の全ページの語（ページ番号つき） */
function wordsOf(pdf) {
    const code = "import fitz, json, sys\nd = fitz.open(sys.argv[1])\nprint(json.dumps([[i, w[0], w[1], w[2], w[3], w[4]] for i, p in enumerate(d) for w in p.get_text('words')]))"
    const r = spawnSync(PY, ["-c", code, pdf], { encoding: "utf8", maxBuffer: 1 << 26 })
    if (r.status !== 0) throw new Error(`PDF を読めない: ${r.stderr}`)
    return JSON.parse(r.stdout.trim().split("\n").pop())
}

async function render(f) {
    const payload = JSON.parse(fs.readFileSync(f.base, "utf8"))
    for (const [key, rows] of Object.entries(f.labels)) {
        const page = Number(key.match(/\d+/)[0])
        payload[key] = rows.map((_, i) => ({
            content: "", judgment: "否", bad_content: marker(page, i), action_content: "",
            bad_count: "", flow_value: "", hose_count: "", nozzle_dia: "", current_value: "",
        }))
    }
    const out = path.join(OUT, `${f.form}.pdf`)
    await runRoutePdf({ routePath: f.route, payload, outPdfPath: out })
    return wordsOf(out)
}

/** 印の左側・同じ高さの刷り込みを連ねる */
function labelTextAt(words, hit) {
    const [pg, x0, y0, , y1] = hit
    const cy = (y0 + y1) / 2
    return words
        // ★±8pt: 2 行に分けて刷られた行の名前（上下 ±6.6〜6.9pt）を両方拾う。行の高さは 19〜21pt なので隣の行は入らない
        .filter((w) => w[0] === pg && w[3] < x0 - 1 && Math.abs((w[2] + w[4]) / 2 - cy) < 8 && !/^Q\d{3,}$/.test(w[5]) && !/^[×○]$/.test(w[5]))
        .sort((a, b) => a[1] - b[1])
        .map((w) => w[5])
        .join("")
}

async function judge(forms, shift = 0) {
    const problems = []
    let checked = 0
    for (const f of forms) {
        const words = await render(f)
        for (const [key, rows] of Object.entries(f.labels)) {
            const page = Number(key.match(/\d+/)[0])
            rows.forEach((label, i) => {
                const m = marker(page, i)
                const hits = words.filter((w) => w[5] === m)
                const heading = /見出し行/.test(label)
                if (heading) {
                    if (hits.length) problems.push(`${f.form} ${key}[${i}]「${label}」: 見出し行なのに印が描かれた`)
                    return
                }
                if (hits.length !== 1) {
                    problems.push(`${f.form} ${key}[${i}]「${label}」: 印が ${hits.length} 回描かれた（1 回のはず）`)
                    return
                }
                // ★陽性対照用: shift 行ずらしたラベルと照らす（ずれを拾えるか）
                const expectLabel = rows[i + shift] ?? label
                const text = norm(labelTextAt(words, hits[0]))
                checked++
                if (mismatched(text, rows, i, expectLabel)) {
                    problems.push(`${f.form} ${key}[${i}]「${expectLabel}」: 印字された行の刷り込みは「${labelTextAt(words, hits[0]) || "（無し）"}」`)
                }
            })
        }
    }
    return { problems, checked }
}

const forms = loadForms()
for (const f of forms) {
    if (!fs.existsSync(f.base)) {
        console.log(`★NG: ${f.base} が無い（generate-realistic-route-tests.mjs を走らせること）`)
        process.exit(1)
    }
}

if (process.argv.includes("--self-test")) {
    const ok = await judge(forms)
    if (ok.problems.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of ok.problems) console.log("   ", p)
        process.exit(1)
    }
    // 陽性対照: 別記13 で「1 行下のラベル」と照らすと、ほぼ全行が外れになること（2026-10-07 のずれと同じ型）
    const f13 = forms.filter((f) => f.form === "別記様式第13")
    const shifted = await judge(f13, 1)
    if (shifted.problems.length < shifted.checked * 0.6) {
        console.log(`自己診断: 1 行ずれを拾えない（外れ ${shifted.problems.length} / ${shifted.checked}）`)
        process.exit(1)
    }
    console.log(`  陰性対照: 23 様式・${ok.checked} 行が、画面と同じ名前の行に印字される`)
    console.log(`  陽性対照: 別記13 を 1 行ずらして照らす → ${shifted.problems.length} / ${shifted.checked} 行が外れと判定`)
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const { problems, checked } = await judge(forms)
console.log(`画面の行 ⇔ 紙の行を検査: 23 様式・${checked} 行`)
if (problems.length) {
    console.log(`★NG: ${problems.length} 件`)
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("ROW_LABEL_PLACEMENT_OK")
