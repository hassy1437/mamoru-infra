import { PDFFont, PDFPage, rgb } from "pdf-lib"
import type { CellAt, CellRef, FitCollector } from "./pdf-fit-report"

// ★描画位置の型はルート側でも使う（薄い包みの引数）。1か所から出す。
export type { CellAt, CellRef }

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
    /**
     * 枠に収まらず切り詰めた項目の収集先（⑧）。
     * ★描画ヘルパーは全て fonts を受け取るので、ここに載せると呼び出し側を
     *   一切変えずに全経路から報告できる。項目名は描画後に payload と
     *   突き合わせて決めるので、呼び出し側に項目名を渡させる必要もない。
     */
    fit?: FitCollector
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
    /** どの欄の何行目のどの列か（行ループ・専用描画が渡す） */
    at?: CellRef
    align?: "left" | "center"
    paddingX?: number
    paddingY?: number
    minFontSize?: number
    maxFontSize?: number
}

export type WrappedCellDrawOptions = {
    /** どの欄の何行目のどの列か（行ループ・専用描画が渡す） */
    at?: CellRef
    paddingX?: number
    paddingY?: number
    minFontSize?: number
    maxFontSize?: number
    lineGap?: number
    /**
     * 縦位置。既定は "center"（従来の挙動）。
     * 縦に大きく余ったセル（itiran の資格保有設備欄など）で中央寄せすると
     * 文字列が空白の中に浮いて見えるため、そこだけ "top" を指定する。
     */
    verticalAlign?: "center" | "top"
}

export type DateAnchors = {
    year: number
    month: number
    day: number
    /**
     * 刷り込みの「年」「月」「日」のベースライン（上端からの絶対値・テンプレート実測）。
     *
     * ★これが無いとセル矩形の中央に置くことになり、刷り込みと高さが揃わない。
     *   実測では23様式すべてでズレており、−0.4〜−5.19pt（bekki7 が最大）。
     *   罫線も越えず切り詰めも起きないので、どの検査にも出なかった。
     */
    baseline?: number
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
    /** 上端からの絶対ベースライン。指定するとセル中央合わせより優先する（隣の刷り込みと揃える） */
    baselineY?: number
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
    /** baselineY を渡す場合は不要（縦中央合わせに使う値なので） */
    cellTopFromTop?: number
    cellH?: number
    fontSize: number
    /** 上端からの絶対ベースライン。指定するとセル中央合わせより優先する */
    baselineY?: number
    /**
     * 左へ伸ばせる限界の幅。超えたら比率で縮める。
     * ★右寄せは「右端固定で左へ伸びる」ので、長い値は左隣の刷り込みへ突っ込む。
     *   左寄せ＋maxWidth の経路にはあった縮小がここには無く、右寄せに変えると
     *   失敗時の挙動だけ悪くなる。それを塞ぐ。
     */
    maxWidth?: number
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
/**
 * 点検期間が年月日に分解できないときの扱い。
 *
 * ★以前は「期間文字列をそのまま刷り込みの上に描く」フォールバックだった。
 *   刷り込み「____年__月__日 ～ ____年__月__日」の上に生の文字列が重なり、
 *   22様式すべてで同じ形（セル定義監査が定義上の重なりとして検出）。
 * ★実測: 現実値セット0件 / 長文セット0件。入力画面は <Input type="date"> なので
 *   UI からは到達しない。到達するのは旧データか API 直叩きだけ。
 * ★情報を消さずに止める。読めない法定書類を出すより、業者に直してもらう方がよい。
 */
export const periodDateError = (form: string, start: unknown, end: unknown) => {
    const bad = [["点検年月日（開始）", start], ["点検年月日（終了）", end]] as const
    const items = bad
        .filter(([, v]) => String(v ?? "").trim() && !parseDateParts(v))
        .map(([label, v]) => ({
            field: "period", label, input: String(v).length, fits: 0, over: 0,
            hint: "年月日に分解できる形式（例 2026-04-01）で入力してください",
            text: String(v),
        }))
    return items.length ? { error: "FIT_FAILED", form, items } : null
}

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

    if (!forceSuffix && font.widthOfTextAtSize(value, size) <= maxWidth + FIT_EPSILON) {
        return value
    }

    if (font.widthOfTextAtSize(suffix, size) > maxWidth) {
        return ""
    }

    let cut = value.length
    while (cut > 0) {
        const candidate = `${value.slice(0, cut).trimEnd()}${suffix}`
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth + FIT_EPSILON) {
            return candidate
        }
        cut -= 1
    }

    return suffix
}

