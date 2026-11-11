import type { PDFPage } from "pdf-lib"

import {
    MIN_CONDENSE,
    NO_LINE_END,
    NO_LINE_START,
    SINGLE_LINE_FIT_DEFAULTS,
    type CellRef,
    type ReportFonts,
    cellAt,
    drawTextRuns,
    measureRuns,
    normalizeText,
    reportIfBelowMinSize,
    truncateRunsToFitWidth,
} from "@/lib/pdf-form-helpers"

/**
 * 点検票の「点検者」の欄（氏名・社名・TEL・住所）の値を、刷り込みの見出しと同じ高さに描く（全機能チェック 51・2026-11-11）。
 *
 * ■ なぜ要るか
 *   様式ごとに値を「欄の上下の真ん中」に 6〜7pt で描いていたため、見出し（10.56pt）より 5〜6pt 下がって小さく見えた（第14〜17 など）。
 *   社名は折り返す欄で、「株式会社サンプル防／災」と 1 字だけ次の行に落ちた（第16）。
 * ■ 決めたこと
 *   - 値は見出しのベースライン（雛形の実測）にそろえ、8pt（READABLE_DESIGN_TARGET_PT）で描く
 *   - 入らなければ、まず 8pt のまま横を 85% まで縮める（長体）→ それでも入らなければ
 *     社名・住所は 2 行に分けて大きく描けるならそうする（字数の釣り合う所で分ける・1 字だけの行を作らない）→ だめなら 1 行で縮める
 *   - 座標は様式ごとの実測（見出しの右端・隣の刷り込みや罫線の手前・欄の上下）を呼ぶ側が渡す
 */
export const INSPECTOR_VALUE_PT = 8.0
/** 見出しの右端から値までの間 */
export const INSPECTOR_LABEL_GAP = 3
/** 値の右の限り（罫線・隣の見出し）の手前に空ける幅（以前の欄の paddingX 2.5 に近い値） */
export const INSPECTOR_RIGHT_PAD = 2

export type InspectorFieldBox = {
    /** 値の左端（見出しの右端 + INSPECTOR_LABEL_GAP） */
    x: number
    /** 値の右端（隣の刷り込み・罫線の手前） */
    right: number
    /** 見出しのベースライン（ページの上端から） */
    baseline: number
    /** 欄の下端（ページの上端から）。2 行に分けるときの下の限り（1 行目は見出しと同じ高さ・2 行目はその下） */
    bottom: number
}

/** 雛形の実測から欄の箱を作る（見出しの右端・見出しのベースライン・値の右の限り・欄の下端） */
export const inspectorBox = (labelRight: number, baseline: number, right: number, bottom: number): InspectorFieldBox =>
    ({ x: labelRight + INSPECTOR_LABEL_GAP, right, baseline, bottom })

export type InspectorFieldBoxes = { name: InspectorFieldBox; company: InspectorFieldBox; tel: InspectorFieldBox; address: InspectorFieldBox }

type Fitted = { size: number; condense: number }

/** 1 行で入れる大きさ（8pt から。まず横を 85% まで縮め、それでも入らなければ小さくする） */
export const fitInspectorLine = (fonts: ReportFonts, text: string, maxWidth: number, maxSize = INSPECTOR_VALUE_PT): Fitted => {
    const w = measureRuns(fonts, text, maxSize)
    if (w <= maxWidth) return { size: maxSize, condense: 1 }
    const c = maxWidth / w
    if (c >= MIN_CONDENSE) return { size: maxSize, condense: Math.floor(c * 1000) / 1000 }
    // 85% まで縮めても入らない → 85% のまま大きさを下げる（5pt を割れば reportIfBelowMinSize が知らせる）
    const size = maxWidth / (measureRuns(fonts, text, 1) * MIN_CONDENSE)
    return { size: Math.floor(size * 100) / 100, condense: MIN_CONDENSE }
}

/** 会社の種類の名前（ここで分けると読みやすい） */
const ENTITY_WORDS = ["株式会社", "有限会社", "合同会社", "合資会社", "合名会社", "一般社団法人", "一般財団法人", "協同組合"]
/** 住所の区切りになる字（この字のあとで分けると読みやすい） */
const ADDRESS_BREAK_AFTER = new Set(Array.from("都道府県市区町村郡"))

const charClass = (c: string): string => {
    if (/[\u3040-\u309f]/.test(c)) return "hira"
    if (/[\u30a0-\u30ff\uff66-\uff9f]/.test(c)) return "kata"
    if (/[\u4e00-\u9fff々]/.test(c)) return "kanji"
    if (/[0-9A-Za-z０-９Ａ-Ｚａ-ｚ\-－‐ー]/.test(c)) return "alnum"
    return "other"
}

/**
 * 2 行に分ける位置。★語の途中で分けない（全機能チェック 51・「株式会社サンプル防／災」）。
 *   1. 空白があればそこ
 *   2. 会社の種類（株式会社 など）の前後
 *   3. それ以外は、左右の行の幅の大きいほうが小さくなる所。ただし字の種類（漢字・かな・カナ・英数）が変わる所と
 *      住所の区切り（都道府県市区町村郡のあと）を優先する
 *   ★1 字だけの行を作らない。行頭禁則（、。）など）と行末禁則（（「 など）を守る。
 */
