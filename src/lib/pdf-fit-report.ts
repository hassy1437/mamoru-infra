/**
 * 枠に収まらなかった項目の収集と、業者向けエラーの組み立て。
 *
 * ■ なぜ要るか
 *   収まらない値は現状 "..." で黙って切り詰められる。法定の提出書類にとっては
 *   「レイアウトの都合で必須項目が欠落した」状態で、はみ出しより悪い。
 *   ここで止めて「どの様式のどの項目が何文字超過か」を返せば、業者は自分で直せる。
 *
 * ■ 業者に見せるもの / 見せないもの
 *   テンプレート由来の固定文言やシステムが整形した値（日付など）が溢れた場合、
 *   業者に見せても直しようがない。それは業者のエラーではなく実装の不具合なので、
 *   業者向けの一覧には出さず system 扱いにしてログに回す。
 *   判定は「描こうとした文字列が入力(payload)の中に存在するか」で行う。
 *   ＝ 呼び出し側に項目名を渡させる必要がなく、既存の描画コードを触らずに済む。
 *
 * ■ 規定の優先順位との関係
 *   枠内収容の手順は 折返し → 縮小 → 字間 → 略称 の順で、最後まで収まらなければ
 *   「収容不能」としてエラーにする決まり。★このうち第4手の自動略称変換は未実装で、
 *   現状はその手前でエラーにしている。将来 略称変換を実装する場合は、
 *   このエラーを出す前段に入れること（エラーの置き換えではなく前段）。
 */

import { BEKKI_ROW_LABELS } from "./bekki-row-labels"

/**
 * 「点検項目の内容」だけでは、40行あるうちのどれか分からない。
 * 入力画面の行ラベル（＝業者が画面で見ている文字列）を添えて、該当行を開けるようにする。
 *
 * ★行ラベルが引けないときは行番号を出す。出典（フォームの PAGE{n}_ITEMS）と
 *   payload の行数がズレることは原理的にありうるので、黙って何も出さない方が悪い。
 */
const withRow = (base: string, form: string, rowsKey?: string, row?: number): string => {
    const r = rowLabelOf(form, rowsKey, row)
    return r ? `${base}（${r}）` : base
}

export const rowLabelOf = (form: string, rowsKey?: string, row?: number): string | null => {
    if (!rowsKey || row === undefined) return null
    const label = BEKKI_ROW_LABELS[form]?.[rowsKey]?.[row]
    const page = rowsKey.match(/page(\d+)_rows/)?.[1]
    const where = page ? `その${page}・${row + 1}行目` : `${row + 1}行目`
    return label ? `${where}「${label}」` : where
}

/** 業者が入力画面で辿れるように、payloadのキーを画面の表記に対応させる。 */
export const FIELD_LABELS: Record<string, string> = {
    form_name: "名称",
    location: "所在地",
    fire_manager: "防火管理者",
    witness: "立会者",
    inspector_name: "点検者氏名",
    inspector_company: "点検者所属会社",
    inspector_address: "点検者住所",
    inspector_tel: "TEL",
    equipment_name: "点検設備名",
    notes: "備考",
    // 報告書（第1号様式）の欄。★この様式は長らく fit コレクタ自体が無く、
    //   ラベルも登録されていなかった（英語のキーがそのまま業者に出る状態だった）。
    fire_department_name: "消防本部名",
    notifier_address: "住所",
    notifier_name: "氏名（法人名及び役職等）",
    notifier_phone: "電話番号",
    building_address: "所在地",
    building_name: "名称",
    building_usage: "用途",
    floor_above: "地上階数",
    floor_below: "地下階数",
    total_floor_area: "延べ面積 (㎡)",
    equipment_types: "消防用設備等の種類",
    content: "点検項目の内容",
    bad_content: "不良内容",
    action_content: "措置内容",
    // 別記様式5（泡消火設備）の消火薬剤 型式番号。刷り込み「（泡第 __ ～ __ 号）」の2つの空欄
    foam_type_no_from: "消火薬剤 型式番号（泡第 ○ 〜）",
    foam_type_no_to: "消火薬剤 型式番号（〜 ○ 号）",
}

