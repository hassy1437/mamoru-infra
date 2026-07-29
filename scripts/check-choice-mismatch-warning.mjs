// 「選択肢欄の値がどの選択肢とも一致しない」ことの警告の回帰検査。
//
// ■ なぜこの検査が要るか（★ここだけ他と性質が違う）
//   選択肢が一致しないと ○ が1つも描かれない。PDFは正常終了し、罫線越えも
//   刷り込みへの重なりも出ず、ベースラインも（そのセルが元から空なら）通る。
//   ＝ **全検査が緑のまま情報だけ落ちる唯一の経路**。だから警告そのものを検査する。
//
// ■ 警告であってエラーでない理由（格上げの判断を誤らせないため、ここにも書く）
//   照合は includes による見込み判定で、フォーム側は自由入力を許している。
//   表記ゆれで外れた瞬間、正当な値なのに報告書が1枚も出せなくなる（回避手段が無い）。
//       誤って警告   → 業者は見て直せる／無視しても出せる
//       誤ってブロック → 正当な値なのに出力できない
//   ★Phase 3 でフォームを選択式にしたら、そのときエラーへ格上げすること。
//
// 検査すること（両方向）:
//   1. 一致しない値 → 警告が出る／有効な選択肢が列挙されている／PDFは返る
//   2. 一致する値   → 警告が出ない（誤検出しない）
//   3. 空欄         → 警告が出ない（未入力を「間違い」と言わない）
//   4. 現実値セット全25様式 → 警告0件（正常な出力を妨げない）
//
// 使い方: node scripts/check-choice-mismatch-warning.mjs
import fs from "fs"
import path from "path"
import { runRoutePdf } from "./run-route-pdf.mjs"

const REAL_DIR = path.join(process.cwd(), "tmp", "pdf-realistic")
const BEKKI14 = "src/app/api/generate-emergency-alarm-bekki14-pdf/route.ts"
const CHOICES = ["一斉", "区分", "相互", "再鳴動"]

const problems = []
const check = (ok, message) => {
    if (!ok) problems.push(message)
}

const readWarning = (headers) => {
    const b64 = headers?.["x-fit-warnings"] ?? headers?.["X-Fit-Warnings"] ?? null
    if (!b64) return null
    return JSON.parse(Buffer.from(b64, "base64").toString("utf8"))
}

/** bekki14 の現実値 payload を土台に、鳴動方式（p1行23）だけ差し替える */
const withAlarmMode = (value) => {
    const payload = JSON.parse(fs.readFileSync(path.join(REAL_DIR, "bekki14_test.payload.json"), "utf8"))
    payload.page1_rows[23].content = value
    // p2 側は一致する値のままにして、対象を1件に絞る（件数の期待値を明確にするため）
    payload.page2_rows[30].content = "再鳴動"
    return payload
}

const run = async (payload, outName) => {
    const res = await runRoutePdf({
        routePath: BEKKI14, payload, outPdfPath: path.join("tmp", outName),
    })
    return { warning: readWarning(res.headers), bytes: res.bytes }
}

// --- 1. 一致しない値 -------------------------------------------------
{
    const { warning, bytes } = await run(withAlarmMode("順次"), "choice-mismatch.pdf")
    const items = warning?.choices ?? []
    check(items.length === 1, `一致しない値で警告1件を期待、実際 ${items.length} 件`)
    const it = items[0]
    check(it?.text === "順次", `警告に入力値が載っていない: ${JSON.stringify(it?.text)}`)
    // ★有効な選択肢の列挙は必須。「一致しません」だけでは業者は直せない
    check(
        CHOICES.every((c) => it?.hint?.includes(c)),
        `有効な選択肢が列挙されていない: ${JSON.stringify(it?.hint)}`,
    )
    check(
        Array.isArray(it?.choices) && CHOICES.every((c) => it.choices.includes(c)),
        `choices が正しくない: ${JSON.stringify(it?.choices)}`,
    )
    // ★止めないこと自体を検査する。エラーに格上げされたらここで落ちる
    check(bytes > 0, "警告が出たときに PDF が返っていない（止めてはいけない）")
}

