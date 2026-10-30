/**
 * 測定機器の台帳（業者ごと・inspection.measuring_instruments）と、様式の測定機器の表へ写す決まり（2026-10-30）。
 *
 * ■ なぜ要るか（docs/銘板の転記_全様式_現状と設計案_20261030.md 案 A）
 *   点検票（別記 23 様式）にはどれも測定機器の表があるのに、報告書ごと・様式ごとに打ち直していた。
 *   業者が台帳に 1 回だけ登録し、様式では「台帳から選ぶ」で写す。
 *
 * ■ 決まり
 *   ・写すだけ。様式の中身は報告書の記録なので、台帳を直しても過去の報告書は変わらない
 *   ・同じ機器（機器名・型式・製造者名が同じ）がもう入っていれば入れない（2 回押しても増えない）
 *   ・11の1・11の2 は紙に機器名が刷り込んである。同じ名前の刷り込みの行が空いていればそこへ、無ければ空欄の行へ名前ごと
 *   ・ほかの様式（plain）は画面に出る順（紙の行ごとに左 → 右）で空いている行へ
 *   ・校正の周期は業者が機器ごとに入れる。周期が無ければ黄色にしない（こちらで決まった年数を置かない）
 *   ・★校正が古くても止めない（黄色にするだけ・Q5）
 *
 * ★この file は実行時の import を型だけにする（vitest と画面の両方から読む）。
 */
import {
    DEVICE_TABLE_PRINTED,
    DEVICE_TABLE_ROWS_PER_COLUMN,
    type DeviceTableKind,
    type DeviceTableRow,
} from "@/lib/bekki-device-table"

export type MeasuringInstrument = {
    id: string
    name: string
    model: string
    maker: string
    serial_number: string
    /** yyyy-MM-dd（DB は date） */
    calibrated_at: string | null
    /** 校正の周期（月）。null なら期限を見ない */
    calibration_months: number | null
    note: string
}

/** 読む列（★サーバの画面と、ブラウザの「台帳から選ぶ」で同じ） */
export const INSTRUMENT_COLUMNS = "id, name, model, maker, serial_number, calibrated_at, calibration_months, note"

/** 登録・直す画面で入れる欄（id は DB が決める） */
export type MeasuringInstrumentInput = Omit<MeasuringInstrument, "id">

export const INSTRUMENT_TEXT_MAX = 60
export const INSTRUMENT_NOTE_MAX = 200

/** 入れた値の確かめ（DB の制約と同じ）。直すところを日本語で返す */
export function validateInstrumentInput(v: MeasuringInstrumentInput): string[] {
    const out: string[] = []
    if (v.name.trim() === "") out.push("機器名を入れてください")
    for (const [label, value] of [["機器名", v.name], ["型式", v.model], ["製造者名", v.maker], ["製造番号", v.serial_number]] as const) {
        if (value.length > INSTRUMENT_TEXT_MAX) out.push(`${label}は ${INSTRUMENT_TEXT_MAX} 字までです`)
    }
    if (v.note.length > INSTRUMENT_NOTE_MAX) out.push(`メモは ${INSTRUMENT_NOTE_MAX} 字までです`)
    if (v.calibration_months !== null && (!Number.isInteger(v.calibration_months) || v.calibration_months < 1 || v.calibration_months > 120)) {
        out.push("校正の周期は 1〜120 か月で入れてください")
    }
    if (v.calibrated_at !== null && !/^\d{4}-\d{2}-\d{2}$/.test(v.calibrated_at)) out.push("校正年月日の形が違います")
    return out
}

// ---- 校正の期限 -------------------------------------------------------

export type CalibrationState = "unknown" | "ok" | "soon" | "overdue"

/** まもなく（黄色の手前）とする日数 */
export const CALIBRATION_SOON_DAYS = 30

function parseYmd(s: string | null | undefined): Date | null {
    const m = String(s ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!m) return null
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
    return Number.isNaN(d.getTime()) ? null : d
}

const ymd = (d: Date) => d.toISOString().slice(0, 10)

/** 月を足す（★月末は月末に寄せる: 1/31 + 1 か月 = 2/28 か 2/29） */
function addMonths(d: Date, months: number): Date {
    const y = d.getUTCFullYear()
    const m = d.getUTCMonth() + months
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
    return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), last)))
}

/**
 * 校正の期限の状態。today は yyyy-MM-dd（日本時間の今日・jstTodayYmd）。
 *   unknown … 校正年月日か周期が無い（黄色にしない）
 *   ok / soon（期限まで 30 日以内）/ overdue（期限を過ぎた）
 */
