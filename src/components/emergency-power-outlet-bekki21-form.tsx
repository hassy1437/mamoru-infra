"use client"

import BekkiResultFormBase, { type BekkiBasePayload } from "@/components/bekki-result-form-base"

type EmergencyPowerOutletBekki21Payload = BekkiBasePayload

interface Props {
    initial: {
        building_name?: string | null
        building_address?: string | null
        notifier_name?: string | null
        fire_manager_name?: string | null
        inspector_name?: string | null
        inspection_date?: string | null
    }
    soukatsuId: string
    itiranId: string
    propertyId?: string | null
    savedPayload?: Partial<EmergencyPowerOutletBekki21Payload> | null
    savedUpdatedAt?: string | null
}

const PAGE1_ITEMS = [
    "保護箱 周囲の状況",
    "保護箱 外形",
    "保護箱 表示",
    "保護箱 表示灯",
    "保護箱 さし込接続器",
    "保護箱 開閉器",
    "保護箱 端子電圧（常用Ｖ・非常Ｖ）",
    "保護箱 相回転",
] as const

export default function EmergencyPowerOutletBekki21Form(props: Props) {
    return (
        <BekkiResultFormBase
            {...props}
            title="非常コンセント設備点検票（別記様式21）"
            iframeTitle="非常コンセント設備点検票（別記様式21）PDFプレビュー"
            apiPath="/api/generate-emergency-power-outlet-bekki21-pdf"
            dbTable="inspection_emergency_power_outlet_bekki21"
            downloadFilenamePrefix="非常コンセント設備点検票"
            sections={[{ key: "page1_rows", title: "機器点検", labels: PAGE1_ITEMS, currentValueRowIndex: 6 }]}
            notesCardTitle="備考（その1）"
            notesRows={12}
        />
    )
}
