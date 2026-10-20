/**
 * 点検票（別記）の「選択肢の欄」— 刷り込みの語を○で囲む行（2026-10-20）。
 *
 * ■ なぜ要るか
 *   専用・兼用／一斉・区分…のような欄が、画面ではただの文字の欄だった。何を書けば○が付くか分からず、
 *   泡・ガス系は行の名前にも選択肢が出ていない。本番の通しチェックで、合わない文字を入れて
 *   「選択肢と一致しません」の警告が出た（○が付かないまま PDF は出る）。
 *
 * ■ 約束
 *   ・選択肢の語（value）は各ルートの drawChoiceCircle の label と同じ（scripts/check-choice-rows.mjs が突き合わせる）
 *   ・保存の形は今までどおり content の文字列（選んだ語を空白でつなぐ）。ルートは「含む」で○を付けるので、
 *     画面のチェックも「含む」で見る（＝画面と紙が食い違わない。以前の「一斉鳴動」なども一斉に付いて見える）
 *   ・1 つだけ選ぶ欄（single）は、選び直すと前の語を外す。もう一度押すと外す（空に戻せる）
 */
export type ChoiceOption = { value: string; label: string }
export type ChoiceRow = { options: readonly ChoiceOption[]; single?: boolean }

const opts = (...values: string[]): ChoiceOption[] => values.map((value) => ({ value, label: value }))

/** 加圧送水装置などの「専用・兼用」 */
const SENYOU_KENYOU: ChoiceRow = { options: opts("専用", "兼用"), single: true }
/** 音響装置・スピーカーの鳴動方式。区分＋再鳴動のように複数に○を付けることがある */
const MEIDOU: ChoiceRow = { options: opts("一斉", "区分", "相互", "再鳴動") }

export const BEKKI_CHOICE_ROWS: Readonly<Record<string, Readonly<Record<string, Readonly<Record<number, ChoiceRow>>>>>> = {
    "/api/generate-shokasen-bekki2-pdf": { page2_rows: { 7: SENYOU_KENYOU }, page3_rows: { 13: SENYOU_KENYOU } },
    "/api/generate-sprinkler-bekki3-pdf": { page2_rows: { 7: SENYOU_KENYOU } },
    "/api/generate-water-spray-bekki4-pdf": { page2_rows: { 7: SENYOU_KENYOU } },
    "/api/generate-foam-bekki5-pdf": { page2_rows: { 7: SENYOU_KENYOU } },
    "/api/generate-inert-gas-bekki6-pdf": { page2_rows: { 17: SENYOU_KENYOU } },
    "/api/generate-halogen-bekki7-pdf": { page2_rows: { 26: SENYOU_KENYOU } },
    "/api/generate-powder-bekki8-pdf": { page2_rows: { 26: SENYOU_KENYOU } },
    "/api/generate-okugai-shokasen-bekki9-pdf": { page2_rows: { 7: SENYOU_KENYOU } },
    "/api/generate-jidou-kasai-houchi-bekki11-1-pdf": {
        page2_rows: {
            // 熱感知器 スポット型: 差動・定温（再）・熱アナログ
            5: { options: [{ value: "差動", label: "差動" }, { value: "定温", label: "定温（再）" }, { value: "熱アナログ", label: "熱アナログ" }] },
            // 煙感知器 スポット型: イオン・光電・アナログ
            9: { options: opts("イオン", "光電", "アナログ") },
            // 炎感知器: 赤外線・紫外線
            11: { options: opts("赤外線", "紫外線") },
            22: MEIDOU,
        },
    },
    "/api/generate-emergency-alarm-bekki14-pdf": { page1_rows: { 23: MEIDOU }, page2_rows: { 30: MEIDOU } },
    "/api/generate-standpipe-bekki20-pdf": { page2_rows: { 7: SENYOU_KENYOU } },
}

/** 不活性ガス・ハロゲン化物・粉末の見出しの「全域・局所・移動」（equipment_system） */
export const EQUIPMENT_SYSTEM_CHOICES: ChoiceRow = { options: opts("全域", "局所", "移動"), single: true }

/** その様式のその表の選択肢の行（無ければ undefined） */
/** rowsKey は "page2_rows" など（専用フォームは page5_rows まである） */
export const choiceRowsOf = (apiPath: string, rowsKey: string): Readonly<Record<number, ChoiceRow>> | undefined =>
    BEKKI_CHOICE_ROWS[apiPath]?.[rowsKey]

/** ○が付く語（ルートと同じく「含む」で見る） */
export const selectedChoices = (content: string, row: ChoiceRow): string[] =>
    row.options.filter((o) => content.includes(o.value)).map((o) => o.value)

/** 押したあとの content（選択肢の順に空白でつなぐ。選択肢に無い以前の文字は外す） */
export const toggleChoice = (content: string, row: ChoiceRow, value: string): string => {
    const current = new Set(selectedChoices(content, row))
    if (current.has(value)) current.delete(value)
    else {
        if (row.single) current.clear()
        current.add(value)
    }
    return row.options.filter((o) => current.has(o.value)).map((o) => o.value).join(" ")
}

/** 選択肢のどれも含まない入力（以前の自由入力）。○が付かないので画面で知らせる */
export const unmatchedChoiceText = (content: string, row: ChoiceRow): string =>
    content.trim() && selectedChoices(content, row).length === 0 ? content.trim() : ""
