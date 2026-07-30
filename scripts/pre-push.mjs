// push 前に走らせる検査。★軽いものだけ（実測 約8秒）。
//
// ■ なぜフックとCIで分けるか
//   ふたつは別の失敗モードを塞ぐ:
//     フック … 「壊れたまま push する」。静的検査は速いので --no-verify を使う動機が出ない
//     CI     … 「その端末では通ったが他では通らない」。生成物が端末にしかない状態を検出
//   ★重い検査（PDFを作って測るもの）はここに入れない。85秒を毎回強いると
//     --no-verify が常用され、フックそのものが無意味になる。それは CI が見る。
//
// ■ ベースラインの鮮度だけは例外的にここで見る
//   ベースライン照合は画素比較で、差分が出たら**人が目で見て承認する**検査。
//   CI には載せられない（赤いまま放置されるか無条件更新されるかになる）。
//   照合そのものは人がやるが、**やり忘れは機構が止める**。
//
// 使い方: .git/hooks/pre-push から呼ばれる。手動なら node scripts/pre-push.mjs
import { spawnSync } from "child_process"

const PY = process.platform === "win32" ? "python" : "python3"

/** 静的検査（PDFを作らずに走るもの）＋ベースラインの鮮度 */
const CHECKS = [
    { name: "Python依存の宣言", cmd: [PY, "scripts/check-python-deps.py"], sentinel: "PYTHON_DEPS_OK",
      why: "requirements.txt とズレると CI だけが落ちる（手戻りになる）" },
    { name: "孤立検査の検出", cmd: ["node", "scripts/check-pdf-all.mjs", "--list"], sentinel: null,
      why: "検査を足して登録し忘れると、誰も走らせない検査が増える" },
    { name: "行ラベル表の同期", cmd: ["node", "scripts/check-row-labels.mjs"], sentinel: "ROW_LABELS_OK",
      why: "フォームの行が増減すると以降のラベルが全部ずれ、業者が別の行を開く" },
    { name: "警告の取りこぼし", cmd: ["node", "scripts/check-warning-consumers.mjs"], sentinel: "WARNING_CONSUMERS_OK",
      why: "サーバが返した警告を UI が捨てる。3回起きている" },
    { name: "様式の綴じ順", cmd: ["node", "scripts/check-merge-order.mjs"], sentinel: "MERGE_ORDER_OK",
      why: "一括PDFの並び順" },
    { name: "数値欄の宣言", cmd: [PY, "scripts/check-numeric-rows-declaration.py"], sentinel: "NUMERIC_ROWS_DECLARATION_OK",
      why: "宣言が嘘だと現実値セットが偽の値で埋まり、検査が空振りしたまま緑になる" },
    { name: "○の接触", cmd: [PY, "scripts/check-choice-clearance.py"], sentinel: "CHOICE_CLEARANCE_OK",
      why: "○が隣の選択肢に触れると、何を選んだか分からない法定書類になる" },
    { name: "行ループのセル定義", cmd: [PY, "scripts/check-row-cells.py"], sentinel: "ROW_CELLS_OK",
      why: "セル定義が刷り込みに掛かっていないか" },
    { name: "ベースラインの鮮度", cmd: ["node", "scripts/baseline-stamp.mjs"], sentinel: "BASELINE_STAMP_OK",
      why: "★照合は人がやるが、やり忘れは機構が止める" },
]

const t0 = Date.now()
let failed = 0
console.log("pre-push 検査（軽いものだけ。重い検査は npm run check:pdf と CI が見ます）")
for (const c of CHECKS) {
    const r = spawnSync(c.cmd[0], c.cmd.slice(1), {
        encoding: "utf8", shell: false, env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    })
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`
    const ok = r.status === 0 && (c.sentinel === null || out.includes(c.sentinel))
    console.log(`  ${ok ? "OK  " : "★NG "} ${c.name}`)
    if (!ok) {
        failed += 1
        console.log(`       ${c.why}`)
        for (const l of out.split(/\r?\n/).filter(Boolean).slice(-12)) console.log(`       ${l}`)
    }
}
console.log(`所要 ${((Date.now() - t0) / 1000).toFixed(1)}s / ${CHECKS.length} 件 / 失敗 ${failed} 件`)
if (failed) {
    console.log("\n★push を中止しました。上の指摘を直してから push してください。")
    console.log("  どうしても急ぐ場合は git push --no-verify で回避できますが、")
    console.log("  その場合 CI が同じものを検出します（手戻りが増えるだけです）。")
    process.exit(1)
}
console.log("PRE_PUSH_OK")
