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
        inspection_type?: string | null
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
            sections={[{
                key: "page1_rows", title: "機器点検", labels: PAGE1_ITEMS, currentValueRowIndex: 6,
                // ★行6「端子電圧」は刷り込みが「常用 ___ V 非常 ___ V」。route は content を常用、
                //   current_value を非常に描く。既定の「電圧(V)・電流(A)」のままだと、案内どおり
                //   電流を入れた値が提出書類の「非常 V」に載っていた（#21・2026-10-05 の通し確認）。
                currentValueFields: { first: "常用(V)", firstUnit: "V", second: "非常(V)", secondUnit: "V" },
            }]}
            notesCardTitle="備考（その1）"
            notesRows={12}
        />
    )
}
