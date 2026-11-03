// 銘板の読み取りの評価: 3 社の API の呼び方（2026-10-30）。
//
// ■ そろえること（比べるため）
//   ・指示（NAMEPLATE_SYSTEM_PROMPT）・写真・頼む文（NAMEPLATE_USER_TEXT）・返す形（NAMEPLATE_SCHEMA）は 3 社とも同じ
//   ・写真を先、頼む文を後に置く
//   ・考える量は同じ言葉（low・medium・high）で渡す。出力の上限は 4,000
//   ・決まった形で返させる（Anthropic: output_config.format ／ OpenAI: text.format の json_schema（strict）／
//     Google: responseSchema。★Google の形は JSON Schema の一部の書き方が違うので toGeminiSchema で直す）
//
// ■ ★キーは呼ぶ側が環境変数から渡す。エラーの文にキーを入れない
// ■ ★Anthropic は公式の SDK（run.mts で作る）。OpenAI・Google は SDK を足さず、HTTP で直に呼ぶ
//   （点検アプリの依存を評価の道具のためだけに増やさない）。fetch は差し替えられる（自己診断で偽の返事を返す）
// ■ ★2026-10-30: OpenAI・Google の公式の資料をこの環境から開けなかった。呼び方は知っている形で書いた。
//   うまくいかないときは、results.jsonl の error に API の返したエラーの文が残る
import {
    NAMEPLATE_SCHEMA,
    NAMEPLATE_SYSTEM_PROMPT,
    NAMEPLATE_USER_TEXT,
    buildNameplateRequest,
} from "../../src/lib/nameplate-reading.ts"

export type Effort = "low" | "medium" | "high"
export type EvalImage = { base64: string; mediaType: "image/jpeg" }

/** 3 社の返事をそろえた形 */
export type Reply = {
    /** 最後まで答えた（途中で切れた・断られた・止められたときは false） */
    finished: boolean
    stopReason: string | null
    /** 答えの文（JSON の文字列）。無ければ null */
    text: string | null
    inputTokens: number
    /** ★考えた分も含む（どの会社も出力の単価で数える） */
    outputTokens: number
    error: string | null
}

const MAX_OUTPUT_TOKENS = 4000

/** 返事の形（使う所だけ。★知らない形でも落ちないよう、全部を省略できるものとして読む） */
type ApiError = { error?: { message?: string } }
type AnthropicMessage = {
    stop_reason?: string | null
    content?: { type: string; text?: string }[]
    usage?: { input_tokens?: number; output_tokens?: number }
}
type OpenAIResponse = {
    status?: string
    incomplete_details?: { reason?: string } | null
    output?: { type?: string; content?: { type?: string; text?: unknown }[] }[]
    usage?: { input_tokens?: number; output_tokens?: number }
}
type GeminiResponse = {
    candidates?: { finishReason?: string; content?: { parts?: { text?: unknown; thought?: boolean }[] } }[]
    promptFeedback?: { blockReason?: string }
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }
}
/** JSON Schema のうち、返す形で使う書き方 */
type SchemaNode = {
    type?: string | readonly string[]
    enum?: readonly string[]
    properties?: Record<string, SchemaNode>
    required?: readonly string[]
    additionalProperties?: boolean
    [other: string]: unknown
}

function failed(error: string): Reply {
    return { finished: false, stopReason: null, text: null, inputTokens: 0, outputTokens: 0, error }
}

/** POST して JSON を読む。★投げない（失敗は文で返す） */
async function postJson(url: string, headers: Record<string, string>, body: unknown, fetchImpl: typeof fetch): Promise<{ json: object } | { error: string }> {
    let res: Response
    try {
        res = await fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) })
    } catch (e) {
        return { error: `通信の失敗: ${e instanceof Error ? e.message : String(e)}` }
    }
    return readJson(res)
}

async function readJson(res: Response): Promise<{ json: object } | { error: string }> {
    const text = await res.text().catch(() => "")
    let json: unknown = null
    try {
        json = text ? JSON.parse(text) : null
    } catch {
        json = null
    }
    if (!res.ok) {
        const message = (json as ApiError | null)?.error?.message ?? text.slice(0, 300)
        return { error: `${res.status} ${message}`.trim() }
    }
    if (!json || typeof json !== "object") return { error: "返事が JSON でない" }
    return { json }
}

// ---- Anthropic（公式の SDK）-------------------------------------------------