export const splitInspectorText = (fonts: ReportFonts, text: string): [string, string] | null => {
    const chars = Array.from(text)
    if (chars.length < 4) return null
    const at = (k: number): [string, string] => [chars.slice(0, k).join("").trim(), chars.slice(k).join("").trim()]
    const spaceAt = chars.findIndex((c, i) => c === " " && i >= 2 && i <= chars.length - 3)
    if (spaceAt >= 0) return [chars.slice(0, spaceAt).join(""), chars.slice(spaceAt + 1).join("")]
    for (const w of ENTITY_WORDS) {
        if (text.startsWith(w) && chars.length - w.length >= 2) return at(w.length)
        if (text.endsWith(w) && chars.length - w.length >= 2) return at(chars.length - w.length)
    }
    const em = measureRuns(fonts, "国", 1)
    let best: { k: number; cost: number } | null = null
    for (let k = 2; k <= chars.length - 2; k += 1) {
        if (NO_LINE_START.has(chars[k]) || NO_LINE_END.has(chars[k - 1])) continue
        const worst = Math.max(measureRuns(fonts, chars.slice(0, k).join(""), 1), measureRuns(fonts, chars.slice(k).join(""), 1))
        const natural = ADDRESS_BREAK_AFTER.has(chars[k - 1]) || charClass(chars[k - 1]) !== charClass(chars[k])
        // ★語の切れ目でない所は 2 字ぶん損にする（少し釣り合いが悪くても切れ目で分ける）
        const cost = worst + (natural ? 0 : 2 * em)
        if (!best || cost < best.cost) best = { k, cost }
    }
    return best ? at(best.k) : null
}

/** 2 行に分けたときの行送り（字の大きさに対する倍率）と、ベースラインより下に出る字の深さ */
const LINE_ADVANCE = 1.15
const DESCENT = 0.2

export const drawInspectorField = (
    page: PDFPage,
    pageHeight: number,
    fonts: ReportFonts,
    text: unknown,
    box: InspectorFieldBox,
    options?: { wrap?: boolean; at?: CellRef },
) => {
    const value = normalizeText(text)
    if (!value) return
    const maxWidth = Math.max(1, box.right - INSPECTOR_RIGHT_PAD - box.x)
    const one = fitInspectorLine(fonts, value, maxWidth)
    const minSize = SINGLE_LINE_FIT_DEFAULTS.minFontSize

    // ★社名・住所は、1 行だと 7pt を割るときだけ 2 行を考える（収まる値の見た目は変えない）。
    //   1 行目は見出しと同じ高さ、2 行目はその下（欄の下端を越えない大きさまで）
    if (options?.wrap && one.size < 7) {
        const parts = splitInspectorText(fonts, value)
        if (parts) {
            const byHeight = (box.bottom - 0.5 - box.baseline) / (LINE_ADVANCE + DESCENT)
            const fit2 = parts.map((p) => fitInspectorLine(fonts, p, maxWidth, Math.min(INSPECTOR_VALUE_PT, byHeight)))
            const size = Math.min(...fit2.map((f) => f.size))
            // ★2 行でも 1 行の下限（3.5pt）を割るなら 2 行にしない（下の「切り詰めて知らせる」へ）
            if (size >= minSize && size > one.size + 0.3) {
                parts.forEach((p, i) => {
                    const c = fitInspectorLine(fonts, p, maxWidth, size).condense
                    drawTextRuns(page, fonts, p, box.x, pageHeight - (box.baseline + i * size * LINE_ADVANCE), size, c)
                })
                fonts.fit?.reportShrink(value, INSPECTOR_VALUE_PT, size, options?.at)
                reportIfBelowMinSize(fonts, value, size, maxWidth, options?.at)
                return
            }
        }
    }

    // ★1 行の下限（3.5pt・drawTextInCell と同じ）を割るほど長い値は、下限で切り詰めて「入りきらない」と知らせる
    //   （PDF を返さず、画面に「短くしてください」が出る・check-fit-error.mjs）
    if (one.size < minSize) {
        const cut = truncateRunsToFitWidth(fonts, value, minSize, maxWidth,
            cellAt(page, box.x, box.baseline - INSPECTOR_VALUE_PT, maxWidth, INSPECTOR_VALUE_PT * 1.4, options?.at))
        if (cut) drawTextRuns(page, fonts, cut, box.x, pageHeight - box.baseline, minSize)
        fonts.fit?.reportShrink(value, INSPECTOR_VALUE_PT, minSize, options?.at)
        reportIfBelowMinSize(fonts, value, minSize, maxWidth, options?.at)
        return
    }
    drawTextRuns(page, fonts, value, box.x, pageHeight - box.baseline, one.size, one.condense)
    fonts.fit?.reportShrink(value, INSPECTOR_VALUE_PT, one.size, options?.at)
    reportIfBelowMinSize(fonts, value, one.size, maxWidth, options?.at)
}

/** 点検者の欄の 4 つをまとめて描く（氏名・TEL は 1 行、社名・住所は入らなければ 2 行） */
export const drawInspectorFields = (
    page: PDFPage,
    pageHeight: number,
    fonts: ReportFonts,
    values: { name: unknown; company: unknown; tel: unknown; address: unknown },
    boxes: InspectorFieldBoxes,
) => {
    drawInspectorField(page, pageHeight, fonts, values.name, boxes.name, { at: { column: "inspector_name" } })
    drawInspectorField(page, pageHeight, fonts, values.company, boxes.company, { wrap: true, at: { column: "inspector_company" } })
    drawInspectorField(page, pageHeight, fonts, values.tel, boxes.tel, { at: { column: "inspector_tel" } })
    drawInspectorField(page, pageHeight, fonts, values.address, boxes.address, { wrap: true, at: { column: "inspector_address" } })
}
