/**
 * 消火器の台帳（業者の物件ごと・inspection.extinguisher_groups）と、年数の決まり（2026-10-30）。
 *
 * ■ なぜ要るか（docs/消火器の台帳_現状と設計案_20261030.md 案 A）
 *   消火器は 1 本ずつ製造年が違い、製造年で「耐圧性能点検」「内部・機能の点検」の対象と交換の目安が決まる。
 *   第1 の点検票には製造年の欄が無く、業者が毎回現地で数えていた。物件ごとに 1 回入れれば年をまたいで残る。
 *
 * ■ 決まり
 *   ・1 行 ＝ 同じ器種・方式・型式・製造年の組と本数（Q2）
 *   ・★年数の決まりは下の EXTINGUISHER_RULES の 1 か所だけ（DB には置かない）。
 *     ★2026-10-30 時点は公開の資料で確かめた値。橋本さんが条文（点検基準・点検要領）で確かめてから DB を当てる（Q3）
 *   ・内部・機能の点検は「対象になる行」を出すだけ。抜き取りの数は業者が決める
 *   ・交換の目安（設計標準使用期限）は法令ではない。「目安」と書き、「使えない」とは書かない
 *
 * ★この file は実行時の import を持たない（vitest と画面の両方から読む）。
 */

// ---- 器種と方式 ---------------------------------------------------------

/** 第1 の点検票の種別の記号（★アルファベット順ではない。A 粉末 … F 水・shokaki-bekki1-form と同じ） */
export type ExtinguisherKind = "A" | "B" | "C" | "D" | "E" | "F"

export const EXTINGUISHER_KINDS: { key: ExtinguisherKind; label: string }[] = [
    { key: "A", label: "粉末" },
    { key: "B", label: "泡" },
    { key: "C", label: "強化液" },
    { key: "D", label: "二酸化炭素" },
    { key: "E", label: "ハロゲン化物" },
    { key: "F", label: "水" },
]

export type Pressurization = "pressurized" | "stored" | "chemical" | "unknown"

export const PRESSURIZATIONS: { key: Pressurization; label: string }[] = [
    { key: "stored", label: "蓄圧式" },
    { key: "pressurized", label: "加圧式" },
    { key: "chemical", label: "化学泡" },
    { key: "unknown", label: "わからない" },
]

export const kindLabel = (k: string) => EXTINGUISHER_KINDS.find((x) => x.key === k)?.label ?? k
export const pressurizationLabel = (p: string) => PRESSURIZATIONS.find((x) => x.key === p)?.label ?? p

// ---- 台帳の行 -----------------------------------------------------------

export type ExtinguisherGroup = {
    id: string
    property_id: string
    kind: ExtinguisherKind
    pressurization: Pressurization
    maker: string
    model: string
    approval_number: string
    manufactured_year: number | null
    quantity: number
    location: string
    last_pressure_test_year: number | null
    note: string
}

/** 読む列（★サーバの画面とブラウザで同じ） */
export const EXTINGUISHER_COLUMNS =
    "id, property_id, kind, pressurization, maker, model, approval_number, manufactured_year, quantity, location, last_pressure_test_year, note"

/** 登録・直す画面で入れる欄（id は DB が決める・user_id は DB の既定） */
export type ExtinguisherGroupInput = Omit<ExtinguisherGroup, "id">

export const EXTINGUISHER_TEXT_MAX = 60
export const EXTINGUISHER_LOCATION_MAX = 200
export const EXTINGUISHER_NOTE_MAX = 200
export const EXTINGUISHER_QUANTITY_MAX = 999

const isYear = (y: number) => Number.isInteger(y) && y >= 1950 && y <= 2100