/**
 * 描画位置。★どのセルで起きたかを、値の文字列ではなくここで識別する。
 *
 * ■ なぜ要るか（2026-08-01 実測）
 *   resolve() は値の文字列一致で入力欄を特定していた。本番DBの72帳票を測ると
 *   文字列欄 6006 のうち 5134（85.5%）が同一様式内に同じ値を持つ他の欄と衝突しており、
 *   72帳票すべてで重複が起きている（「良」1395・「部品交換」306・「変形あり」306 等）。
 *   ＝ ラベルが別の欄を指すのは例外ではなく常態。実際 15F で bekki3/4 の
 *      「設定圧力・作動圧力」が「貯水槽 水量」と誤帰属した。
 */
/** 「どの欄の何行目のどの列か」。呼び出し側（行ループ・専用描画）が渡す。 */
export type CellRef = {
    rowsKey?: string
    row?: number
    column?: string
}

export type CellAt = CellRef & {
    page: number
    cellX: number
    cellTopFromTop: number
    cellW: number
    cellH: number
}

export type FitFailure = {
    /** どの rows配列の何行目か（業者に「どの行か」を伝えるため） */
    rowsKey?: string
    row?: number
    /** 描画位置（分かった場合）。重複の畳み込みと帰属はこれを優先する */
    at?: CellAt
    /** 描こうとした文字列（全文） */
    text: string
    /** 収まった文字数（"..." を除く） */
    fits: number
    /** 入力(payload)由来か。false ならシステム整形値＝業者に見せない */
    fromInput: boolean
    /** payload 上のキー（分かった場合） */
    field?: string
}

export type FitCollector = {
    /** 描画側から「収まらなかった」ことを報告する（＝業者向けエラーになりうる） */
    report: (text: string, fits: number, at?: CellAt) => void
    /**
     * 判読しづらいほど小さく描かれたことの報告。★エラーにはしない。
     * 絶対下限を業者向けエラーにすると正常な出力まで止まる: 現実データでも
     * 「設定圧力 ___ MPa」のように設計上そもそも極小のセルがあり、実測の最小は 3.60pt。
     * 4pt を超える下限を課すと現実値セットの4様式が出力できなくなる（実測）。
     * ＝ 絶対下限は単独では判定に使えない。設計値からの逸脱と組み合わせる必要がある。
     * それまでは記録のみ行い、監視で傾向を見る。
     */
    reportSmall: (text: string, size: number) => void
    /**
     * ⑨ 設計値からの逸脱の記録。
     * 各セルには呼び出し側が指定した設計サイズがある。実描画がそこからどれだけ
     * 縮んだかは相対値なので、「設計上そもそも極小のセル」を巻き込まない
     * （絶対下限が失敗した理由がこれ）。閾値はキャリブレーションで決めるため、
     * まずは全ての縮小を記録して分布を測る。
     */
    reportShrink: (text: string, design: number, actual: number) => void
    /**
     * 様式の行数を超えて描けなかった項目の報告。
     * ★これは縮小(警告)ではなくデータ欠落(エラー)。切り詰めと同じ扱いにする。
     * 総括表の設備欄はテンプレート実測で 6+11=17行しかなく、18件目以降は
     * 黙って捨てられていた（落ちるのは順序で決まるので、一般的な設備でも消えうる）。
     */
    reportOverflowRow: (text: string, capacity: number) => void
    /**
     * 選択肢欄の値が、刷り込まれたどの選択肢とも一致しなかったことの報告。
     *
     * ★これは「黙って情報が落ちる」唯一の経路。○が1つも描かれず、
     *   PDFは正常終了し、罫線越えも刷り込みへの重なりも出ず、
     *   ベースラインも（そのセルが元から空なら）通る＝全検査が緑のまま欠落する。
     *
     * ★なぜエラー(422)にせず警告に留めるか（格上げの判断を誤らせないため明記する）
     *   照合は includes による見込み判定で、フォーム側が自由入力を許している。
     *   全角半角や表記ゆれで外れた瞬間、**正当な値なのに報告書が1枚も出せなくなり、
     *   業者に回避手段が無い**。失敗の非対称性が明確:
     *       誤って警告   → 業者は見て直せる／無視しても出せる
     *       誤ってブロック → 正当な値なのに出力できない
     *   ＝ 自由入力を許している側の代償を業者に払わせない。
     *
     * ★Phase 3 でフォームを選択式にしたら、そのときエラーへ格上げすること。
     *   選択式なら不一致＝バグなので止めるのが正しくなる。
     *   （それまでは「データが消えるのにエラーでないのは誤りだ」と見えるが、
     *     上の非対称性が理由。自由入力のまま格上げすると誤ブロックが起きる）
     */
    reportChoiceMismatch: (text: string, choices: string[]) => void
    /** 選択肢と一致しなかった値（警告に載せる） */
    choiceMismatches: ChoiceMismatch[]
    /** 行数超過で落ちた項目（業者向けエラーに載せる） */
    overflowRows: { text: string; capacity: number }[]
    failures: FitFailure[]
    smalls: FitSmall[]
    shrinks: FitShrink[]
    /** 縮小の有無に関わらず描画した回数（分布の母数） */
    drawCount: number
    /** 入力(payload)と突き合わせて由来を確定する（描画後に一度だけ呼ぶ） */
    resolve: (body: unknown) => void
}

