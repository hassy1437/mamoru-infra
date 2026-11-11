import { measureRuns, type ReportFonts } from "@/lib/pdf-form-helpers"

/**
 * 「、」で並べる名前の一覧を、名前の途中で折らずに行に分ける（全機能チェック 51・2026-11-11）。
 *
 * ■ なぜ要るか
 *   報告書の表紙の「消防用設備等の種類」は、設備名を「、」でつないで字の単位で折り返していたため、
 *   「不活性ガス／消火設備」「火災報知／設備」のように名前の途中で行が変わって読みにくかった。
 * ■ 決めたこと
 *   - 名前（と後ろの「、」）は 1 つのかたまり。行に入らなければ、かたまりごと次の行へ送る
 *   - 1 つの名前だけで行に入らないときだけ、その名前を字の単位で折る（入りきらないよりよい）
 */
export const wrapListItems = (fonts: ReportFonts, items: string[], size: number, maxWidth: number, sep = "、"): string[] => {
    const names = items.map((s) => s.trim()).filter(Boolean)
    const lines: string[] = []
    let current = ""
    const fits = (s: string) => measureRuns(fonts, s, size) <= maxWidth + 0.1

    names.forEach((name, i) => {
        const chunk = i < names.length - 1 ? `${name}${sep}` : name
        if (fits(current + chunk)) {
            current += chunk
            return
        }
        if (current) lines.push(current)
        current = ""
        if (fits(chunk)) {
            current = chunk
            return
        }
        // ★1 つの名前だけで行に入らない → 字の単位で折る
        for (const ch of Array.from(chunk)) {
            if (current && !fits(current + ch)) {
                lines.push(current)
                current = ""
            }
            current += ch
        }
    })
    if (current) lines.push(current)
    return lines
}
