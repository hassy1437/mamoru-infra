// 銘板の読み取りの評価: 実行（run.mts）から切り離した、計算だけの部品（2026-10-23）。
// ★API も画像も触らない。scripts/check-nameplate-eval.mjs がここを自己診断する。
// ★2026-10-30: Anthropic に加えて Google（Gemini）・OpenAI（GPT）も、同じ写真・同じ指示・同じ採点で比べる。
//   段階方式（安いモデル → 引っかかった写真だけ強いモデル）の集計も足した。
import {
    NAMEPLATE_DEVICE_KINDS,
    NAMEPLATE_FIELDS,
    checkNameplateReading,
    judgeNameplateField,
    type NameplateCheckOptions,
    type NameplateFieldKey,
    type NameplateReading,
    type NameplateVerdict,
} from "../../src/lib/nameplate-reading.ts"

/** 会社。★キーは環境変数から読む（コードやファイルに書かない）。キーの無い会社のモデルは飛ばす */
export type Provider = "anthropic" | "openai" | "google"
export const PROVIDERS: Record<Provider, { label: string; keyEnv: readonly string[]; priceSource: string }> = {
    anthropic: {
        label: "Anthropic", keyEnv: ["ANTHROPIC_API_KEY"],
        priceSource: "https://platform.claude.com/docs/en/about-claude/pricing（2026-10-23 に確認）",
    },
    // ★2026-10-30: 公式の料金の頁をこの環境から開けず、検索の要約（第三者のまとめを含む）で入れた。使う前に公式で確かめる
    openai: {
        label: "OpenAI", keyEnv: ["OPENAI_API_KEY"],
        priceSource: "https://openai.com/api/pricing/（★未確認。GPT-5.4 mini・nano の値は OpenAI の発表の要約から）",
    },
    google: {
        label: "Google", keyEnv: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
        priceSource: "https://ai.google.dev/gemini-api/docs/pricing（★未確認。第三者のまとめから）",
    },
}

export type ModelInfo = {
    provider: Provider
    /** API に渡すモデル名。★--id で差し替えられる（新しい版が出たとき） */
    id: string
    label: string
    /** 米ドル／100 万トークン。★--price で差し替えられる */
    usdIn: number
    usdOut: number
    /** 単価を公式の頁で確かめたか（false なら表に ★ を付ける） */
    priceChecked: boolean
}

/** 比べるモデルと単価 */
const MODEL_TABLE = {
    opus: { provider: "anthropic", id: "claude-opus-5-5", label: "Opus 5.5", usdIn: 4, usdOut: 20, priceChecked: true },
    sonnet: { provider: "anthropic", id: "claude-sonnet-5-5", label: "Sonnet 5.5", usdIn: 2, usdOut: 10, priceChecked: true },
    // ★Haiku 5.5 は 1 回の入力が 10 万トークンを超えると 0.50／2.50。銘板 1 枚では超えない
    haiku: { provider: "anthropic", id: "claude-haiku-5-5", label: "Haiku 5.5", usdIn: 0.1, usdOut: 0.5, priceChecked: true },
    // ★ここから下のモデル名と単価は未確認（2026-10-30・上の PROVIDERS の注）。`models` コマンドでモデル名があるか確かめられる
    "gemini-flash-lite": { provider: "google", id: "gemini-3.1-flash-lite", label: "Gemini Flash-Lite", usdIn: 0.25, usdOut: 1.5, priceChecked: false },
    // ★新しい Flash の単価は「2026-12-31 までの値」と書くまとめがある（そのあと上がるかもしれない）
    "gemini-flash": { provider: "google", id: "gemini-3.6-flash", label: "Gemini Flash", usdIn: 0.75, usdOut: 3.75, priceChecked: false },
    "gpt-nano": { provider: "openai", id: "gpt-5.4-nano", label: "GPT nano", usdIn: 0.2, usdOut: 1.25, priceChecked: false },
    "gpt-mini": { provider: "openai", id: "gpt-5.4-mini", label: "GPT mini", usdIn: 0.75, usdOut: 4.5, priceChecked: false },
} satisfies Record<string, ModelInfo>
export type ModelAlias = keyof typeof MODEL_TABLE
export const MODELS: Record<ModelAlias, ModelInfo> = MODEL_TABLE
export const MODEL_ALIASES = Object.keys(MODELS) as ModelAlias[]
/** 既定で比べるもの（Opus 5.5 は --models で足す） */
export const DEFAULT_MODELS: ModelAlias[] = ["haiku", "sonnet", "gemini-flash-lite", "gemini-flash", "gpt-nano", "gpt-mini"]

