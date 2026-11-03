/**
 * 銘板の読み取り: 3 社の答えの多数決と、点検者が入れた値との答え合わせ（2026-11-03）。
 * 設計: docs/銘板の読み取り_使いながら学ぶ_設計_20261103.md（3. 多数決の決まり）
 *
 * ■ 多数決
 *   ・「読めた（clear）」で値のある答えだけが票。読めない（unreadable）・銘板に無い（absent）・失敗した会社は数えない
 *   ・同じかどうかは looseNameplateText（全角半角・空白・ハイフンや波ダッシュの仲間・株式会社などをそろえる）で見る。
 *     製造年は年、校正年月日は年月日（取れるところまで）にそろえて見る
 *   ・全部の票が同じで 2 票以上 → agreed（緑）／いちばん多い組が 2 票以上で、ほかの票もある → split（黄色・多い方を入れる）／
 *     それ以外（1 票だけ・ばらばら）→ none（空にして候補を並べる。★推測で埋めない）
 *   ・入れる値は、いちばん多い組の中で並びが先の会社（Claude → Gemini → ChatGPT）の表記
 *   ・形の確かめ（checkNameplateReading）に引っかかった欄・自信が低い（low）と答えた会社のある欄は warning（黄色）
 * ■ 答え合わせ
 *   ・会社ごと・欄ごとに judgeNameplateField（点検者が入れた値 ＝ 正解）。DB の outcomes にそのまま入る
 */
import {
    NAMEPLATE_DEVICE_KINDS,
    NAMEPLATE_FIELDS,
    checkNameplateReading,
    judgeNameplateField,
    looseNameplateText,
    nameplateYear,
    normalizeNameplateText,
    type NameplateDeviceKind,
    type NameplateFieldKey,
    type NameplateReading,
    type NameplateVerdict,
} from "./nameplate-reading.ts"

export type NameplateProvider = "anthropic" | "google" | "openai"
/** 並び（★同じ票数のときに先の会社の表記を使う） */
export const NAMEPLATE_PROVIDER_ORDER: readonly NameplateProvider[] = ["anthropic", "google", "openai"]
export const NAMEPLATE_PROVIDER_LABEL: Record<NameplateProvider, string> = {
    anthropic: "Claude",
    google: "Gemini",
    openai: "ChatGPT",
}

/** 1 社の結果（DB の ai_results の 1 件） */
export type NameplateProviderResult = {
    provider: NameplateProvider
    model: string
    ok: boolean
    error: string | null
    ms: number
    inputTokens: number
    outputTokens: number
    costUsd: number | null
    reading: NameplateReading | null
}

export type NameplateFieldStatus = "agreed" | "split" | "none"
export type NameplateCandidate = { value: string; providers: NameplateProvider[] }
export type NameplateFieldConsensus = {
    value: string | null
    status: NameplateFieldStatus
    /** 票の多い順（同じなら会社の並び順） */
    candidates: NameplateCandidate[]
    /** 形の確かめに引っかかった・自信が低いと答えた会社がある（黄色） */
    warning: boolean
}
export type NameplateConsensus = {
    device_kind: NameplateDeviceKind
    fields: Record<NameplateFieldKey, NameplateFieldConsensus>
    /** 形の確かめの文（画面にそのまま出す） */
    warnings: string[]
    /** 答えが返ってきた会社の数 */
    voters: number
}

/** 年月日の数字だけ取り出す（2024.4.12・2024/04/12・2024年4月12日 → 2024-04-12）。取れなければ null */
function dateKey(value: string): string | null {
    const nums = normalizeNameplateText(value).match(/\d+/g)
    if (!nums || nums.length === 0) return null
    const [y, m, d] = nums
    if (!/^(19|20)\d{2}$/.test(y)) return null
    const pad = (s: string | undefined) => (s === undefined ? null : s.padStart(2, "0"))
    return [y, pad(m), pad(d)].filter((s) => s !== null).join("-")
}

/** 同じ値かを見るための鍵 */
export function nameplateVoteKey(field: NameplateFieldKey, value: string): string {
    if (field === "manufactured") {
        const y = nameplateYear(value)
        if (y !== null) return `Y${y}`
    }
    if (field === "calibrated_at") {
        const k = dateKey(value)
        if (k !== null) return `D${k}`
    }
    return `T${looseNameplateText(value)}`
}

const present = (v: string | null | undefined): v is string => typeof v === "string" && v.trim() !== ""
const providerRank = (p: NameplateProvider) => NAMEPLATE_PROVIDER_ORDER.indexOf(p)

