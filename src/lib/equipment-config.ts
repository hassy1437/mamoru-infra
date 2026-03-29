export const ALL_EQUIPMENT_TYPES = [
    "消火器",
    "屋内消火栓設備",
    "スプリンクラー設備",
    "水噴霧消火設備",
    "泡消火設備",
    "不活性ガス消火設備",
    "ハロゲン化物消火設備",
    "粉末消火設備",
    "屋外消火栓設備",
    "動力消防ポンプ設備",
    "自動火災報知設備",
    "ガス漏れ火災警報設備",
    "漏電火災警報器",
    "消防機関へ通報する火災報知設備",
    "非常警報器具・設備",
    "避難器具",
    "誘導灯・誘導標識",
    "消防用水",
    "排煙設備",
    "連結散水設備",
    "連結送水管",
    "非常コンセント設備",
    "無線通信補助設備",
] as const

export type EquipmentType = (typeof ALL_EQUIPMENT_TYPES)[number]

const DEFAULT_ENABLED: readonly string[] = [
    "消火器",
    "避難器具",
    "屋内消火栓設備",
    "自動火災報知設備",
    "誘導灯・誘導標識",
    "スプリンクラー設備",
    "連結送水管",
]

const STORAGE_KEY = "enabled_equipment_types"

export function getEnabledEquipmentTypes(): string[] {
    if (typeof window === "undefined") return [...DEFAULT_ENABLED]
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return [...DEFAULT_ENABLED]
    try {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) return parsed
    } catch {
        // ignore
    }
    return [...DEFAULT_ENABLED]
}

export function setEnabledEquipmentTypes(types: string[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(types))
}

export function resetEnabledEquipmentTypes() {
    localStorage.removeItem(STORAGE_KEY)
}