// --- 2. 一致する値（誤検出しないこと） ------------------------------
for (const v of ["一斉", "区分", "相互", "再鳴動", "一斉鳴動"]) {
    const { warning } = await run(withAlarmMode(v), "choice-match.pdf")
    const items = warning?.choices ?? []
    check(items.length === 0, `一致する値「${v}」で誤検出 ${items.length} 件`)
}

// --- 3. 空欄（未入力を間違いと言わないこと） ------------------------
{
    const { warning } = await run(withAlarmMode(""), "choice-empty.pdf")
    check((warning?.choices ?? []).length === 0, "空欄で警告が出ている（未入力は間違いではない）")
}

/**
 * ★かつて○が一度も描かれていなかった選択肢欄の記録（現在は空）。
 *
 * この検査を入れた初回に判明したこと（2026-07-28）:
 *   選択肢欄のうち **行から値を取るもの が16箇所** あり、そのうち bekki14 の2つ以外は
 *   どちらのテストセットでも選択肢の語が入っていない。行番号が skipContentRows にも
 *   載るため、applyNumericRows が "0.45" で上書きしてしまう（bekki14 と同じ conflation）。
 *   結果、**14箇所の○は一度も描かれたことがなく、座標が正しいかも未検証**。
 *   ○が描かれないこと自体はどの検査にも出ない（罫線越えでも重なりでもベースラインでもない）。
 *
 * ★このリストは「既知の借金」であって、正常の記録ではない。ゼロにするのが目標。
 *   ・新しく増えたら落とす（黙って増えるのを防ぐ）
 *   ・直したら落とす（リストから外させる。放置すると嘘の記録になる）
 *   解消には各様式で選択肢の語をテストデータに入れ、bekki14 と同様に
 *   楕円が隣の刷り込み語に触れていないことを実測する必要がある。
 */
const KNOWN_UNEXERCISED = []   // ★2026-07-28: 14箇所すべてに選択肢の語を入れ、○が描かれることを確認済み

// --- 4. 現実値セット全体で0件 ---------------------------------------
{
    const jobs = fs.readdirSync(REAL_DIR).filter((f) => f.endsWith(".payload.json"))
    let scanned = 0
    const hits = []
    for (const f of jobs) {
        const name = f.replace(/\.payload\.json$/, "")
        const jobPath = path.join(process.cwd(), "tmp")
        // 生成時に残した job.json からルートを引く（様式ごとに探し回らない）
        const jobFile = findJob(jobPath, name)
        if (!jobFile) continue
        const { routePath } = JSON.parse(fs.readFileSync(jobFile, "utf8"))
        const payload = JSON.parse(fs.readFileSync(path.join(REAL_DIR, f), "utf8"))
        const res = await runRoutePdf({
            routePath, payload, outPdfPath: path.join("tmp", "choice-scan.pdf"),
        })
        scanned += 1
        const items = readWarning(res.headers)?.choices ?? []
        if (items.length) hits.push(`${name}: ${items.map((i) => i.text).join(", ")}`)
    }
    check(scanned >= 20, `走査した様式が少なすぎる（${scanned} 件）。job.json の探索が壊れている可能性`)
    const got = hits.map((h) => h.split(":")[0]).sort()
    const want = [...KNOWN_UNEXERCISED].sort()
    const added = got.filter((g) => !want.includes(g))
    const fixed = want.filter((w) => !got.includes(w))
    check(added.length === 0, `★新しく○が描かれない様式が増えた: ${added.join(", ")}`)
    check(
        fixed.length === 0,
        `${fixed.join(", ")} は○が描かれるようになった。KNOWN_UNEXERCISED から外してください`
        + "（放置するとリストが嘘になる）",
    )
    console.log(`  現実値セット ${scanned} 様式を走査 / ○が描かれない様式 ${got.length} 件（既知 ${want.length} 件）`)
}

function findJob(root, name) {
    const stack = [root]
    while (stack.length) {
        const dir = stack.pop()
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name)
            if (e.isDirectory()) stack.push(p)
            else if (e.name === `${name}.job.json`) return p
        }
    }
    return null
}

if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("CHOICE_MISMATCH_WARNING_CHECK_OK")
