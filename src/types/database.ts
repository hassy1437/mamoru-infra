export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export interface Database {
    public: {
        Tables: {
            properties: {
                Row: {
                    id: string
                    user_id: string | null
                    name: string
                    address: string
                    floor_area: number | null
                    usage_type: string
                    created_at: string
                    updated_at: string
                    notifier_name: string
                    notifier_address: string
                    notifier_phone: string | null
                    building_name: string
                    building_address: string
                    building_usage: string
                    building_structure: string | null
                    floor_above: number | null
                    floor_below: number | null
                    total_floor_area: number | null
                    equipment_types: string[]
                }
                Insert: {
                    id?: string
                    user_id?: string | null
                    name: string
                    address: string
                    floor_area?: number | null
                    usage_type: string
                    created_at?: string
                    updated_at?: string
                    notifier_name: string
                    notifier_address: string
                    notifier_phone?: string | null
                    building_name: string
                    building_address: string
                    building_usage: string
                    building_structure?: string | null
                    floor_above?: number | null
                    floor_below?: number | null
                    total_floor_area?: number | null
                    equipment_types?: string[]
                }
                Update: {
                    id?: string
                    user_id?: string | null
                    name?: string
                    address?: string
                    floor_area?: number | null
                    usage_type?: string
                    created_at?: string
                    updated_at?: string
                    notifier_name?: string
                    notifier_address?: string
                    notifier_phone?: string | null
                    building_name?: string
                    building_address?: string
                    building_usage?: string
                    building_structure?: string | null
                    floor_above?: number | null
                    floor_below?: number | null
                    total_floor_area?: number | null
                    equipment_types?: string[]
                }
            }
            inspection_reports: {
                Row: {
                    id: string
                    created_at: string
                    user_id: string | null
                    report_date: string
                    fire_department_name: string
                    notifier_address: string
                    notifier_name: string
                    notifier_phone: string | null
                    building_address: string
                    building_name: string
                    building_usage: string
                    floor_above: number | null
                    floor_below: number | null
                    total_floor_area: number | null
                    equipment_types: Json | null
                    status: string | null
                }
                Insert: {
                    id?: string
                    created_at?: string
                    user_id?: string | null
                    report_date: string
                    fire_department_name: string
                    notifier_address: string
                    notifier_name: string
                    notifier_phone?: string | null
                    building_address: string
                    building_name: string
                    building_usage: string
                    floor_above?: number | null
                    floor_below?: number | null
                    total_floor_area?: number | null
                    equipment_types?: Json | null
                    status?: string | null
                }
                Update: {
                    id?: string
                    created_at?: string
                    user_id?: string | null
                    report_date?: string
                    fire_department_name?: string
                    notifier_address?: string
                    notifier_name?: string
                    notifier_phone?: string | null
                    building_address?: string
                    building_name?: string
                    building_usage?: string
                    floor_above?: number | null
                    floor_below?: number | null
                    total_floor_area?: number | null
                    equipment_types?: Json | null
                    status?: string | null
                }
            }
            inspection_itiran: {
                Row: {
                    id: string
                    created_at: string
                    user_id: string | null
                    soukatsu_id: string | null
                    inspector1: Json | null
                    inspector2: Json | null
                }
                Insert: {
                    id?: string
                    created_at?: string
                    user_id?: string | null
                    soukatsu_id?: string | null
                    inspector1?: Json | null
                    inspector2?: Json | null
                }
                Update: {
                    id?: string
                    created_at?: string
                    user_id?: string | null
                    soukatsu_id?: string | null
                    inspector1?: Json | null
                    inspector2?: Json | null
                }
            }
            inspection_shokaki_bekki1: {
                Row: {
                    id: string
                    created_at: string
                    updated_at: string
                    soukatsu_id: string
                    itiran_id: string
                    property_id: string | null
                    payload: Json
                }
                Insert: {
                    id?: string
                    created_at?: string
                    updated_at?: string
                    soukatsu_id: string
                    itiran_id: string
                    property_id?: string | null
                    payload?: Json
                }
                Update: {
                    id?: string
                    created_at?: string
                    updated_at?: string
                    soukatsu_id?: string
                    itiran_id?: string
                    property_id?: string | null
                    payload?: Json
                }
            }
            inspection_shokasen_bekki2: {
                Row: {
                    id: string
                    created_at: string
                    updated_at: string
                    soukatsu_id: string
                    itiran_id: string
                    property_id: string | null
                    payload: Json
                }
                Insert: {
                    id?: string
                    created_at?: string
                    updated_at?: string
                    soukatsu_id: string
                    itiran_id: string
                    property_id?: string | null
                    payload?: Json
                }
                Update: {
                    id?: string
                    created_at?: string
                    updated_at?: string
                    soukatsu_id?: string
                    itiran_id?: string
                    property_id?: string | null
                    payload?: Json
                }
            }
            inspection_sprinkler_bekki3: {
                Row: {
                    id: string
                    created_at: string
                    updated_at: string
                    soukatsu_id: string
                    itiran_id: string
                    property_id: string | null
                    payload: Json
                }
                Insert: {
                    id?: string
                    created_at?: string
                    updated_at?: string
                    soukatsu_id: string
                    itiran_id: string
                    property_id?: string | null
                    payload?: Json
                }
                Update: {
                    id?: string
                    created_at?: string
                    updated_at?: string
                    soukatsu_id?: string
                    itiran_id?: string
                    property_id?: string | null
                    payload?: Json
                }
            }
            inspection_foam_bekki5: {
                Row: {
                    id: string
                    created_at: string
                    updated_at: string
                    soukatsu_id: string
                    itiran_id: string
                    property_id: string | null
                    payload: Json
                }
                Insert: {
                    id?: string
                    created_at?: string
                    updated_at?: string
                    soukatsu_id: string
                    itiran_id: string
                    property_id?: string | null
                    payload?: Json
                }
                Update: {
                    id?: string
                    created_at?: string
                    updated_at?: string
                    soukatsu_id?: string
                    itiran_id?: string
                    property_id?: string | null
                    payload?: Json
                }
            }
            inspection_inert_gas_bekki6: {
                Row: {
                    id: string
                    created_at: string
                    updated_at: string
                    soukatsu_id: string
                    itiran_id: string
                    property_id: string | null
                    payload: Json
                }
                Insert: {
                    id?: string
                    created_at?: string
                    updated_at?: string
                    soukatsu_id: string
                    itiran_id: string
                    property_id?: string | null
                    payload?: Json
                }
                Update: {
                    id?: string
                    created_at?: string
                    updated_at?: string
                    soukatsu_id?: string
                    itiran_id?: string
                    property_id?: string | null
                    payload?: Json
                }
            }
            inspection_halogen_bekki7: {
                Row: {
                    id: string
                    created_at: string
                    updated_at: string
                    soukatsu_id: string
                    itiran_id: string
                    property_id: string | null
                    payload: Json
                }
                Insert: {
                    id?: string
                    created_at?: string
                    updated_at?: string
                    soukatsu_id: string
                    itiran_id: string
                    property_id?: string | null
                    payload?: Json
                }
                Update: {
                    id?: string
                    created_at?: string
                    updated_at?: string
                    soukatsu_id?: string
                    itiran_id?: string
                    property_id?: string | null
                    payload?: Json
                }
            }
            inspection_powder_bekki8: {
                Row: {
                    id: string
                    created_at: string
                    updated_at: string
                    soukatsu_id: string
                    itiran_id: string
                    property_id: string | null
                    payload: Json
                }
                Insert: {
                    id?: string
                    created_at?: string
                    updated_at?: string
                    soukatsu_id: string
                    itiran_id: string
                    property_id?: string | null
                    payload?: Json
                }
                Update: {
                    id?: string
                    created_at?: string
                    updated_at?: string
                    soukatsu_id?: string
                    itiran_id?: string
                    property_id?: string | null
                    payload?: Json
                }
            }
            inspection_okugai_shokasen_bekki9: {
                Row: {
                    id: string
                    created_at: string
                    updated_at: string
                    soukatsu_id: string
                    itiran_id: string
                    property_id: string | null
                    payload: Json
                }
                Insert: {
                    id?: string
                    created_at?: string
                    updated_at?: string
                    soukatsu_id: string
                    itiran_id: string
                    property_id?: string | null
                    payload?: Json
                }
                Update: {
                    id?: string
                    created_at?: string
                    updated_at?: string
                    soukatsu_id?: string
                    itiran_id?: string
                    property_id?: string | null
                    payload?: Json
                }
            }
            inspection_doryoku_pump_bekki10: {
                Row: {
                    id: string
                    created_at: string
                    updated_at: string
                    soukatsu_id: string
                    itiran_id: string
                    property_id: string | null
                    payload: Json
                }
                Insert: {
                    id?: string
                    created_at?: string
                    updated_at?: string
                    soukatsu_id: string
                    itiran_id: string
                    property_id?: string | null
                    payload?: Json
                }
                Update: {
                    id?: string
                    created_at?: string
                    updated_at?: string
                    soukatsu_id?: string
                    itiran_id?: string
                    property_id?: string | null
                    payload?: Json
                }
            }
            inspection_jidou_kasai_houchi_bekki11_1: {
                Row: {
                    id: string
                    created_at: string
                    updated_at: string
                    soukatsu_id: string
                    itiran_id: string
                    property_id: string | null
                    payload: Json
                }
                Insert: {
                    id?: string
                    created_at?: string
                    updated_at?: string
                    soukatsu_id: string
                    itiran_id: string
                    property_id?: string | null
                    payload?: Json
                }
                Update: {
                    id?: string
                    created_at?: string
                    updated_at?: string
                    soukatsu_id?: string
                    itiran_id?: string
                    property_id?: string | null
                    payload?: Json
                }
            }
            inspection_gas_leak_fire_alarm_bekki11_2: {
                Row: {
                    id: string
                    created_at: string
                    updated_at: string
                    soukatsu_id: string
                    itiran_id: string
                    property_id: string | null
                    payload: Json
                }
                Insert: {
                    id?: string
                    created_at?: string
                    updated_at?: string
                    soukatsu_id: string
                    itiran_id: string
                    property_id?: string | null
                    payload?: Json
                }
                Update: {
                    id?: string
                    created_at?: string
                    updated_at?: string
                    soukatsu_id?: string
                    itiran_id?: string
                    property_id?: string | null
                    payload?: Json
                }
            }
            inspection_water_spray_bekki4: {
                Row: {
                    id: string
                    created_at: string
                    updated_at: string
                    soukatsu_id: string
                    itiran_id: string
                    property_id: string | null
                    payload: Json
                }
                Insert: {
                    id?: string
                    created_at?: string
                    updated_at?: string
                    soukatsu_id: string
                    itiran_id: string
                    property_id?: string | null
                    payload?: Json
                }
                Update: {
                    id?: string
                    created_at?: string
                    updated_at?: string
                    soukatsu_id?: string
                    itiran_id?: string
                    property_id?: string | null
                    payload?: Json
                }
            }
            inspection_soukatsu: {
                Row: {
                    id: string
                    created_at: string
                    user_id: string | null
                    inspection_date: string
                    inspection_type: string
                    inspection_period_start: string | null
                    inspection_period_end: string | null
                    notifier_address: string
                    notifier_name: string
                    notifier_phone: string | null
                    building_address: string
                    building_name: string
                    building_usage: string
                    building_structure: string | null
                    floor_above: number | null
                    floor_below: number | null
                    total_floor_area: number | null
                    equipment_results: Json | null
                    overall_judgment: string | null
                    notes: string | null
                    property_id: string | null
                }
                Insert: {
                    id?: string
                    created_at?: string
                    user_id?: string | null
                    inspection_date: string
                    inspection_type: string
                    inspection_period_start?: string | null
                    inspection_period_end?: string | null
                    notifier_address: string
                    notifier_name: string
                    notifier_phone?: string | null
                    building_address: string
                    building_name: string
                    building_usage: string
                    building_structure?: string | null
                    floor_above?: number | null
                    floor_below?: number | null
                    total_floor_area?: number | null
                    equipment_results?: Json | null
                    overall_judgment?: string | null
                    notes?: string | null
                    property_id?: string | null
                }
                Update: {
                    id?: string
                    created_at?: string
                    user_id?: string | null
                    inspection_date?: string
                    inspection_type?: string
                    inspection_period_start?: string | null
                    inspection_period_end?: string | null
                    notifier_address?: string
                    notifier_name?: string
                    notifier_phone?: string | null
                    building_address?: string
                    building_name?: string
                    building_usage?: string
                    building_structure?: string | null
                    floor_above?: number | null
                    floor_below?: number | null
                    total_floor_area?: number | null
                    equipment_results?: Json | null
                    overall_judgment?: string | null
                    notes?: string | null
                    property_id?: string | null
                }
            }
        }
    }
}