export type ChoiceMismatch = {
    /** どの rows配列の何行目か（業者に「どの行か」を伝えるため） */
    rowsKey?: string
    row?: number
    /** 入力された値 */
    text: string
    /** その欄に刷り込まれている選択肢 */
    choices: string[]
    /** payload 上のキー（分かった場合） */
    field?: string
}

export type FitShrink = {
    /** どの rows配列の何行目か（業者に「どの行か」を伝えるため） */
    rowsKey?: string
    row?: number
    text: string
    design: number
    actual: number
    /** 逸脱率(%) = (design - actual) / design * 100 */
    deviation: number
    fromInput: boolean
    field?: string
}

/**
 * ⑧⑨の第3条件: 絶対下限(5.0pt)を割って描かれた項目。
 * ★縮小(⑨)とは別に持つ。⑨の主指標は「設計値からの逸脱」で閾値30%なので、
 *   設計値そのものが小さいセルや、逸脱率が低いまま床を割るものが網から漏れる
 *   （実測: bekki5 の圧力スイッチは逸脱21.9%で 4.53pt。⑨には出なかった）。
 * ★さらに buildShrinkWarning は純数値を除外するので、数値欄の下限割れは
 *   ⑨経由では原理的に出ない（実測: 報告書の延べ面積 4.19pt が出なかった）。
 */
export type FitSmall = {
    text: string
    size: number
    fromInput: boolean
    field?: string
    rowsKey?: string
    row?: number
}