export function isModelAlias(s: string): s is ModelAlias {
    return (MODEL_ALIASES as string[]).includes(s)
}

/**
 * --id gemini-flash=gemini-3.8-flash ／ --price gemini-flash=0.75/3.75 を表に当てる。直せないものは problems に。
 * ★モデル名だけ替えて単価を替えないと、単価は「未確認」に戻す（前のモデルの単価のままかもしれない）。
 */
export function applyModelOverrides(ids: string[], prices: string[]): string[] {
    const problems: string[] = []
    const split = (spec: string, what: string): [ModelAlias, string] | null => {
        const i = spec.indexOf("=")
        const alias = i > 0 ? spec.slice(0, i).trim() : ""
        const value = i > 0 ? spec.slice(i + 1).trim() : ""
        if (!isModelAlias(alias) || value === "") {
            problems.push(`${what} の書き方: 「モデル=値」（モデルは ${MODEL_ALIASES.join("・")}）: ${spec}`)
            return null
        }
        return [alias, value]
    }
    const priced = new Set<ModelAlias>()
    for (const spec of prices) {
        const kv = split(spec, "--price")
        if (!kv) continue
        const m = kv[1].match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/)
        if (!m) { problems.push(`--price は「入力/出力」の米ドル（100 万トークンあたり）: ${spec}`); continue }
        MODELS[kv[0]].usdIn = Number(m[1])
        MODELS[kv[0]].usdOut = Number(m[2])
        MODELS[kv[0]].priceChecked = true
        priced.add(kv[0])
    }
    for (const spec of ids) {
        const kv = split(spec, "--id")
        if (!kv) continue
        if (!/^[A-Za-z0-9._:-]+$/.test(kv[1])) { problems.push(`--id のモデル名に使えない字がある: ${spec}`); continue }
        if (MODELS[kv[0]].id !== kv[1] && !priced.has(kv[0])) MODELS[kv[0]].priceChecked = false
        MODELS[kv[0]].id = kv[1]
    }
    return problems
}

export function costYen(alias: ModelAlias, inputTokens: number, outputTokens: number, yenPerUsd: number): number {
    const m = MODELS[alias]
    return ((inputTokens * m.usdIn + outputTokens * m.usdOut) / 1_000_000) * yenPerUsd
}

/**
 * 送る前の見込み（★実際の費用は、返ってきたトークン数で出す）。指示と返す形 約 1,500 は共通。
 *   Anthropic: 写真は「縦 × 横 ÷ 750」（設計書 3.）。出力 約 1,000
 *   OpenAI: 小さいモデルは写真を 32px の升で数え、モデルごとの倍率を掛ける（升は 1,536 まで）。倍率を 2.5 と多めに置く
 *   Google: 768px の升 1 つ 258、または 1 枚 1,120 前後（モデルと設定で違う）。多いほうを取る
 *   ★OpenAI・Google は考える分が出力に入るので、出力を 1,500 と多めに置く
 */
export function estimateTokens(provider: Provider, width: number, height: number): { input: number; output: number } {
    if (provider === "openai") {
        const patches = Math.min(Math.ceil(width / 32) * Math.ceil(height / 32), 1536)
        return { input: Math.ceil(patches * 2.5) + 1500, output: 1500 }
    }
    if (provider === "google") {
        const tiles = Math.ceil(width / 768) * Math.ceil(height / 768)
        return { input: Math.max(tiles * 258, 1120) + 1500, output: 1500 }
    }
    return { input: Math.round((width * height) / 750) + 1500, output: 1000 }
}

