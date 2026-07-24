// 「数値欄（幅を絞ったセル・専用コードが描く行）」の行番号をルート実装から読む共有部品。
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

/**
 * ルート実装から「数値欄（幅を絞ったセル）」の行番号を rows配列ごとに読む。
 *
 * ★contentOverrides という語は関数シグネチャにも出るので、そこを拾ってはいけない。
 *   最初はシグネチャ側の `= {}` を掴んでしまい、置換が黙って効かず、
 *   現実値セットに存在しないはずの切り詰めが6件出ていた（＝合否判定が狂う）。
 *   呼び出し側の実引数を括弧の対応で取り出し、最後のオブジェクトリテラルから読む。
 */
export const numericRowsByKey = (routePath) => {
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
