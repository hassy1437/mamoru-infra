// 「狭めたセル」に境界へ届く長さの値を入れる（測定誤りをあぶり出すため）。
//
// ■ なぜ要るか
//   ①で77セルを「単位の左端」まで狭めたが、ベースラインが変わったのは3セルだけだった。
//   ＝ 残り74セルは**実際には一度も踏まれていない**。規則が正しくても、
//   個々の「単位の左端」を測り間違えていれば:
//       広すぎる → 監査（check-row-cells）に潜在として残るので検出できる
//       ★狭すぎる → 過剰な切り詰め。長い値のときだけ出るので誰も気づかない
//   bekki21 で「常用」の位置を x=275 と誤認（実測 232.92）した前例があるので、
//   これは机上の話ではない。
//
// ■ やり方
//   contentOverrides が指定されている行（＝狭めた行）に、そのセル幅で
//   ちょうど収まるはずの長さの日本語を入れる。切り詰めが出たら、
//   「そのセルには本当に入らない」のか「狭すぎる」のかを人が判断する。
//   ★数値欄（NUMERIC_ROWS）は対象外。数値しか入らないので長文を入れる意味がない。
import fs from "fs"
import path from "path"

import { callArgs, splitTopLevelArgs } from "./lib-numeric-rows.mjs"
import { numericRowsByKey } from "./lib-numeric-rows.mjs"

/** 6pt の日本語は約6pt/字。セル幅から padding を引いた分に収まる字数を作る */
const FILLER = "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん"

/**
 * ルートの contentOverrides を読む（payloadキー -> 行番号 -> 幅）。
 * ★check-row-cells.py と同じ情報を JS 側でも読む必要がある。
 *   位置は「contentOverrides という名前の引数」で特定する（bekki18 は sizes が
 *   間に入るので固定位置で決め打ちすると別の引数を読む）。
 */
export const overrideWidthsByKey = (routePath) => {
    const src = fs.readFileSync(path.join(process.cwd(), routePath), "utf8")
    const sig = src.match(/const drawResultRows = \(([\s\S]*?)\) => \{/)
    if (!sig) return new Map()
    const params = splitTopLevelArgs(sig[1])
    const argIndex = params.findIndex((p) => p.trim().startsWith("contentOverrides"))
    if (argIndex < 0) return new Map()

    const map = new Map()
    let idx = src.indexOf("drawResultRows(")
    while (idx !== -1) {
        if (/const\s+$/.test(src.slice(Math.max(0, idx - 40), idx))) {
            idx = src.indexOf("drawResultRows(", idx + 1)
            continue
        }
        const parts = splitTopLevelArgs(callArgs(src, idx + "drawResultRows".length))
        const rowsExpr = parts[2] ?? ""
        let key = rowsExpr.match(/page\d+_rows/)?.[0]
        if (!key) {
            const inner = rowsExpr.trim().replace(/^[A-Za-z_$][\w$]*\s*\(/, "")
            const local = inner.trim().match(/^[A-Za-z_$][\w$]*/)?.[0]
            if (local) key = src.match(new RegExp(`const\\s+${local}\\s*=([^\\n]*)`))?.[1].match(/page\d+_rows/)?.[0]
        }
        // ★bekki2 は第5引数が startIndex。payload の添字はそのぶん進む
        const startIndex = /^\s*\d+\s*$/.test(parts[4] ?? "") ? Number(parts[4]) : 0
        const arg = parts[argIndex] ?? ""
        if (key) {
            const cur = map.get(key) ?? new Map()
            for (const m of arg.matchAll(/(\d+):\s*\{\s*x:\s*[\d.]+\s*,\s*w:\s*([\d.]+)\s*\}/g)) {
                cur.set(Number(m[1]) + startIndex, Number(m[2]))
            }
            if (cur.size) map.set(key, cur)
        }
        idx = src.indexOf("drawResultRows(", idx + 1)
    }
    return map
}

/**
 * 狭めた行に「セル幅ちょうどに収まるはず」の長さの値を入れる。
 * ★収まるはずの長さにするのが肝。溢れる長さを入れると切り詰めが出て当たり前になり、
 *   測定誤りと区別できない。
 */
export const applyBoundaryRows = (payload, routePath, { fontSize = 6.0, padding = 2.0 } = {}) => {
    const numeric = numericRowsByKey(routePath)
    const filled = []
    for (const [key, widths] of overrideWidthsByKey(routePath)) {
        const rows = payload?.[key]
        if (!Array.isArray(rows)) continue
        for (const [i, w] of widths) {
            if (numeric.get(key)?.has(i)) continue          // 数値欄は対象外
            if (!rows[i] || typeof rows[i] !== "object") continue
            // ★2行分の長さを入れる。1行に収まる字数を計算して入れる方式では、
            //   ルートごとにフォントサイズが 6.0〜6.8 と違うため短すぎる行が出て、
            //   セル右端まで 8pt 以上余る行が 42/139 あった（＝境界を踏めていない）。
            //   折り返しは1行目をセル幅いっぱいまで詰めるので、2行分入れれば
            //   フォントサイズを知らなくても必ず境界を踏む。
            const chars = Math.max(2, Math.floor((w - padding * 2) / fontSize) * 2)
            rows[i].content = FILLER.slice(0, chars)
            filled.push(`${key}[${i}]=${chars}字(幅${w})`)
        }
    }
    return filled
}
