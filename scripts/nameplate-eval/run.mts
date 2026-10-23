// 銘板の読み取りの評価（設計書 6.・2026-10-23）。
//   docs/銘板・過去報告書の読み取り_設計と費用_20261020.md
//
// ■ 何をするか
//   銘板の写真と、人が書いた正解の表（CSV）を用意して、3 つのモデル（Opus 5.5・Sonnet 5.5・Haiku 5.5）に
//   同じ写真を読ませ、欄ごとの正答率・「読めないのに値を作った」件数・費用・時間を表にする。
//   ★指示と返す形は本番と同じもの（src/lib/nameplate-reading.ts）を使う。
//
// ■ 使い方（リポジトリの一番上で。写真と正解は tmp/ の下に置く＝git には入らない）
//   1. 写真を tmp/nameplate-eval/photos/ に入れる（jpg・png・webp。iPhone の HEIC は JPEG にして入れる）
//   2. npm run eval:nameplate -- init     … 正解の表 tmp/nameplate-eval/answers.csv の雛形を作る（Excel で開ける）
//   3. 正解を書く（読めない・銘板に無い欄は空のまま）
//   4. npm run eval:nameplate -- check    … 写真と正解の表を確かめ、呼び出しの回数と費用の見込みを出す（API は呼ばない）
//   5. npm run eval:nameplate -- count    … 送る前に数える API で、入力トークンを正確に数える（費用はかからない）
//   6. npm run eval:nameplate -- run --yes … 実行。結果は tmp/nameplate-eval/out/<日時>/ に
//        summary.md（まとめ）・diff.csv（写真 × 欄ごとの値）・results.jsonl（生の結果）
//
// ■ オプション
//   --models opus,sonnet,haiku  比べるモデル（既定は 3 つとも）
//   --effort low|medium|high    考える量（既定 low）
//   --max-side 1568             写真の長い辺を縮める大きさ（既定 1568。2576 まで細かく見られる）
//   --limit N                   先頭の N 枚だけ
//   --concurrency 3             同時に送る数
//   --yen 150                   1 ドルの円
//
// ■ ★API キーは環境変数 ANTHROPIC_API_KEY（コードやファイルに書かない）。run は --yes が無ければ見込みを出して止まる。
import fs from "node:fs"
import path from "node:path"
import Anthropic from "@anthropic-ai/sdk"
import { buildNameplateRequest, parseNameplateReading, NAMEPLATE_SYSTEM_PROMPT } from "../../src/lib/nameplate-reading.ts"
import {
    ANSWER_HEADER,
    MODELS,
    MODEL_ALIASES,
    PRICE_SOURCE,
    costYen,
    decodeCsvBytes,
    diffRows,
    estimateTokens,
    loadAnswers,
    renderSummaryMarkdown,
    summarize,
    toCsv,
    type Answer,
    type CallResult,
    type ModelAlias,
} from "./lib.mts"

const BASE = path.join("tmp", "nameplate-eval")
const PHOTOS = path.join(BASE, "photos")
const ANSWERS = path.join(BASE, "answers.csv")
const IMAGE_EXT = /\.(jpe?g|png|webp)$/i

