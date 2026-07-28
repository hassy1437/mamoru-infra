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
 * ルート実装から「数値欄（幅を絞ったセル）」の行番号を rows配列ごとに読む。
 *
 * ★contentOverrides という語は関数シグネチャにも出るので、そこを拾ってはいけない。
 *   最初はシグネチャ側の `= {}` を掴んでしまい、置換が黙って効かず、
 *   現実値セットに存在しないはずの切り詰めが6件出ていた（＝合否判定が狂う）。
 *   呼び出し側の実引数を括弧の対応で取り出し、最後のオブジェクトリテラルから読む。
 *
 * ★2026-07-28 の事故: rows 引数を blankPrintedRows(rows, new Set([7])) で包んだところ、
 *   skip集合を拾う正規表現が**引数列の最初の new Set([...]) を非貪欲に**掴み、
 *   本来の skip 集合 new Set([3]) ではなく包み側の [7] を読んだ。
 *   その結果 bekki10 の数値行3に数値が入らず、テキストが 21.4pt の狭いセルに落ちて
 *   ⑧が 422 で止めた（止めなければ壊れたテストデータで全検査が緑になっていた）。
 *   ＝ 引数の**位置**で見る。skip集合は「それ単体が new Set( で始まる引数」だけ。
 */
export const numericRowsByKey = (routePath) => {
    const src = fs.readFileSync(path.join(process.cwd(), routePath), "utf8")
    const map = new Map() // payloadのキー -> Set<行番号>
    // ★このルートが drawResultRows を使っているか自体を先に見る。
    //   使っていない様式が実在する（bekki1 / 総括表 / 点検者一覧）ので、
    //   「呼び出し0件＝異常」にすると正常なものを落とす。実測してから条件を決める。
    const mentions = (src.match(/drawResultRows\(/g) ?? []).length
    const map0 = map
    let calls = 0
    let idx = src.indexOf("drawResultRows(")
    while (idx !== -1) {
        // 関数定義（const drawResultRows = (...)）は呼び出しではないので飛ばす
        const before = src.slice(Math.max(0, idx - 40), idx)
        if (/const\s+$/.test(before)) { idx = src.indexOf("drawResultRows(", idx + 1); continue }
        calls += 1
        const args = callArgs(src, idx + "drawResultRows".length)
        const parts = splitTopLevelArgs(args)
        const rowsExpr = parts[2] ?? ""
        // rows が局所変数なら const 宣言をたどって body.pageN_rows を解決する
        let key = rowsExpr.match(/page\d+_rows/)?.[0]
        if (!key) {
            // ★rows が blankPrintedRows(...) のように包まれている場合は中の識別子を見る
            const inner = rowsExpr.trim().replace(/^[A-Za-z_$][\w$]*\s*\(/, "")
            const local = (inner.match(/page\d+_rows/)?.[0])
                ?? inner.trim().match(/^[A-Za-z_$][\w$]*/)?.[0]
                ?? rowsExpr.trim().match(/^[A-Za-z_$][\w$]*/)?.[0]
            if (local?.match(/page\d+_rows/)) {
                key = local
            } else if (local) {
                // ★テンプレートリテラル内では \s が s に潰れ \n が実改行になる。
                //   正規表現を文字列で組むときはエスケープを二重にすること。
                const decl = src.match(new RegExp(`const\\s+${local}\\s*=([^\\n]*)`))
                key = decl?.[1].match(/page\d+_rows/)?.[0]
            }
        }
        const indexes = new Set()
        // ★列定義より後ろの引数だけを見る（rows 引数の中身は対象外）
        for (const part of parts.slice(4)) {
            // (a) contentOverrides: 幅を絞ったセル
            for (const m of part.matchAll(/(\d+):\s*\{\s*x:\s*[\d.]+\s*,\s*w:\s*[\d.]+\s*\}/g)) {
                indexes.add(Number(m[1]))
            }
            // (b) skip集合: **その引数自体が** new Set( で始まるものだけ。
            //     入れ子の new Set(...) を拾わないための位置指定。
            if (/^\s*new Set\(/.test(part)) {
                const inner = part.match(/new Set\(\[([\s\S]*)\]\)/)
                if (inner) {
                    // 行コメント付きで複数行に書かれるので、コメントを外してから数字を拾う
                    const cleaned = inner[1].replace(/\/\/.*/g, "")
                    for (const m of cleaned.matchAll(/\d+/g)) indexes.add(Number(m[0]))
                }
            }
        }
        if (key && indexes.size) {
            const cur = map.get(key) ?? new Set()
            for (const v of indexes) cur.add(v)
            map.set(key, cur)
        }
        idx = src.indexOf("drawResultRows(", idx + 1)
    }
    // ★静かに空を返さない。今回の事故は「壊れても空が返る」のが最悪だった。
    //   ただし条件は実測してから決める（正常側を測らずに置くと正常を落とす）:
    //     - 使っていない様式が実在する … bekki1 / 総括表 / 点検者一覧 は drawResultRows を
    //       持たない。「呼び出し0件＝異常」にすると、この3つを落とす（実際に落とした）
    //     - 狭いセルも skip集合も無い様式が9つある … 結果が空でも正常
    //   ＝ 落とすのは「ソースには出現するのに1件も解析できなかった」ときだけ。
    //     これは解析の前提が崩れた証拠にしかならない。
    if (mentions > 0 && calls === 0) {
        throw new Error(
            `numericRowsByKey: ${routePath} は drawResultRows を ${mentions} 箇所含むのに` +
            `呼び出しを1つも解析できない（解析の前提が崩れている）`,
        )
    }
    return map0
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
export const applyChoiceRows = (payload, routePath, choiceRows) => {
    if (!choiceRows) return payload
    const byKey = numericRowsByKey(routePath)
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