// ---- CSV（正解の表）----------------------------------------------

/**
 * ★Excel で保存した CSV は Shift_JIS のことがある（「CSV (コンマ区切り)」）。
 *   UTF-8 として読めなければ Shift_JIS として読む。先頭の BOM は外す。
 */
export function decodeCsvBytes(bytes: Uint8Array): string {
    let text: string
    try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    } catch {
        text = new TextDecoder("shift_jis").decode(bytes)
    }
    return text.replace(/^﻿/, "")
}

/** 引用符・引用符の中の改行とカンマ・"" の書き方に対応した CSV の読み取り */
export function parseCsv(text: string): string[][] {
    const rows: string[][] = []
    let row: string[] = []
    let cell = ""
    let quoted = false
    for (let i = 0; i < text.length; i++) {
        const c = text[i]
        if (quoted) {
            if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
            else if (c === '"') quoted = false
            else cell += c
        } else if (c === '"') quoted = true
        else if (c === ",") { row.push(cell); cell = "" }
        else if (c === "\n" || c === "\r") {
            if (c === "\r" && text[i + 1] === "\n") i++
            row.push(cell); rows.push(row); row = []; cell = ""
        } else cell += c
    }
    if (cell !== "" || row.length > 0) { row.push(cell); rows.push(row) }
    return rows.filter((r) => r.some((v) => v.trim() !== ""))
}

/** Excel で開ける CSV（UTF-8 の BOM 付き・改行は CRLF・全部の欄を引用符で囲む） */
export function toCsv(rows: string[][]): string {
    return "﻿" + rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\r\n") + "\r\n"
}

/** 正解の表の見出し（人が読む名前）。★キー名（maker など）でも読める */
export const ANSWER_HEADER = ["ファイル", "機器の種類", ...NAMEPLATE_FIELDS.map((f) => f.label)]
const HEADER_TO_KEY: Record<string, string> = {
    ファイル: "file", file: "file", 機器の種類: "device_kind", device_kind: "device_kind",
    ...Object.fromEntries(NAMEPLATE_FIELDS.flatMap((f) => [[f.label, f.key], [f.key, f.key]])),
}

export type Answer = {
    file: string
    deviceKind: string | null
    fields: Record<NameplateFieldKey, string | null>
}

/**
 * 正解の表を読む。★空の欄は null（＝銘板に無い・人が見ても読めない）。
 *   ★全部の欄が空の行は「書き忘れ」とみなして問題に出す（全部 null だと、読めた値がすべて「作った」に数えられる）。
 */
export function loadAnswers(text: string): { answers: Answer[]; problems: string[] } {
    const rows = parseCsv(text)
    const problems: string[] = []
    if (rows.length === 0) return { answers: [], problems: ["正解の表が空です"] }
    const keys = rows[0].map((h) => HEADER_TO_KEY[h.trim()] ?? null)
    for (const need of ["file", "device_kind", ...NAMEPLATE_FIELDS.map((f) => f.key)]) {
        if (!keys.includes(need)) problems.push(`見出しに「${need}」の列がありません`)
    }
    if (problems.length) return { answers: [], problems }
    const answers: Answer[] = []
    const seen = new Set<string>()
    rows.slice(1).forEach((r, i) => {
        const line = i + 2
        const get = (k: string) => {
            const v = (r[keys.indexOf(k)] ?? "").trim()
            return v === "" ? null : v
        }
        const file = get("file")
        if (!file) { problems.push(`${line} 行目: ファイル名がありません`); return }
        if (seen.has(file)) { problems.push(`${line} 行目: ${file} が 2 回出てきます`); return }
        seen.add(file)
        const deviceKind = get("device_kind")
        if (deviceKind && !(NAMEPLATE_DEVICE_KINDS as readonly string[]).includes(deviceKind)) {
            problems.push(`${line} 行目（${file}）: 機器の種類「${deviceKind}」は選べる値にありません（${NAMEPLATE_DEVICE_KINDS.join("・")}）`)
        }
        const fields = Object.fromEntries(NAMEPLATE_FIELDS.map((f) => [f.key, get(f.key)])) as Answer["fields"]
        if (!deviceKind && Object.values(fields).every((v) => v === null)) {
            problems.push(`${line} 行目（${file}）: 正解が 1 つも書いてありません（書き忘れなら書いてください）`)
            return
        }
        answers.push({ file, deviceKind, fields })
    })
    return { answers, problems }
}

