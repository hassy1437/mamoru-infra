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
// 1文字が印字可能ASCIIか。
const IS_ASCII_CHAR = (ch: string) => ch.length > 0 && ch >= "\x20" && ch <= "\x7E"

/**
 * 文字列に応じて描画フォントを選ぶ。ASCIIのみ→latin、日本語を含む→jp。
 * ★計測（widthOfTextAtSize）と描画（drawText）で必ず同じフォントを使うこと。
 *
 * ※単独では「日本語混在文字列」を救えない（例: "27-P2 点検項目" は jp が選ばれ、
 *   その中の英数字が化ける）。混在に対応するには splitFontRuns を使うこと。
 *   本関数は「文字列全体が単一フォントで足りる」場面と後方互換のために残している。
 */
export const pickFont = (fonts: ReportFonts, text: string): PDFFont =>
    ASCII_ONLY.test(text) ? fonts.latin : fonts.jp

export type FontRun = {
    text: string
    font: PDFFont
}

/**
 * 文字列を「連続するASCII区間」と「それ以外の区間」に分割し、区間ごとの描画フォントを決める。
 *
 * ★なぜ文字列単位のフォント選択では不十分か（2026-07-24 実測）:
 *   NotoSansJP は英数字の並びを GSUB で別グリフ（CJK拡張A・ID 16625等）に置換する。
 *   置換自体は正当だが、pdf-lib の埋め込み（subset:false）ではそのグリフの幅が /W に
 *   出力されず、ビューアが既定幅1000で描くため、計測幅と実描画幅が最大 +41.6% ズレる。
 *   （subset:true にすると幅は直るが CJK グリフが脱落して描画が壊れるため採用不可）
 *   → 英数字を Helvetica で描けば GSUB の文脈から切り離せる。文字列単位の選択だと
 *     "型式 PMP-9000-EX" のような混在が jp 側に落ちて化けるので、区間単位で分ける。
 *
 * 副次効果: ASCII は文脈によらず常に Helvetica になるため、同じ型番が
 *   "PMP-9000-EX" と "型式 PMP-9000-EX" で別書体になる不統一も解消する。
 */
export const splitFontRuns = (fonts: ReportFonts, text: string): FontRun[] => {
    if (!text) return []

    const runs: FontRun[] = []
    let current = ""
    let currentIsAscii = IS_ASCII_CHAR(text[0]!)

    for (const ch of Array.from(text)) {
        const isAscii = IS_ASCII_CHAR(ch)
        if (isAscii === currentIsAscii) {
            current += ch
            continue
        }
        if (current) runs.push({ text: current, font: currentIsAscii ? fonts.latin : fonts.jp })
        current = ch
        currentIsAscii = isAscii
    }
    if (current) runs.push({ text: current, font: currentIsAscii ? fonts.latin : fonts.jp })

    return runs
}

/**
 * ラン分割した文字列の実描画幅。各区間を自身のフォントで測って合計する。
 * ★描画（drawFontRuns）と必ず同じ分割・同じフォントで計算すること。
 */
export const measureRuns = (fonts: ReportFonts, text: string, size: number): number =>
    splitFontRuns(fonts, text).reduce((w, run) => w + run.font.widthOfTextAtSize(run.text, size), 0)

/**
 * ラン分割した文字列を、指定位置から順に区間ごとのフォントで描画する。
 * ルート側のローカル描画ヘルパーからも使えるよう公開している
 * （単一フォントで drawText すると混在文字列で英数字が化けるため、必ずこれを通すこと）。
 */
export const drawTextRuns = (
    page: PDFPage,
    fonts: ReportFonts,
    text: string,
    x: number,
    y: number,
    size: number,
) => {
    let cursor = x
    for (const run of splitFontRuns(fonts, text)) {
        page.drawText(run.text, { x: cursor, y, size, font: run.font, color: rgb(0, 0, 0) })
        cursor += run.font.widthOfTextAtSize(run.text, size)
    }
}

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

/**
 * ラン分割した文字列を maxWidth に収まるまで末尾から切り詰める。
 * ★計測は measureRuns（描画と同じ分割・同じフォント）で行う。
 */
