import { describe, expect, it } from "vitest"
import {
    NAMEPLATE_DIALOG_FIELDS,
    nameplateConfirmValues,
    nameplateFieldPairs,
    nameplateInitialValues,
    nameplateIsoDate,
    nameplateTargetSize,
} from "./nameplate-apply.ts"
import { buildNameplateConsensus, type NameplateProviderResult } from "./nameplate-consensus.ts"
import { NAMEPLATE_FIELDS, type NameplateReading } from "./nameplate-reading.ts"

function reading(values: Partial<Record<string, string>>): NameplateReading {
    return {
        device_kind: "受信機",
        fields: Object.fromEntries(
            NAMEPLATE_FIELDS.map((f) => [
                f.key,
                values[f.key] ? { value: values[f.key], legibility: "clear", certainty: "high" } : { value: null, legibility: "absent", certainty: "high" },
            ]),
        ) as NameplateReading["fields"],
    }
}
const r = (provider: NameplateProviderResult["provider"], values: Partial<Record<string, string>>): NameplateProviderResult => ({
    provider, model: "m", ok: true, error: null, ms: 1, inputTokens: 1, outputTokens: 1, costUsd: null, reading: reading(values),
})

describe("画面に出す欄", () => {
    it("測定機器は台帳の 4 つ・設備は製造者名と型式と型式番号", () => {
        expect(NAMEPLATE_DIALOG_FIELDS.instrument).toEqual(["maker", "model", "serial_number", "calibrated_at"])
        expect(NAMEPLATE_DIALOG_FIELDS.device).toEqual(["maker", "model", "approval_number"])
    })

    it("そろった・割れた欄は値を入れ、ばらばらの欄は空（★推測で埋めない）", () => {
        const c = buildNameplateConsensus([
            r("anthropic", { maker: "能美防災", model: "A1" }),
            r("google", { maker: "能美防災", model: "B2" }),
            r("openai", { maker: "能美防災", model: "C3" }),
        ])
        expect(nameplateInitialValues(c, NAMEPLATE_DIALOG_FIELDS.device)).toEqual({ maker: "能美防災", model: "", approval_number: "" })
    })

    it("答え合わせに送るのは画面に出した欄だけ（空は null）", () => {
        expect(nameplateConfirmValues({ maker: " 能美防災 ", model: "", serial_number: "x" }, ["maker", "model"])).toEqual({ maker: "能美防災", model: null })
    })
})

describe("校正年月日を日付の欄に", () => {
    it("いろいろな書き方を YYYY-MM-DD に", () => {
        expect(nameplateIsoDate("2024.4.12")).toBe("2024-04-12")
        expect(nameplateIsoDate("2024/04/12")).toBe("2024-04-12")
        expect(nameplateIsoDate("2024年4月12日")).toBe("2024-04-12")
        expect(nameplateIsoDate("２０２４－０４－１２")).toBe("2024-04-12")
        expect(nameplateIsoDate("R6.4.12")).toBe("2024-04-12")
        expect(nameplateIsoDate("令和元年5月1日")).toBe("2019-05-01")
        expect(nameplateIsoDate("H31.4.30")).toBe("2019-04-30")
    })

    it("★年月だけ・ありえない日付・年が無いものは null（欄は変えない）", () => {
        expect(nameplateIsoDate("2024.4")).toBeNull()
        expect(nameplateIsoDate("2024.2.30")).toBeNull()
        expect(nameplateIsoDate("4.12")).toBeNull()
        expect(nameplateIsoDate("")).toBeNull()
        expect(nameplateIsoDate(null)).toBeNull()
    })
})

describe("様式の欄の組", () => {
    it("<prefix>_maker と <prefix>_model がそろったものだけ・機器の名前は欄の名前から", () => {
        const pairs = nameplateFieldPairs([
            { key: "receiver_maker", label: "受信機 製造者名" },
            { key: "receiver_model", label: "受信機 型式等" },
            { key: "ct_maker", label: "変流器 製造者名" },
            { key: "other", label: "そのほか" },
            { key: "smoke_machine_maker", label: "製造者名" },
            { key: "smoke_machine_model", label: "型式等" },
            { key: "x_maker", label: "X 製造者名", type: "checkbox" },
            { key: "x_model", label: "X 型式等" },
        ])
        expect(pairs).toEqual([
            { prefix: "receiver", device: "受信機", makerKey: "receiver_maker", modelKey: "receiver_model" },
            { prefix: "smoke_machine", device: "", makerKey: "smoke_machine_maker", modelKey: "smoke_machine_model" },
        ])
    })
})

describe("写真を縮める大きさ", () => {
    it("長い辺を 1568 に・小さい写真は大きくしない", () => {
        expect(nameplateTargetSize(4032, 3024, 1568)).toEqual({ width: 1568, height: 1176 })
        expect(nameplateTargetSize(3024, 4032, 1568)).toEqual({ width: 1176, height: 1568 })
        expect(nameplateTargetSize(800, 600, 1568)).toEqual({ width: 800, height: 600 })
    })
})
