import type { ItiranInputStepId } from "./itiran-input-flow"

export type PdfMergeStepConfig = {
    apiRoute: string
    dbTable: string
    /**
     * 綴じ順（別記様式の番号）。11の1 / 11の2 は 11.1 / 11.2。
     *
     * ★定義順に頼らない。結合PDFの順序は入力フローの並び（STEPS）で決まっており、
     *   1→12→13…22→2→3…11の2 とバラバラになっていた（実機で指摘）。
     *   STEPS は入力の導線なので、綴じ順とは別の関心事。
     *   「この表がたまたま番号順に書かれている」に依存すると、行を1つ足した瞬間に崩れる。
     */
    formNo: number
}

export const PDF_MERGE_CONFIG: Record<ItiranInputStepId, PdfMergeStepConfig> = {
    shokaki:                        { apiRoute: "/api/generate-shokaki-bekki1-pdf",                       formNo: 1, dbTable: "inspection_shokaki_bekki1" },
    shokasen:                       { apiRoute: "/api/generate-shokasen-bekki2-pdf",                      formNo: 2, dbTable: "inspection_shokasen_bekki2" },
    sprinkler:                      { apiRoute: "/api/generate-sprinkler-bekki3-pdf",                     formNo: 3, dbTable: "inspection_sprinkler_bekki3" },
    "water-spray":                  { apiRoute: "/api/generate-water-spray-bekki4-pdf",                   formNo: 4, dbTable: "inspection_water_spray_bekki4" },
    foam:                           { apiRoute: "/api/generate-foam-bekki5-pdf",                          formNo: 5, dbTable: "inspection_foam_bekki5" },
    "inert-gas":                    { apiRoute: "/api/generate-inert-gas-bekki6-pdf",                     formNo: 6, dbTable: "inspection_inert_gas_bekki6" },
    halogen:                        { apiRoute: "/api/generate-halogen-bekki7-pdf",                       formNo: 7, dbTable: "inspection_halogen_bekki7" },
    powder:                         { apiRoute: "/api/generate-powder-bekki8-pdf",                        formNo: 8, dbTable: "inspection_powder_bekki8" },
    "okugai-shokasen":              { apiRoute: "/api/generate-okugai-shokasen-bekki9-pdf",               formNo: 9, dbTable: "inspection_okugai_shokasen_bekki9" },
    "doryoku-pump":                 { apiRoute: "/api/generate-doryoku-pump-bekki10-pdf",                 formNo: 10, dbTable: "inspection_doryoku_pump_bekki10" },
    "jidou-kasai-houchi":           { apiRoute: "/api/generate-jidou-kasai-houchi-bekki11-1-pdf",         formNo: 11.1, dbTable: "inspection_jidou_kasai_houchi_bekki11_1" },
    "gas-leak-fire-alarm":          { apiRoute: "/api/generate-gas-leak-fire-alarm-bekki11-2-pdf",        formNo: 11.2, dbTable: "inspection_gas_leak_fire_alarm_bekki11_2" },
    "leakage-fire-alarm":           { apiRoute: "/api/generate-leakage-fire-alarm-bekki12-pdf",           formNo: 12, dbTable: "inspection_leakage_fire_alarm_bekki12" },
    "fire-department-notification": { apiRoute: "/api/generate-fire-department-notification-bekki13-pdf",  formNo: 13, dbTable: "inspection_fire_department_notification_bekki13" },
    "emergency-alarm":              { apiRoute: "/api/generate-emergency-alarm-bekki14-pdf",              formNo: 14, dbTable: "inspection_emergency_alarm_bekki14" },
    "evacuation-equipment":         { apiRoute: "/api/generate-evacuation-equipment-bekki15-pdf",         formNo: 15, dbTable: "inspection_evacuation_equipment_bekki15" },
    "guidance-lights-signs":        { apiRoute: "/api/generate-guidance-lights-signs-bekki16-pdf",        formNo: 16, dbTable: "inspection_guidance_lights_signs_bekki16" },
    "fire-water":                   { apiRoute: "/api/generate-fire-water-bekki17-pdf",                   formNo: 17, dbTable: "inspection_fire_water_bekki17" },
    "smoke-control":                { apiRoute: "/api/generate-smoke-control-bekki18-pdf",                formNo: 18, dbTable: "inspection_smoke_control_bekki18" },
    "connected-sprinkler":          { apiRoute: "/api/generate-connected-sprinkler-bekki19-pdf",          formNo: 19, dbTable: "inspection_connected_sprinkler_bekki19" },
    standpipe:                      { apiRoute: "/api/generate-standpipe-bekki20-pdf",                    formNo: 20, dbTable: "inspection_standpipe_bekki20" },
    "emergency-power-outlet":       { apiRoute: "/api/generate-emergency-power-outlet-bekki21-pdf",       formNo: 21, dbTable: "inspection_emergency_power_outlet_bekki21" },
    "radio-communication-support":  { apiRoute: "/api/generate-radio-communication-support-bekki22-pdf",  formNo: 22, dbTable: "inspection_radio_communication_support_bekki22" },
}

// dbTable → stepId の逆引き。複製の「未確認様式」（inspection.unconfirmed_cloned_forms が返す
// テーブル名）を、既存の STEPS.title（ラベル）と buildItiranInputHref（リンク）へ橋渡しするために使う。
// 設備名の定義をここで増やさず、PDF_MERGE_CONFIG と itiran-input-flow の既存定義から導出する。
// report_form_tables() ⇔ PDF_MERGE_CONFIG の23本一致は DB 側 drift テストが保証する。
const DB_TABLE_TO_STEP: Record<string, ItiranInputStepId> = Object.fromEntries(
    Object.entries(PDF_MERGE_CONFIG).map(([stepId, cfg]) => [cfg.dbTable, stepId as ItiranInputStepId]),
)

export function formTableToStep(dbTable: string): ItiranInputStepId | null {
    return DB_TABLE_TO_STEP[dbTable] ?? null
}