const truncateRunsToFitWidth = (
    fonts: ReportFonts,
    value: string,
    size: number,
    maxWidth: number,
) => {
    if (!value) return ""
    if (measureRuns(fonts, value, size) <= maxWidth) return value

    const suffix = "..."
    if (measureRuns(fonts, suffix, size) > maxWidth) return ""

    let cut = value.length
    while (cut > 0) {
        const candidate = `${value.slice(0, cut).trimEnd()}${suffix}`
        if (measureRuns(fonts, candidate, size) <= maxWidth) return candidate
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

    const paddingX = options?.paddingX ?? 2.5
    const paddingY = options?.paddingY ?? 1.6
    const minFontSize = options?.minFontSize ?? 3.5
    let currentSize = Math.min(fontSize, options?.maxFontSize ?? fontSize)

    const maxWidth = Math.max(1, cellW - paddingX * 2)
    const maxHeight = Math.max(1, cellH - paddingY * 2)

    // ★計測はラン分割（区間ごとに自フォントで測って合計）。描画も同じ分割で行う。
    const widthAtCurrent = measureRuns(fonts, normalized, currentSize)
    if (widthAtCurrent > maxWidth) {
        currentSize *= maxWidth / widthAtCurrent
    }

    // 高さは jp 基準に固定する。テキストごとに変えると同じ行で縦位置がばらつくため。
    const heightAtCurrent = fonts.jp.heightAtSize(currentSize, { descender: true })
    if (heightAtCurrent > maxHeight) {
        currentSize *= maxHeight / heightAtCurrent
    }

    currentSize = Math.max(currentSize, minFontSize)

    const textToDraw = truncateRunsToFitWidth(fonts, normalized, currentSize, maxWidth)
    if (!textToDraw) return

    const textWidth = measureRuns(fonts, textToDraw, currentSize)
    const textHeight = fonts.jp.heightAtSize(currentSize, { descender: true })
    const textX =
        options?.align === "center"
            ? cellX + (cellW - textWidth) / 2
            : cellX + paddingX

    drawTextRuns(
        page,
        fonts,
        textToDraw,
        textX,
        getBaselineY(pageHeight, textHeight, cellTopFromTop, cellH),
        currentSize,
    )
}

export const drawJapaneseDateInCell = ({
    dateValue,
    ...args
}: DrawJapaneseDateInCellArgs) => drawTextInCell({
    ...args,
    text: formatJapaneseDateText(dateValue),
})

const wrapTextByWidth = (fonts: ReportFonts, value: string, size: number, maxWidth: number) => {
    const lines: string[] = []
    let current = ""

    for (const ch of Array.from(value)) {
        if (!current && ch === " ") continue

        const candidate = `${current}${ch}`
        if (current && measureRuns(fonts, candidate, size) > maxWidth + 0.1) {
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

    const paddingX = options?.paddingX ?? 2
    const paddingY = options?.paddingY ?? 1
    const minFontSize = options?.minFontSize ?? 4.5
    const lineGap = options?.lineGap ?? 0.7
    let currentSize = Math.min(fontSize, options?.maxFontSize ?? fontSize)

    // ★安全係数（旧 0.90）は撤廃した。
    //   旧コメントは「NotoSansJP のメトリクスが実描画幅を約10%過小評価するため」だったが、
    //   その過小評価の実体は英数字がCJKグリフに化けていたことで、①b のラン分割で解消済み
    //   （計測幅と実描画幅は回帰テストで一致を確認している）。
    //   係数はその後、セル座標の定義ミスを隠す働きしかしておらず、②③④で座標を実測値に
    //   直した上で撤廃した。再び足したくなったら、まず何がはみ出るのかを実測すること。
    const maxWidth = Math.max(1, cellW - paddingX * 2)
    const maxHeight = Math.max(1, cellH - paddingY * 2)

    const wrapAtSize = (size: number) => {
        const lineHeight = size + lineGap
        const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight))
        const lines = wrapTextByWidth(fonts, normalized, size, maxWidth)
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
        visibleLines[lastIndex] = truncateRunsToFitWidth(
            fonts,
            `${visibleLines[lastIndex]}...`,
            currentSize,
            maxWidth,
        )
    }

    const lineHeight = currentSize + lineGap
    const totalHeight = visibleLines.length * lineHeight
    let top = cellTopFromTop + (cellH - totalHeight) / 2

    for (const line of visibleLines) {
        const textHeight = fonts.jp.heightAtSize(currentSize, { descender: true })
        drawTextRuns(
            page,
            fonts,
            line,
            cellX + paddingX,
            getBaselineY(pageHeight, textHeight, top, lineHeight),
            currentSize,
        )
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

    // ★右寄せは幅計測で位置が決まるので、計測と描画の一致が特に効く（ラン分割で合計幅を出す）
    const textWidth = measureRuns(fonts, normalized, fontSize)
    const textHeight = fonts.jp.heightAtSize(fontSize, { descender: true })

    drawTextRuns(
        page,
        fonts,
        normalized,
        rightX - textWidth,
        getBaselineY(pageHeight, textHeight, cellTopFromTop, cellH),
        fontSize,
    )
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
