/**
 * 銘板の読み取り: スイッチ・使うモデル・単価（2026-11-03）。
 * 設計: docs/銘板の読み取り_使いながら学ぶ_設計_20261103.md（5. スイッチと上限）
 *
 * ★サーバだけで使う（キーを読む）。ブラウザに渡すのは「使えるか」と残り枚数だけ。
 * ★キーの無い会社は飛ばす（2 社でも動く）。1 社も無ければ使えない扱い。
 */
import type { NameplateProvider } from "./nameplate-consensus.ts"

/** 指示の版（★指示・返す形を変えたら上げる。成績表を版ごとに分けて見るため） */
export const NAMEPLATE_PROMPT_VERSION = "2026-11-03"

export type NameplateAiMode = "off" | "test" | "on"

type Env = Record<string, string | undefined>

export function nameplateAiMode(env: Env): NameplateAiMode {
    const v = (env.NAMEPLATE_AI ?? "").trim().toLowerCase()
    return v === "on" || v === "test" ? v : "off"
}

/** test のときに使える人（環境変数 NAMEPLATE_AI_TESTERS にカンマで並べた利用者の id） */
export function nameplateAiTesters(env: Env): string[] {
    return (env.NAMEPLATE_AI_TESTERS ?? "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter((s) => /^[0-9a-f-]{36}$/.test(s))
}

/**
 * 使うモデルと単価（米ドル／100 万トークン）。★scripts/nameplate-eval/lib.mts の MODELS と同じ値（src/lib/nameplate-ai-config.test.ts が見比べる）。
 * ★Gemini・GPT の単価は未確認（評価の道具の注と同じ）。使って返ってきたトークン数で費用を出すので、単価が違えば費用の数字だけずれる。
 */
export const NAMEPLATE_LIVE_MODELS: Record<
    NameplateProvider,
    { id: string; idEnv: string; keyEnv: readonly string[]; usdIn: number; usdOut: number; priceChecked: boolean }
> = {
    anthropic: { id: "claude-haiku-5-5", idEnv: "NAMEPLATE_MODEL_ANTHROPIC", keyEnv: ["ANTHROPIC_API_KEY"], usdIn: 0.1, usdOut: 0.5, priceChecked: true },
    google: { id: "gemini-3.1-flash-lite", idEnv: "NAMEPLATE_MODEL_GOOGLE", keyEnv: ["GEMINI_API_KEY", "GOOGLE_API_KEY"], usdIn: 0.25, usdOut: 1.5, priceChecked: false },
    openai: { id: "gpt-5.4-nano", idEnv: "NAMEPLATE_MODEL_OPENAI", keyEnv: ["OPENAI_API_KEY"], usdIn: 0.2, usdOut: 1.25, priceChecked: false },
}

export type NameplateLiveModel = {
    provider: NameplateProvider
    id: string
    apiKey: string
    usdIn: number
    usdOut: number
}

/** キーのある会社のモデル（★キーの値はこの戻り値の中だけ。ログやエラーに出さない） */
export function nameplateLiveModels(env: Env): NameplateLiveModel[] {
    const out: NameplateLiveModel[] = []
    for (const provider of ["anthropic", "google", "openai"] as const) {
        const m = NAMEPLATE_LIVE_MODELS[provider]
        const apiKey = m.keyEnv.map((k) => (env[k] ?? "").trim()).find((v) => v !== "")
        if (!apiKey) continue
        const id = (env[m.idEnv] ?? "").trim() || m.id
        // ★モデル名を替えたら、単価は前のモデルのままかもしれない（費用の数字は目安）
        out.push({ provider, id, apiKey, usdIn: m.usdIn, usdOut: m.usdOut })
    }
    return out
}

/** この人に「銘板を撮って読む」を出すか（★スイッチ・テストの人・キーの有無だけ。月の残り枚数は DB で見る） */
export function nameplateAiEnabledFor(env: Env, userId: string | null | undefined): boolean {
    const mode = nameplateAiMode(env)
    if (mode === "off" || !userId) return false
    if (nameplateLiveModels(env).length === 0) return false
    if (mode === "test") return nameplateAiTesters(env).includes(userId.toLowerCase())
    return true
}

/** 費用（米ドル）。トークン数が取れなければ null */
export function nameplateCostUsd(model: { usdIn: number; usdOut: number }, inputTokens: number, outputTokens: number): number | null {
    if (!(inputTokens > 0) && !(outputTokens > 0)) return null
    return (inputTokens * model.usdIn + outputTokens * model.usdOut) / 1_000_000
}
