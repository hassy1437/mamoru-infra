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
/**
 * 刷り込みが両端を規定していて「桁数そのものが決まっている」空欄。
 *
 * ★既定の埋め値 "0.45" は4文字ある。刷り込みが「－ __ ％」のように2桁ぶんしか
 *   空けていない欄に4文字を入れると、レイアウトの検証ではなく**入るはずのない値**の
 *   検証になり、絶対下限割れが恒常的に出て検出器が死ぬ。
 * ★これは列挙であって導出ではない。増えたら足す必要があるが、足し忘れても
 *   「下限割れが出る」側に転ぶ（黙って通らない）。
 *   値は様式が想定する桁数に合わせる。幅は実測値。
 */
export const NARROW_NUMERIC_ROWS = {
    // 別記様式第12 感度範囲「－ __ ％ ～ ＋ __ ％」: 空欄は 10.56pt / 10.44pt ＝ 2桁
    "generate-leakage-fire-alarm-bekki12-pdf": { page2_rows: { 0: "10" } },
}

export const numericValueFor = (routePath, key, row, fallback = "0.45") => {
    const dir = routePath.replace(/\\/g, "/").split("/").at(-2)
    return NARROW_NUMERIC_ROWS[dir]?.[key]?.[row] ?? fallback
}

/**
 * 数値欄に入れる「文字種」の基準。
 *
 * ■ なぜ要るか（2026-08-01 に踏んだ）
 *   長文セットは**長さ**を振っていたが**文字種**を振っていなかった。数値欄は
 *   現実値セットも長文セットも "0.45" のような短い数字を入れるので、
 *   「数値欄に和文が入る」経路がテストデータで一度も踏まれていなかった。
 *   業者は実際に「不明」「確認できず」「該当なし」と書く（未計測・未設置・故障中など、
 *   数値を書けない状況が点検では普通に起きる）。bekki9 ホース本数の情報欠落は
 *   この経路で、長さをいくら振っても出てこなかった。
 *
 * ■ なぜ3本目のセットを作らないか
 *   系統を増やすと片方に処理を足し忘れる（fixture 系4本が長文化されていなかったのが実例）。
 *   ＝ 長文セットに「文字種」という軸を足す。現実値セットは数字のまま残すので、
 *      2セットで 数字×現実長 / 和文×長文 の両方を踏む。
 *
 * ■ どれを長文セットに当てるか（実測。★推測で決めない）
 *   全26様式に同じ値を入れて計測した結果:
 *
 *     値              字数  422   切り詰め(新規)  下限割れ(新規)
 *     不明              2    0本      0             1
 *     該当なし          4    4本      —             —
 *     確認できず        5    5本      3             3
 *
 *   ★422 になると**その様式の PDF が出ない**ので、下流の検査（下限割れ・はみ出し・
 *     ベースライン）がその様式を丸ごと失う。長文セットは「収まらないことを表明する」
 *     ためではなく「その入力での版面を測る」ためにあるので、26本すべてが出る
 *     「不明」を当てる。4字・5字で 4〜5本が 422 になることは**本番の所見**であって
 *     テストの都合ではないので、消さずにここに残す（applyToStress: false）。
 */
export const NUMERIC_JP_STANDARD = [
    {
        value: "不明",
        applyToStress: true,
        why: "点検時に数値を確認できない場合の最短の記載。2字なら26様式すべてがPDFを出せるので、"
            + "下流の検査を落とさずに『数値欄に和文が入る』経路を常時踏める",
    },
    {
        value: "該当なし",
        applyToStress: false,
        why: "設備が無い・対象外のときの定型。実測で4様式が422になり、その様式のPDFが出ないため当てない",
    },
    {
        value: "確認できず",
        applyToStress: false,
        why: "計測不能・立入不可のときの定型。実測で5様式が422（bekki3/4/5/9/12）。"
            + "★これらの欄は和文5字が物理的に入らないという本番の所見",
    },
]

/** 長文セットで数値欄に入れる値。★1か所で決める（生成スクリプトに直書きしない） */
export const numericStressValue = () => NUMERIC_JP_STANDARD.find((x) => x.applyToStress).value

/**
 * @param {object} opts
 *   ignoreNarrow … NARROW_NUMERIC_ROWS（桁数が決まった欄の専用値）を無視する。
 *   ★文字種の軸を当てるときは無視する。あの一覧は「数字を入れる前提」で桁数を
 *     合わせたものなので、尊重すると**いちばん狭い欄にだけ和文が入らない**という
 *     逆の穴が空く（実測: bekki12 page2_rows[0] がそれに当たる）。
 */
export const applyNumericRows = (payload, routePath, value = "0.45", opts = {}) => {
    const byKey = numericRowsByKey(routePath)
    for (const [key, indexes] of byKey) {
        const rows = payload?.[key]
        if (!Array.isArray(rows)) continue
        for (const i of indexes) {
            if (rows[i] && typeof rows[i] === "object" && "content" in rows[i]) {
                rows[i].content = opts.ignoreNarrow ? value : numericValueFor(routePath, key, i, value)
            }
        }
    }
    return payload
}
