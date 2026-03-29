import type { ItiranInputStepId } from "./itiran-input-flow"

export type PdfMergeStepConfig = {
    apiRoute: string
    dbTable: string
}

export const PDF_MERGE_CONFIG: Record<ItiranInputStepId, PdfMergeStepConfig> = {
    shokaki:                        { apiRoute: "/api/generate-shokaki-bekki1-pdf",                       dbTable: "inspection_shokaki_bekki1" },
    shokasen:                       { apiRoute: "/api/generate-shokasen-bekki2-pdf",                      dbTable: "inspection_shokasen_bekki2" },
    sprinkler:                      { apiRoute: "/api/generate-sprinkler-bekki3-pdf",                     dbTable: "inspection_sprinkler_bekki3" },
    "water-spray":                  { apiRoute: "/api/generate-water-spray-bekki4-pdf",                   dbTable: "inspection_water_spray_bekki4" },
    foam:                           { apiRoute: "/api/generate-foam-bekki5-pdf",                          dbTable: "inspection_foam_bekki5" },
    "inert-gas":                    { apiRoute: "/api/generate-inert-gas-bekki6-pdf",                     dbTable: "inspection_inert_gas_bekki6" },
    halogen:                        { apiRoute: "/api/generate-halogen-bekki7-pdf",                       dbTable: "inspection_halogen_bekki7" },
    powder:                         { apiRoute: "/api/generate-powder-bekki8-pdf",                        dbTable: "inspection_powder_bekki8" },
    "okugai-shokasen":              { apiRoute: "/api/generate-okugai-shokasen-bekki9-pdf",               dbTable: "inspection_okugai_shokasen_bekki9" },
    "doryoku-pump":                 { apiRoute: "/api/generate-doryoku-pump-bekki10-pdf",                 dbTable: "inspection_doryoku_pump_bekki10" },
    "jidou-kasai-houchi":           { apiRoute: "/api/generate-jidou-kasai-houchi-bekki11-1-pdf",         dbTable: "inspection_jidou_kasai_houchi_bekki11_1" },
    "gas-leak-fire-alarm":          { apiRoute: "/api/generate-gas-leak-fire-alarm-bekki11-2-pdf",        dbTable: "inspection_gas_leak_fire_alarm_bekki11_2" },
    "leakage-fire-alarm":           { apiRoute: "/api/generate-leakage-fire-alarm-bekki12-pdf",           dbTable: "inspection_leakage_fire_alarm_bekki12" },
    "fire-department-notification": { apiRoute: "/api/generate-fire-department-notification-bekki13-pdf",  dbTable: "inspection_fire_department_notification_bekki13" },
    "emergency-alarm":              { apiRoute: "/api/generate-emergency-alarm-bekki14-pdf",              dbTable: "inspection_emergency_alarm_bekki14" },
    "evacuation-equipment":         { apiRoute: "/api/generate-evacuation-equipment-bekki15-pdf",         dbTable: "inspection_evacuation_equipment_bekki15" },
    "guidance-lights-signs":        { apiRoute: "/api/generate-guidance-lights-signs-bekki16-pdf",        dbTable: "inspection_guidance_lights_signs_bekki16" },
    "fire-water":                   { apiRoute: "/api/generate-fire-water-bekki17-pdf",                   dbTable: "inspection_fire_water_bekki17" },
    "smoke-control":                { apiRoute: "/api/generate-smoke-control-bekki18-pdf",                dbTable: "inspection_smoke_control_bekki18" },
    "connected-sprinkler":          { apiRoute: "/api/generate-connected-sprinkler-bekki19-pdf",          dbTable: "inspection_connected_sprinkler_bekki19" },
    standpipe:                      { apiRoute: "/api/generate-standpipe-bekki20-pdf",                    dbTable: "inspection_standpipe_bekki20" },
    "emergency-power-outlet":       { apiRoute: "/api/generate-emergency-power-outlet-bekki21-pdf",       dbTable: "inspection_emergency_power_outlet_bekki21" },
    "radio-communication-support":  { apiRoute: "/api/generate-radio-communication-support-bekki22-pdf",  dbTable: "inspection_radio_communication_support_bekki22" },
}
