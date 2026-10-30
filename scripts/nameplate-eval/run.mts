// 銘板の読み取りの評価（設計書 6.・2026-10-23。2026-10-30 に 3 社へ広げた）。
//   docs/銘板・過去報告書の読み取り_設計と費用_20261020.md
//
// ■ 何をするか
//   銘板の写真と、人が書いた正解の表（CSV）を用意して、3 社のモデル（Anthropic の Claude・Google の Gemini・OpenAI の GPT）に
//   同じ写真を読ませ、欄ごとの正答率・「読めないのに値を作った」件数・費用・時間を表にする。
//   段階方式（安いモデルで読み、形の確かめで引っかかった写真だけ強いモデルで読み直す）も、同じ結果から組み立てて表にする。
//   ★指示と返す形は本番と同じもの（src/lib/nameplate-reading.ts）を使う。3 社とも同じ指示・同じ形（scripts/nameplate-eval/providers.mts）。
//
// ■ 使い方（リポジトリの一番上で。写真と正解は tmp/ の下に置く＝git には入らない）
//   1. 写真を tmp/nameplate-eval/photos/ に入れる（jpg・png・webp。iPhone の HEIC は JPEG にして入れる）
//   2. npm run eval:nameplate -- init     … 正解の表 tmp/nameplate-eval/answers.csv の雛形を作る（Excel で開ける）
//   3. 正解を書く（読めない・銘板に無い欄は空のまま）
//   4. npm run eval:nameplate -- check    … 写真と正解の表を確かめ、呼び出しの回数と費用の見込みを出す（API は呼ばない）
//   5. npm run eval:nameplate -- models   … 使うモデル名が各社にあるかを確かめる（一覧を読むだけ・費用はかからない）
//   6. npm run eval:nameplate -- count    … Claude だけ、送る前に数える API で入力トークンを正確に数える（費用はかからない）
//   7. npm run eval:nameplate -- run --yes … 実行。結果は tmp/nameplate-eval/out/<日時>/ に
//        summary.md（まとめ）・diff.csv（写真 × 欄ごとの値）・results.jsonl（生の結果）・meta.json（モデル名と単価）
//   8. npm run eval:nameplate -- report tmp/nameplate-eval/out/<日時>
//        … 正解の表を直したあと・段階方式の組を替えたいときに、API を呼ばずに表を作り直す（summary.md・diff.csv を上書き）
//
// ■ オプション
//   --models haiku,sonnet,...   比べるモデル（既定: haiku・sonnet・gemini-flash-lite・gemini-flash・gpt-nano・gpt-mini。opus も選べる）
//   --effort low|medium|high    考える量（既定 low。3 社に同じ言葉で渡す）
//   --max-side 1568             写真の長い辺を縮める大きさ（既定 1568。2576 まで細かく見られる）
//   --limit N                   先頭の N 枚だけ
//   --concurrency 3             同時に送る数
//   --yen 150                   1 ドルの円
//   --id gemini-flash=gemini-3.8-flash      モデル名を替える（新しい版が出たとき。カンマで区切って複数）
//   --price gemini-flash=0.75/3.75          単価を替える（入力/出力の米ドル・100 万トークンあたり。公式の頁で確かめた値）
//   --cascade haiku>sonnet,gpt-nano>gpt-mini 段階方式の組（既定: 各モデル → それより高く正答率がいちばん高いモデル）
//   --makers 一覧.txt            製造者名の一覧（1 行 1 社）。一覧に無い製造者名も「引っかかった」に数える
//                               （tmp/nameplate-eval/makers.txt があれば、指定しなくても使う）
//
// ■ ★API キーは環境変数（コードやファイルに書かない）: ANTHROPIC_API_KEY ／ OPENAI_API_KEY ／ GEMINI_API_KEY（または GOOGLE_API_KEY）
//   キーの無い会社のモデルは飛ばす。run は --yes が無ければ見込みを出して止まる。
// ■ ★写真が各社（米国）に送られる。銘板の写真だけにする（人の名前・顔・書類を写さない）。
//   Google は無料枠のキーだと、送ったものを Google が改善に使うことがある（★公式の規約で確かめる）＝有料（請求先を付けた）キーを使う。
import fs from "node:fs"
import path from "node:path"
import Anthropic from "@anthropic-ai/sdk"
import { buildNameplateRequest, parseNameplateReading, NAMEPLATE_SYSTEM_PROMPT, type NameplateCheckOptions } from "../../src/lib/nameplate-reading.ts"
import {
    ANSWER_HEADER,
    CASCADE_RULES,
    DEFAULT_MODELS,
    MODELS,
    MODEL_ALIASES,
    PROVIDERS,
    applyModelOverrides,
    checkStats,
    costYen,
    decodeCsvBytes,
    defaultCascadePairs,
    diffRows,
    estimateTokens,
    isModelAlias,
    loadAnswers,
    parseCascadePairs,
    renderSummaryMarkdown,
    summarize,
    summarizeCascade,
    toCsv,
    type Answer,
    type CallResult,
    type ModelAlias,
    type ModelInfo,
    type Provider,
} from "./lib.mts"
import { callAnthropic, callGemini, callOpenAI, listGeminiModels, listOpenAIModels, type Effort, type Reply } from "./providers.mts"