export const createFitCollector = (): FitCollector => {
    const failures: FitFailure[] = []
    const smalls: FitSmall[] = []
    const shrinks: FitShrink[] = []
    const overflowRows: { text: string; capacity: number }[] = []
    const choiceMismatches: ChoiceMismatch[] = []
    const state = { drawCount: 0 }
    return {
        failures,
        smalls,
        shrinks,
        overflowRows,
        choiceMismatches,
        reportChoiceMismatch(text, choices) {
            const t = String(text ?? "").replace(/\s+/g, " ").trim()
            if (!t || choiceMismatches.some((c) => c.text === t)) return
            choiceMismatches.push({ text: t, choices: [...choices] })
        },
        reportOverflowRow(text, capacity) {
            const t = String(text ?? "").trim()
            if (!t || overflowRows.some((o) => o.text === t)) return
            overflowRows.push({ text: t, capacity })
        },
        get drawCount() {
            return state.drawCount
        },
        reportShrink(text, design, actual) {
            state.drawCount += 1
            const t = String(text ?? "").trim()
            if (!t || !(design > 0)) return
            const deviation = ((design - actual) / design) * 100
            // 浮動小数の誤差だけの差は縮小ではない
            if (deviation < 0.5) return
            shrinks.push({
                text: t,
                design: Math.round(design * 100) / 100,
                actual: Math.round(actual * 100) / 100,
                deviation: Math.round(deviation * 10) / 10,
                fromInput: false,
            })
        },
        reportSmall(text, size) {
            const t = String(text ?? "").trim()
            if (!t || smalls.some((s) => s.text === t)) return
            smalls.push({ text: t, size: Math.round(size * 10) / 10, fromInput: false })
        },
        report(text, fits, at) {
            // ★既に切り詰め済みの文字列を渡してくる経路があるので、末尾の "..." を外してから
            //   記録する。付いたままだと入力と部分一致すらせず、業者由来の値を
            //   「システム由来＝実装の不具合」と誤判定してログに流してしまう。
            const t = String(text ?? "").trim().replace(/\.{3}$/, "").trim()
            if (!t) return
            // ★重複の畳み込みは「同じセル」だけにする。
            //   以前は同じ**値**で畳んでいたため、同じ定型値（「部品交換」等）が
            //   複数の欄で切り詰められても1件しか残らず、2件目以降は報告ごと消えていた。
            //   位置が分からない経路（旧シグネチャ）だけ従来どおり値で畳む。
            const key = at
                ? `${at.page}|${at.cellX}|${at.cellTopFromTop}|${at.cellW}|${at.cellH}`
                : null
            if (key
                ? failures.some((f) => f.at && `${f.at.page}|${f.at.cellX}|${f.at.cellTopFromTop}|${f.at.cellW}|${f.at.cellH}` === key)
                : failures.some((f) => !f.at && f.text === t)) return
            failures.push({ text: t, fits, fromInput: false, at,
                rowsKey: at?.rowsKey, row: at?.row })
        },
        resolve(body) {
            const entries = collectStrings(body)
            for (const c of choiceMismatches) {
                const hit = entries.find((e) => e.value === c.text)
                if (hit) { c.field = hit.key; c.rowsKey = hit.rowsKey; c.row = hit.row }
            }
            for (const f of shrinks) {
                const hit =
                    entries.find((e) => e.value === f.text) ?? entries.find((e) => e.value.includes(f.text))
                if (!hit) continue
                f.fromInput = true
                f.field = hit.key
                f.rowsKey = hit.rowsKey
                f.row = hit.row
            }
            for (const f of smalls) {
                const hit =
                    entries.find((e) => e.value === f.text) ?? entries.find((e) => e.value.includes(f.text))
                if (!hit) continue
                f.fromInput = true
                f.field = hit.key
                f.rowsKey = hit.rowsKey
                f.row = hit.row
            }
            for (const f of failures) {
                // ★描画位置から欄が分かっているなら、そちらを優先する。
                //   値の文字列一致は「同じ値を持つ最初の欄」を拾うので、
                //   定型値（「部品交換」等）が複数欄にあると別の欄を指してしまう。
                if (f.at?.rowsKey !== undefined && f.at?.row !== undefined) {
                    f.rowsKey = f.at.rowsKey
                    f.row = f.at.row
                    if (f.at.column) f.field = f.at.column
                    // 由来（業者入力か実装由来か）だけは値で判定する。位置では決まらない。
                    const own = entries.find(
                        (e) => e.rowsKey === f.at!.rowsKey && e.row === f.at!.row
                            && (f.at!.column ? e.key === f.at!.column : true)
                            && (e.value === f.text || e.value.includes(f.text)))
                    f.fromInput = Boolean(own)
                    continue
                }
                // 位置が無い経路（専用描画の未対応分）は従来どおり値で当てる。
                // ★完全一致だけで判定してはいけない。折り返しの2行目以降を報告する経路が
                //   あり、その断片は入力そのものとは一致しない。部分一致まで見ないと
                //   業者由来の値を「システム由来＝実装の不具合」と誤ってログに流してしまう。
                const hit =
                    entries.find((e) => e.value === f.text) ??
                    entries.find((e) => e.value.includes(f.text))
                if (!hit) continue
                f.fromInput = true
                f.field = hit.key
                f.rowsKey = hit.rowsKey
                f.row = hit.row
            }
        },
    }
}

type Located = { key: string; value: string; rowsKey?: string; row?: number }

