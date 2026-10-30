/**
 * 銘板の写真を AI に読ませるときの「何を・どの形で返させるか」と「正誤の決め方」（2026-10-23）。
 * ★2026-10-30: 評価では Claude・Gemini・GPT に同じ指示・同じ形を渡す（scripts/nameplate-eval/providers.mts）。
 *   読み取った値の「形」の確かめ（checkNameplateReading）もここに置いた（段階方式と本番の確かめる画面で使う）。
 *
 * ■ 1 か所にまとめる
 *   評価（scripts/nameplate-eval/）と、あとで作る本番の読み取りが★同じ指示・同じ形を使う。
 *   評価で測った指示と本番の指示が違うと、測った正答率が本番に当てはまらない。
 *   設計: docs/銘板・過去報告書の読み取り_設計と費用_20261020.md
 *
 * ■ 決まり（設計書 1・2 より）
 *   ・読めない字は補わない。1 字でも読めない欄は null（推測させない）
 *   ・銘板に無い欄も null。ただし「読めない」と「無い」は分けて返させる（撮り直せば読めるかが違う）
 *   ・判定（良・不良）・点検者は読ませない（銘板には無いが、欄に作らない）
 *
 * ★この file は実行時の import を持たない（node --experimental-strip-types でそのまま読むため）。
 */

/** 機器の種類（設計書 2.「返す形」） */
export const NAMEPLATE_DEVICE_KINDS = [
    "受信機", "中継器", "ポンプ", "電動機", "増幅器", "消火器", "誘導灯", "測定機器", "その他",
] as const
export type NameplateDeviceKind = (typeof NAMEPLATE_DEVICE_KINDS)[number]

/** 読む欄。★並びは評価の表・正解の CSV の列の並びにもなる */
export const NAMEPLATE_FIELDS = [
    { key: "maker", label: "製造者名" },
    { key: "model", label: "型式" },
    { key: "approval_number", label: "型式番号" },
    { key: "manufactured", label: "製造年" },
    { key: "serial_number", label: "製造番号" },
    { key: "calibrated_at", label: "校正年月日" },
] as const
export type NameplateFieldKey = (typeof NAMEPLATE_FIELDS)[number]["key"]

/** clear = 読めた / unreadable = 銘板にあるが読めない / absent = 銘板に無い */
export const NAMEPLATE_LEGIBILITY = ["clear", "unreadable", "absent"] as const
export type NameplateLegibility = (typeof NAMEPLATE_LEGIBILITY)[number]

/** 読めた値への自信（low の欄は画面で黄色にする想定） */
export const NAMEPLATE_CERTAINTY = ["high", "low"] as const
export type NameplateCertainty = (typeof NAMEPLATE_CERTAINTY)[number]

export type NameplateFieldReading = {
    value: string | null
    legibility: NameplateLegibility
    certainty: NameplateCertainty
}
export type NameplateReading = {
    device_kind: NameplateDeviceKind
    fields: Record<NameplateFieldKey, NameplateFieldReading>
}

const FIELD_SCHEMA = {
    type: "object",
    properties: {
        value: { type: ["string", "null"] },
        legibility: { type: "string", enum: [...NAMEPLATE_LEGIBILITY] },
        certainty: { type: "string", enum: [...NAMEPLATE_CERTAINTY] },
    },
    required: ["value", "legibility", "certainty"],
    additionalProperties: false,
}

/**
 * 決まった形で返させるための JSON の型（structured outputs）。
 * ★Claude の制限: object はすべて additionalProperties: false・null を許す欄（型の組み合わせ）は 16 まで・
 *   minLength などの制約は使えない（scripts/check-nameplate-eval.mjs が見張る）。
 */
export const NAMEPLATE_SCHEMA = {
    type: "object",
    properties: {
        device_kind: { type: "string", enum: [...NAMEPLATE_DEVICE_KINDS] },
        fields: {
            type: "object",
            properties: Object.fromEntries(NAMEPLATE_FIELDS.map((f) => [f.key, FIELD_SCHEMA])),
            required: NAMEPLATE_FIELDS.map((f) => f.key),
            additionalProperties: false,
        },
    },
    required: ["device_kind", "fields"],
    additionalProperties: false,
}