const BASE = path.join("tmp", "nameplate-eval")
const PHOTOS = path.join(BASE, "photos")
const ANSWERS = path.join(BASE, "answers.csv")
const DEFAULT_MAKERS = path.join(BASE, "makers.txt")
const IMAGE_EXT = /\.(jpe?g|png|webp)$/i

function option(name: string, fallback: string): string {
    const i = process.argv.indexOf(`--${name}`)
    return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
/** 何度でも書ける・カンマで区切れるオプション */
function options(name: string): string[] {
    return process.argv.flatMap((a, i) => (a === `--${name}` && process.argv[i + 1] ? process.argv[i + 1].split(",") : []))
        .map((s) => s.trim()).filter(Boolean)
}
const has = (name: string) => process.argv.includes(`--${name}`)
function fail(message: string): never {
    console.error(`★${message}`)
    process.exit(1)
}

const command = process.argv[2] ?? ""
const overrideProblems = applyModelOverrides(options("id"), options("price"))
if (overrideProblems.length) fail(overrideProblems.join("\n "))
const models = (has("models") ? options("models") : DEFAULT_MODELS) as ModelAlias[]
for (const m of models) if (!isModelAlias(m)) fail(`知らないモデル: ${m}（${MODEL_ALIASES.join("・")} から選ぶ）`)
const effort = option("effort", "low") as Effort
if (!["low", "medium", "high"].includes(effort)) fail(`--effort は low・medium・high のどれか: ${effort}`)
const maxSide = Number(option("max-side", "1568"))
if (!Number.isInteger(maxSide) || maxSide < 200 || maxSide > 2576) fail("--max-side は 200〜2576 の整数")
const limit = Number(option("limit", "0"))
const concurrency = Math.max(1, Number(option("concurrency", "3")))
const yenPerUsd = Number(option("yen", "150"))
const cascadeSpec = parseCascadePairs(options("cascade").join(","))
if (cascadeSpec.problems.length) fail(cascadeSpec.problems.join("\n "))

/** 環境変数のキー（★値は表に出さない） */
function keyOf(p: Provider): string | null {
    for (const name of PROVIDERS[p].keyEnv) if (process.env[name]) return process.env[name]!
    return null
}

function loadMakers(): string[] | undefined {
    const file = option("makers", fs.existsSync(DEFAULT_MAKERS) ? DEFAULT_MAKERS : "")
    if (!file) return undefined
    if (!fs.existsSync(file)) fail(`製造者名の一覧 ${file} がありません`)
    const list = decodeCsvBytes(fs.readFileSync(file)).split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith("#"))
    console.log(`  製造者名の一覧: ${file}（${list.length} 件）`)
    return list
}

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
    return { base64: data.toString("base64"), mediaType: "image/jpeg" as const, width: info.width, height: info.height, bytes: data.length }
}

