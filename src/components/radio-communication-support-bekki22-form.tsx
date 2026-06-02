"use client"

import BekkiResultFormBase, { type BekkiBasePayload } from "@/components/bekki-result-form-base"

type RadioCommunicationSupportBekki22Payload = BekkiBasePayload

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
    savedPayload?: Partial<RadioCommunicationSupportBekki22Payload> | null
    savedUpdatedAt?: string | null
}

const PAGE1_ITEMS = [
    "保護箱 周囲の状況",
    "保護箱 外形",
    "保護箱 表示",
    "無線機 外形",
    "無線機 無反射終端抵抗器・キャップ",
    "無線機 コネクター",
    "無線機 増幅器",
    "無線機 分配器等",
    "無線機 空中線",
    "漏洩同軸ケーブル 支持部",
    "漏洩同軸ケーブル 防湿措置",
    "漏洩同軸ケーブル 耐熱保護",
    "漏洩同軸ケーブル 可とう性",
    "漏洩同軸ケーブル 結線接続",
] as const

export default function RadioCommunicationSupportBekki22Form(props: Props) {
    return (
        <BekkiResultFormBase
            {...props}
            title="無線通信補助設備点検票（別記様式22）"
            iframeTitle="無線通信補助設備点検票（別記様式22）PDFプレビュー"
            apiPath="/api/generate-radio-communication-support-bekki22-pdf"
            dbTable="inspection_radio_communication_support_bekki22"
            downloadFilenamePrefix="無線通信補助設備点検票"
            extraFieldsTitle="漏洩同軸ケーブル・空中線・増幅器"
            extraFields={[
                { key: "cable_maker", label: "漏洩同軸ケーブル 製造者名" },
                { key: "cable_model", label: "漏洩同軸ケーブル 型式等" },
                { key: "antenna_maker", label: "空中線 製造者名" },
                { key: "antenna_model", label: "空中線 型式等" },
                { key: "amplifier_maker", label: "増幅器 製造者名" },
                { key: "amplifier_model", label: "増幅器 型式等" },
            ]}
            sections={[{ key: "page1_rows", title: "機器点検", labels: PAGE1_ITEMS }]}
            notesCardTitle="備考（その1）"
            notesRows={6}
        />
    )
}