export const NAMEPLATE_SYSTEM_PROMPT = `あなたは消防用設備等の点検を手伝う係です。写真に写った機器の銘板（ラベル・刻印を含む）から、決まった欄の文字を読み取ります。読み取った値は、点検者が確かめてから消防署へ出す点検票に入ります。

決まり:
1. 銘板に書いてある文字を、書いてあるとおりに写す。漢字・かな・英数字・記号の種類を変えない。和暦は和暦のまま写す。
2. 1 字でも確かに読めない字がある欄は、value を null、legibility を "unreadable" にする。似た字で補ったり、よくある型式から推し量ったりしない。
3. 銘板にその欄が無いときは、value を null、legibility を "absent" にする。
4. 読めたが、反射・ぼけ・小さい字などで自信がないときは certainty を "low" にする。それ以外は "high"。
5. 銘板以外（外箱の印刷、貼り紙、手書きのメモなど）の文字は読まない。銘板が複数写っているときは、いちばん大きく写っている銘板だけを読む。
6. device_kind は写っている機器の種類を選ぶ。分からなければ "その他"。

欄の意味:
- maker: 製造者名（会社名。銘板の表記のまま）
- model: 型式（例: P-1A）
- approval_number: 型式番号（検定・認定の番号。例: 受第2〜1号）
- manufactured: 製造年または製造年月（銘板の書き方のまま）
- serial_number: 製造番号
- calibrated_at: 校正年月日（測定機器の校正ラベルにあるとき）`

export const NAMEPLATE_USER_TEXT = "この写真の銘板を読み取ってください。"

/**
 * 読み取りの依頼の中身（モデル・画像・考える量だけを差し替える）。
 * ★thinking は送らない。Opus 5.5 は常に考える（切ると 400）、Sonnet 5.5・Haiku 5.5 も既定で考える。
 *   考える量は effort で決める（既定 low ＝ 読み取りに深い思考は要らない。評価で確かめる）。
 * ★画像を先、指示の文を後に置く。
 */
export function buildNameplateRequest(args: {
    model: string
    imageBase64: string
    mediaType: "image/jpeg" | "image/png" | "image/webp"
    effort?: "low" | "medium" | "high"
    maxTokens?: number
}) {
    return {
        model: args.model,
        max_tokens: args.maxTokens ?? 4000,
        system: NAMEPLATE_SYSTEM_PROMPT,
        messages: [
            {
                role: "user" as const,
                content: [
                    {
                        type: "image" as const,
                        source: { type: "base64" as const, media_type: args.mediaType, data: args.imageBase64 },
                    },
                    { type: "text" as const, text: NAMEPLATE_USER_TEXT },
                ],
            },
        ],
        output_config: {
            effort: args.effort ?? "low",
            format: { type: "json_schema" as const, schema: NAMEPLATE_SCHEMA },
        },
    }
}

/**
 * 返ってきた文字列を読む。形が違えば null（★structured outputs でも、断られた・途中で切れたときは形が崩れうる）。
 */
export function parseNameplateReading(text: string): NameplateReading | null {
    let raw: unknown
    try {
        raw = JSON.parse(text)
    } catch {
        return null
    }
    if (!raw || typeof raw !== "object") return null
    const r = raw as { device_kind?: unknown; fields?: Record<string, unknown> }
    if (typeof r.device_kind !== "string" || !r.fields || typeof r.fields !== "object") return null
    for (const f of NAMEPLATE_FIELDS) {
        const v = r.fields[f.key] as Partial<NameplateFieldReading> | undefined
        if (!v || (v.value !== null && typeof v.value !== "string")) return null
        if (!NAMEPLATE_LEGIBILITY.includes(v.legibility as NameplateLegibility)) return null
        if (!NAMEPLATE_CERTAINTY.includes(v.certainty as NameplateCertainty)) return null
    }
    return raw as NameplateReading
}

/**
 * 比べるための形にそろえる。全角英数・記号の幅、ハイフンと波ダッシュの仲間、空白、大文字小文字の違いは無視する。
 * ★長音「ー」は会社名に使うので、ハイフンの仲間に入れない。
 */
export function normalizeNameplateText(s: string): string {
    return s
        .normalize("NFKC")
        .replace(/[‐-―−﹣]/g, "-")
        .replace(/[〜〰~]/g, "~")
        .replace(/\s+/g, "")
        .toUpperCase()
}

/** ゆるい比較: 会社の種類の書き方（株式会社・(株) など）の違いも無視する */
export function looseNameplateText(s: string): string {
    return normalizeNameplateText(s).replace(/株式会社|\(株\)|有限会社|\(有\)/g, "")
}

// ---- 読み取った値の形の確かめ（2026-10-30） ----------------------------------

const ERA_START: Record<string, number> = { 昭和: 1925, 平成: 1988, 令和: 2018, S: 1925, H: 1988, R: 2018 }

/**
 * 値の中の西暦の年（和暦は西暦に直す）。年らしい数が無ければ null。
 *   2015・2015.4・201504・20150412・H27・平成27年・令和元年 など
 */
