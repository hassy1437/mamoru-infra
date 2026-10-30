import { describe, expect, it } from "vitest"

import { emptyDeviceTable } from "@/lib/bekki-device-table"
import {
    calibrationStatus,
    findInstrumentForRow,
    placeInstruments,
    rowChanges,
    validateInstrumentInput,
    type MeasuringInstrument,
} from "@/lib/measuring-instruments"

const inst = (name: string, model = "", maker = "", extra: Partial<MeasuringInstrument> = {}): MeasuringInstrument => ({
    id: `${name}-${model}`, name, model, maker, serial_number: "", calibrated_at: "2026-04-01", calibration_months: 12, note: "", ...extra,
})

describe("calibrationStatus", () => {
    it("周期と校正年月日から期限を出す", () => {
        expect(calibrationStatus("2026-04-01", 12, "2026-10-30")).toEqual({ state: "ok", due: "2027-04-01" })
    })
    it("期限まで 30 日以内はまもなく・過ぎたら過ぎた", () => {
        expect(calibrationStatus("2025-11-15", 12, "2026-10-30").state).toBe("soon")
        expect(calibrationStatus("2025-11-29", 12, "2026-10-30").state).toBe("soon")
        expect(calibrationStatus("2025-12-01", 12, "2026-10-30").state).toBe("ok")
        expect(calibrationStatus("2025-10-29", 12, "2026-10-30")).toEqual({ state: "overdue", due: "2026-10-29" })
        expect(calibrationStatus("2025-10-30", 12, "2026-10-30").state).toBe("soon") // 期限の当日はまだ過ぎていない
    })
    it("★月末は月末に寄せる（1/31 + 1 か月 = 2 月の末）", () => {
        expect(calibrationStatus("2026-01-31", 1, "2026-01-31").due).toBe("2026-02-28")
        expect(calibrationStatus("2028-01-31", 1, "2028-01-31").due).toBe("2028-02-29")
    })
    it("★周期か校正年月日が無ければ黄色にしない（こちらで年数を決めない）", () => {
        expect(calibrationStatus("2020-01-01", null, "2026-10-30").state).toBe("unknown")
        expect(calibrationStatus(null, 12, "2026-10-30").state).toBe("unknown")
        expect(calibrationStatus("令和2年4月", 12, "2026-10-30").state).toBe("unknown")
    })
})

describe("placeInstruments（plain＝ほかの 21 様式）", () => {
    it("画面に出る順（紙の行ごとに左 → 右）で空いている行へ", () => {
        const r = placeInstruments("plain", emptyDeviceTable("plain"), [inst("絶縁抵抗計", "IR4051", "日置電機"), inst("回路計", "CX06", "三和"), inst("圧力計")])
        // 左の列の 1 行目（0）→ 右の列の 1 行目（3）→ 左の列の 2 行目（1）
        expect(r.rows[0]).toEqual({ name: "絶縁抵抗計", model: "IR4051", calibrated_at: "2026-04-01", maker: "日置電機" })
        expect(r.rows[3].name).toBe("回路計")
        expect(r.rows[1].name).toBe("圧力計")
        expect(r.placed).toHaveLength(3)
    })
    it("★手で入れてある行は上書きしない・同じ機器はもう一度入れない", () => {
        const rows = emptyDeviceTable("plain")
        rows[0] = { name: "手で入れた機器", model: "", calibrated_at: "", maker: "" }
        rows[3] = { name: "絶縁抵抗計", model: "ＩＲ４０５１", calibrated_at: "2025-04-01", maker: "日置電機 " }
        const r = placeInstruments("plain", rows, [inst("絶縁抵抗計", "IR4051", "日置電機"), inst("回路計")])
        expect(r.rows[0].name).toBe("手で入れた機器")
        expect(r.already.map((i) => i.name)).toEqual(["絶縁抵抗計"])
        expect(r.rows[3].calibrated_at).toBe("2025-04-01") // ★入っている行の校正年月日も書き換えない
        expect(r.rows[1].name).toBe("回路計")
        // ★2 回押しても増えない
        const again = placeInstruments("plain", r.rows, [inst("回路計")])
        expect(again.placed).toHaveLength(0)
        expect(again.already).toHaveLength(1)
    })
    it("★表が埋まっていたら入れられなかった機器を返す（6 台まで）", () => {
        const many = Array.from({ length: 8 }, (_, i) => inst(`機器${i + 1}`))
        const r = placeInstruments("plain", emptyDeviceTable("plain"), many)
        expect(r.placed).toHaveLength(6)
        expect(r.noRoom.map((i) => i.name)).toEqual(["機器7", "機器8"])
    })
    it("元の行は変えない", () => {
        const rows = emptyDeviceTable("plain")
        placeInstruments("plain", rows, [inst("回路計")])
        expect(rows[0].name).toBe("")
    })
})