/** 入れた値の確かめ（DB の制約と同じ＋今年より後の年は止める）。直すところを日本語で返す */
export function validateExtinguisherInput(v: ExtinguisherGroupInput, thisYear: number): string[] {
    const out: string[] = []
    if (!EXTINGUISHER_KINDS.some((k) => k.key === v.kind)) out.push("器種を選んでください")
    if (!PRESSURIZATIONS.some((p) => p.key === v.pressurization)) out.push("方式を選んでください")
    if (v.pressurization === "chemical" && v.kind !== "B") out.push("化学泡は器種が「泡」のときだけ選べます")
    for (const [label, value] of [["製造者名", v.maker], ["型式", v.model], ["型式番号", v.approval_number]] as const) {
        if (value.length > EXTINGUISHER_TEXT_MAX) out.push(`${label}は ${EXTINGUISHER_TEXT_MAX} 字までです`)
    }
    if (v.location.length > EXTINGUISHER_LOCATION_MAX) out.push(`設置場所は ${EXTINGUISHER_LOCATION_MAX} 字までです`)
    if (v.note.length > EXTINGUISHER_NOTE_MAX) out.push(`メモは ${EXTINGUISHER_NOTE_MAX} 字までです`)
    if (!Number.isInteger(v.quantity) || v.quantity < 1 || v.quantity > EXTINGUISHER_QUANTITY_MAX) {
        out.push(`本数は 1〜${EXTINGUISHER_QUANTITY_MAX} で入れてください`)
    }
    const made = v.manufactured_year
    if (made !== null && (!isYear(made) || made > thisYear)) out.push(`製造年は 1950〜${thisYear} の西暦で入れてください`)
    const tested = v.last_pressure_test_year
    if (tested !== null) {
        if (!isYear(tested) || tested > thisYear) out.push(`前回の耐圧性能点検の年は 1950〜${thisYear} の西暦で入れてください`)
        else if (made !== null && tested < made) out.push("前回の耐圧性能点検の年が製造年より前です")
    }
    return out
}

// ---- ★年数の決まり（要確認・ここ 1 か所） -------------------------------------

/**
 * ★2026-10-30 に公開の資料（消防庁・総務省・市の消防局の案内）で確かめた値。★条文での確かめは橋本さん（Q3）。
 *   耐圧性能点検: 製造年から 10 年を経過したもの。以後 3 年ごと。二酸化炭素・ハロゲン化物は除く
 *   内部・機能の点検: 加圧式は製造年から 3 年、蓄圧式は 5 年、化学泡は設置後 1 年を経過したもの
 *     （★二酸化炭素・ハロゲン化物は除く・要確認）
 *   交換の目安: 設計標準使用期限（業務用はおおむね 10 年・★メーカーの目安で法令ではない）
 */
export const EXTINGUISHER_RULES = {
    /**
     * 「製造年から N 年を経過」の数え方（★要確認）。
     *   reach  … 今年 − 製造年 ≥ N で対象（2016 年製は 2026 年から耐圧性能点検）
     *   exceed … 今年 − 製造年 > N で対象（2016 年製は 2027 年から）
     */
    counting: "reach" as "reach" | "exceed",
    pressureTestFirstYears: 10,
    pressureTestEveryYears: 3,
    internalYears: { pressurized: 3, stored: 5, chemical: 1 } as Record<Exclude<Pressurization, "unknown">, number>,
    replacementGuideYears: 10,
    /** 年数で耐圧性能点検・内部と機能の点検を求めない器種（二酸化炭素・ハロゲン化物＝高圧ガスの容器） */
    exemptKinds: ["D", "E"] as ExtinguisherKind[],
}

/** base 年から n 年を経過して対象になる最初の年 */
export function yearReached(base: number, n: number, counting: "reach" | "exceed" = EXTINGUISHER_RULES.counting): number {
    return base + n + (counting === "exceed" ? 1 : 0)
}

export type Duty =
    /** この点検で対象 */
    | { state: "due"; reason: string }
    /** まだ（fromYear 年から） */
    | { state: "later"; fromYear: number; reason: string }
    /** 年数では求めない（二酸化炭素・ハロゲン化物） */
    | { state: "exempt"; reason: string }
    /** 製造年・方式が無くて分からない */
    | { state: "unknown"; reason: string }

type DutyInput = Pick<ExtinguisherGroup, "kind" | "pressurization" | "manufactured_year" | "last_pressure_test_year">

const EXEMPT_REASON = "二酸化炭素・ハロゲン化物は年数では求めない"

/** 耐圧性能点検（今年の点検で対象か） */
export function pressureTestDuty(g: DutyInput, thisYear: number, rules = EXTINGUISHER_RULES): Duty {
    if (rules.exemptKinds.includes(g.kind)) return { state: "exempt", reason: EXEMPT_REASON }
    if (g.manufactured_year === null) return { state: "unknown", reason: "製造年を入れると分かります" }
    const first = yearReached(g.manufactured_year, rules.pressureTestFirstYears, rules.counting)
    // ★前回の年があれば 3 年ごと。ただし製造年から 10 年より前には戻らない（腐食などで早めに行った分）
    if (g.last_pressure_test_year !== null) {
        const next = Math.max(first, yearReached(g.last_pressure_test_year, rules.pressureTestEveryYears, rules.counting))
        return thisYear >= next
            ? { state: "due", reason: `前回 ${g.last_pressure_test_year} 年から ${rules.pressureTestEveryYears} 年` }
            : { state: "later", fromYear: next, reason: `前回 ${g.last_pressure_test_year} 年・次は ${next} 年` }
    }
    return thisYear >= first
        ? { state: "due", reason: `製造年から ${rules.pressureTestFirstYears} 年（前回の年が入っていません）` }
        : { state: "later", fromYear: first, reason: `製造年から ${rules.pressureTestFirstYears} 年・${first} 年から` }
}

