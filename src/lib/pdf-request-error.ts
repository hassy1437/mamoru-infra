/**
 * PDF生成リクエストの失敗を「業者が直せるか」で分類し、業者向けの文言にする。
 *
 * ■ なぜ要るか（2026-07-25 に見つかった退行）
 *   ⑧で各様式ルートは「枠に収まらない項目がある」とき 422 に
 *   どの項目が何文字超過かを載せて返すようにした。ところが呼び出し側は
 *   `if (!response.ok) throw new Error("PDF generation failed")` のままで、
 *   その本文を捨てていた。しかも様式フォームごとのPDF出力は業者の主経路なので、
 *   「PDF生成に失敗しました」としか出ず、業者は何を直せばよいか分からないまま
 *   様式を1枚も作れない状態になっていた（⑧の前は黙って切り詰められたPDFが出ていた）。
 *
 * ■ 原因の種類を必ず区別する
 *   fit     … 枠に収まらない。業者が入力を短くすれば直る
 *   server  … サーバ側の不具合（5xx等）。業者には直せない
 *   network … 通信断・本文が壊れている等。再試行で直る可能性がある
 *   これを混ぜて1つの文言にすると、業者は「自分が直すのか待つのか」が判断できない。
 *   ★納品はこの分類で挙動を変える（fit のときは納品させない。deliver-report-button 参照）。
 */

export type PdfFailureKind = "fit" | "server" | "network"

export type PdfFitItem = {
    field: string
    label: string
    input: number
    fits: number
    over: number
    hint: string
    text: string
}

export type PdfFailure = {
    kind: PdfFailureKind
    /** 業者に見せる文言（複数行） */
    message: string
    /** kind==="fit" のときだけ入る。修正すべき項目 */
    items: PdfFitItem[]
    status: number
}

/** 枠に収まらない項目の一覧を、業者が直せる形の文章にする。 */
const fitMessage = (form: string | undefined, items: PdfFitItem[]): string =>
    [
        `枠に収まらない項目があるため${form ? `「${form}」の` : ""}PDFを作成できませんでした。`,
        "次の項目を短くしてから、もう一度お試しください:",
        ...items.map((it) => `・${it.label}: ${it.input}文字（${it.over}文字超過）\n　 ${it.hint}`),
    ].join("\n")

/**
 * 失敗レスポンスを分類する。本文が読めない場合も必ず何かを返す
 * （ここで「PDF generation failed」に戻すと、直したはずの問題がそのまま復活する）。
 */
export const describePdfFailure = async (response: Response): Promise<PdfFailure> => {
    const status = response.status
    if (status === 422) {
        try {
            const body = await response.json()
            if (body?.error === "FIT_FAILED" && Array.isArray(body.items) && body.items.length) {
                return {
                    kind: "fit",
                    message: fitMessage(body.form, body.items),
                    items: body.items,
                    status,
                }
            }
        } catch {
            // 本文が壊れている。422 である事実だけは伝える（下へ落とす）
        }
        return {
            kind: "fit",
            message:
                "入力が枠に収まらないためPDFを作成できませんでした。\n" +
                "物件名・会社名・住所などの長い項目を短くしてお試しください。",
            items: [],
            status,
        }
    }
    if (status >= 500) {
        return {
            kind: "server",
            message:
                "サーバ側の問題でPDFを作成できませんでした。\n" +
                "入力の修正では直りません。時間をおいて再試行し、続くようご連絡ください。",
            items: [],
            status,
        }
    }
    return {
        kind: "network",
        message: `PDFの作成に失敗しました（エラー ${status}）。\n通信状況をご確認のうえ、再試行してください。`,
        items: [],
        status,
    }
}

/** 分類した失敗を throw できる Error にする。message はそのまま業者向け文言。 */
export class PdfRequestError extends Error {
    readonly failure: PdfFailure
    constructor(failure: PdfFailure) {
        super(failure.message)
        this.name = "PdfRequestError"
        this.failure = failure
    }
}

/** `if (!res.ok) throw await pdfRequestError(res)` の形で使う。 */
export const pdfRequestError = async (response: Response): Promise<PdfRequestError> =>
    new PdfRequestError(await describePdfFailure(response))

/**
 * catch で受けた例外を業者向け文言にする。
 * 分類済みならその文言、そうでなければ（fetch自体が失敗した等）呼び出し側の既定文言に
 * 通信エラーの可能性を添える。★既定文言だけに戻さないこと（原因の種類が消える）。
 */
export const pdfErrorText = (error: unknown, fallback: string): string => {
    if (error instanceof PdfRequestError) return error.message
    return `${fallback}\n通信エラーの可能性があります。再試行してください。`
}

/** catch で受けた例外が「業者が直せる」ものか。納品の可否判断に使う。 */
export const isFitFailure = (error: unknown): error is PdfRequestError =>
    error instanceof PdfRequestError && error.failure.kind === "fit"