// ---- 結果の集計 ---------------------------------------------------

export type CallResult = {
    file: string
    model: ModelAlias
    /** 実際に呼んだモデル名（--id で替えたときに分かるように） */
    modelId?: string
    reading: NameplateReading | null
    stopReason: string | null
    error: string | null
    inputTokens: number
    outputTokens: number
    ms: number
}

const VERDICTS: NameplateVerdict[] = ["correct", "variant", "wrong", "missed", "fabricated", "both_empty"]

type FieldCounts = Record<NameplateVerdict, number> & { expected: number }

/** 採点の結果（1 つのモデル、または段階方式の組） */
export type Score = {
    calls: number
    failed: number
    byField: Record<NameplateFieldKey, FieldCounts>
    deviceKindCorrect: number
    deviceKindTotal: number
    /** 正答率 = (正解 + 表記ゆれ) ÷ 正解のある欄 */
    accuracy: number
    fabricated: number
    wrong: number
    /** ★自信が高い（certainty = high）と言ったのに、誤り・作った欄（黄色にならず素通りする危ない欄） */
    confidentMistakes: number
    /** 合格の目安（設計書 6.4）: 製造者名・型式番号で「作った」0 件、かつ 正答率 9 割以上 */
    passes: boolean
}

export type ModelSummary = Score & {
    model: ModelAlias
    avgInputTokens: number
    avgOutputTokens: number
    yenPerImage: number
    yenTotal: number
    avgSeconds: number
}

function emptyCounts(): FieldCounts {
    return Object.fromEntries([...VERDICTS.map((v) => [v, 0]), ["expected", 0]]) as FieldCounts
}

/** 写真ごとの読み取りを採点する（★正解の表に無い写真は数えない） */
function score(rows: { file: string; reading: NameplateReading | null; error: string | null }[], answers: Answer[]): Score {
    const byFile = new Map(answers.map((a) => [a.file, a]))
    const rs = rows.filter((r) => byFile.has(r.file))
    const byField = Object.fromEntries(NAMEPLATE_FIELDS.map((f) => [f.key, emptyCounts()])) as Score["byField"]
    let deviceKindCorrect = 0
    let deviceKindTotal = 0
    let confidentMistakes = 0
    for (const r of rs) {
        const a = byFile.get(r.file)!
        if (a.deviceKind) {
            deviceKindTotal++
            if (r.reading?.device_kind === a.deviceKind) deviceKindCorrect++
        }
        for (const f of NAMEPLATE_FIELDS) {
            const got = r.reading?.fields[f.key] ?? null
            const v = judgeNameplateField(a.fields[f.key], got?.value ?? null)
            byField[f.key][v]++
            if (a.fields[f.key] !== null) byField[f.key].expected++
            if ((v === "wrong" || v === "fabricated") && got?.certainty === "high") confidentMistakes++
        }
    }
    const sum = (v: NameplateVerdict | "expected") => NAMEPLATE_FIELDS.reduce((n, f) => n + byField[f.key][v], 0)
    const expected = sum("expected")
    const accuracy = expected === 0 ? 0 : (sum("correct") + sum("variant")) / expected
    const keyFabricated = byField.maker.fabricated + byField.approval_number.fabricated
    return {
        calls: rs.length,
        failed: rs.filter((r) => r.error || !r.reading).length,
        byField,
        deviceKindCorrect,
        deviceKindTotal,
        accuracy,
        fabricated: sum("fabricated"),
        wrong: sum("wrong"),
        confidentMistakes,
        passes: keyFabricated === 0 && accuracy >= 0.9 && expected > 0,
    }
}

