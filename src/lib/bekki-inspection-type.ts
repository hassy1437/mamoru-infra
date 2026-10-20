/**
 * 別記様式の「点検種別」の既定を、総括表の点検種別から決める（2026-09-23・総点検 A2）。
 *
 * ■ ★なぜ要るか（2026-09-03 に実測、9/4 の総点検で食い違いとして記録）
 *   総括表の既定は「機器点検」、別記の既定は「機器・総合」で、別記ページは総括表の値を渡していなかった。
 *   ＝ 業者が別記を開いてそのまま保存すると、同じ提出物の中で総括表は「機器点検」・
 *      別記は「機器と総合の両方に○」になる。消防署に出す書類の中身の誤り。
 *
 * ■ 値の約束
 *   PDF ルートは drawChoiceCircle で「値が "機器" を含めば機器に○、"総合" を含めば総合に○」と描く
 *   （src/lib/pdf-form-helpers.ts）。総括表の値は "機器点検" / "総合点検" なので、そのまま渡せば
 *   片方だけに○が付く。総括表に値が無いときだけ、従来どおり「機器・総合」（両方に○）に倒す。
 *
 * ■ ★業者が別記で変えた値は尊重する
 *   ここは「保存済みの値が無いとき」の既定を決めるだけ。別記の入力画面で変えた値は
 *   payload.inspection_type に残り、次に開いたときはそれが優先される（coerceString(saved, 既定)）。
 *
 * ★別記の既定をここ以外に書かないこと。scripts/check-bekki-inspection-type.mjs が見張る。
 */

/**
 * 点検種別の選ぶ欄（機器点検・総合点検のチェック・2026-10-20）。★以前は文字の欄だった。
 * ★保存の形は今までどおり（機器だけ "機器点検"・総合だけ "総合点検"・両方 "機器・総合"）。
 *   ルートの○（"機器" / "総合" を含むか）・「すべて良」の判定（isKikiOnly）・総括表との整合の検査がこの形を前提にしている。
 *   以前の「機器・総合点検」なども「含む」で読むので、両方にチェックが付いて見える（紙と同じ）。
 */
export function inspectionTypeParts(value: string): { kiki: boolean; sougou: boolean } {
    return { kiki: value.includes("機器"), sougou: value.includes("総合") }
}

export function inspectionTypeFromParts(p: { kiki: boolean; sougou: boolean }): string {
    if (p.kiki && p.sougou) return BEKKI_INSPECTION_TYPE_FALLBACK
    if (p.kiki) return "機器点検"
    if (p.sougou) return "総合点検"
    return ""
}

/** 総括表に点検種別が無いときの既定（両方に○）。従来の別記の既定と同じ。 */
export const BEKKI_INSPECTION_TYPE_FALLBACK = "機器・総合"

/** 総括表の点検種別 → 別記の既定。空・null なら BEKKI_INSPECTION_TYPE_FALLBACK。 */
export function bekkiInspectionTypeDefault(soukatsuInspectionType: string | null | undefined): string {
    const t = (soukatsuInspectionType ?? "").replace(/\s+/g, " ").trim()
    return t || BEKKI_INSPECTION_TYPE_FALLBACK
}