/**
 * 幅の収まり判定に使う許容誤差。
 * ★これはレイアウトの余裕ではなく IEEE754 の丸め誤差を吸収するためのものである。
 *   drawInCell 系は「セル幅にちょうど収まる」ようフォントサイズを
 *   size *= maxWidth / measure(size) で決める。数学的には measure(size) == maxWidth に
 *   なるが、浮動小数では最後の桁がわずかに上振れすることがあり（実測 +5.68e-14）、
 *   許容誤差なしで比較すると「収まっているのに末尾1文字だけ切り詰める」が起きる。
 *   実際 2026-07-24 時点の切り詰め32件はほぼ全てがちょうど1文字の欠落だった。
 *   1e-6pt は 300dpi で 1/10000 px 未満＝視覚的に完全にゼロで、実測誤差に対して8桁の余裕がある。
 *   レイアウト上の余白が欲しくなってもこの値を大きくしないこと（それは別の問題の隠蔽になる）。
 */
export const FIT_EPSILON = 1e-6

/**
 * 判読できないほど縮んだとみなす下限（暫定値）。
 *
 * ★この 5.0pt に根拠は無い。7pt は消防法令ではなく可読性の目安で、
 *   テンプレート自身の印字（最小8.5pt）は我々の設計値（点検結果行 6.0〜6.8pt）より
 *   上なので基準にできない。根拠を作るなら 300dpi 印刷での判読実験か消防署への確認が要る。
 *   現実値セットでは 5pt 未満は 0.3% しか出ないので、実質「異常検知」としてのみ働く。
 *
 * なぜ必要か: 切り詰めが起きなくても、長い値は縮小だけで「収まって」しまう。
 *   実測では55文字の物件名が 3.5pt で描かれ、エラーにならず静かに判読不能になっていた。
 *   ＝ 切り詰めの検出だけでは、業者が長い建物名を入れた場合を捕まえられない。
 */
/**
 * ★新しく欄を設計するときの目安: 8pt
 *
 * これは「止める閾値」でも「警告の閾値」でもなく、**欄を新設・再設計するときに
 * 狙う下限**。相棒（実務側）の「8ptを最小と一旦設定」に対応する。
 *
 * ■ なぜ検査に載せないか（2026-08-03 実測）
 *   現実値セット26帳票で 5.0〜8.0pt の描画が **4,925 件**、26様式中 **25様式**で発生する。
 *   （bekki6 929 / bekki8 605 / bekki7 598 / bekki3 217 / bekki20 199 …）
 *   さらに同じ(様式, pt)が10件以上まとまるものが 4,412 件（89%）＝
 *   **欄の設計値がそもそも 8pt 未満**で、入力の長さで縮んだ結果ではない。
 *   内訳の最小側は bekki8 の ○/× が 5.11〜5.34pt、bekki11-1 の年月日が 5.20pt。
 *   狭い升目に記号や日付を入れる設計そのもので、業者に打つ手が無い。
 *
 *   ＝ 警告にすると 4,925 件が常時鳴り、
 *      現実値セットで **1 件**しか鳴らない ABSOLUTE_MIN_FONT_SIZE の警告が埋もれる。
 *      「読みにくい」と「実質欠落」の区別が消えるので、検査には載せない。
 *   再計測: `python scripts/measure-below-8pt.py`
 *
 * ■ どう使うか
 *   既存の欄を判定するのではなく、**新しい欄・新しい様式を起こすときに
 *   「値がこのサイズを割るなら欄の幅か行の高さを見直す」**という判断に使う。
 */
export const READABLE_DESIGN_TARGET_PT = 8.0

export const ABSOLUTE_MIN_FONT_SIZE = 5.0

/**
 * 下限より小さく描かれる場合に「収まらなかった」として報告する。
 * fits は下限サイズなら何文字入るかで、業者に「何文字まで」を示すために使う。
 */
export const reportIfBelowMinSize = (
    fonts: ReportFonts,
    value: string,
    size: number,
    maxWidth: number,
) => {
    void maxWidth
    if (!fonts.fit || size >= ABSOLUTE_MIN_FONT_SIZE || !value) return
    fonts.fit.reportSmall(value, size)
}

/**
 * ラン分割した文字列を maxWidth に収まるまで末尾から切り詰める。
 * ★計測は measureRuns（描画と同じ分割・同じフォント）で行う。
 */