/**
 * payload から (キー, 文字列) を再帰的に集める。キーは最後の要素名だけ使う。
 *
 * ★どの rows配列の何行目かも持たせる。これが無いと業者に伝えられるのが
 *   「点検項目の内容」だけになり、40行あるうちのどれか分からない。
 */
const collectStrings = (
    node: unknown, key = "", out: Located[] = [], rowsKey?: string, row?: number,
): Located[] => {
    if (Array.isArray(node)) {
        const isRows = key.endsWith("_rows")
        node.forEach((v, i) => collectStrings(v, key, out, isRows ? key : rowsKey, isRows ? i : row))
        return out
    }
    if (node && typeof node === "object") {
        for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
            collectStrings(v, k, out, rowsKey, row)
        }
        return out
    }
    if (typeof node === "string") {
        const s = node.replace(/\s+/g, " ").trim()
        if (s) out.push({ key, value: s, rowsKey, row })
    }
    return out
}

export type FitErrorItem = {
    field: string
    label: string
    input: number
    fits: number
    over: number
    hint: string
    text: string
}

/**
 * 対処の提示。項目によって言えることが違う。
 * ★会社名・住所は略称が使えるが、設備名は法定名称が必要なことがあるので
 *   勝手な短縮を勧めない（不正確な報告書になる）。迷う項目は「短くしてください」に留める。
 */
const hintFor = (field: string): string => {
    if (field === "inspector_company") return "会社名を短くするか、認知された略称をお使いください（例: 株式会社 → (株)）"
    if (field === "location" || field === "inspector_address") return "住所を短くしてください（建物名・部屋番号など）"
    if (field === "equipment_name") return "設備名は法定の名称が必要な場合があります。短縮できるか確認してください"
    return "入力を短くしてください"
}

export type FitErrorBody = {
    error: "FIT_FAILED"
    form: string
    items: FitErrorItem[]
}

/**
 * 業者向けのエラー本文を作る。入力由来のものが1件も無ければ null（＝エラーにしない）。
 * システム整形値の溢れは呼び出し側でログに出すこと。
 */
export const buildFitError = (form: string, collector: FitCollector): FitErrorBody | null => {
    // 同じ値の断片（折り返しの行）が別項目として並ばないよう、
    // 他の失敗の一部でしかないものは落とす。
    // ★「真に短い断片」だけを落とすこと。以前は length を見ずに includes だけで判定しており、
    //   **同じ文字列**の失敗が2件以上あると互いに互いを含むので全部消えていた
    //   （実測: 総括表の3欄に同じ住所を入れると 1欄なら422・3欄なら200 になった）。
    //   report の畳み込みがテキスト単位だった頃は失敗が常に1件だったので露見しなかった。
    const whole = collector.failures.filter(
        (f) => !collector.failures.some(
            (g) => g !== f && g.text.length > f.text.length && g.text.includes(f.text)),
    )
    const items = whole
        .filter((f) => f.fromInput && f.field)
        .map<FitErrorItem>((f) => ({
            field: f.field!,
            label: withRow(FIELD_LABELS[f.field!] ?? f.field!, form, f.rowsKey, f.row),
            input: f.text.length,
            fits: f.fits,
            over: f.text.length - f.fits,
            hint: hintFor(f.field!),
            text: f.text,
        }))
    // ★行数超過はデータ欠落なのでエラーに載せる（縮小＝警告との線引き）
    for (const o of collector.overflowRows) {
        items.push({
            field: "equipment_results",
            label: "点検を行った消防用設備等",
            input: o.text.length,
            fits: 0,
            over: o.text.length,
            hint: `この様式に書ける設備は ${o.capacity} 件までです。件数を減らすか、様式を分けてください`,
            text: o.text,
        })
    }
    if (!items.length) return null
    return { error: "FIT_FAILED", form, items }
}

/** システム整形値の溢れ（＝実装の不具合）。業者には見せずログに出す。 */
export const systemFitFailures = (collector: FitCollector): FitFailure[] =>
    collector.failures.filter((f) => !f.fromInput)

/**
 * ⑨のキャリブレーション用。PDF_FIT_DEBUG=1 のときだけ、逸脱の実測値を1行のJSONで出す。
 * 閾値を勘で置かないために、まず現実値セットと長文セットの分布を測る。
 */