export function nameplateYear(value: string): number | null {
    const s = normalizeNameplateText(value)
    const era = s.match(/(昭和|平成|令和|(?<![A-Z])[SHR])\.?(元|\d{1,2})(?!\d)/)
    if (era) return ERA_START[era[1]] + (era[2] === "元" ? 1 : Number(era[2]))
    const west = s.match(/(?<!\d)(19|20)\d{2}(?=(\d{2}){0,2}(?!\d))/)
    return west ? Number(west[0].slice(0, 4)) : null
}

/** 型式番号の頭の字（検定品）。★分かっているものだけ。ほかの機器は頭の字を見ない */
const APPROVAL_PREFIX: Partial<Record<NameplateDeviceKind, string>> = { 消火器: "消", 受信機: "受", 中継器: "中" }

export type NameplateCheckOptions = {
    /** 年の上限を決める「いま」（既定は実行した時） */
    now?: Date
    /** 製造者名の一覧（渡したときだけ、一覧に無い製造者名を拾う） */
    makers?: readonly string[]
}

/**
 * 読み取った値の「形」がありえるかを確かめる。引っかかった所を日本語で返す（無ければ空）。
 * ★正しいかどうかは分からない。ありえない形（未来の製造年・型式番号の頭の字の食い違いなど）だけを拾う。
 *   使い道: 安いモデルの答えが引っかかったら強いモデルで読み直す（段階方式）／本番の確かめる画面で黄色にする。
 *   ★引っかかっても値は消さない（読み直しと人の確かめに回すだけ）。
 */
export function checkNameplateReading(reading: NameplateReading, opts: NameplateCheckOptions = {}): string[] {
    const out: string[] = []
    const thisYear = (opts.now ?? new Date()).getFullYear()
    for (const f of NAMEPLATE_FIELDS) {
        const r = reading.fields[f.key]
        if (r.value !== null && r.value.trim() !== "" && r.legibility !== "clear") out.push(`${f.label}: 値があるのに「${r.legibility === "absent" ? "銘板に無い" : "読めない"}」と答えた`)
        if ((r.value === null || r.value.trim() === "") && r.legibility === "clear") out.push(`${f.label}: 「読めた」と答えたのに値が無い`)
    }
    const value = (key: NameplateFieldKey) => {
        const v = reading.fields[key].value
        return v === null || v.trim() === "" ? null : v
    }
    for (const [key, label, from] of [["manufactured", "製造年", 1950], ["calibrated_at", "校正年月日", 2000]] as const) {
        const v = value(key)
        if (v === null) continue
        const year = nameplateYear(v)
        if (year === null) out.push(`${label}: 年の形が無い（${v}）`)
        else if (year < from || year > thisYear) out.push(`${label}: ありえない年（${v} → ${year} 年）`)
    }
    const approval = value("approval_number")
    if (approval !== null) {
        const s = normalizeNameplateText(approval)
        if (s.includes("第")) {
            if (!/^[^\d第]{1,4}第[\dA-Z~\-・,]+号$/.test(s)) out.push(`型式番号: 「〇第…号」の形でない（${approval}）`)
            const head = APPROVAL_PREFIX[reading.device_kind]
            if (head && !s.startsWith(head)) out.push(`型式番号: ${reading.device_kind}なのに頭の字が「${head}」でない（${approval}）`)
        }
    }
    const maker = value("maker")
    if (maker !== null && opts.makers && opts.makers.length > 0) {
        const known = new Set(opts.makers.map(looseNameplateText))
        if (!known.has(looseNameplateText(maker))) out.push(`製造者名: 一覧に無い（${maker}）`)
    }
    return out
}

/**
 * 1 つの欄の正誤（expected = 人が書いた正解。null = 銘板に無い・人が見ても読めない）。
 *   correct     … 一致（幅・空白などの違いだけ）
 *   variant     … 会社の種類の書き方だけ違う（表記ゆれ）
 *   wrong       … 違う値（★読み間違い）
 *   missed      … 正解はあるのに空で返した（★安全側。手で入れればよい）
 *   fabricated  … 正解が空なのに値を返した（★読めないのに作った。いちばん危ない）
 *   both_empty  … どちらも空
 */
export type NameplateVerdict = "correct" | "variant" | "wrong" | "missed" | "fabricated" | "both_empty"

export function judgeNameplateField(expected: string | null, got: string | null): NameplateVerdict {
    const e = expected === null || expected.trim() === "" ? null : expected
    const g = got === null || got.trim() === "" ? null : got
    if (e === null && g === null) return "both_empty"
    if (e === null) return "fabricated"
    if (g === null) return "missed"
    if (normalizeNameplateText(e) === normalizeNameplateText(g)) return "correct"
    if (looseNameplateText(e) === looseNameplateText(g)) return "variant"
    return "wrong"
}