function option(name: string, fallback: string): string {
    const i = process.argv.indexOf(`--${name}`)
    return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const has = (name: string) => process.argv.includes(`--${name}`)
function fail(message: string): never {
    console.error(`★${message}`)
    process.exit(1)
}

const command = process.argv[2] ?? ""
const models = option("models", MODEL_ALIASES.join(",")).split(",").map((s) => s.trim()) as ModelAlias[]
for (const m of models) if (!MODEL_ALIASES.includes(m)) fail(`知らないモデル: ${m}（${MODEL_ALIASES.join("・")} から選ぶ）`)
const effort = option("effort", "low") as "low" | "medium" | "high"
if (!["low", "medium", "high"].includes(effort)) fail(`--effort は low・medium・high のどれか: ${effort}`)
const maxSide = Number(option("max-side", "1568"))
if (!Number.isInteger(maxSide) || maxSide < 200 || maxSide > 2576) fail("--max-side は 200〜2576 の整数")
const limit = Number(option("limit", "0"))
const concurrency = Math.max(1, Number(option("concurrency", "3")))
const yenPerUsd = Number(option("yen", "150"))

function listPhotos(): string[] {
    if (!fs.existsSync(PHOTOS)) fail(`写真のフォルダ ${PHOTOS} がありません。作って写真を入れてください`)
    const all = fs.readdirSync(PHOTOS).filter((f) => IMAGE_EXT.test(f)).sort()
    const skipped = fs.readdirSync(PHOTOS).filter((f) => !IMAGE_EXT.test(f) && !f.startsWith("."))
    if (skipped.length) console.log(`  （読まないファイル: ${skipped.join("、")}。jpg・png・webp にしてください）`)
    return all
}

function readAnswers(): Answer[] {
    if (!fs.existsSync(ANSWERS)) fail(`正解の表 ${ANSWERS} がありません。先に init を実行してください`)
    const { answers, problems } = loadAnswers(decodeCsvBytes(fs.readFileSync(ANSWERS)))
    if (problems.length) {
        console.log("★正解の表に直すところがあります:")
        for (const p of problems) console.log(`   - ${p}`)
        process.exit(1)
    }
    return answers
}

/**
 * 写真を本番と同じ形にする: 向きを直し、長い辺を縮め、JPEG にする。
 * ★撮影場所などの付帯情報（EXIF）はここで落ちる（sharp は既定で付帯情報を書き出さない）。
 */
async function loadSharp() {
    try {
        return (await import("sharp")).default
    } catch {
        fail("写真を縮める部品（sharp）が読めません。npm install -D sharp を実行してください")
    }
}

const images = new Map<string, ReturnType<typeof resizeImage>>()
/** 同じ写真を何度も縮めない（モデルごと・見込みと実行で使い回す） */
function loadImage(file: string) {
    if (!images.has(file)) images.set(file, resizeImage(file))
    return images.get(file)!
}

async function resizeImage(file: string) {
    const sharp = await loadSharp()
    const { data, info } = await sharp(path.join(PHOTOS, file))
        .rotate()
        .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer({ resolveWithObject: true })
    return { base64: data.toString("base64"), width: info.width, height: info.height, bytes: data.length }
}

async function plan(answers: Answer[]) {
    const files = answers.map((a) => a.file).slice(0, limit > 0 ? limit : undefined)
    const missing = files.filter((f) => !fs.existsSync(path.join(PHOTOS, f)))
    if (missing.length) fail(`正解の表にあるのに写真がありません: ${missing.join("、")}`)
    let estIn = 0
    let estOut = 0
    for (const f of files) {
        const img = await loadImage(f)
        const t = estimateTokens(img.width, img.height)
        estIn += t.input
        estOut += t.output
    }
    console.log(`写真 ${files.length} 枚 × モデル ${models.length} つ = 呼び出し ${files.length * models.length} 回（考える量 ${effort}・長い辺 ${maxSide}px）`)
    console.log("費用の見込み（入力は写真の大きさから・出力は 1 枚 1,000 トークンと置いた）:")
    for (const m of models) console.log(`  ${MODELS[m].label}: 約 ${Math.ceil(costYen(m, estIn, estOut, yenPerUsd))} 円`)
    console.log(`  単価: ${PRICE_SOURCE}`)
    return files
}

function client(): Anthropic {
    if (!process.env.ANTHROPIC_API_KEY) fail("環境変数 ANTHROPIC_API_KEY がありません（キーはコードやファイルに書かないこと）")
    return new Anthropic()
}

async function pool<T>(items: T[], n: number, work: (item: T) => Promise<void>) {
    let next = 0
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
        while (next < items.length) await work(items[next++])
    }))
}

