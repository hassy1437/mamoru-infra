"use client"

import BekkiResultFormBase, { type BekkiBasePayload } from "@/components/bekki-result-form-base"

type FireWaterBekki17Payload = BekkiBasePayload

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
    savedPayload?: Partial<FireWaterBekki17Payload> | null
    savedUpdatedAt?: string | null
}

const PAGE1_ITEMS = [
    "水源",
    "貯水槽",
    "水量",
    "水状",
    "給水装置",
    "周囲の状況",
    "吸管投入口",
    "本体",
    "開閉弁",
    "標識",
] as const

export default function FireWaterBekki17Form(props: Props) {
    return (
        <BekkiResultFormBase
            {...props}
            title="消防用水点検票（別記様式17）"
            iframeTitle="消防用水点検票（別記様式17）PDFプレビュー"
            apiPath="/api/generate-fire-water-bekki17-pdf"
            dbTable="inspection_fire_water_bekki17"
            downloadFilenamePrefix="消防用水点検票"
            sections={[
                { key: "page1_rows", title: "点検項目", labels: PAGE1_ITEMS },
            ]}
            notesCardTitle="備考"
            notesRows={8}
        />
    )
}