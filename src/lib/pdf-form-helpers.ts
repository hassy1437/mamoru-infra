import { PDFFont, PDFPage, rgb } from "pdf-lib"

/**
 * 帳票描画に使うフォントの組。jp=NotoSansJP(日本語) / latin=Helvetica(英数字)。
 *
 * ★なぜ2本必要か（2026-07-24 実測）:
 *   NotoSansJP は「英字＋ハイフン＋数字」（例 PMP-9000-EX / CYL-1000）を描くと、数字が
 *   CJK拡張Aのグリフ（9→U+40FA, 0→U+40F1）に化けて全角幅で描画される。ところが
 *   font.widthOfTextAtSize() は比例幅を返すため、収まり判定は「収まる」と誤答し、
 *   実描画は最大 +41.6% はみ出して罫線・隣接セルに食い込む（PMP-9000-EX で +28.9%）。
 *   Helvetica で同じ文字列を描くと計測値と実描画幅の乖離は 0.0%。
 *   ＝ 収まり判定を信用できるようにするための修正であって、見た目の好みではない。
 *
 * 型を PDFFont 単体から ReportFonts に変えてあるのは意図的。単体を渡す旧コードは
 * コンパイルエラーになり、「対応漏れのルート」が型検査で全部あぶり出される
 * （関数の存在＝対策済み、と誤認して customFont を渡し続ける事故を防ぐ）。
 */
export type ReportFonts = {
    jp: PDFFont
    latin: PDFFont
}

// 印字可能ASCIIのみで構成される文字列か（半角英数字・記号・空白）。
const ASCII_ONLY = /^[\x20-\x7E]+$/

/**
 * 文字列に応じて描画フォントを選ぶ。ASCIIのみ→latin、日本語を含む→jp。
 * ★計測（widthOfTextAtSize）と描画（drawText）で必ず同じフォントを使うこと。
 *   両者がズレることが、このモジュールが直そうとしている不具合そのもの。
 */
export const pickFont = (fonts: ReportFonts, text: string): PDFFont =>
    ASCII_ONLY.test(text) ? fonts.latin : fonts.jp

export type CellDrawOptions = {
    align?: "left" | "center"
    paddingX?: number
    paddingY?: number
    minFontSize?: number
    maxFontSize?: number
}

export type WrappedCellDrawOptions = {
    paddingX?: number
    paddingY?: number
    minFontSize?: number
    maxFontSize?: number
    lineGap?: number
}

export type DateAnchors = {
    year: number
    month: number
    day: number
}

type DrawTextInCellArgs = {
    page: PDFPage
    pageHeight: number
    fonts: ReportFonts
    text: unknown
    cellX: number
    cellTopFromTop: number
    cellW: number
    cellH: number
    fontSize?: number
    options?: CellDrawOptions
}

type DrawWrappedTextInCellArgs = {
    page: PDFPage
    pageHeight: number
    fonts: ReportFonts
    text: unknown
    cellX: number
    cellTopFromTop: number
    cellW: number
    cellH: number
    fontSize?: number
    options?: WrappedCellDrawOptions
}

type DrawRightAtArgs = {
    page: PDFPage
    pageHeight: number
    fonts: ReportFonts
    text: unknown
    rightX: number
    cellTopFromTop: number
    cellH: number
    fontSize: number
}

type DrawPeriodDateArgs = {
    page: PDFPage
    pageHeight: number
    fonts: ReportFonts
    dateValue: unknown
    anchors: DateAnchors
    rowTop: number
    rowHeight: number
    fontSize: number
}

type DrawJapaneseDateInCellArgs = Omit<DrawTextInCellArgs, "text"> & {
    dateValue: unknown
}

export const normalizeText = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim()

// 判定の表示記号化（PDF描画専用）。UI・保存値・ロジック判定は "良"/"否" のまま不変。
// 告示第14号の記号に準拠: 正常=○(U+25CB)、不良=×(U+00D7)。空は空のまま。
// "不良" は fixture 不備の保険（実フォームは "否" を保存）。
export const formatJudgment = (value: unknown): string => {
    const v = String(value ?? "").trim()
    if (v === "良") return "○" // ○
    if (v === "否" || v === "不良") return "×" // ×
    return v
}

const getDatePartsFromNormalizedText = (raw: string) => {
    const explicitMatch = raw.match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})$/)
    if (explicitMatch) {
        return {
            year: explicitMatch[1],
            month: String(Number(explicitMatch[2])),
            day: String(Number(explicitMatch[3])),
        }
    }

    const date = new Date(raw)
    if (Number.isNaN(date.getTime())) return null

    return {
        year: String(date.getFullYear()),
        month: String(date.getMonth() + 1),
        day: String(date.getDate()),
    }
}