/**
 * PDFPage オブジェクトに安定した番号を振る。
 * ★セルの同一性には「どのページか」が要るが、描画ヘルパーが受け取るのは PDFPage の
 *   オブジェクトでページ番号ではない。呼び出し側にページ番号を足すと 614 箇所に波及するので、
 *   オブジェクトの同一性から番号を導く。
 */
const pageIds = new WeakMap<PDFPage, number>()
let nextPageId = 0
export const pageIdOf = (page: PDFPage): number => {
    let id = pageIds.get(page)
    if (id === undefined) {
        id = nextPageId += 1
        pageIds.set(page, id)
    }
    return id
}

/** 描画位置を組み立てる。行ループは extra で欄名・行番号・列名を足す。 */
export const cellAt = (
    page: PDFPage,
    cellX: number,
    cellTopFromTop: number,
    cellW: number,
    cellH: number,
    extra?: CellRef,
): CellAt => ({
    page: pageIdOf(page), cellX, cellTopFromTop, cellW, cellH, ...extra,
})

export const truncateRunsToFitWidth = (
    fonts: ReportFonts,
    value: string,
    size: number,
    maxWidth: number,
    /** 描画位置。★どのセルで起きたかを値の文字列ではなくこれで識別する（重複の畳み込みも） */
    at?: CellAt,
) => {
    if (!value) return ""
    if (measureRuns(fonts, value, size) <= maxWidth + FIT_EPSILON) return value

    const suffix = "..."
    if (measureRuns(fonts, suffix, size) > maxWidth) return ""

    let cut = value.length
    while (cut > 0) {
        const candidate = `${value.slice(0, cut).trimEnd()}${suffix}`
        if (measureRuns(fonts, candidate, size) <= maxWidth + FIT_EPSILON) {
            fonts.fit?.report(value, cut, at)
            return candidate
        }
        cut -= 1
    }
    fonts.fit?.report(value, 0, at)
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
    baselineY,
}: DrawTextInCellArgs) => {
    const normalized = normalizeText(text)
    if (!normalized) return

    const paddingX = options?.paddingX ?? 2.5
    const paddingY = options?.paddingY ?? 1.6
    const minFontSize = options?.minFontSize ?? 3.5
    let currentSize = Math.min(fontSize, options?.maxFontSize ?? fontSize)
    const designSize = currentSize

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

    fonts.fit?.reportShrink(normalized, designSize, currentSize)
    reportIfBelowMinSize(fonts, normalized, currentSize, maxWidth)

    const textToDraw = truncateRunsToFitWidth(fonts, normalized, currentSize, maxWidth,
        cellAt(page, cellX, cellTopFromTop, cellW, cellH, options?.at))
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
        // ★baselineY が来たらセル中央ではなくそこに合わせる（隣の刷り込みと高さを揃える）。
        //   縮小すると中央合わせの位置はサイズに応じて動くので、刷り込みと並べる欄では
        //   ベースラインを直接指定しないと値ごとに上下がばらつく。
        baselineY !== undefined ? pageHeight - baselineY : getBaselineY(pageHeight, textHeight, cellTopFromTop, cellH),
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
        // ★この 0.1 は FIT_EPSILON（丸め誤差の吸収）とは別物。
        //   セル幅を 0.1pt だけ超えることを許して1文字多く行に載せるレイアウト上の余白で、
        //   FIT_EPSILON(1e-6) に置き換えると bekki18 の措置内容が 2行→3行に増える（実測）。
        //   ＝挙動を変える値なので、折り返し方針を見直す時（⑧）に一緒に判断すること。
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
    const designSize = currentSize

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
    // 折り返しは縮小ループが別なので、ここでも設計値からの逸脱を記録する
    fonts.fit?.reportShrink(normalized, designSize, currentSize)
    reportIfBelowMinSize(fonts, normalized, currentSize, maxWidth)

    const visibleLines = wrapped.lines.slice(0, wrapped.maxLines)
    if (!visibleLines.length) return

    if (wrapped.lines.length > wrapped.maxLines) {
        // 折り返しても行数が入らず末尾を落とす＝情報欠落なので報告する
        fonts.fit?.report(normalized, visibleLines.join("").length,
            cellAt(page, cellX, cellTopFromTop, cellW, cellH, options?.at))
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
    let top =
        options?.verticalAlign === "top"
            ? cellTopFromTop + paddingY
            : cellTopFromTop + (cellH - totalHeight) / 2

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
    baselineY,
    maxWidth,
}: DrawRightAtArgs) => {
    const normalized = normalizeText(text)
    if (!normalized) return

    // ★右寄せは幅計測で位置が決まるので、計測と描画の一致が特に効く（ラン分割で合計幅を出す）
    let size = fontSize
    let textWidth = measureRuns(fonts, normalized, size)
    if (maxWidth !== undefined && textWidth > maxWidth) {
        size = size * (maxWidth / textWidth)
        textWidth = measureRuns(fonts, normalized, size)
        fonts.fit?.reportShrink(normalized, fontSize, size)
        reportIfBelowMinSize(fonts, normalized, size, maxWidth)
    }
    const textHeight = fonts.jp.heightAtSize(size, { descender: true })

    drawTextRuns(
        page,
        fonts,
        normalized,
        rightX - textWidth,
        // ★baselineY が来たらセル中央ではなくそこに合わせる（隣の刷り込みと高さを揃える）
        baselineY !== undefined
            ? pageHeight - baselineY
            : getBaselineY(pageHeight, textHeight, cellTopFromTop ?? 0, cellH ?? textHeight),
        size,
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
        baselineY: anchors.baseline,
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
        baselineY: anchors.baseline,
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
        baselineY: anchors.baseline,
    })

    return true
}

