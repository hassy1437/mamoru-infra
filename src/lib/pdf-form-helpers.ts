import { PDFFont, PDFPage, rgb } from "pdf-lib"

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
    font: PDFFont
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
    font: PDFFont
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
    font: PDFFont
    text: unknown
    rightX: number
    cellTopFromTop: number
    cellH: number
    fontSize: number
}

type DrawPeriodDateArgs = {
    page: PDFPage
    pageHeight: number
    font: PDFFont
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
    font,
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
    font,
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
    font,
    text,
    rightX,
    cellTopFromTop,
    cellH,
    fontSize,
}: DrawRightAtArgs) => {
    const normalized = normalizeText(text)
    if (!normalized) return

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
    font,
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
        font,
        text: parts.year,
        rightX: anchors.year,
        cellTopFromTop: rowTop,
        cellH: rowHeight,
        fontSize,
    })
    drawRightAt({
        page,
        pageHeight,
        font,
        text: parts.month,
        rightX: anchors.month,
        cellTopFromTop: rowTop,
        cellH: rowHeight,
        fontSize,
    })
    drawRightAt({
        page,
        pageHeight,
        font,
        text: parts.day,
        rightX: anchors.day,
        cellTopFromTop: rowTop,
        cellH: rowHeight,
        fontSize,
    })

    return true
}