export const formatDateText = (value: unknown) => {
    const raw = normalizeText(value)
    if (!raw) return ""

    const parts = getDatePartsFromNormalizedText(raw)
    if (!parts) return raw

    return `${parts.year}/${parts.month}/${parts.day}`
}

export const formatJapaneseDateText = (value: unknown) => {
    const raw = normalizeText(value)
    if (!raw) return ""

    const parts = getDatePartsFromNormalizedText(raw)
    if (!parts) return raw

    return `${parts.year}年${parts.month.padStart(2, "0")}月${parts.day.padStart(2, "0")}日`
}

export const parseDateParts = (value: unknown) => {
    const raw = normalizeText(value)
    if (!raw) return null

    return getDatePartsFromNormalizedText(raw)
}

export const truncateToFitWidth = (
    font: PDFFont,
    value: string,
    size: number,
    maxWidth: number,
    options?: { suffix?: string; forceSuffix?: boolean },
) => {
    if (!value) return ""

    const suffix = options?.suffix ?? "..."
    const forceSuffix = options?.forceSuffix ?? false

    if (!forceSuffix && font.widthOfTextAtSize(value, size) <= maxWidth) {
        return value
    }

    if (font.widthOfTextAtSize(suffix, size) > maxWidth) {
        return ""
    }

    let cut = value.length
    while (cut > 0) {
        const candidate = `${value.slice(0, cut).trimEnd()}${suffix}`
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
            return candidate
        }
        cut -= 1
    }

    return suffix
}

const getBaselineY = (
    pageHeight: number,
    textHeight: number,
    cellTopFromTop: number,
    cellH: number,
) => {
    const textTop = cellTopFromTop + (cellH - textHeight) / 2
    const baselineOffset = textHeight * 0.78
    return pageHeight - (textTop + baselineOffset)
}

export const drawTextInCell = ({
    page,
    pageHeight,
    fonts,
    text,
    cellX,
    cellTopFromTop,
    cellW,
    cellH,
    fontSize = 9,
    options,
}: DrawTextInCellArgs) => {
    const normalized = normalizeText(text)
    if (!normalized) return

    // ★計測と描画で必ず同一フォントを使う（ズレると収まり判定が嘘になる）
    const font = pickFont(fonts, normalized)

    const paddingX = options?.paddingX ?? 2.5
    const paddingY = options?.paddingY ?? 1.6
    const minFontSize = options?.minFontSize ?? 3.5
    let currentSize = Math.min(fontSize, options?.maxFontSize ?? fontSize)

    const maxWidth = Math.max(1, cellW - paddingX * 2)
    const maxHeight = Math.max(1, cellH - paddingY * 2)

    const widthAtCurrent = font.widthOfTextAtSize(normalized, currentSize)
    if (widthAtCurrent > maxWidth) {
        currentSize *= maxWidth / widthAtCurrent
    }

    const heightAtCurrent = font.heightAtSize(currentSize, { descender: true })
    if (heightAtCurrent > maxHeight) {
        currentSize *= maxHeight / heightAtCurrent
    }

    currentSize = Math.max(currentSize, minFontSize)

    const textToDraw = truncateToFitWidth(font, normalized, currentSize, maxWidth)
    if (!textToDraw) return

    const textWidth = font.widthOfTextAtSize(textToDraw, currentSize)
    const textHeight = font.heightAtSize(currentSize, { descender: true })
    const textX =
        options?.align === "center"
            ? cellX + (cellW - textWidth) / 2
            : cellX + paddingX

    page.drawText(textToDraw, {
        x: textX,
        y: getBaselineY(pageHeight, textHeight, cellTopFromTop, cellH),
        size: currentSize,
        font,
        color: rgb(0, 0, 0),
    })
}

export const drawJapaneseDateInCell = ({
    dateValue,
    ...args
}: DrawJapaneseDateInCellArgs) => drawTextInCell({
    ...args,
    text: formatJapaneseDateText(dateValue),
})

const wrapTextByWidth = (font: PDFFont, value: string, size: number, maxWidth: number) => {
    const lines: string[] = []
    let current = ""

    for (const ch of Array.from(value)) {
        if (!current && ch === " ") continue

        const candidate = `${current}${ch}`
        if (current && font.widthOfTextAtSize(candidate, size) > maxWidth + 0.1) {
            const trimmed = current.trimEnd()
            if (trimmed) lines.push(trimmed)
            current = ch === " " ? "" : ch
            continue
        }

        current = candidate
    }

    const last = current.trimEnd()
    if (last) lines.push(last)

    return lines
}

