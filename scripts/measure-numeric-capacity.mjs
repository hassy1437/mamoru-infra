// 数値欄が何桁まで入るかを測る（容量という事実だけを出す）。
//
// ■ ★「その欄に入りうる最長の数値」を定義しない
//   それは実務の知識が要り、我々の手には無い。推測で決めると間違った基準で
//   検査を作ることになる。ここでは容量だけを残し、後で実務の値と突き合わせて
//   判断できるようにする。
//
// ■ 測り方（1様式 1リクエスト）
//   その様式の数値欄すべてに、**行ごとに違う**14桁の数字を入れて生成する。
//   ⑧は収まらない項目を 422 の本文で返し、各項目に fits（収まった文字数）が入る。
//   ＝ fits がそのまま容量。422 に出ない行は 14桁でも収まっている。
//   ★行ごとに違う文字列にするのが肝。同じ文字列だと収集器が重複を畳んでしまい、
//     どの行の容量か分からなくなる。
//
//   桁数を1ずつ増やして生成する方式も試したが、77行×14回で生成が10分を超えた。
//   ⑧が既に「何文字収まったか」を返しているので、それを使えば1回で足りる。
//
// ■ この失敗モードは元々安全側
//   数値が入らなければ 422 で「何文字超過か」が業者に返る。黙って切れることはない。
//   容量は余裕の把握のために測る。
//
// 使い方: node scripts/measure-numeric-capacity.mjs
import fs from "fs"
import path from "path"

import { numericRowsByKey } from "./lib-numeric-rows.mjs"
import { overrideWidthsByKey } from "./lib-boundary-rows.mjs"
import { runRoutePdf } from "./run-route-pdf.mjs"

const DIGITS = 14

const jobs = []
const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else if (e.name.endsWith(".job.json")) jobs.push(p)
    }
}
walk(path.join(process.cwd(), "tmp"))

/** 行ごとに違う14桁を作る（先頭3桁が行番号） */
const probeValue = (row) => String(row).padStart(3, "0") + "12345678901".slice(0, DIGITS - 3)

const out = []
for (const jobPath of [...new Set(jobs)].sort()) {
    const { routePath } = JSON.parse(fs.readFileSync(jobPath, "utf8"))
    const payloadPath = jobPath.replace(/\.job\.json$/, ".payload.json")
    if (!fs.existsSync(payloadPath)) continue
    const numeric = numericRowsByKey(routePath)
    if (!numeric.size) continue
    const form = path.basename(jobPath).replace(/\.job\.json$/, "").replace("_test", "")
    const widths = overrideWidthsByKey(routePath)

    const payload = JSON.parse(fs.readFileSync(payloadPath, "utf8"))
    const targets = []
    for (const [key, rows] of numeric) {
        if (!Array.isArray(payload[key])) continue
        for (const row of [...rows].sort((a, b) => a - b)) {
            if (!payload[key][row] || typeof payload[key][row] !== "object") continue
            payload[key][row].content = probeValue(row)
            targets.push({ key, row, value: probeValue(row) })
        }
    }
    if (!targets.length) continue

    let items = []
    try {
        await runRoutePdf({ routePath, payload, outPdfPath: path.join("tmp", "_cap.pdf") })
    } catch (e) {
        if (e.status !== 422) throw e
        items = JSON.parse(e.responseBody).items
    }
    for (const t of targets) {
        const hit = items.find((it) => it.text === t.value)
        out.push({
            form, key: t.key, row: t.row,
            width: widths.get(t.key)?.get(t.row) ?? null,
            capacity: hit ? hit.fits : DIGITS,
            atLeast: !hit,
        })
    }
    console.log(`  ${form.padEnd(12)} ${targets.length} 欄 / 収まらなかった ${items.length} 件`)
}

fs.writeFileSync(path.join("tmp", "numeric-capacity.json"), JSON.stringify(out, null, 2))
out.sort((a, b) => a.capacity - b.capacity)
console.log(`\n数値欄 ${out.length} 件の容量（${DIGITS}桁を投入して測定）`)
console.log(`${"容量".padEnd(8)}${"様式".padEnd(14)}${"欄".padEnd(16)}幅`)
console.log("-".repeat(56))
for (const o of out) {
    const cap = o.atLeast ? `${o.capacity}桁以上` : `${o.capacity}桁`
    console.log(`${cap.padEnd(10)}${o.form.padEnd(14)}${`${o.key}[${o.row}]`.padEnd(16)}${o.width ?? "既定"}`)
}
const tight = out.filter((o) => !o.atLeast && o.capacity <= 4)
console.log(`\n★4桁以下しか入らない欄: ${tight.length} 件`)
for (const t of tight) console.log(`    ${t.capacity}桁  ${t.form} ${t.key}[${t.row}] 幅 ${t.width ?? "既定"}`)
