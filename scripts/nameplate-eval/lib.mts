// 銘板の読み取りの評価: 実行（run.mts）から切り離した、計算だけの部品（2026-10-23）。
// ★API も画像も触らない。scripts/check-nameplate-eval.mjs がここを自己診断する。
import {
    NAMEPLATE_DEVICE_KINDS,
    NAMEPLATE_FIELDS,
    judgeNameplateField,
    type NameplateFieldKey,
    type NameplateReading,
    type NameplateVerdict,
} from "../../src/lib/nameplate-reading.ts"

/** 比べるモデルと単価（米ドル／100 万トークン） */
export const MODELS = {
    opus: { id: "claude-opus-5-5", label: "Opus 5.5", usdIn: 4, usdOut: 20 },
    sonnet: { id: "claude-sonnet-5-5", label: "Sonnet 5.5", usdIn: 2, usdOut: 10 },
    // ★Haiku 5.5 は 1 回の入力が 10 万トークンを超えると 0.50／2.50。銘板 1 枚では超えない
    haiku: { id: "claude-haiku-5-5", label: "Haiku 5.5", usdIn: 0.1, usdOut: 0.5 },
} as const
export type ModelAlias = keyof typeof MODELS
export const MODEL_ALIASES = Object.keys(MODELS) as ModelAlias[]
export const PRICE_SOURCE = "https://platform.claude.com/docs/en/about-claude/pricing（2026-10-23 に確認）"

export function costYen(alias: ModelAlias, inputTokens: number, outputTokens: number, yenPerUsd: number): number {
    const m = MODELS[alias]
    return ((inputTokens * m.usdIn + outputTokens * m.usdOut) / 1_000_000) * yenPerUsd
}

/** 送る前の見込み: 画像は「縦 × 横 ÷ 750」トークン（設計書 3.）＋指示と返す形 約 1,500。出力は約 1,000 */
export function estimateTokens(width: number, height: number): { input: number; output: number } {
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
    reading: NameplateReading | null
    stopReason: string | null
    error: string | null
    inputTokens: number
    outputTokens: number
    ms: number
}

const VERDICTS: NameplateVerdict[] = ["correct", "variant", "wrong", "missed", "fabricated", "both_empty"]

export type ModelSummary = {
    model: ModelAlias
    calls: number
    failed: number
    byField: Record<NameplateFieldKey, Record<NameplateVerdict, number> & { expected: number }>
    deviceKindCorrect: number
    deviceKindTotal: number
    /** 正答率 = (正解 + 表記ゆれ) ÷ 正解のある欄 */
    accuracy: number
    fabricated: number
    wrong: number
    /** ★自信が高い（certainty = high）と言ったのに、誤り・作った欄（黄色にならず素通りする危ない欄） */
    confidentMistakes: number
    avgInputTokens: number
    avgOutputTokens: number
    yenPerImage: number
    yenTotal: number
    avgSeconds: number
    /** 合格の目安（設計書 6.4）: 製造者名・型式番号で「作った」0 件、かつ 正答率 9 割以上 */
    passes: boolean
}

function emptyCounts() {
    return Object.fromEntries([...VERDICTS.map((v) => [v, 0]), ["expected", 0]]) as Record<NameplateVerdict, number> & { expected: number }
}

export function summarize(results: CallResult[], answers: Answer[], yenPerUsd: number): ModelSummary[] {
    const byFile = new Map(answers.map((a) => [a.file, a]))
    const models = MODEL_ALIASES.filter((m) => results.some((r) => r.model === m))
    return models.map((model) => {
        const rs = results.filter((r) => r.model === model && byFile.has(r.file))
        const byField = Object.fromEntries(NAMEPLATE_FIELDS.map((f) => [f.key, emptyCounts()])) as ModelSummary["byField"]
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
        const ok = rs.filter((r) => !r.error)
        const avg = (pick: (r: CallResult) => number) => (ok.length ? ok.reduce((n, r) => n + pick(r), 0) / ok.length : 0)
        const yenTotal = rs.reduce((n, r) => n + costYen(model, r.inputTokens, r.outputTokens, yenPerUsd), 0)
        const keyFabricated = byField.maker.fabricated + byField.approval_number.fabricated
        return {
            model,
            calls: rs.length,
            failed: rs.filter((r) => r.error || !r.reading).length,
            byField,
            deviceKindCorrect,
            deviceKindTotal,
            accuracy,
            fabricated: sum("fabricated"),
            wrong: sum("wrong"),
            confidentMistakes,
            avgInputTokens: avg((r) => r.inputTokens),
            avgOutputTokens: avg((r) => r.outputTokens),
            yenPerImage: rs.length ? yenTotal / rs.length : 0,
            yenTotal,
            avgSeconds: avg((r) => r.ms) / 1000,
            passes: keyFabricated === 0 && accuracy >= 0.9 && expected > 0,
        }
    })
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`
const yen = (n: number) => (n < 1 ? `${n.toFixed(2)}円` : `${n.toFixed(1)}円`)

export function renderSummaryMarkdown(summaries: ModelSummary[], meta: { when: string; images: number; effort: string; maxSide: number; yenPerUsd: number }): string {
    const lines: string[] = []
    lines.push(`# 銘板の読み取り 評価の結果（${meta.when}）`, "")
    lines.push(`写真 ${meta.images} 枚・考える量（effort）${meta.effort}・写真の長い辺 ${meta.maxSide}px・1 ドル ${meta.yenPerUsd} 円`, "")
    lines.push("## まとめ", "")
    lines.push("| モデル | 合格の目安 | 正答率 | 作った（読めないのに値） | 誤り | 自信ありの誤り | 機器の種類 | 1 枚の費用 | 合計 | 1 枚の時間 | 失敗 |")
    lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    for (const s of summaries) {
        lines.push(`| ${MODELS[s.model].label} | ${s.passes ? "満たす" : "★満たさない"} | ${pct(s.accuracy)} | ${s.fabricated} | ${s.wrong} | ${s.confidentMistakes} | ${s.deviceKindCorrect}/${s.deviceKindTotal} | ${yen(s.yenPerImage)} | ${yen(s.yenTotal)} | ${s.avgSeconds.toFixed(1)}秒 | ${s.failed} |`)
    }
    lines.push("", "- 合格の目安（設計書 6.4）: 製造者名・型式番号で「作った」が 0 件、かつ 正答率 9 割以上")
    lines.push("- 正答率 = (正解 + 表記ゆれ) ÷ 正解のある欄。空で返した欄（手で入れればよい）は正解に数えない")
    lines.push("- 自信ありの誤り = 自信が高いと答えたのに誤り・作った欄（画面で黄色にならず、素通りしやすい）")
    lines.push(`- 単価: ${PRICE_SOURCE}`, "")
    lines.push("## 欄ごと", "")
    for (const s of summaries) {
        lines.push(`### ${MODELS[s.model].label}`, "")
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
export function diffRows(results: CallResult[], answers: Answer[]): string[][] {
    const models = MODEL_ALIASES.filter((m) => results.some((r) => r.model === m))
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
    }
    return rows
}