export function calibrationStatus(
    calibratedAt: string | null | undefined,
    months: number | null | undefined,
    today: string,
): { state: CalibrationState; due: string | null } {
    const at = parseYmd(calibratedAt)
    const now = parseYmd(today)
    if (!at || !now || !months || months < 1) return { state: "unknown", due: null }
    const due = addMonths(at, months)
    const days = Math.round((due.getTime() - now.getTime()) / 86_400_000)
    return { state: days < 0 ? "overdue" : days <= CALIBRATION_SOON_DAYS ? "soon" : "ok", due: ymd(due) }
}

// ---- 様式の表へ写す ------------------------------------------------------

const norm = (s: string) => s.normalize("NFKC").replace(/\s+/g, "").toUpperCase()
const blank = (s: string) => s.trim() === ""

/** 表の行と台帳の機器が同じ機器か（機器名・型式・製造者名。幅・空白・大文字小文字は無視） */
export function sameInstrument(row: Pick<DeviceTableRow, "name" | "model" | "maker">, inst: Pick<MeasuringInstrument, "name" | "model" | "maker">): boolean {
    return norm(row.name) === norm(inst.name) && norm(row.model) === norm(inst.model) && norm(row.maker) === norm(inst.maker)
}

/** 表の行に合う台帳の機器（無ければ null） */
export function findInstrumentForRow(row: DeviceTableRow, instruments: readonly MeasuringInstrument[]): MeasuringInstrument | null {
    if (blank(row.name) && blank(row.model) && blank(row.maker)) return null
    return instruments.find((i) => sameInstrument(row, i)) ?? null
}

export function toDeviceRow(inst: MeasuringInstrument): DeviceTableRow {
    return { name: inst.name, model: inst.model, calibrated_at: inst.calibrated_at ?? "", maker: inst.maker }
}

/** 空いている行の並び（画面に出る順）。plain は紙の行ごとに左 → 右、刷り込みのある表は上から */
function slotOrder(kind: DeviceTableKind, length: number): number[] {
    if (kind !== "plain") return Array.from({ length }, (_, i) => i)
    const per = DEVICE_TABLE_ROWS_PER_COLUMN[kind]
    return Array.from({ length: per }, (_, line) => [line, per + line]).flat().filter((i) => i < length)
}

export type PlaceResult = {
    rows: DeviceTableRow[]
    /** 入れた機器 */
    placed: MeasuringInstrument[]
    /** もう入っていた機器 */
    already: MeasuringInstrument[]
    /** 空いている行が無くて入れられなかった機器 */
    noRoom: MeasuringInstrument[]
}

/**
 * 台帳の機器を表に写す（★元の rows は変えない）。
 * ★入っている行は上書きしない（人が手で入れた値を消さない）。
 */
export function placeInstruments(kind: DeviceTableKind, rows: readonly DeviceTableRow[], instruments: readonly MeasuringInstrument[]): PlaceResult {
    const printed = DEVICE_TABLE_PRINTED[kind]
    const next = rows.map((r) => ({ ...r }))
    const result: PlaceResult = { rows: next, placed: [], already: [], noRoom: [] }
    const emptyPrinted = (i: number) => blank(next[i].model) && blank(next[i].calibrated_at) && blank(next[i].maker)
    const emptyFree = (i: number) => emptyPrinted(i) && blank(next[i].name)

    for (const inst of instruments) {
        if (next.some((r) => sameInstrument(r, inst))) {
            result.already.push(inst)
            continue
        }
        // 刷り込みの行（同じ機器名・まだ空いている）
        let at = printed.findIndex((p, i) => p !== null && i < next.length && norm(p) === norm(inst.name) && emptyPrinted(i))
        if (at < 0) at = slotOrder(kind, next.length).find((i) => printed[i] === null && emptyFree(i)) ?? -1
        if (at < 0) {
            result.noRoom.push(inst)
            continue
        }
        // ★刷り込みの行の名前は紙のまま（resolveDeviceTable と同じ）
        next[at] = { ...toDeviceRow(inst), name: printed[at] ?? inst.name }
        result.placed.push(inst)
    }
    return result
}

/** placeInstruments の結果を、画面の onChange（行・欄・値）の呼び出しに直す（変わった欄だけ） */
export function rowChanges(before: readonly DeviceTableRow[], after: readonly DeviceTableRow[]): { index: number; field: keyof DeviceTableRow; value: string }[] {
    const out: { index: number; field: keyof DeviceTableRow; value: string }[] = []
    after.forEach((row, index) => {
        for (const field of ["name", "model", "calibrated_at", "maker"] as const) {
            if (row[field] !== before[index]?.[field]) out.push({ index, field, value: row[field] })
        }
    })
    return out
}