export const logFitDebug = (form: string, collector: FitCollector) => {
    if (!process.env.PDF_FIT_DEBUG) return
    console.warn(
        "[pdf-fit-debug] " +
            JSON.stringify({
                form,
                draws: collector.drawCount,
                shrinks: collector.shrinks.map((s) => ({
                    t: s.text.slice(0, 40),
                    d: s.design,
                    a: s.actual,
                    p: s.deviation,
                    i: s.fromInput,
                    f: s.field ?? null,
                })),
            }),
    )
}

/**
 * ⑨ 設計値からの逸脱の警告。
 *
 * ■ 何を測っているか（★「読めるか」ではない）
 *   各セルには呼び出し側が指定した設計サイズがある。実描画がそこから何%縮んだかを見る。
 *   相対値なので「設計上そもそも極小のセル」を巻き込まない（絶対下限が失敗した理由がこれ）。
 *   ただしこの指標が言えるのは「通常運用で観測された範囲の外にある」ことだけで、
 *   印刷して判読できるかの保証ではない。それを言うには 300dpi 印刷での判読実験が要る。
 *
 * ■ 閾値 30% の根拠（キャリブレーション実測 2026-07-24 / 描画5004件×2セット）
 *   現実値セット（実際に提出される値）… 縮小 848件・最大 23.7%
 *   長文セット（ストレス）          … 縮小 1313件・最大 44.4%
 *   下の除外規則を適用すると現実値は 23.7% で頭打ちになり、25%以上のどこに引いても
 *   誤検出0になる。谷の中で余裕を取り 30%（現実値最大に対し 6.3pt の余裕）とした。
 *   ＝ インク層検出器と同じ決め方で、勘では置いていない。
 *
 * ■ 除外規則（これが無いと分離しない）
 *   (a) 入力(payload)由来でないもの … 判定記号「○」「×」等。システムが描くもので
 *       業者は直せないうえ、狭い判定欄で 33〜39% 縮むのが通常動作。
 *   (b) 純粋な数値 … 例: bekki3 の flow_value "1800" は設計6pt→3.6pt(40%)まで縮むが、
 *       これはテンプレートが「___ L/min」と単位を印字していて幅38ptしか無いセルに
 *       数値を入れる正常動作。★将来「数値も対象にすべきでは」と考えたときは、
 *       この例を先に見ること。数値欄は設計上そもそも狭い。
 */
export const SHRINK_WARN_THRESHOLD = 30

/** 数字と区切り記号だけで構成される値（単位印字済みの狭いセルに入る想定） */
const PURELY_NUMERIC = /^[\d.,/／\-]+$/

export type FitWarnItem = {
    field: string
    label: string
    design: number
    actual: number
    deviation: number
    text: string
}

export type FitWarnBody = { form: string; items: FitWarnItem[] }

export type BelowMinWarnItem = {
    field: string
    label: string
    size: number
    text: string
}

/**
 * 絶対下限(ABSOLUTE_MIN_FONT_SIZE)を割って描かれた項目の警告一覧。
 *
 * ★⑨（縮小警告）と別経路にする理由:
 *   - ⑨は「設計値からの逸脱 >= 30%」が条件。設計値が元から小さいセルは逸脱が出ない
 *   - ⑨は純数値を除外する。数値欄の下限割れは原理的に⑨からは出ない
 *   ＝ 相対の網と絶対の床が接続されておらず、その隙間に落ちたものが
 *      判読困難なサイズのまま黙って出ていた。
 * ★エラー(422)にはしない。情報は残っており、止めると入力の長い業者が出力できない。
 *   出荷品質は「現実値セットで0件」を CI で守る（scripts/check-below-min.py）。
 */
export const buildBelowMinWarning = (form: string, collector: FitCollector): BelowMinWarnItem[] => {
    const seen = new Set<string>()
    const items: BelowMinWarnItem[] = []
    for (const s of collector.smalls) {
        if (!s.fromInput || !s.field) continue
        const key = JSON.stringify([s.field, s.text])
        if (seen.has(key)) continue
        seen.add(key)
        items.push({
            field: s.field,
            label: withRow(FIELD_LABELS[s.field] ?? s.field, form, s.rowsKey, s.row),
            size: s.size,
            text: s.text,
        })
    }
    items.sort((a, b) => a.size - b.size)
    return items
}

