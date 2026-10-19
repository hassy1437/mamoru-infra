import {
    DEFECT_PHRASE_GROUPS,
    DEFECT_PHRASE_LIST_PREFIX,
    defectPhraseGroupListId,
    defectPhrasesOf,
    type DefectPhraseGroup,
    type DefectPhraseKind,
} from "@/lib/defect-phrases"

/**
 * 不良内容・措置内容の候補の <datalist>（2026-10-19・#101）。一覧は src/lib/defect-phrases.ts。
 * ★入力欄は自由入力のまま。list 属性（defectPhraseListId）で候補を添えるだけ。
 * ★1 画面に 1 回だけ描く（同じ id が 2 つあると後のほうは使われない）。
 *   1 画面に何度も出る部品（総括表の設備ごとの欄）は、useId などで prefix を分けて generalOnly で描く。
 */
export function DefectPhraseDatalists({
    prefix = DEFECT_PHRASE_LIST_PREFIX,
    generalOnly = false,
}: {
    prefix?: string
    /** 行ラベルが無い欄（総括表）は、どの行にも出す候補だけでよい */
    generalOnly?: boolean
}) {
    const groups: (DefectPhraseGroup | null)[] = generalOnly ? [null] : [null, ...DEFECT_PHRASE_GROUPS]
    const kinds: DefectPhraseKind[] = ["bad", "action"]
    return (
        <>
            {groups.flatMap((g) =>
                kinds.map((kind) => {
                    const id = defectPhraseGroupListId(kind, g, prefix)
                    return (
                        <datalist key={id} id={id}>
                            {defectPhrasesOf(kind, g).map((p) => (
                                <option key={p} value={p} />
                            ))}
                        </datalist>
                    )
                }),
            )}
        </>
    )
}