export function buildNameplateConsensus(
    results: readonly NameplateProviderResult[],
    opts: { makers?: readonly string[]; now?: Date } = {},
): NameplateConsensus {
    const answered = results
        .filter((r): r is NameplateProviderResult & { reading: NameplateReading } => r.ok && r.reading !== null)
        .sort((a, b) => providerRank(a.provider) - providerRank(b.provider))

    const fields = {} as Record<NameplateFieldKey, NameplateFieldConsensus>
    for (const f of NAMEPLATE_FIELDS) {
        const groups = new Map<string, { value: string; providers: NameplateProvider[]; low: boolean }>()
        for (const r of answered) {
            const fr = r.reading.fields[f.key]
            if (!fr || fr.legibility !== "clear" || !present(fr.value)) continue
            const value = fr.value.trim()
            const key = nameplateVoteKey(f.key, value)
            const g = groups.get(key)
            if (g) {
                g.providers.push(r.provider)
                g.low ||= fr.certainty === "low"
            } else {
                groups.set(key, { value, providers: [r.provider], low: fr.certainty === "low" })
            }
        }
        const sorted = [...groups.values()].sort(
            (a, b) => b.providers.length - a.providers.length || providerRank(a.providers[0]) - providerRank(b.providers[0]),
        )
        const top = sorted[0]
        const others = sorted.slice(1).reduce((n, g) => n + g.providers.length, 0)
        const status: NameplateFieldStatus = !top || top.providers.length < 2 ? "none" : others === 0 ? "agreed" : "split"
        fields[f.key] = {
            value: status === "none" ? null : top.value,
            status,
            candidates: sorted.map((g) => ({ value: g.value, providers: g.providers })),
            warning: status !== "none" && (top.low || status === "split"),
        }
    }

    // 機器の種類も多数決（そろわなければ「その他」）
    const kinds = new Map<string, number>()
    for (const r of answered) kinds.set(r.reading.device_kind, (kinds.get(r.reading.device_kind) ?? 0) + 1)
    const [bestKind, bestCount] = [...kinds.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["その他", 0]
    const tie = [...kinds.values()].filter((n) => n === bestCount).length > 1
    const device_kind: NameplateDeviceKind =
        bestCount >= 2 && !tie && (NAMEPLATE_DEVICE_KINDS as readonly string[]).includes(bestKind)
            ? (bestKind as NameplateDeviceKind)
            : "その他"

    // 形の確かめは、多数決の結果に対して行う
    const merged: NameplateReading = {
        device_kind,
        fields: Object.fromEntries(
            NAMEPLATE_FIELDS.map((f) => [
                f.key,
                {
                    value: fields[f.key].value,
                    legibility: fields[f.key].value === null ? "absent" : "clear",
                    certainty: "high",
                },
            ]),
        ) as NameplateReading["fields"],
    }
    const warnings = checkNameplateReading(merged, { makers: opts.makers, now: opts.now })
    for (const f of NAMEPLATE_FIELDS) {
        if (warnings.some((w) => w.startsWith(`${f.label}:`))) fields[f.key].warning = true
    }

    return { device_kind, fields, warnings, voters: answered.length }
}

/**
 * 点検者が入れた値（正解）と、各社の答えの当たり外れ。★失敗した会社は入れない（数えない）
 * ★採点するのは finalValues に入っている欄だけ（画面に出して点検者が確かめた欄）。
 *   出していない欄まで「空＝正解」として採点すると、読めた会社が「作った（fabricated）」に数えられてしまう
 */
export function nameplateOutcomes(
    results: readonly NameplateProviderResult[],
    finalValues: Partial<Record<NameplateFieldKey, string | null>>,
): Partial<Record<NameplateProvider, Partial<Record<NameplateFieldKey, NameplateVerdict>>>> {
    const out: Partial<Record<NameplateProvider, Partial<Record<NameplateFieldKey, NameplateVerdict>>>> = {}
    for (const r of results) {
        if (!r.ok || r.reading === null) continue
        const reading = r.reading
        out[r.provider] = Object.fromEntries(
            NAMEPLATE_FIELDS.filter((f) => Object.hasOwn(finalValues, f.key)).map((f) => {
                const fr = reading.fields[f.key]
                const got = fr && fr.legibility === "clear" && present(fr.value) ? fr.value : null
                return [f.key, judgeNameplateField(finalValues[f.key] ?? null, got)]
            }),
        ) as Partial<Record<NameplateFieldKey, NameplateVerdict>>
    }
    return out
}

/** 様式の「型式等」の欄に入れる形（型式（型式番号）・転記の Q2） */
export function deviceModelText(model: string | null | undefined, approval: string | null | undefined): string {
    const m = present(model) ? model.trim() : ""
    const a = present(approval) ? approval.trim() : ""
    if (m && a) return `${m}（${a}）`
    return m || a
}
