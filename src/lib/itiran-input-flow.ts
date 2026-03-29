export type ItiranInputStepId =
    | "shokaki"
    | "leakage-fire-alarm"
    | "fire-department-notification"
    | "emergency-alarm"
    | "evacuation-equipment"
    | "guidance-lights-signs"
    | "fire-water"
    | "smoke-control"
    | "connected-sprinkler"
    | "standpipe"
    | "emergency-power-outlet"
    | "radio-communication-support"
    | "shokasen"
    | "sprinkler"
    | "water-spray"
    | "foam"
    | "inert-gas"
    | "halogen"
    | "powder"
    | "okugai-shokasen"
    | "doryoku-pump"
    | "jidou-kasai-houchi"
    | "gas-leak-fire-alarm"

type ItiranInputStep = {
    id: ItiranInputStepId
    routeSegment: string
    equipmentKeyword: string
    title: string
}

const STEPS: readonly ItiranInputStep[] = [
    { id: "shokaki", routeSegment: "shokaki", equipmentKeyword: "消火器", title: "消火器点検票（別記様式1）" },
    { id: "leakage-fire-alarm", routeSegment: "leakage-fire-alarm", equipmentKeyword: "漏電火災警報器", title: "漏電火災警報器点検票（別記様式12）" },
    { id: "fire-department-notification", routeSegment: "fire-department-notification", equipmentKeyword: "消防機関へ通報する火災報知設備", title: "消防機関へ通報する火災報知設備点検票（別記様式13）" },
    { id: "emergency-alarm", routeSegment: "emergency-alarm", equipmentKeyword: "非常警報器具", title: "非常警報器具及び設備点検票（別記様式14）" },
    { id: "evacuation-equipment", routeSegment: "evacuation-equipment", equipmentKeyword: "避難器具", title: "避難器具点検票（別記様式15）" },
    { id: "guidance-lights-signs", routeSegment: "guidance-lights-signs", equipmentKeyword: "誘導灯及び誘導標識", title: "誘導灯及び誘導標識点検票（別記様式16）" },
    { id: "fire-water", routeSegment: "fire-water", equipmentKeyword: "消防用水", title: "消防用水点検票（別記様式17）" },
    { id: "smoke-control", routeSegment: "smoke-control", equipmentKeyword: "排煙設備", title: "排煙設備点検票（別記様式18）" },
    { id: "connected-sprinkler", routeSegment: "connected-sprinkler", equipmentKeyword: "連結散水設備", title: "連結散水設備点検票（別記様式19）" },
    { id: "standpipe", routeSegment: "standpipe", equipmentKeyword: "連結送水管", title: "連結送水管点検票（別記様式20）" },
    { id: "emergency-power-outlet", routeSegment: "emergency-power-outlet", equipmentKeyword: "非常コンセント設備", title: "非常コンセント設備点検票（別記様式21）" },
    { id: "radio-communication-support", routeSegment: "radio-communication-support", equipmentKeyword: "無線通信補助設備", title: "無線通信補助設備点検票（別記様式22）" },
    { id: "shokasen", routeSegment: "shokasen", equipmentKeyword: "屋内消火栓設備", title: "屋内消火栓設備点検票（別記様式2）" },
    { id: "sprinkler", routeSegment: "sprinkler", equipmentKeyword: "スプリンクラー設備", title: "スプリンクラー設備点検票（別記様式3）" },
    { id: "water-spray", routeSegment: "water-spray", equipmentKeyword: "水噴霧消火設備", title: "水噴霧消火設備点検票（別記様式4）" },
    { id: "foam", routeSegment: "foam", equipmentKeyword: "泡消火設備", title: "泡消火設備点検票（別記様式5）" },
    { id: "inert-gas", routeSegment: "inert-gas", equipmentKeyword: "不活性ガス消火設備", title: "不活性ガス消火設備点検票（別記様式6）" },
    { id: "halogen", routeSegment: "halogen", equipmentKeyword: "ハロゲン化物消火設備", title: "ハロゲン化物消火設備点検票（別記様式7）" },
    { id: "powder", routeSegment: "powder", equipmentKeyword: "粉末消火設備", title: "粉末消火設備点検票（別記様式8）" },
    { id: "okugai-shokasen", routeSegment: "okugai-shokasen", equipmentKeyword: "屋外消火栓設備", title: "屋外消火栓設備点検票（別記様式9）" },
    { id: "doryoku-pump", routeSegment: "doryoku-pump", equipmentKeyword: "動力消防ポンプ設備", title: "動力消防ポンプ設備点検票（別記様式10）" },
    { id: "jidou-kasai-houchi", routeSegment: "jidou-kasai-houchi", equipmentKeyword: "自動火災報知設備", title: "自動火災報知設備点検票（別記様式11の1）" },
    { id: "gas-leak-fire-alarm", routeSegment: "gas-leak-fire-alarm", equipmentKeyword: "ガス漏れ火災警報設備", title: "ガス漏れ火災警報設備点検票（別記様式11の2）" },
]

const includesKeyword = (value: unknown, keyword: string) =>
    Array.isArray(value) && value.some((item) => String(item ?? "").includes(keyword))

const getStep = (id: ItiranInputStepId) => {
    const step = STEPS.find((v) => v.id === id)
    if (!step) throw new Error(`Unknown itiran input step: ${id}`)
    return step
}

export const selectedSteps = (equipmentTypes: unknown) => STEPS.filter((step) => includesKeyword(equipmentTypes, step.equipmentKeyword))

export const hasItiranInputStep = (id: ItiranInputStepId, equipmentTypes: unknown) =>
    includesKeyword(equipmentTypes, getStep(id).equipmentKeyword)

export const getNextItiranInputStep = (currentId: ItiranInputStepId | null, equipmentTypes: unknown): ItiranInputStepId | null => {
    const steps = selectedSteps(equipmentTypes)
    if (steps.length === 0) return null
    if (currentId === null) return steps[0]?.id ?? null
    const idx = steps.findIndex((step) => step.id === currentId)
    if (idx < 0) return steps[0]?.id ?? null
    return steps[idx + 1]?.id ?? null
}

export const getPrevItiranInputStep = (currentId: ItiranInputStepId, equipmentTypes: unknown): ItiranInputStepId | null => {
    const steps = selectedSteps(equipmentTypes)
    const idx = steps.findIndex((step) => step.id === currentId)
    if (idx <= 0) return null
    return steps[idx - 1]?.id ?? null
}

export const buildItiranInputHref = (stepId: ItiranInputStepId, soukatsuId: string, itiranId: string) => {
    const step = getStep(stepId)
    return `/inspection/${soukatsuId}/itiran/${itiranId}/${step.routeSegment}`
}

export const getItiranInputPageTitle = (stepId: ItiranInputStepId) => getStep(stepId).title

export const getItiranInputBackLabel = (stepId: ItiranInputStepId) =>
    `${getStep(stepId).title} に戻る`

export const getItiranInputNextLabel = (stepId: ItiranInputStepId) =>
    `次へ: ${getStep(stepId).title}を入力`
