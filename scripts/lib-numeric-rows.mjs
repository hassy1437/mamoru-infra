// 「数値しか入らない欄」の行番号を、各ルートの NUMERIC_ROWS 宣言から読む共有部品。
// 長文セットと現実値セットの両方が使う。長文セットでも、物理的に数値しか入らない
// セルに長文を入れるのはレイアウトの検証にならないため（入るはずがない）。
import fs from "fs"
import path from "path"

/** 括弧の対応を見て drawResultRows(...) の引数列を丸ごと取り出す */
export const callArgs = (src, start) => {
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

/** ★引数をトップレベルのカンマだけで分割する。
 *  素朴な split(",") だと、入れ子の呼び出しやオブジェクト内のカンマで割れてしまう。 */
export const splitTopLevelArgs = (args) => {
    const out = []
    let depth = 0, cur = ""
    for (const c of args) {
        if ("([{".includes(c)) depth += 1
        else if (")]}".includes(c)) depth -= 1
        if (c === "," && depth === 0) { out.push(cur); cur = ""; continue }
        cur += c
    }
    if (cur.trim()) out.push(cur)
    return out
}

/**
 * 各ルートの NUMERIC_ROWS 宣言から「数値しか入らない欄」の行番号を読む。
 *
 * ★以前は contentOverrides / skipContentRows から**推論**していた。これが誤りだった:
 *   - override の幅は実測で 12〜97pt に連続しており、数値欄と「単に x をずらした
 *     文字欄」を幅で分離できない。結果、現実値セットの100セル/14様式に "0.45" が入り、
 *     その範囲では切り詰めもはみ出しも測れていなかった（＝合否の基準が空振り）
 *   - skipContentRows には「専用コードが数値を描く行」と「刷り込みの選択肢の行」が
 *     混ざっており、ソースからは区別できない
 *   - bekki2 は drawResultRows に startIndex を取る。推論は rowBounds 基準の添字を
 *     返すため、page3 は実際の payload 添字と 22 ずれていた
 *   ＝ 推論をやめ、宣言だけを根拠にする。
 */
export const numericRowsByKey = (routePath) => {
    const src = fs.readFileSync(path.join(process.cwd(), routePath), "utf8")
    const map = new Map() // payloadのキー -> Set<行番号>

    const decl = src.match(/export const NUMERIC_ROWS[^=]*=\s*\{([\s\S]*?)\n\}/)
        ?? src.match(/export const NUMERIC_ROWS[^=]*=\s*(\{\})/)
    if (!decl) {
        // ★drawResultRows を使う様式は必ず宣言する。「宣言が無い＝未分類」を
        //   黙って空として扱うと、新しい様式が測られないまま緑になる。
        if (/drawResultRows\(/.test(src)) {
            throw new Error(
                `numericRowsByKey: ${routePath} は drawResultRows を使うのに ` +
                `NUMERIC_ROWS の宣言が無い（数値欄が無いなら空の宣言を置くこと）`,
            )
        }
        return map
    }
    for (const m of decl[1].matchAll(/(page\d+_rows)\s*:\s*\[([^\]]*)\]/g)) {
        const idx = new Set([...m[2].matchAll(/\d+/g)].map((x) => Number(x[0])))
        if (idx.size) map.set(m[1], idx)
    }
    return map
}

/**
 * 選択肢欄（テンプレートに刷り込まれた語を○で囲む欄）に、実際の選択肢の語を入れる。
 *
 * ★なぜ解析器任せにできないか（2026-07-28 に踏んだ）
 *   ルートの skipContentRows には**意味の違う2種類**が混ざっている:
 *     (a) 専用コードが数値を描く行 … 数値を入れるのが正しい
 *     (b) 刷り込みの選択肢の行     … 選択肢の語を入れないと ○ が1つも描かれない
 *   ソースからは (a)(b) を区別できない。実際 bekki14 に (b) を足した直後、
 *   長文セットの「一斉」「相互」が 0.45 で上書きされ、○が描かれないまま
 *   PDFは正常に生成された（＝黙って回帰が素通りする）。
 *   よって (b) は呼び出し側が宣言する。宣言と実装のズレはここで落とす。
 */
/**
 * ルートが実際に内容列の描画を止めている行（skipContentRows）を読む。
 *
 * ★NUMERIC_ROWS とは別物。NUMERIC_ROWS は「テストデータに数値を入れる欄」の宣言で、
 *   こちらは「実装が本当に描画を止めているか」の確認用。選択肢欄は数値欄ではないので
 *   NUMERIC_ROWS には載らないが、内容列は止まっていなければならない。
 */
export const skipContentRowsByKey = (routePath) => {
    const src = fs.readFileSync(path.join(process.cwd(), routePath), "utf8")
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
            if (local) {
                const decl = src.match(new RegExp(`const\\s+${local}\\s*=([^\\n]*)`))
                key = decl?.[1].match(/page\d+_rows/)?.[0]
            }
        }
        // ★第5引数が数値の様式がある（bekki2 の startIndex）。payload の添字はそのぶん進む
        const startIndex = /^\s*\d+\s*$/.test(parts[4] ?? "") ? Number(parts[4]) : 0
        const indexes = new Set()
        for (const part of parts.slice(4)) {
            if (!/^\s*new Set\(/.test(part)) continue
            const inner = part.match(/new Set\(\[([\s\S]*)\]\)/)
            if (!inner) continue
            for (const m of inner[1].replace(/\/\/.*/g, "").matchAll(/\d+/g)) {
                indexes.add(Number(m[0]) + startIndex)
            }
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

export const applyChoiceRows = (payload, routePath, choiceRows) => {
    if (!choiceRows) return payload
    const byKey = skipContentRowsByKey(routePath)
    for (const [key, rowMap] of Object.entries(choiceRows)) {
        const rows = payload?.[key]
        if (!Array.isArray(rows)) throw new Error(`applyChoiceRows: ${routePath} の payload に ${key} が無い`)
        for (const [i, word] of Object.entries(rowMap)) {
            const idx = Number(i)
            if (!rows[idx]) throw new Error(`applyChoiceRows: ${routePath} ${key}[${idx}] が存在しない`)
            // ★ルート側が内容列を止めていなければ、語が刷り込みに重なって描かれる。
            //   行番号がずれた／skip を消した、を黙って通さない。
            if (!byKey.get(key)?.has(idx)) {
                throw new Error(
                    `applyChoiceRows: ${routePath} ${key}[${idx}] を選択肢行として宣言しているが、` +
                    `ルートは内容列を止めていない（skipContentRows に ${idx} が無い）`,
                )
            }
            rows[idx].content = word
        }
    }
    return payload
}

/**
 * rows配列のうち「数値欄」に当たる行の content を数値に差し替える。
 *
 * 長文セットでもこれを通す理由: テンプレートが「設定圧力 ___ MPa」のように
 * 単位を印字していて物理的に数値しか入らないセルに長文を入れても、
 * レイアウトの検証にはならない（入るはずがない）。長文で試したいのは
 * 折り返し・縮小が働く"文字を入れる欄"のほう。
 */
export const applyNumericRows = (payload, routePath, value = "0.45") => {
    const byKey = numericRowsByKey(routePath)
    for (const [key, indexes] of byKey) {
        const rows = payload?.[key]
        if (!Array.isArray(rows)) continue
        for (const i of indexes) {
            if (rows[i] && typeof rows[i] === "object" && "content" in rows[i]) rows[i].content = value
        }
    }
    return payload
}