/** 結果に出てくるモデル（表の並び順） */
function modelsIn(results: CallResult[]): ModelAlias[] {
    return MODEL_ALIASES.filter((m) => results.some((r) => r.model === m))
}

export function summarize(results: CallResult[], answers: Answer[], yenPerUsd: number): ModelSummary[] {
    const files = new Set(answers.map((a) => a.file))
    return modelsIn(results).map((model) => {
        const rs = results.filter((r) => r.model === model && files.has(r.file))
        const ok = rs.filter((r) => !r.error)
        const avg = (pick: (r: CallResult) => number) => (ok.length ? ok.reduce((n, r) => n + pick(r), 0) / ok.length : 0)
        const yenTotal = rs.reduce((n, r) => n + costYen(model, r.inputTokens, r.outputTokens, yenPerUsd), 0)
        return {
            model,
            ...score(rs, answers),
            avgInputTokens: avg((r) => r.inputTokens),
            avgOutputTokens: avg((r) => r.outputTokens),
            yenPerImage: rs.length ? yenTotal / rs.length : 0,
            yenTotal,
            avgSeconds: avg((r) => r.ms) / 1000,
        }
    })
}

// ---- 段階方式（安いモデル → 引っかかったら強いモデルで読み直す）------------------

/**
 * 読み直す条件。
 *   check        … 失敗した・答えの形が違う・形の確かめ（checkNameplateReading）で引っかかった
 *   check_or_low … それに加えて、値のある欄に自信が低い（certainty = low）ものがある
 */
export type CascadeRule = "check" | "check_or_low"
export const CASCADE_RULES: CascadeRule[] = ["check", "check_or_low"]
const RULE_LABEL: Record<CascadeRule, string> = { check: "形の確かめ", check_or_low: "形の確かめ＋自信が低い欄" }

export function needsSecondLook(r: CallResult, rule: CascadeRule, opts: NameplateCheckOptions = {}): boolean {
    if (r.error || !r.reading) return true
    if (checkNameplateReading(r.reading, opts).length > 0) return true
    if (rule === "check_or_low") {
        return NAMEPLATE_FIELDS.some((f) => {
            const v = r.reading!.fields[f.key]
            return v.value !== null && v.value.trim() !== "" && v.certainty === "low"
        })
    }
    return false
}

export type CascadeSummary = Score & {
    cheap: ModelAlias
    strong: ModelAlias
    rule: CascadeRule
    /** 強いモデルで読み直した写真の数 */
    escalated: number
    yenPerImage: number
    yenTotal: number
    /** ★読み直した写真は 2 回分の時間（順に呼ぶため） */
    avgSeconds: number
}

/**
 * 段階方式を、両方のモデルで流した結果から組み立てる（★API は呼ばない）。
 * 安いモデルの答えが条件に当たった写真だけ、強いモデルの答えに替え、費用と時間は 2 回分を足す。
 */
