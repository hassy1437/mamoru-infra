"use client"

import BekkiResultFormBase, { type BekkiBasePayload } from "@/components/bekki-result-form-base"

type EmergencyPowerOutletBekki21Payload = BekkiBasePayload

interface Props {
    initial: {
        building_name?: string | null
        building_address?: string | null
        notifier_name?: string | null
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
    "???: ?????",
    "???: ??",
    "???: ??",
    "???: ???",
    "???: ??????",
    "???: ???",
    "???: ???????V???V?",
    "???: ???",
] as const

export default function EmergencyPowerOutletBekki21Form(props: Props) {
    return (
        <BekkiResultFormBase
            {...props}
            title="?????????????????21?"
            iframeTitle="?????????????????21?PDF?????"
            apiPath="/api/generate-emergency-power-outlet-bekki21-pdf"
            dbTable="inspection_emergency_power_outlet_bekki21"
            downloadFilenamePrefix="????????????"
            sections={[{ key: "page1_rows", title: "??1 ????", labels: PAGE1_ITEMS }]}
            notesCardTitle="?????1?"
            notesRows={12}
        />
    )
}