/** キーのあるモデル（★無いものは名前を出して飛ばす） */
function runnable(): ModelAlias[] {
    const ok = models.filter((m) => keyOf(MODELS[m].provider))
    const skipped = models.filter((m) => !ok.includes(m))
    if (skipped.length) {
        const envs = [...new Set(skipped.map((m) => PROVIDERS[MODELS[m].provider].keyEnv.join(" か ")))]
        console.log(`  （キーが無いので飛ばす: ${skipped.map((m) => MODELS[m].label).join("・")}。環境変数 ${envs.join("・")}）`)
    }
    return ok
}

async function plan(answers: Answer[], use: ModelAlias[]) {
    const files = answers.map((a) => a.file).slice(0, limit > 0 ? limit : undefined)
    const missing = files.filter((f) => !fs.existsSync(path.join(PHOTOS, f)))
    if (missing.length) fail(`正解の表にあるのに写真がありません: ${missing.join("、")}`)
    console.log(`写真 ${files.length} 枚 × モデル ${use.length} つ = 呼び出し ${files.length * use.length} 回（考える量 ${effort}・長い辺 ${maxSide}px）`)
    console.log("費用の見込み（★多めに見ている。実際の費用は返ってきたトークン数で出す）:")
    let total = 0
    for (const m of use) {
        let yen = 0
        for (const f of files) {
            const img = await loadImage(f)
            const t = estimateTokens(MODELS[m].provider, img.width, img.height)
            yen += costYen(m, t.input, t.output, yenPerUsd)
        }
        total += yen
        console.log(`  ${MODELS[m].label}（${MODELS[m].id}）: 約 ${Math.ceil(yen)} 円${MODELS[m].priceChecked ? "" : "  ★単価は未確認"}`)
    }
    console.log(`  合計: 約 ${Math.ceil(total)} 円`)
    for (const p of [...new Set(use.map((m) => MODELS[m].provider))]) console.log(`  ${PROVIDERS[p].label} の単価: ${PROVIDERS[p].priceSource}`)
    return files
}

let anthropicClient: Anthropic | null = null
function anthropic(): Anthropic {
    if (!process.env.ANTHROPIC_API_KEY) fail("環境変数 ANTHROPIC_API_KEY がありません（キーはコードやファイルに書かないこと）")
    anthropicClient ??= new Anthropic()
    return anthropicClient
}

async function callModel(model: ModelAlias, img: { base64: string; mediaType: "image/jpeg" }): Promise<Reply> {
    const m = MODELS[model]
    if (m.provider === "anthropic") return callAnthropic(anthropic(), m.id, img, effort)
    if (m.provider === "openai") return callOpenAI(keyOf("openai")!, m.id, img, effort)
    return callGemini(keyOf("google")!, m.id, img, effort)
}

async function pool<T>(items: T[], n: number, work: (item: T) => Promise<void>) {
    let next = 0
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
        while (next < items.length) await work(items[next++])
    }))
}

type Meta = { effort: string; maxSide: number; yenPerUsd: number; images: number; models: Partial<Record<ModelAlias, ModelInfo>> }

