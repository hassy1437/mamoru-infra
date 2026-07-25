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
    content: "点検項目の内容",
    bad_content: "不良内容",
    action_content: "措置内容",
}

export type FitFailure = {
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
    report: (text: string, fits: number) => void
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
    failures: FitFailure[]
    smalls: { text: string; size: number }[]
    shrinks: FitShrink[]
    /** 縮小の有無に関わらず描画した回数（分布の母数） */
    drawCount: number
    /** 入力(payload)と突き合わせて由来を確定する（描画後に一度だけ呼ぶ） */
    resolve: (body: unknown) => void
}

export type FitShrink = {
    text: string
    design: number
    actual: number
    /** 逸脱率(%) = (design - actual) / design * 100 */
    deviation: number
    fromInput: boolean
    field?: string
}

export const createFitCollector = (): FitCollector => {
    const failures: FitFailure[] = []
    const smalls: { text: string; size: number }[] = []
    const shrinks: FitShrink[] = []
    const state = { drawCount: 0 }
    return {
        failures,
        smalls,
        shrinks,
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
            smalls.push({ text: t, size: Math.round(size * 10) / 10 })
        },
        report(text, fits) {
            // ★既に切り詰め済みの文字列を渡してくる経路があるので、末尾の "..." を外してから
            //   記録する。付いたままだと入力と部分一致すらせず、業者由来の値を
            //   「システム由来＝実装の不具合」と誤判定してログに流してしまう。
            const t = String(text ?? "").trim().replace(/\.{3}$/, "").trim()
            if (!t) return
            // 同じ値が複数セルに出ることがあるので重複は畳む
            if (failures.some((f) => f.text === t)) return
            failures.push({ text: t, fits, fromInput: false })
        },
        resolve(body) {
            const entries = collectStrings(body)
            for (const f of shrinks) {
                const hit =
                    entries.find(([, v]) => v === f.text) ?? entries.find(([, v]) => v.includes(f.text))
                if (!hit) continue
                f.fromInput = true
                f.field = hit[0]
            }
            for (const f of failures) {
                // ★完全一致だけで判定してはいけない。折り返しの2行目以降を報告する経路が
                //   あり、その断片は入力そのものとは一致しない。部分一致まで見ないと
                //   業者由来の値を「システム由来＝実装の不具合」と誤ってログに流してしまう。
                const hit =
                    entries.find(([, v]) => v === f.text) ??
                    entries.find(([, v]) => v.includes(f.text))
                if (!hit) continue
                f.fromInput = true
                f.field = hit[0]
            }
        },
    }
}

/** payload から (キー, 文字列) を再帰的に集める。キーは最後の要素名だけ使う。 */
const collectStrings = (node: unknown, key = "", out: [string, string][] = []): [string, string][] => {
    if (Array.isArray(node)) {
        for (const v of node) collectStrings(v, key, out)
        return out
    }
    if (node && typeof node === "object") {
        for (const [k, v] of Object.entries(node as Record<string, unknown>)) collectStrings(v, k, out)
        return out
    }
    if (typeof node === "string") {
        const s = node.replace(/\s+/g, " ").trim()
        if (s) out.push([key, s])
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
    // 他の失敗の一部でしかないものは落とす
    const whole = collector.failures.filter(
        (f) => !collector.failures.some((g) => g !== f && g.text.includes(f.text)),
    )
    const items = whole
        .filter((f) => f.fromInput && f.field)
        .map<FitErrorItem>((f) => ({
            field: f.field!,
            label: FIELD_LABELS[f.field!] ?? f.field!,
            input: f.text.length,
            fits: f.fits,
            over: f.text.length - f.fits,
            hint: hintFor(f.field!),
            text: f.text,
        }))
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