/** 選択肢を○で囲む位置。テンプレートPDFから実測した値を入れる */
export type ChoiceMark = { label: string; cx: number; cy: number; rx: number; ry: number }

/**
 * 刷り込まれた選択肢を○で囲む。
 *
 * ★選択肢欄に文字を重ね書きしてはいけない（Phase 1）。テンプレートが
 *   「機器・総合」「専用・兼用」のように選択肢を刷り込んでいる欄は、
 *   該当する語を○で囲むのが様式どおりの記入方法。文字列をそのまま描くと
 *   刷り込みの上に重なり、消防署から見て何を選んだのか分からなくなる。
 *
 * ★この関数は各ルートに散らばっていた drawSelectionCircle を1本化したもの。
 *   実測で3種類に分岐しており（borderWidth 0.7 が8ルート / 0.8 が2ルート、
 *   normalizeText の有無）、まさにドリフトが起きていた。既定を 0.7 にし、
 *   0.8 のルートは引数で明示して従来の出力を保つ。
 */
export const drawChoiceCircle = (
    page: PDFPage,
    pageHeight: number,
    fonts: ReportFonts,
    value: unknown,
    choices: ChoiceMark[],
    borderWidth = 0.7,
) => {
    const text = String(value ?? "").replace(/\s+/g, " ").trim()
    if (!text) return
    let matched = 0
    for (const c of choices) {
        if (!text.includes(c.label)) continue
        matched += 1
        page.drawEllipse({
            x: c.cx,
            y: pageHeight - c.cy,
            xScale: c.rx,
            yScale: c.ry,
            borderColor: rgb(0, 0, 0),
            borderWidth,
        })
    }
    // ★値が入っているのに1つも一致しない＝○が1つも描かれず、PDFは正常に出る。
    //   罫線越えでも刷り込みへの重なりでも出ず、ベースラインも通る。
    //   ＝ 全検査が緑のまま情報だけ落ちる唯一の経路なので、必ず報告する。
    //   エラーにせず警告に留める理由と、Phase 3 での格上げの申し送りは
    //   FitCollector.reportChoiceMismatch のコメントに書いてある。
    if (matched === 0) fonts.fit?.reportChoiceMismatch(text, choices.map((c) => c.label))
}

/**
 * テンプレートに刷り込み済みで、アプリが描いてはいけない行を空にする。
 *
 * ★用途: 「機器点検」「総合点検」のようなセクション見出しは、様式では**行いっぱいの
 *   刷り込み**であってデータ行ではない。そこに点検項目や判定を描くと見出しに重なる。
 *
 * ★なぜ skipContentRows では足りないか
 *   各ルートの drawResultRows が持つ skipContentRows は**内容列しか飛ばさない**。
 *   判定・不良内容・措置内容は描かれてしまうので、見出し行には使えない。
 *   行データ自体を空にすれば、列の構成やルートごとの引数の違いに関係なく全列止まる。
 *
 * ★ここに置く理由: 同じ判断を7ルートに書くと必ずドリフトする（drawSelectionCircle が
 *   実際に3種類に分かれ、equipment_name の非描画が1様式だけ漏れていた）。定義は1つにする。
 */
export const blankPrintedRows = <T>(rows: T[] | undefined, printedRows: ReadonlySet<number>): T[] =>
    (rows ?? []).map((row, i) => (printedRows.has(i) ? ({} as T) : row))
