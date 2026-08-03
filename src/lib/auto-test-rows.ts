/**
 * 別記様式第11の1（自動火災報知設備）の「※」行 = 自動試験機能を有する場合は点検対象外。
 *
 * ■ ★なぜ1箇所に置くか
 *   入力画面（畳む）と PDF（描かない）の両方が同じ行集合を見る必要がある。
 *   2箇所に書くと必ず食い違い、「画面では畳まれているのに PDF には出る」
 *   （またはその逆）が静かに起きる。
 *
 * ■ ★行は列挙せず、ラベルの「※」から機械的に導出する
 *   正典の行ラベルに※が付いているので、それを唯一の根拠にする。
 *   手で23件書き写すと、行ラベルが変わったときに気づけない。
 *   件数は EXPECTED_AUTO_TEST_ROW_COUNT で固定し、増減したらテストが落ちる。
 *
 * ■ 適用範囲
 *   ★bekki11-1 のみ。bekki14（放送設備の※1行）と bekki16（誘導標識）には適用しない。
 *   - bekki14 の※は「地震動予報等に係る放送切替」で、自動試験機能とは別の性質。
 *     1行のために属性を増やす価値があるかは別途判断（BACKLOG 参照）。
 *   - bekki16 は1枚に蓄光式と電気式を両方記載するので欄を消せない。
 */

/** 点検票 payload に持たせる属性名。★物件属性ではない（受信機の性質であり、
 *  同一物件に複数の受信機がある場合や設備更新で破綻するため）。 */
export const AUTO_TEST_ATTR = "hasAutoTestFunction" as const

/** 自動試験機能の有無を持つ payload の断片。 */
export type AutoTestAttr = {
    /**
     * 受信機が自動試験機能を有するか。
     * ★undefined は「未回答」で、false（有さない）と同じ扱いにする
     *   （未回答のうちは従来どおり全行を入力・出力する＝安全側）。
     */
    hasAutoTestFunction?: boolean
}

/** ※が付いた行か（＝自動試験機能ありのとき点検対象外になる行か）。 */
export const isAutoTestRow = (label: string): boolean => label.includes("※")

/**
 * 与えられた行ラベル配列から、※行だけを抜き出す。
 * 入力画面・PDF の双方がこれを使う。
 */
export const autoTestRowsOf = (labels: readonly string[]): string[] =>
    labels.filter(isAutoTestRow)

/**
 * その行を描画/入力対象にするか。
 * ★自動試験機能ありのときだけ※行を落とす。未回答・なしのときは従来どおり全行。
 */
export const isRowActive = (label: string, hasAutoTest: boolean | undefined): boolean =>
    hasAutoTest === true ? !isAutoTestRow(label) : true

/**
 * ★bekki11-1 の※行の件数。実測して固定する（2026-08-03 時点で23件）。
 *   行ラベルが変わって増減したらテストが落ち、この宣言を見直す動線になる。
 */
export const EXPECTED_AUTO_TEST_ROW_COUNT = 23

/** 畳んだセクションの見出しに出す文言（★入力画面で使う。文言を散らさない）。 */
export const AUTO_TEST_COLLAPSED_NOTICE =
    `自動試験機能ありのため、この${EXPECTED_AUTO_TEST_ROW_COUNT}項目は点検対象外です` +
    "（入力済みの値は保持されますが、報告書には出力されません）"