export function summarizeCascade(
    results: CallResult[], answers: Answer[], cheap: ModelAlias, strong: ModelAlias, rule: CascadeRule,
    yenPerUsd: number, opts: NameplateCheckOptions = {},
): CascadeSummary {
    const merged: { file: string; reading: NameplateReading | null; error: string | null; yen: number; ms: number }[] = []
    let escalated = 0
    for (const a of answers) {
        const c = results.find((r) => r.file === a.file && r.model === cheap)
        if (!c) continue
        const s = results.find((r) => r.file === a.file && r.model === strong)
        const yen = costYen(cheap, c.inputTokens, c.outputTokens, yenPerUsd)
        if (s && needsSecondLook(c, rule, opts)) {
            escalated++
            merged.push({ file: a.file, reading: s.reading, error: s.error, yen: yen + costYen(strong, s.inputTokens, s.outputTokens, yenPerUsd), ms: c.ms + s.ms })
        } else {
            merged.push({ file: a.file, reading: c.reading, error: c.error, yen, ms: c.ms })
        }
    }
    const yenTotal = merged.reduce((n, r) => n + r.yen, 0)
    return {
        cheap, strong, rule, escalated,
        ...score(merged, answers),
        yenPerImage: merged.length ? yenTotal / merged.length : 0,
        yenTotal,
        avgSeconds: merged.length ? merged.reduce((n, r) => n + r.ms, 0) / merged.length / 1000 : 0,
    }
}

/** --cascade haiku>sonnet,gpt-nano>gpt-mini */
export function parseCascadePairs(spec: string): { pairs: [ModelAlias, ModelAlias][]; problems: string[] } {
    const pairs: [ModelAlias, ModelAlias][] = []
    const problems: string[] = []
    for (const part of spec.split(",").map((s) => s.trim()).filter(Boolean)) {
        const [a, b, extra] = part.split(">").map((s) => s.trim())
        if (!a || !b || extra !== undefined || !isModelAlias(a) || !isModelAlias(b) || a === b) {
            problems.push(`--cascade の書き方: 「安い>強い」をカンマで区切る（モデルは ${MODEL_ALIASES.join("・")}）: ${part}`)
        } else pairs.push([a, b])
    }
    return { pairs, problems }
}

/**
 * 組を指定しないときの組: 各モデルから、それより 1 枚の費用が高いモデルのうち正答率がいちばん高いもの（同じなら安いほう）へ。
 * ★正答率は同じ写真で測った結果なので、組の選び方が結果に寄る（後で別の写真で確かめる）。
 */
export function defaultCascadePairs(summaries: ModelSummary[]): [ModelAlias, ModelAlias][] {
    const pairs: [ModelAlias, ModelAlias][] = []
    for (const a of summaries) {
        const better = summaries
            .filter((b) => b.model !== a.model && b.yenPerImage > a.yenPerImage && b.accuracy > a.accuracy)
            .sort((x, y) => y.accuracy - x.accuracy || x.yenPerImage - y.yenPerImage)[0]
        if (better) pairs.push([a.model, better.model])
    }
    return pairs
}

/** 形の確かめが、誤りのある写真をどれだけ拾えたか（モデルごと） */
export type CheckStat = {
    model: ModelAlias
    images: number
    /** 失敗・形の確かめで引っかかった写真 */
    flagged: number
    /** 誤り・作った欄がある写真 */
    mistakeImages: number
    /** そのうち引っかかった写真（＝段階方式で読み直しに回る） */
    mistakeImagesFlagged: number
    /** 値のある欄に自信が低いものがある写真 */
    lowCertainty: number
}

export function checkStats(results: CallResult[], answers: Answer[], opts: NameplateCheckOptions = {}): CheckStat[] {
    const byFile = new Map(answers.map((a) => [a.file, a]))
    return modelsIn(results).map((model) => {
        const rs = results.filter((r) => r.model === model && byFile.has(r.file))
        let flagged = 0, mistakeImages = 0, mistakeImagesFlagged = 0, lowCertainty = 0
        for (const r of rs) {
            const a = byFile.get(r.file)!
            const f = needsSecondLook(r, "check", opts)
            if (f) flagged++
            if (needsSecondLook(r, "check_or_low", opts) && !f) lowCertainty++
            const mistake = NAMEPLATE_FIELDS.some((fl) => {
                const v = judgeNameplateField(a.fields[fl.key], r.reading?.fields[fl.key]?.value ?? null)
                return v === "wrong" || v === "fabricated"
            })
            if (mistake) {
                mistakeImages++
                if (f) mistakeImagesFlagged++
            }
        }
        return { model, images: rs.length, flagged, mistakeImages, mistakeImagesFlagged, lowCertainty }
    })
}

