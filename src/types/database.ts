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
        }
    }
}

export type InspectionReport = Database['public']['Tables']['inspection_reports']['Row']
export type InspectionReportInsert = Database['public']['Tables']['inspection_reports']['Insert']