export const drawWrappedTextInCell = ({
    page,
    pageHeight,
    fonts,
    text,
    cellX,
    cellTopFromTop,
    cellW,
    cellH,
    fontSize = 7,
    options,
}: DrawWrappedTextInCellArgs) => {
    const normalized = normalizeText(text)
    if (!normalized) return

    // ★折り返し計算・描画とも同一フォントで行う（全行を通して一貫させる）
    const font = pickFont(fonts, normalized)

    const paddingX = options?.paddingX ?? 2
    const paddingY = options?.paddingY ?? 1
    const minFontSize = options?.minFontSize ?? 4.5
    const lineGap = options?.lineGap ?? 0.7
    let currentSize = Math.min(fontSize, options?.maxFontSize ?? fontSize)

    // NotoSansJP のフォントメトリクスが実際の描画幅を約10%過小評価するため
    // 0.90の安全係数を適用して折り返し幅を計算する
    const maxWidth = Math.max(1, (cellW - paddingX * 2) * 0.90)
    const maxHeight = Math.max(1, cellH - paddingY * 2)

    const wrapAtSize = (size: number) => {
        const lineHeight = size + lineGap
        const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight))
        const lines = wrapTextByWidth(font, normalized, size, maxWidth)
        return { lines, lineHeight, maxLines }
    }

    let wrapped = wrapAtSize(currentSize)
    while (wrapped.lines.length > wrapped.maxLines && currentSize > minFontSize) {
        currentSize = Math.max(minFontSize, currentSize - 0.3)
        wrapped = wrapAtSize(currentSize)
        if (currentSize <= minFontSize) break
    }

    const visibleLines = wrapped.lines.slice(0, wrapped.maxLines)
    if (!visibleLines.length) return

    if (wrapped.lines.length > wrapped.maxLines) {
        const lastIndex = visibleLines.length - 1
        visibleLines[lastIndex] = truncateToFitWidth(
            font,
            `${visibleLines[lastIndex]}...`,
            currentSize,
            maxWidth,
        )
    }

    const lineHeight = currentSize + lineGap
    const totalHeight = visibleLines.length * lineHeight
    let top = cellTopFromTop + (cellH - totalHeight) / 2

    for (const line of visibleLines) {
        const textHeight = font.heightAtSize(currentSize, { descender: true })
        page.drawText(line, {
            x: cellX + paddingX,
            y: getBaselineY(pageHeight, textHeight, top, lineHeight),
            size: currentSize,
            font,
            color: rgb(0, 0, 0),
        })
        top += lineHeight
    }
}

export const drawRightAt = ({
    page,
    pageHeight,
    fonts,
    text,
    rightX,
    cellTopFromTop,
    cellH,
    fontSize,
}: DrawRightAtArgs) => {
    const normalized = normalizeText(text)
    if (!normalized) return

    // ★右寄せは幅計測で位置が決まるので、計測と描画のフォント一致が特に効く
    const font = pickFont(fonts, normalized)

    const textWidth = font.widthOfTextAtSize(normalized, fontSize)
    const textHeight = font.heightAtSize(fontSize, { descender: true })

    page.drawText(normalized, {
        x: rightX - textWidth,
        y: getBaselineY(pageHeight, textHeight, cellTopFromTop, cellH),
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
    })
}

export const drawPeriodDate = ({
    page,
    pageHeight,
    fonts,
    dateValue,
    anchors,
    rowTop,
    rowHeight,
    fontSize,
}: DrawPeriodDateArgs) => {
    const parts = parseDateParts(dateValue)
    if (!parts) return false

    drawRightAt({
        page,
        pageHeight,
        fonts,
        text: parts.year,
        rightX: anchors.year,
        cellTopFromTop: rowTop,
        cellH: rowHeight,
        fontSize,
    })
    drawRightAt({
        page,
        pageHeight,
        fonts,
        text: parts.month,
        rightX: anchors.month,
        cellTopFromTop: rowTop,
        cellH: rowHeight,
        fontSize,
    })
    drawRightAt({
        page,
        pageHeight,
        fonts,
        text: parts.day,
        rightX: anchors.day,
        cellTopFromTop: rowTop,
        cellH: rowHeight,
        fontSize,
    })

    return true
}