export type ChoiceWarnItem = {
    field: string
    label: string
    text: string
    choices: string[]
    hint: string
}

/**
 * 選択肢と一致しなかった値の警告一覧。該当が無ければ null。
 * ★有効な選択肢を必ず列挙する。「一致しません」だけでは業者は直せない。
 */
export const buildChoiceWarning = (form: string, collector: FitCollector): ChoiceWarnItem[] => {
    const items: ChoiceWarnItem[] = []
    for (const c of collector.choiceMismatches) {
        // 入力(payload)に無い値＝システム由来。業者には直しようがないので出さない
        if (!c.field) continue
        const label = withRow(FIELD_LABELS[c.field] ?? c.field, form, c.rowsKey, c.row)
        items.push({
            field: c.field,
            label,
            text: c.text,
            choices: c.choices,
            hint: `${label}の値「${c.text}」は選択肢と一致しません。`
                + `${c.choices.join("／")} のいずれかを入力してください`,
        })
    }
    return items
}

/**
 * 警告一覧を作る。該当が無ければ null。
 * ★重複はここで畳む。同じ値が何行にも出るため、生のまま UI に渡すと
 *   同一項目が並んで読めなくなる（実測: 生117件 → 畳んで28件）。
 */
export const buildShrinkWarning = (form: string, collector: FitCollector): FitWarnBody | null => {
    const seen = new Set<string>()
    const items: FitWarnItem[] = []
    for (const s of collector.shrinks) {
        if (!s.fromInput || !s.field) continue
        if (PURELY_NUMERIC.test(s.text)) continue
        if (s.deviation < SHRINK_WARN_THRESHOLD) continue
        const key = JSON.stringify([s.field, s.text])
        if (seen.has(key)) continue
        seen.add(key)
        items.push({
            field: s.field,
            label: withRow(FIELD_LABELS[s.field] ?? s.field, form, s.rowsKey, s.row),
            design: s.design,
            actual: s.actual,
            deviation: s.deviation,
            text: s.text,
        })
    }
    if (!items.length) return null
    items.sort((a, b) => b.deviation - a.deviation)
    return { form, items }
}

/**
 * PDFは返しつつ警告を運ぶためのヘッダ。
 * 切り詰め（データ欠落）と違い、縮小は情報が残っているのでエラーにはしない。
 * 止めると「正式名称が長い建物」の業者が出力できなくなるうえ、実測では現実値でも
 * 描画の 16.9% が縮んでおり、縮小自体は異常ではなく通常動作である。
 * 値は日本語を含むので base64（ヘッダはASCIIしか運べない）。
 */
/**
 * ヘッダに載せる件数の上限。
 * 実測では様式あたり最大4件（重複を畳んだ後）だが、原理的には無制限なので
 * HTTPヘッダの長さ制限に当たって 431/500 になりうる。上位N件で打ち切り、
 * 残りは件数だけ伝える（黙って落とさない）。
 */
const WARN_HEADER_MAX_ITEMS = 20

export const fitWarningHeader = (form: string, collector: FitCollector): Record<string, string> => {
    const warn = buildShrinkWarning(form, collector)
    const choices = buildChoiceWarning(form, collector).slice(0, WARN_HEADER_MAX_ITEMS)
    const belowMin = buildBelowMinWarning(form, collector).slice(0, WARN_HEADER_MAX_ITEMS)
    // ★どれか1種類でもあれば出す（片方だけで打ち切らない）
    if (!warn && !choices.length && !belowMin.length) return {}
    const shown = warn ? warn.items.slice(0, WARN_HEADER_MAX_ITEMS) : []
    const body = {
        form,
        items: shown,
        omitted: warn ? warn.items.length - shown.length : 0,
        choices,
        belowMin,
    }
    return { "X-Fit-Warnings": Buffer.from(JSON.stringify(body), "utf8").toString("base64") }
}