export type Property = Database['public']['Tables']['properties']['Row']
export type PropertyInsert = Database['public']['Tables']['properties']['Insert']

export type InspectionReport = Database['public']['Tables']['inspection_reports']['Row']
export type InspectionReportInsert = Database['public']['Tables']['inspection_reports']['Insert']

export type InspectionSoukatsu = Database['public']['Tables']['inspection_soukatsu']['Row']
export type InspectionSoukatsuInsert = Database['public']['Tables']['inspection_soukatsu']['Insert']

export type InspectionItiran = Database['public']['Tables']['inspection_itiran']['Row']
export type InspectionItiranInsert = Database['public']['Tables']['inspection_itiran']['Insert']

export type InspectionShokakiBekki1 = Database['public']['Tables']['inspection_shokaki_bekki1']['Row']
export type InspectionShokakiBekki1Insert = Database['public']['Tables']['inspection_shokaki_bekki1']['Insert']
export type InspectionShokasenBekki2 = Database['public']['Tables']['inspection_shokasen_bekki2']['Row']
export type InspectionShokasenBekki2Insert = Database['public']['Tables']['inspection_shokasen_bekki2']['Insert']
export type InspectionSprinklerBekki3 = Database['public']['Tables']['inspection_sprinkler_bekki3']['Row']
export type InspectionSprinklerBekki3Insert = Database['public']['Tables']['inspection_sprinkler_bekki3']['Insert']
export type InspectionFoamBekki5 = Database['public']['Tables']['inspection_foam_bekki5']['Row']
export type InspectionFoamBekki5Insert = Database['public']['Tables']['inspection_foam_bekki5']['Insert']
export type InspectionInertGasBekki6 = Database['public']['Tables']['inspection_inert_gas_bekki6']['Row']
export type InspectionInertGasBekki6Insert = Database['public']['Tables']['inspection_inert_gas_bekki6']['Insert']
export type InspectionHalogenBekki7 = Database['public']['Tables']['inspection_halogen_bekki7']['Row']
export type InspectionHalogenBekki7Insert = Database['public']['Tables']['inspection_halogen_bekki7']['Insert']
export type InspectionPowderBekki8 = Database['public']['Tables']['inspection_powder_bekki8']['Row']
export type InspectionPowderBekki8Insert = Database['public']['Tables']['inspection_powder_bekki8']['Insert']
export type InspectionOkugaiShokasenBekki9 = Database['public']['Tables']['inspection_okugai_shokasen_bekki9']['Row']
export type InspectionOkugaiShokasenBekki9Insert = Database['public']['Tables']['inspection_okugai_shokasen_bekki9']['Insert']
export type InspectionDoryokuPumpBekki10 = Database['public']['Tables']['inspection_doryoku_pump_bekki10']['Row']
export type InspectionDoryokuPumpBekki10Insert = Database['public']['Tables']['inspection_doryoku_pump_bekki10']['Insert']
export type InspectionJidouKasaiHouchiBekki11_1 = Database['public']['Tables']['inspection_jidou_kasai_houchi_bekki11_1']['Row']
export type InspectionJidouKasaiHouchiBekki11_1Insert = Database['public']['Tables']['inspection_jidou_kasai_houchi_bekki11_1']['Insert']
export type InspectionGasLeakFireAlarmBekki11_2 = Database['public']['Tables']['inspection_gas_leak_fire_alarm_bekki11_2']['Row']
export type InspectionGasLeakFireAlarmBekki11_2Insert = Database['public']['Tables']['inspection_gas_leak_fire_alarm_bekki11_2']['Insert']
export type InspectionWaterSprayBekki4 = Database['public']['Tables']['inspection_water_spray_bekki4']['Row']
export type InspectionWaterSprayBekki4Insert = Database['public']['Tables']['inspection_water_spray_bekki4']['Insert']

// 消防設備士免状
export interface ShoubouLicense {
    issue_year: string
    issue_month: string
    issue_day: string
    license_number: string
    issuing_governor: string
    training_year: string
    training_month: string
}

// 消防設備点検資格者免状
export interface KensaLicense {
    issue_year: string
    issue_month: string
    issue_day: string
    license_number: string
    expiry_year: string
    expiry_month: string
    expiry_day: string
}

// 点検者データ
export interface InspectorData {
    address: string
    name: string
    company: string
    phone: string
    equipment_names: string
    shoubou_licenses: {
        toku: ShoubouLicense
        class1: ShoubouLicense
        class2: ShoubouLicense
        class3: ShoubouLicense
        class4: ShoubouLicense
        class5: ShoubouLicense
        class6: ShoubouLicense
        class7: ShoubouLicense
    }
    shoubou_notes: string
    kensa_licenses: {
        toku: KensaLicense
        class1: KensaLicense
        class2: KensaLicense
    }
}