/** 表を作って書く（run と report で同じ） */
function writeReport(out: string, results: CallResult[], answers: Answer[], meta: Meta, checkOpts: NameplateCheckOptions) {
    const summaries = summarize(results, answers, meta.yenPerUsd)
    const ran = summaries.map((s) => s.model)
    const pairs = (cascadeSpec.pairs.length ? cascadeSpec.pairs : defaultCascadePairs(summaries))
        .filter(([a, b]) => ran.includes(a) && ran.includes(b))
    const cascades = pairs.flatMap(([a, b]) => CASCADE_RULES.map((rule) => summarizeCascade(results, answers, a, b, rule, meta.yenPerUsd, checkOpts)))
    const md = renderSummaryMarkdown(
        summaries,
        { when: new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }), images: meta.images, effort: meta.effort, maxSide: meta.maxSide, yenPerUsd: meta.yenPerUsd, makers: checkOpts.makers?.length },
        cascades,
        checkStats(results, answers, checkOpts),
    )
    fs.writeFileSync(path.join(out, "summary.md"), md)
    fs.writeFileSync(path.join(out, "diff.csv"), toCsv(diffRows(results, answers, checkOpts)))
    console.log("\n" + md)
    console.log(`結果: ${out}`)
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
    runnable()
    await plan(answers, models)
    loadMakers()
    console.log("NAMEPLATE_EVAL_CHECK_OK")
} else if (command === "models") {
    // ★一覧を読むだけ（費用はかからない）。使うモデル名が無ければ、似た名前を出す
    for (const p of [...new Set(models.map((m) => MODELS[m].provider))]) {
        const key = keyOf(p)
        if (!key) { console.log(`${PROVIDERS[p].label}: キーが無いので確かめない（${PROVIDERS[p].keyEnv.join(" か ")}）`); continue }
        let ids: string[]
        if (p === "anthropic") {
            ids = []
            try {
                for await (const m of anthropic().models.list()) ids.push(m.id)
            } catch (e) {
                console.log(`${PROVIDERS[p].label}: ★一覧を読めない: ${e instanceof Error ? e.message : String(e)}`)
                continue
            }
        } else {
            const r = p === "openai" ? await listOpenAIModels(key) : await listGeminiModels(key)
            if ("error" in r) { console.log(`${PROVIDERS[p].label}: ★一覧を読めない: ${r.error}`); continue }
            ids = r.ids
        }
        for (const m of models.filter((a) => MODELS[a].provider === p)) {
            const id = MODELS[m].id
            if (ids.includes(id)) { console.log(`${PROVIDERS[p].label}: ${id} … あり`); continue }
            const hint = m.replace(/^(gemini|gpt)-/, "")
            const like = ids.filter((x) => x.includes(hint)).sort().reverse().slice(0, 8)
            console.log(`${PROVIDERS[p].label}: ★${id} … 無い。似た名前: ${like.join("・") || "（無い）"}（--id ${m}=名前 で替えられる）`)
        }
    }
} else if (command === "count") {
    const answers = readAnswers()
    const files = await plan(answers, models)
    for (const m of models) {
        if (MODELS[m].provider !== "anthropic") { console.log(`${MODELS[m].label}: 数えない（Claude だけ。ほかは見込みのまま）`); continue }
        let total = 0
        for (const f of files) {
            const img = await loadImage(f)
            const req = buildNameplateRequest({ model: MODELS[m].id, imageBase64: img.base64, mediaType: "image/jpeg", effort })
            const r = await anthropic().messages.countTokens({ model: req.model, system: req.system, messages: req.messages, output_config: req.output_config })
            total += r.input_tokens
        }
        const avg = files.length ? total / files.length : 0
        console.log(`${MODELS[m].label}: 入力 1 枚あたり ${Math.round(avg)} トークン（出力を 1,000 と置くと 1 枚 約 ${costYen(m, avg, 1000, yenPerUsd).toFixed(2)} 円）`)
    }
} else if (command === "run") {
    const answers = readAnswers()
    const use = runnable()
    if (use.length === 0) fail("キーのあるモデルが 1 つもありません")
    const files = await plan(answers, use)
    const checkOpts: NameplateCheckOptions = { makers: loadMakers() }
    if (!has("yes")) {
        console.log("\n実行するには --yes を付けてください（上の見込みくらいの費用がかかります）。")
        process.exit(0)
    }
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-")
    const out = path.join(BASE, "out", stamp)
    fs.mkdirSync(out, { recursive: true })
    const jsonl = path.join(out, "results.jsonl")
    fs.writeFileSync(path.join(out, "prompt.txt"), NAMEPLATE_SYSTEM_PROMPT)
    const meta: Meta = { effort, maxSide, yenPerUsd, images: files.length, models: Object.fromEntries(use.map((m) => [m, MODELS[m]])) }
    fs.writeFileSync(path.join(out, "meta.json"), JSON.stringify(meta, null, 2))
    const results: CallResult[] = []
    const jobs = files.flatMap((file) => use.map((model) => ({ file, model })))
    let done = 0
    await pool(jobs, concurrency, async ({ file, model }) => {
        const img = await loadImage(file)
        const t0 = Date.now()
        const reply = await callModel(model, img)
        const r: CallResult = {
            file, model, modelId: MODELS[model].id, reading: null, stopReason: reply.stopReason, error: reply.error,
            inputTokens: reply.inputTokens, outputTokens: reply.outputTokens, ms: Date.now() - t0,
        }
        if (!r.error) {
            // ★断られた・途中で切れた答えは形が崩れうるので読まない（設計書 7.「作るときの注意」）
            if (reply.finished) {
                r.reading = parseNameplateReading(reply.text ?? "")
                if (!r.reading) r.error = "答えの形が違う"
            } else {
                r.error = `止まった理由: ${reply.stopReason}`
            }
        }
        results.push(r)
        fs.appendFileSync(jsonl, JSON.stringify(r) + "\n")
        done++
        console.log(`  ${done}/${jobs.length} ${MODELS[model].label} ${file}${r.error ? ` ★${r.error}` : ""}`)
    })
    writeReport(out, results, answers.filter((a) => files.includes(a.file)), meta, checkOpts)
} else if (command === "report") {
    const out = process.argv[3] ?? ""
    if (!out || out.startsWith("--") || !fs.existsSync(path.join(out, "results.jsonl"))) fail("report の後に、結果のフォルダ（tmp/nameplate-eval/out/<日時>）を書いてください")
    // ★実行したときのモデル名と単価で数える（--price を付けたときはそちらを使う）
    const meta: Meta = fs.existsSync(path.join(out, "meta.json"))
        ? JSON.parse(fs.readFileSync(path.join(out, "meta.json"), "utf8"))
        : { effort: "?", maxSide: 0, yenPerUsd, images: 0, models: {} }
    const priced = new Set(options("price").map((s) => s.split("=")[0].trim()))
    for (const [alias, info] of Object.entries(meta.models)) {
        if (isModelAlias(alias) && info && !priced.has(alias)) Object.assign(MODELS[alias], info)
    }
    if (has("yen")) meta.yenPerUsd = yenPerUsd
    const results: CallResult[] = fs.readFileSync(path.join(out, "results.jsonl"), "utf8").split("\n").filter(Boolean)
        .map((l) => JSON.parse(l)).filter((r: CallResult) => isModelAlias(r.model))
    const files = new Set(results.map((r) => r.file))
    const answers = readAnswers().filter((a) => files.has(a.file))
    meta.images = answers.length
    writeReport(out, results, answers, meta, { makers: loadMakers() })
} else {
    console.log("使い方: npm run eval:nameplate -- <init|check|models|count|run|report> [--models haiku,sonnet,gemini-flash-lite,...] [--effort low] [--max-side 1568] [--limit N] [--yes]")
    console.log(`モデル: ${MODEL_ALIASES.map((m) => `${m}（${PROVIDERS[MODELS[m].provider].label} ${MODELS[m].id}）`).join("・")}`)
    console.log("くわしくは scripts/nameplate-eval/run.mts の冒頭")
    process.exit(command ? 1 : 0)
}