if (command === "init") {
    const files = listPhotos()
    if (files.length === 0) fail(`${PHOTOS} に写真がありません`)
    if (fs.existsSync(ANSWERS)) fail(`${ANSWERS} はもうあります（上書きしません。作り直すなら消してから）`)
    fs.writeFileSync(ANSWERS, toCsv([ANSWER_HEADER, ...files.map((f) => [f, ...ANSWER_HEADER.slice(1).map(() => "")])]))
    console.log(`正解の表を作りました: ${ANSWERS}（${files.length} 枚）`)
    console.log("Excel で開き、写真を見て正解を書いてください。読めない欄・銘板に無い欄は空のままにします。")
} else if (command === "check") {
    const answers = readAnswers()
    const photos = listPhotos()
    const noAnswer = photos.filter((p) => !answers.some((a) => a.file === p))
    if (noAnswer.length) console.log(`  （正解の表に無い写真は使いません: ${noAnswer.join("、")}）`)
    await plan(answers)
    console.log("NAMEPLATE_EVAL_CHECK_OK")
} else if (command === "count") {
    const answers = readAnswers()
    const files = await plan(answers)
    const api = client()
    for (const m of models) {
        let total = 0
        for (const f of files) {
            const img = await loadImage(f)
            const req = buildNameplateRequest({ model: MODELS[m].id, imageBase64: img.base64, mediaType: "image/jpeg", effort })
            const r = await api.messages.countTokens({ model: req.model, system: req.system, messages: req.messages, output_config: req.output_config })
            total += r.input_tokens
        }
        const avg = files.length ? total / files.length : 0
        console.log(`${MODELS[m].label}: 入力 1 枚あたり ${Math.round(avg)} トークン（出力を 1,000 と置くと 1 枚 約 ${costYen(m, avg, 1000, yenPerUsd).toFixed(2)} 円）`)
    }
} else if (command === "run") {
    const answers = readAnswers()
    const files = await plan(answers)
    if (!has("yes")) {
        console.log("\n実行するには --yes を付けてください（上の見込みどおりの費用がかかります）。")
        process.exit(0)
    }
    const api = client()
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-")
    const out = path.join(BASE, "out", stamp)
    fs.mkdirSync(out, { recursive: true })
    const jsonl = path.join(out, "results.jsonl")
    fs.writeFileSync(path.join(out, "prompt.txt"), NAMEPLATE_SYSTEM_PROMPT)
    const results: CallResult[] = []
    const jobs = files.flatMap((file) => models.map((model) => ({ file, model })))
    let done = 0
    await pool(jobs, concurrency, async ({ file, model }) => {
        const img = await loadImage(file)
        const t0 = Date.now()
        const r: CallResult = { file, model, reading: null, stopReason: null, error: null, inputTokens: 0, outputTokens: 0, ms: 0 }
        try {
            const res = await api.messages.create(
                buildNameplateRequest({ model: MODELS[model].id, imageBase64: img.base64, mediaType: "image/jpeg", effort }),
            )
            r.stopReason = res.stop_reason
            r.inputTokens = res.usage.input_tokens
            r.outputTokens = res.usage.output_tokens
            // ★断られた・途中で切れた答えは形が崩れうるので読まない（設計書 7.「作るときの注意」）
            if (res.stop_reason === "end_turn") {
                const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("")
                r.reading = parseNameplateReading(text)
                if (!r.reading) r.error = "答えの形が違う"
            } else {
                r.error = `止まった理由: ${res.stop_reason}`
            }
        } catch (e) {
            r.error = e instanceof Anthropic.APIError ? `${e.status ?? ""} ${e.name}: ${e.message}` : String(e)
        }
        r.ms = Date.now() - t0
        results.push(r)
        fs.appendFileSync(jsonl, JSON.stringify(r) + "\n")
        done++
        console.log(`  ${done}/${jobs.length} ${MODELS[model].label} ${file}${r.error ? ` ★${r.error}` : ""}`)
    })
    const summaries = summarize(results, answers, yenPerUsd)
    const md = renderSummaryMarkdown(summaries, { when: new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }), images: files.length, effort, maxSide, yenPerUsd })
    fs.writeFileSync(path.join(out, "summary.md"), md)
    fs.writeFileSync(path.join(out, "diff.csv"), toCsv(diffRows(results, answers.filter((a) => files.includes(a.file)))))
    console.log("\n" + md)
    console.log(`結果: ${out}`)
} else {
    console.log("使い方: npm run eval:nameplate -- <init|check|count|run> [--models opus,sonnet,haiku] [--effort low] [--max-side 1568] [--limit N] [--yes]")
    console.log("くわしくは scripts/nameplate-eval/run.mts の冒頭")
    process.exit(command ? 1 : 0)
}
