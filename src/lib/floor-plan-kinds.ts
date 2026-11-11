/**
 * 見取り図の印（設備の種類）と階の並び（地図などの改善 6・2026-11-11）。
 *
 * ■ なぜ要るか
 *   使うのは現場の職人さん（作業しながら）。建物の中で消火器・感知器などの場所を探す手間をなくす。
 *   階を選ぶ → 見取り図を撮る → 設備のボタンを選んで図をタップ。★字は打たない。
 * ■ ★種類の記号は DB の決まり（20261231170000 の floor_plan_pins.kind）と同じ。足すときは DB も直す
 * ■ 印は色＋1〜2 字（写真の上で見分けられるように・色だけに頼らない）
 */

export type FloorPlanKind =
    | "extinguisher"
    | "hydrant"
    | "detector"
    | "manual_station"
    | "receiver"
    | "bell"
    | "exit_light"
    | "escape"
    | "sprinkler_valve"
    | "siamese"
    | "outlet"
    | "other"

export type FloorPlanKindInfo = {
    key: FloorPlanKind
    /** ボタンの言葉（短く） */
    label: string
    /** 印の中の字（1〜2 字） */
    mark: string
    /** 印の色（Tailwind の bg） */
    bg: string
    /** この物件の設備にこれがあれば、最初から出す（src/lib/equipment-config.ts の名前） */
    equipment: readonly string[]
}

export const FLOOR_PLAN_KINDS: readonly FloorPlanKindInfo[] = [
    { key: "extinguisher", label: "消火器", mark: "消", bg: "bg-red-600", equipment: ["消火器"] },
    { key: "hydrant", label: "消火栓", mark: "栓", bg: "bg-rose-800", equipment: ["屋内消火栓設備", "屋外消火栓設備"] },
    { key: "detector", label: "感知器", mark: "感", bg: "bg-orange-500", equipment: ["自動火災報知設備"] },
    { key: "manual_station", label: "発信機", mark: "発", bg: "bg-amber-600", equipment: ["自動火災報知設備"] },
    { key: "receiver", label: "受信機", mark: "受", bg: "bg-violet-600", equipment: ["自動火災報知設備", "ガス漏れ火災警報設備", "漏電火災警報器"] },
    { key: "bell", label: "非常ベル", mark: "ベ", bg: "bg-pink-600", equipment: ["非常警報器具・設備"] },
    { key: "exit_light", label: "誘導灯", mark: "誘", bg: "bg-green-600", equipment: ["誘導灯及び誘導標識"] },
    { key: "escape", label: "避難器具", mark: "避", bg: "bg-teal-600", equipment: ["避難器具"] },
    { key: "sprinkler_valve", label: "SPの弁", mark: "SP", bg: "bg-blue-600", equipment: ["スプリンクラー設備", "水噴霧消火設備", "泡消火設備", "連結散水設備"] },
    { key: "siamese", label: "送水口", mark: "送", bg: "bg-sky-600", equipment: ["連結送水管", "連結散水設備", "スプリンクラー設備"] },
    { key: "outlet", label: "コンセント", mark: "コ", bg: "bg-slate-600", equipment: ["非常コンセント設備"] },
    { key: "other", label: "その他", mark: "他", bg: "bg-slate-800", equipment: [] },
]

export const KIND_BY_KEY: Record<FloorPlanKind, FloorPlanKindInfo> = Object.fromEntries(
    FLOOR_PLAN_KINDS.map((k) => [k.key, k]),
) as Record<FloorPlanKind, FloorPlanKindInfo>

export const isFloorPlanKind = (v: unknown): v is FloorPlanKind => typeof v === "string" && v in KIND_BY_KEY

/**
 * 最初から出すボタン（この物件の設備に合うもの＋その他）と、「ほか」で開くボタン。
 * ★設備が登録されていなければ全部を最初から出す
 */
export function kindsFor(equipmentTypes: readonly string[] | null | undefined): { main: FloorPlanKindInfo[]; more: FloorPlanKindInfo[] } {
    const have = new Set(equipmentTypes ?? [])
    if (have.size === 0) return { main: [...FLOOR_PLAN_KINDS], more: [] }
    const main = FLOOR_PLAN_KINDS.filter((k) => k.key === "other" || k.equipment.some((e) => have.has(e)))
    const more = FLOOR_PLAN_KINDS.filter((k) => !main.includes(k))
    return { main, more }
}

/** DB の階の書き方（B9〜B1・1F〜999F・R・20261231170000 と同じ） */
export const FLOOR_RE = /^(B[1-9]|[1-9][0-9]{0,2}F|R)$/

/** 階の並び（地下の深い所 → 地上 → 屋上）。並べ替えの値 */
export function floorOrder(floor: string): number {
    if (floor === "R") return 10_000
    const b = /^B([1-9])$/.exec(floor)
    if (b) return -Number(b[1])
    const f = /^([1-9][0-9]{0,2})F$/.exec(floor)
    return f ? Number(f[1]) : 0
}

/**
 * 物件の階数から階のボタンを作る（地下 → 1F → … → R）。
 * ★階数が入っていなければ 1F だけ（＋R）。見取り図がある階は階数の外でも出す（階数を直したときに消えないように）
 */
export function floorsFor(floorAbove: number | null | undefined, floorBelow: number | null | undefined, existing: readonly string[] = []): string[] {
    const above = Math.min(Math.max(Number(floorAbove) || 1, 1), 999)
    const below = Math.min(Math.max(Number(floorBelow) || 0, 0), 9)
    const out = new Set<string>()
    for (let n = below; n >= 1; n -= 1) out.add(`B${n}`)
    for (let n = 1; n <= above; n += 1) out.add(`${n}F`)
    out.add("R")
    for (const f of existing) if (FLOOR_RE.test(f)) out.add(f)
    return [...out].sort((a, b) => floorOrder(a) - floorOrder(b))
}

/** 写真の置き場の名前（★DB の決まり: <会社 ID>/<物件 ID>/… だけ） */
export function floorPlanPath(companyId: string, propertyId: string, floor: string, id: string): string {
    return `${companyId}/${propertyId}/${floor}-${id}.jpg`
}

/** 図の中の位置（0〜1）にそろえる */
export const clamp01 = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0))

/** 種類ごとの数 */
export function countByKind(pins: readonly { kind: string }[]): Partial<Record<FloorPlanKind, number>> {
    const out: Partial<Record<FloorPlanKind, number>> = {}
    for (const p of pins) if (isFloorPlanKind(p.kind)) out[p.kind] = (out[p.kind] ?? 0) + 1
    return out
}
