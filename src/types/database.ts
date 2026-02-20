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
                    soukatsu_id: string | null
                    inspector1: Json | null
                    inspector2: Json | null
                }
                Insert: {
                    id?: string
                    created_at?: string
                    soukatsu_id?: string | null
                    inspector1?: Json | null
                    inspector2?: Json | null
                }
                Update: {
                    id?: string
                    created_at?: string
                    soukatsu_id?: string | null
                    inspector1?: Json | null
                    inspector2?: Json | null
                }
            }
            inspection_soukatsu: {
                Row: {
                    id: string
                    created_at: string
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
                }
                Insert: {
                    id?: string
                    created_at?: string
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
                }
                Update: {
                    id?: string
                    created_at?: string
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
                }
            }
        }
    }
}

export type InspectionReport = Database['public']['Tables']['inspection_reports']['Row']
export type InspectionReportInsert = Database['public']['Tables']['inspection_reports']['Insert']

export type InspectionSoukatsu = Database['public']['Tables']['inspection_soukatsu']['Row']
export type InspectionSoukatsuInsert = Database['public']['Tables']['inspection_soukatsu']['Insert']

export type InspectionItiran = Database['public']['Tables']['inspection_itiran']['Row']
export type InspectionItiranInsert = Database['public']['Tables']['inspection_itiran']['Insert']

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