// ---- 表にする -------------------------------------------------------

const pct = (n: number) => `${(n * 100).toFixed(1)}%`
const yen = (n: number) => (n < 1 ? `${n.toFixed(2)}円` : `${n.toFixed(1)}円`)
const priceMark = (m: ModelAlias) => (MODELS[m].priceChecked ? "" : "★")

export function renderSummaryMarkdown(
    summaries: ModelSummary[],
    meta: { when: string; images: number; effort: string; maxSide: number; yenPerUsd: number; makers?: number },
    cascades: CascadeSummary[] = [],
    checks: CheckStat[] = [],
): string {
    const lines: string[] = []
    lines.push(`# 銘板の読み取り 評価の結果（${meta.when}）`, "")
    lines.push(`写真 ${meta.images} 枚・考える量（effort）${meta.effort}・写真の長い辺 ${meta.maxSide}px・1 ドル ${meta.yenPerUsd} 円`, "")
    lines.push("## まとめ", "")
    lines.push("| モデル | 会社 | モデル名 | 合格の目安 | 正答率 | 作った（読めないのに値） | 誤り | 自信ありの誤り | 機器の種類 | 1 枚の費用 | 合計 | 1 枚の時間 | 失敗 |")
    lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    for (const s of summaries) {
        const m = MODELS[s.model]
        lines.push(`| ${m.label} | ${PROVIDERS[m.provider].label} | ${m.id} | ${s.passes ? "満たす" : "★満たさない"} | ${pct(s.accuracy)} | ${s.fabricated} | ${s.wrong} | ${s.confidentMistakes} | ${s.deviceKindCorrect}/${s.deviceKindTotal} | ${priceMark(s.model)}${yen(s.yenPerImage)} | ${priceMark(s.model)}${yen(s.yenTotal)} | ${s.avgSeconds.toFixed(1)}秒 | ${s.failed} |`)
    }
    lines.push("", "- 合格の目安（設計書 6.4）: 製造者名・型式番号で「作った」が 0 件、かつ 正答率 9 割以上")
    lines.push("- 正答率 = (正解 + 表記ゆれ) ÷ 正解のある欄。空で返した欄（手で入れればよい）は正解に数えない")
    lines.push("- 自信ありの誤り = 自信が高いと答えたのに誤り・作った欄（画面で黄色にならず、素通りしやすい）")
    lines.push("- 費用は返ってきたトークン数 × 単価。★の付いた費用は単価が未確認（公式の頁で確かめる）")
    const providers = [...new Set(summaries.map((s) => MODELS[s.model].provider))]
    for (const p of providers) lines.push(`- ${PROVIDERS[p].label} の単価: ${PROVIDERS[p].priceSource}`)
    lines.push("")
    if (cascades.length) {
        lines.push("## 段階方式（安いモデルで読み、引っかかった写真だけ強いモデルで読み直す）", "")
        lines.push("| 安い → 強い | 読み直す条件 | 読み直した写真 | 合格の目安 | 正答率 | 作った | 誤り | 自信ありの誤り | 1 枚の費用 | 1 枚の時間 |")
        lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
        for (const c of cascades) {
            const mark = priceMark(c.cheap) || priceMark(c.strong)
            lines.push(`| ${MODELS[c.cheap].label} → ${MODELS[c.strong].label} | ${RULE_LABEL[c.rule]} | ${c.escalated}/${c.calls} | ${c.passes ? "満たす" : "★満たさない"} | ${pct(c.accuracy)} | ${c.fabricated} | ${c.wrong} | ${c.confidentMistakes} | ${mark}${yen(c.yenPerImage)} | ${c.avgSeconds.toFixed(1)}秒 |`)
        }
        lines.push("", "- 両方のモデルで流した結果から組み立てた（追加の呼び出しはしていない）。費用と時間は、読み直した写真で 2 回分")
        lines.push("- 形の確かめ: 失敗・答えの形が違う・製造年や校正年月日がありえない年・型式番号が「〇第…号」の形でない・消火器／受信機／中継器／泡消火薬剤で型式番号の頭の字が違う・「読めた」のに値が無い（またはその逆）"
            + (meta.makers ? `・製造者名が一覧（${meta.makers} 件）に無い` : ""))
        lines.push("- ★組と条件は同じ写真で選んでいる。本番に使う前に、別の写真でもう一度確かめる", "")
    }
    if (checks.length) {
        lines.push("## 形の確かめで、誤りのある写真をどれだけ拾えるか", "")
        lines.push("| モデル | 写真 | 引っかかった | 誤り・作ったがある写真 | そのうち引っかかった | 形は通ったが自信が低い欄がある |")
        lines.push("| --- | --- | --- | --- | --- | --- |")
        for (const c of checks) {
            lines.push(`| ${MODELS[c.model].label} | ${c.images} | ${c.flagged} | ${c.mistakeImages} | ${c.mistakeImagesFlagged} | ${c.lowCertainty} |`)
        }
        lines.push("", "- 「そのうち引っかかった」が「誤り・作ったがある写真」に近いほど、段階方式で安いモデルを使いやすい", "")
    }
    lines.push("## 欄ごと", "")
    for (const s of summaries) {
        lines.push(`### ${MODELS[s.model].label}（${MODELS[s.model].id}）`, "")
        lines.push("| 欄 | 正解のある欄 | 正解 | 表記ゆれ | 誤り | 空で返した | 作った | どちらも空 |")
        lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |")
        for (const f of NAMEPLATE_FIELDS) {
            const c = s.byField[f.key]
            lines.push(`| ${f.label} | ${c.expected} | ${c.correct} | ${c.variant} | ${c.wrong} | ${c.missed} | ${c.fabricated} | ${c.both_empty} |`)
        }
        lines.push("")
    }
    lines.push("欄ごと・写真ごとの値は同じフォルダの diff.csv（Excel で開けます）。")
    return lines.join("\n") + "\n"
}