/** SDK の client のうち使う所だけ（自己診断で偽物を渡せるように） */
export type AnthropicLike = {
    messages: { create(req: ReturnType<typeof buildNameplateRequest>): Promise<AnthropicMessage> }
}

export async function callAnthropic(client: AnthropicLike, model: string, img: EvalImage, effort: Effort): Promise<Reply> {
    try {
        const res = await client.messages.create(buildNameplateRequest({ model, imageBase64: img.base64, mediaType: img.mediaType, effort }))
        const text = (res.content ?? []).flatMap((b) => (b.type === "text" && typeof b.text === "string" ? [b.text] : [])).join("")
        return {
            // ★断られた（refusal）・途中で切れた（max_tokens）答えは形が崩れうるので読まない（設計書 7.「作るときの注意」）
            finished: res.stop_reason === "end_turn",
            stopReason: res.stop_reason ?? null,
            text: text || null,
            inputTokens: res.usage?.input_tokens ?? 0,
            outputTokens: res.usage?.output_tokens ?? 0,
            error: null,
        }
    } catch (e) {
        const err = e as { status?: number; name?: string; message?: string } | null
        return failed(`${err?.status ?? ""} ${err?.name ?? "Error"}: ${err?.message ?? String(e)}`.trim())
    }
}

// ---- OpenAI（Responses API）-------------------------------------------------

export const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"

export function buildOpenAIRequest(model: string, img: EvalImage, effort: Effort) {
    return {
        model,
        instructions: NAMEPLATE_SYSTEM_PROMPT,
        input: [
            {
                role: "user",
                content: [
                    // ★細かい字を読むので high（既定の auto だと縮めて見ることがある）
                    { type: "input_image", image_url: `data:${img.mediaType};base64,${img.base64}`, detail: "high" },
                    { type: "input_text", text: NAMEPLATE_USER_TEXT },
                ],
            },
        ],
        text: { format: { type: "json_schema", name: "nameplate_reading", schema: NAMEPLATE_SCHEMA, strict: true } },
        reasoning: { effort },
        max_output_tokens: MAX_OUTPUT_TOKENS,
        // ★答えを OpenAI 側に残さない（既定は後から読めるように残す）
        store: false,
    }
}

export function readOpenAIResponse(json: OpenAIResponse): Reply {
    const usage = json.usage ?? {}
    const parts = (json.output ?? []).filter((o) => o?.type === "message").flatMap((o) => o.content ?? [])
    const refused = parts.some((p) => p?.type === "refusal")
    const text = parts.flatMap((p) => (p?.type === "output_text" && typeof p.text === "string" ? [p.text] : [])).join("")
    const status = typeof json.status === "string" ? json.status : null
    const stopReason = refused ? "refusal"
        : status === "incomplete" ? `incomplete: ${json.incomplete_details?.reason ?? "?"}`
        : status
    return {
        finished: status === "completed" && !refused && text !== "",
        stopReason,
        text: text || null,
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        error: null,
    }
}

export async function callOpenAI(apiKey: string, model: string, img: EvalImage, effort: Effort, fetchImpl: typeof fetch = fetch): Promise<Reply> {
    const r = await postJson(OPENAI_RESPONSES_URL, { Authorization: `Bearer ${apiKey}` }, buildOpenAIRequest(model, img, effort), fetchImpl)
    return "error" in r ? failed(r.error) : readOpenAIResponse(r.json as OpenAIResponse)
}

// ---- Google（Gemini API の generateContent）------------------------------------

export function geminiUrl(model: string): string {
    return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
}

/**
 * JSON Schema を Gemini の responseSchema の書き方に直す。
 *   ・型は大文字（STRING・OBJECT）。null を許す欄は type の組み合わせでなく nullable: true
 *   ・文字の選択肢は format: "enum"
 *   ・additionalProperties は書かない。欄の並びは propertyOrdering で決める
 * ★知らない書き方（配列・anyOf・数の制約など）があれば投げる（黙って落とすと、形の決まりがゆるむ）
 */