/** 内部・機能の点検（今年の点検で対象か。★抜き取りの数は業者が決める） */
export function internalCheckDuty(g: DutyInput, thisYear: number, rules = EXTINGUISHER_RULES): Duty {
    if (rules.exemptKinds.includes(g.kind)) return { state: "exempt", reason: EXEMPT_REASON }
    if (g.manufactured_year === null) return { state: "unknown", reason: "製造年を入れると分かります" }
    const made = g.manufactured_year
    if (g.pressurization === "unknown") {
        // ★方式が分からなくても、どちらでも同じ答えになる年は言い切る
        const pFrom = yearReached(made, rules.internalYears.pressurized, rules.counting)
        const sFrom = yearReached(made, rules.internalYears.stored, rules.counting)
        if (thisYear >= Math.max(pFrom, sFrom)) return { state: "due", reason: "加圧式でも蓄圧式でも対象" }
        if (thisYear < Math.min(pFrom, sFrom)) {
            return { state: "later", fromYear: Math.min(pFrom, sFrom), reason: `加圧式なら ${pFrom} 年から・蓄圧式なら ${sFrom} 年から` }
        }
        return { state: "unknown", reason: `加圧式なら対象・蓄圧式なら ${sFrom} 年から（方式を入れると分かります）` }
    }
    const n = rules.internalYears[g.pressurization]
    const from = yearReached(made, n, rules.counting)
    // ★化学泡は「設置後 1 年」。台帳に設置年は無いので製造年で数える（★設置が遅いと早めに出る）
    const what = g.pressurization === "chemical" ? `化学泡は設置後 ${n} 年（製造年で数えています）` : `${pressurizationLabel(g.pressurization)}は製造年から ${n} 年`
    return thisYear >= from ? { state: "due", reason: what } : { state: "later", fromYear: from, reason: `${what}・${from} 年から` }
}

export type ReplacementGuide = { state: "unknown" } | { state: "ok" | "this_year" | "past"; year: number }

/** 交換の目安（★法令ではない。製造年 ＋ 10 年の年まで） */
export function replacementGuide(g: Pick<ExtinguisherGroup, "manufactured_year">, thisYear: number, rules = EXTINGUISHER_RULES): ReplacementGuide {
    if (g.manufactured_year === null) return { state: "unknown" }
    const year = g.manufactured_year + rules.replacementGuideYears
    return { state: thisYear > year ? "past" : thisYear === year ? "this_year" : "ok", year }
}

// ---- まとめ ---------------------------------------------------------------

export type LedgerSummary = {
    /** 本数の合計 */
    total: number
    /** 器種ごとの本数（第1 の点検票の「設置数」の候補・案 B） */
    byKind: Record<ExtinguisherKind, number>
    pressureTestDue: number
    internalCheckDue: number
    /** 方式が分からず内部・機能の点検の対象か決まらない本数 */
    internalCheckUnknown: number
    replacementPast: number
    /** 製造年が無い本数 */
    noYear: number
}

export function summarizeLedger(
    groups: readonly (DutyInput & Pick<ExtinguisherGroup, "quantity">)[],
    thisYear: number,
    rules = EXTINGUISHER_RULES,
): LedgerSummary {
    const byKind: Record<ExtinguisherKind, number> = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 }
    const s: LedgerSummary = { total: 0, byKind, pressureTestDue: 0, internalCheckDue: 0, internalCheckUnknown: 0, replacementPast: 0, noYear: 0 }
    for (const g of groups) {
        s.total += g.quantity
        byKind[g.kind] += g.quantity
        if (g.manufactured_year === null) {
            s.noYear += g.quantity
            continue
        }
        if (pressureTestDuty(g, thisYear, rules).state === "due") s.pressureTestDue += g.quantity
        const internal = internalCheckDuty(g, thisYear, rules).state
        if (internal === "due") s.internalCheckDue += g.quantity
        else if (internal === "unknown") s.internalCheckUnknown += g.quantity
        if (replacementGuide(g, thisYear, rules).state === "past") s.replacementPast += g.quantity
    }
    return s
}