/** 写真 × 欄ごとに、正解と各モデルの値・判定を並べた表（人が目で確かめる用） */
export function diffRows(results: CallResult[], answers: Answer[], opts: NameplateCheckOptions = {}): string[][] {
    const models = modelsIn(results)
    const label: Record<NameplateVerdict, string> = {
        correct: "正解", variant: "表記ゆれ", wrong: "★誤り", missed: "空で返した", fabricated: "★作った", both_empty: "",
    }
    const head = ["ファイル", "欄", "正解", ...models.flatMap((m) => [MODELS[m].label, `${MODELS[m].label} 判定`])]
    const rows: string[][] = [head]
    for (const a of answers) {
        const of = (m: ModelAlias) => results.find((r) => r.file === a.file && r.model === m)
        rows.push([a.file, "機器の種類", a.deviceKind ?? "", ...models.flatMap((m) => {
            const r = of(m)
            const got = r?.reading?.device_kind ?? (r?.error ? `（失敗: ${r.error}）` : "")
            return [got, a.deviceKind ? (got === a.deviceKind ? "正解" : "★違う") : ""]
        })])
        for (const f of NAMEPLATE_FIELDS) {
            rows.push([a.file, f.label, a.fields[f.key] ?? "", ...models.flatMap((m) => {
                const got = of(m)?.reading?.fields[f.key]
                const v = judgeNameplateField(a.fields[f.key], got?.value ?? null)
                const mark = got?.certainty === "low" && got.value !== null ? "（自信低）" : ""
                return [`${got?.value ?? ""}${mark}`, label[v]]
            })])
        }
        rows.push([a.file, "形の確かめ", "", ...models.flatMap((m) => {
            const r = of(m)
            return [r?.reading ? checkNameplateReading(r.reading, opts).join(" ／ ") : "", ""]
        })])
    }
    return rows
}