describe("placeInstruments（11の1・11の2＝機器名の刷り込みがある）", () => {
    it("刷り込みと同じ名前の機器はその行へ（名前は紙のまま）", () => {
        const r = placeInstruments("bekki11_1", emptyDeviceTable("bekki11_1"), [inst("加煙試験器", "SM-1", "ホーチキ")])
        expect(r.rows[1]).toEqual({ name: "加煙試験器", model: "SM-1", calibrated_at: "2026-04-01", maker: "ホーチキ" })
    })
    it("刷り込みに無い機器は空欄の行へ名前ごと", () => {
        const r = placeInstruments("bekki11_1", emptyDeviceTable("bekki11_1"), [inst("絶縁抵抗計", "IR4051")])
        expect(r.rows[7].name).toBe("絶縁抵抗計")
    })
    it("刷り込みの行がもう埋まっていれば、2 台目は空欄の行へ", () => {
        const first = placeInstruments("bekki11_1", emptyDeviceTable("bekki11_1"), [inst("加熱試験器", "A")])
        const second = placeInstruments("bekki11_1", first.rows, [inst("加熱試験器", "B")])
        expect(second.rows[0].model).toBe("A")
        expect(second.rows[7]).toMatchObject({ name: "加熱試験器", model: "B" })
    })
    it("11の2: 加ガス試験器は先頭の行へ", () => {
        const r = placeInstruments("bekki11_2", emptyDeviceTable("bekki11_2"), [inst("加ガス試験器", "G-1")])
        expect(r.rows[0]).toMatchObject({ name: "加ガス試験器", model: "G-1" })
    })
})

describe("rowChanges", () => {
    it("変わった欄だけを返す（画面の onChange に渡す）", () => {
        const before = emptyDeviceTable("plain")
        const after = placeInstruments("plain", before, [inst("回路計", "CX06")]).rows
        expect(rowChanges(before, after)).toEqual([
            { index: 0, field: "name", value: "回路計" },
            { index: 0, field: "model", value: "CX06" },
            { index: 0, field: "calibrated_at", value: "2026-04-01" },
        ])
    })
})

describe("findInstrumentForRow", () => {
    it("表の行に合う台帳の機器（幅・空白の違いは同じ）。空の行は null", () => {
        const list = [inst("絶縁抵抗計", "IR4051", "日置電機")]
        expect(findInstrumentForRow({ name: "絶縁抵抗計", model: "ＩＲ ４０５１", calibrated_at: "", maker: "日置電機" }, list)?.id).toBe("絶縁抵抗計-IR4051")
        expect(findInstrumentForRow({ name: "", model: "", calibrated_at: "", maker: "" }, list)).toBeNull()
        expect(findInstrumentForRow({ name: "絶縁抵抗計", model: "IR4052", calibrated_at: "", maker: "日置電機" }, list)).toBeNull()
    })
})

describe("validateInstrumentInput", () => {
    const base = { name: "回路計", model: "", maker: "", serial_number: "", calibrated_at: null, calibration_months: null, note: "" }
    it("機器名は必須・周期は 1〜120 か月・字数（DB の制約と同じ）", () => {
        expect(validateInstrumentInput(base)).toEqual([])
        expect(validateInstrumentInput({ ...base, name: " " })).toContain("機器名を入れてください")
        expect(validateInstrumentInput({ ...base, calibration_months: 0 })).toHaveLength(1)
        expect(validateInstrumentInput({ ...base, calibration_months: 121 })).toHaveLength(1)
        expect(validateInstrumentInput({ ...base, calibration_months: 12 })).toEqual([])
        expect(validateInstrumentInput({ ...base, model: "x".repeat(61) })).toHaveLength(1)
        expect(validateInstrumentInput({ ...base, note: "x".repeat(201) })).toHaveLength(1)
        expect(validateInstrumentInput({ ...base, calibrated_at: "2026/4/1" })).toHaveLength(1)
    })
})
