"use client"

import BekkiResultFormBase, { type BekkiBasePayload } from "@/components/bekki-result-form-base"

type GuidanceLightsSignsBekki16Payload = BekkiBasePayload

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
    savedPayload?: Partial<GuidanceLightsSignsBekki16Payload> | null
    savedUpdatedAt?: string | null
}

const PAGE1_ITEMS = [
    "種類",
    "外箱・表示面：視認障害等",
    "外箱・表示面：外形",
    "外箱・表示面：表示",
    "非常電源（内蔵型）：外形",
    "非常電源（内蔵型）：表示",
    "非常電源（内蔵型）：機能",
    "光源",
    "点検スイッチ",
    "ヒューズ類",
    "結線接続（誘導灯）",
    "外形（信号装置）",
    "結線接続（信号装置）",
    "機能（信号装置）",
] as const

const PAGE2_ITEMS = [
    "外形（誘導標識）",
    "視認障害等（誘導標識）",
    "採光又は照明（誘導標識）",
    "※表示面の輝度（誘導標識）",
    "※設置場所の照度（誘導標識）",
    "※※ヒューズ類（誘導標識）",
    "※※結線接続（誘導標識）",
    "外形（※※※非常電源）",
    "※※※非常電源表示",
    "機能（※※※非常電源）",
] as const

export default function GuidanceLightsSignsBekki16Form(props: Props) {
    return (
        <BekkiResultFormBase
            {...props}
            title="誘導灯及び誘導標識点検票（別記様式16）"
            iframeTitle="誘導灯及び誘導標識点検票（別記様式16）PDFプレビュー"
            apiPath="/api/generate-guidance-lights-signs-bekki16-pdf"
            dbTable="inspection_guidance_lights_signs_bekki16"
            downloadFilenamePrefix="誘導灯及び誘導標識点検票"
            sections={[
                { key: "page1_rows", title: "その1 点検項目", labels: PAGE1_ITEMS },
                { key: "page2_rows", title: "その2 点検項目", labels: PAGE2_ITEMS },
            ]}
            notesCardTitle="備考（その2）"
            notesRows={12}
        />
    )
}