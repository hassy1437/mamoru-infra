/**
 * 点検票の行状態と、保存済み payload からの復元。
 *
 * ■ ★なぜコンポーネントから切り出したか
 *   「値は残して表示だけ畳む」（※印の一括非表示）が守れているかを実測する手段が
 *   無かった。状態が .tsx の中に閉じていて、JSX を含むため単体で実行できない。
 *   ここに出すことで `node --experimental-strip-types` で直接叩ける
 *   （このリポジトリにはテストランナーが無い）。
 *
 * ■ ★hydrateRows の性質（畳み込みの安全性はここに依存している）
 *   行数を `count` だけで決め、`source` は同じ添字から読む。
 *   ＝ 描画側で行を隠しても `count`（= labels.length）が変わらない限り、
 *      保存済みの値は添字ごとそのまま復元される。
 *      逆に labels を絞ると count が縮み、末尾が切り捨てられる。
 */

export type BekkiRowState = {
    content: string
    judgment: string
    bad_content: string
    action_content: string
    current_value: string
    content_tsuro: string
    content_kyaku: string
    flow_value: string
    hose_count: string
    nozzle_dia: string
}

// ★base と完全に同じ実装にすること（非文字列は fallback に落とす）。
export const coerceString = (value: unknown, fallback = "") =>
    typeof value === "string" ? value : fallback

export const createEmptyRow = (): BekkiRowState => ({
    content: "",
    judgment: "",
    bad_content: "",
    action_content: "",
    current_value: "",
    content_tsuro: "",
    content_kyaku: "",
    flow_value: "",
    hose_count: "",
    nozzle_dia: "",
})

export const coerceRow = (value: unknown): BekkiRowState => {
    const source = (value ?? {}) as Partial<BekkiRowState>
    return {
        content: coerceString(source.content),
        judgment: coerceString(source.judgment),
        bad_content: coerceString(source.bad_content),
        action_content: coerceString(source.action_content),
        current_value: coerceString(source.current_value),
        content_tsuro: coerceString(source.content_tsuro),
        content_kyaku: coerceString(source.content_kyaku),
        flow_value: coerceString(source.flow_value),
        hose_count: coerceString(source.hose_count),
        nozzle_dia: coerceString(source.nozzle_dia),
    }
}

/**
 * 保存済み配列から `count` 行ぶんの状態を作る。
 * ★count は labels.length。描画で行を隠しても count は変わらないので値は失われない。
 */
export const hydrateRows = (count: number, source?: unknown[]): BekkiRowState[] =>
    Array.from({ length: count }, (_, i) => coerceRow(source?.[i] ?? createEmptyRow()))