export function toGeminiSchema(node: SchemaNode): Record<string, unknown> {
    const known = new Set(["type", "enum", "properties", "required", "additionalProperties"])
    for (const k of Object.keys(node ?? {})) if (!known.has(k)) throw new Error(`Gemini の形に直せない書き方: ${k}`)
    const types: string[] = typeof node.type === "string" ? [node.type] : [...(node.type ?? [])]
    const main = types.filter((t) => t !== "null")
    if (main.length !== 1 || !["string", "object"].includes(main[0])) throw new Error(`Gemini の形に直せない型: ${JSON.stringify(node.type)}`)
    const out: Record<string, unknown> = { type: main[0].toUpperCase() }
    if (types.includes("null")) out.nullable = true
    if (node.enum) {
        out.format = "enum"
        out.enum = node.enum
    }
    if (main[0] === "object") {
        const props = node.properties ?? {}
        out.properties = Object.fromEntries(Object.entries(props).map(([k, v]) => [k, toGeminiSchema(v)]))
        out.required = node.required ?? []
        out.propertyOrdering = Object.keys(props)
    }
    return out
}

export function buildGeminiRequest(img: EvalImage, effort: Effort) {
    return {
        systemInstruction: { parts: [{ text: NAMEPLATE_SYSTEM_PROMPT }] },
        contents: [
            {
                role: "user",
                parts: [
                    { inlineData: { mimeType: img.mediaType, data: img.base64 } },
                    { text: NAMEPLATE_USER_TEXT },
                ],
            },
        ],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: toGeminiSchema(NAMEPLATE_SCHEMA),
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            // ★考える量（Gemini 3 の書き方）。古い 2.5 は thinkingBudget なので、2.5 を --id で選ぶと 400 になる
            thinkingConfig: { thinkingLevel: effort },
        },
    }
}

export function readGeminiResponse(json: GeminiResponse): Reply {
    const usage = json.usageMetadata ?? {}
    const inputTokens = usage.promptTokenCount ?? 0
    // ★考えた分（thoughtsTokenCount）も出力の単価で数える
    const outputTokens = (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0)
    const cand = json.candidates?.[0]
    if (!cand) {
        const blocked = json.promptFeedback?.blockReason
        return { finished: false, stopReason: blocked ? `blocked: ${blocked}` : "答えが無い", text: null, inputTokens, outputTokens, error: null }
    }
    // ★考えた中身（thought: true）は答えに混ぜない
    const text = (cand.content?.parts ?? []).flatMap((p) => (!p?.thought && typeof p?.text === "string" ? [p.text] : [])).join("")
    return {
        finished: cand.finishReason === "STOP" && text !== "",
        stopReason: cand.finishReason ?? null,
        text: text || null,
        inputTokens,
        outputTokens,
        error: null,
    }
}

export async function callGemini(apiKey: string, model: string, img: EvalImage, effort: Effort, fetchImpl: typeof fetch = fetch): Promise<Reply> {
    const r = await postJson(geminiUrl(model), { "x-goog-api-key": apiKey }, buildGeminiRequest(img, effort), fetchImpl)
    return "error" in r ? failed(r.error) : readGeminiResponse(r.json as GeminiResponse)
}

// ---- モデル名があるかの確かめ（費用はかからない）-------------------------------

async function getJson(url: string, headers: Record<string, string>, fetchImpl: typeof fetch): Promise<{ json: object } | { error: string }> {
    let res: Response
    try {
        res = await fetchImpl(url, { headers })
    } catch (e) {
        return { error: `通信の失敗: ${e instanceof Error ? e.message : String(e)}` }
    }
    return readJson(res)
}

/** OpenAI で使えるモデル名の一覧 */
export async function listOpenAIModels(apiKey: string, fetchImpl: typeof fetch = fetch): Promise<{ ids: string[] } | { error: string }> {
    const r = await getJson("https://api.openai.com/v1/models", { Authorization: `Bearer ${apiKey}` }, fetchImpl)
    if ("error" in r) return r
    return { ids: ((r.json as { data?: { id?: unknown }[] }).data ?? []).map((m) => String(m.id)) }
}

/** Google（Gemini API）で使えるモデル名の一覧（頭の models/ は外す） */
export async function listGeminiModels(apiKey: string, fetchImpl: typeof fetch = fetch): Promise<{ ids: string[] } | { error: string }> {
    const ids: string[] = []
    let page = ""
    for (let i = 0; i < 20; i++) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000${page ? `&pageToken=${encodeURIComponent(page)}` : ""}`
        const r = await getJson(url, { "x-goog-api-key": apiKey }, fetchImpl)
        if ("error" in r) return r
        const body = r.json as { models?: { name?: unknown }[]; nextPageToken?: string }
        for (const m of body.models ?? []) ids.push(String(m.name).replace(/^models\//, ""))
        page = body.nextPageToken ?? ""
        if (!page) break
    }
    return { ids }
}
