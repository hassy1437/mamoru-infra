/**
 * 銘板の読み取り: サーバで 3 社に同時に読ませる（2026-11-03）。
 * 設計: docs/銘板の読み取り_使いながら学ぶ_設計_20261103.md（2. 使うときの流れ）
 *
 * ★サーバだけで使う（キーを読む）。キーの値はログ・エラーの文・DB に出さない。
 * ★1 社が遅い・失敗しても、ほかの会社の答えで続ける（30 秒で打ち切る）。
 * ★答えは「最後まで答えた」かつ「決まった形」のときだけ使う（断られた・途中で切れた答えは読まない）。
 */
import Anthropic from "@anthropic-ai/sdk"
import { callAnthropic, callGemini, callOpenAI, type AnthropicLike, type EvalImage, type Reply } from "./nameplate-providers.ts"
import { parseNameplateReading } from "./nameplate-reading.ts"
import { nameplateCostUsd, type NameplateLiveModel } from "./nameplate-ai-config.ts"
import type { NameplateProvider, NameplateProviderResult } from "./nameplate-consensus.ts"

export const NAMEPLATE_CALL_TIMEOUT_MS = 30_000
const ERROR_MAX = 300

export type NameplateCaller = (model: NameplateLiveModel, img: EvalImage, timeoutMs: number) => Promise<Reply>
export type NameplateCallers = Record<NameplateProvider, NameplateCaller>

/** 本物の呼び方（★考える量は low・評価の道具と同じ） */
export const NAMEPLATE_CALLERS: NameplateCallers = {
    anthropic: (m, img, timeoutMs) =>
        callAnthropic(new Anthropic({ apiKey: m.apiKey, timeout: timeoutMs, maxRetries: 1 }) as unknown as AnthropicLike, m.id, img, "low"),
    google: (m, img, timeoutMs) => callGemini(m.apiKey, m.id, img, "low", withTimeout(timeoutMs)),
    openai: (m, img, timeoutMs) => callOpenAI(m.apiKey, m.id, img, "low", withTimeout(timeoutMs)),
}

function withTimeout(ms: number): typeof fetch {
    return (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(ms) }) // fetch-ok: サーバから AI 各社へ（PDF ではない）
}

/** キーらしい文字列をエラーの文から消す（★念のため。各社のエラーにキーが入ることは無いはず） */
function scrub(text: string, keys: readonly string[]): string {
    let s = text
    for (const k of keys) if (k.length >= 8) s = s.split(k).join("***")
    return s.length > ERROR_MAX ? `${s.slice(0, ERROR_MAX)}…` : s
}

/** 打ち切りの保険（各社の呼び方の打ち切りが効かなかったとき）。★投げられても Reply にして返す（ほかの会社を止めない） */
function race(p: Promise<Reply>, ms: number, timedOut: Reply): Promise<Reply> {
    return new Promise((resolve) => {
        const t = setTimeout(() => resolve(timedOut), ms + 2_000)
        p.then(
            (v) => {
                clearTimeout(t)
                resolve(v)
            },
            (e) => {
                clearTimeout(t)
                resolve({ ...timedOut, error: e instanceof Error ? e.message : String(e) })
            },
        )
    })
}

export async function readNameplateWithAll(
    models: readonly NameplateLiveModel[],
    img: EvalImage,
    callers: NameplateCallers = NAMEPLATE_CALLERS,
    timeoutMs: number = NAMEPLATE_CALL_TIMEOUT_MS,
): Promise<NameplateProviderResult[]> {
    const keys = models.map((m) => m.apiKey)
    return Promise.all(
        models.map(async (m): Promise<NameplateProviderResult> => {
            const started = Date.now()
            const timedOut: Reply = { finished: false, stopReason: null, text: null, inputTokens: 0, outputTokens: 0, error: "時間切れ" }
            const reply = await race(
                Promise.resolve().then(() => callers[m.provider](m, img, timeoutMs)),
                timeoutMs,
                timedOut,
            )
            const reading = reply.finished && reply.text ? parseNameplateReading(reply.text) : null
            const error = reading
                ? null
                : reply.error
                  ? scrub(reply.error, keys)
                  : reply.finished
                    ? "決まった形でない答え"
                    : `最後まで答えなかった（${reply.stopReason ?? "理由なし"}）`
            return {
                provider: m.provider,
                model: m.id,
                ok: reading !== null,
                error,
                ms: Date.now() - started,
                inputTokens: reply.inputTokens,
                outputTokens: reply.outputTokens,
                costUsd: nameplateCostUsd(m, reply.inputTokens, reply.outputTokens),
                reading,
            }
        }),
    )
}
