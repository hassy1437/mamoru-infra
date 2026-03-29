"use client"

import BekkiResultFormBase, { type BekkiBasePayload } from "@/components/bekki-result-form-base"

type EvacuationEquipmentBekki15Payload = BekkiBasePayload

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
    savedPayload?: Partial<EvacuationEquipmentBekki15Payload> | null
    savedUpdatedAt?: string | null
}

const PAGE1_ITEMS = [
    "設置場所",
    "周囲の状況：操作面積等",
    "周囲の状況：開口部",
    "周囲の状況：降下空間",
    "周囲の状況：避難空地",
    "標識",
    "縦棒",
    "横さん",
    "突子",
    "結合部等",
    "可動部外形",
    "機能（はしご）",
    "つり下げ金具（はしご）",
    "調速機外形",
    "調速機機能",
    "調速機の連結部",
    "ロープ（緩降機）",
    "着用具",
    "ロープと着用具の緊結部",
    "底板及び側板",
    "すべり面の勾配",
    "手すり",
    "すべり棒",
    "ロープ本体",
    "結合部（避難ロープ）",
    "つり下げ金具（避難ロープ）",
] as const

const PAGE2_ITEMS = [
    "床板・手すり等",
    "接合部（避難橋）",
    "可動部外形（避難橋）",
    "機能（避難橋）",
    "踏み板・手すり等",
    "接合部（避難用タラップ）",
    "可動部外形（避難用タラップ）",
    "機能（避難用タラップ）",
    "本体布及び展張部材",
    "縫い合せ部",
    "保護装置（斜降式の救助袋に限る）",
    "結合部（救助袋）",
    "可動部外形（救助袋）",
    "機能（救助袋）",
    "取付具",
    "可動部（取付具）",
    "支持部",
    "固定環",
    "上蓋",
    "下蓋",
    "使用方法の表示",
    "格納箱（格納状況）",
] as const

export default function EvacuationEquipmentBekki15Form(props: Props) {
    return (
        <BekkiResultFormBase
            {...props}
            title="避難器具点検票（別記様式15）"
            iframeTitle="避難器具点検票（別記様式15）PDFプレビュー"
            apiPath="/api/generate-evacuation-equipment-bekki15-pdf"
            dbTable="inspection_evacuation_equipment_bekki15"
            downloadFilenamePrefix="避難器具点検票"
            sections={[
                { key: "page1_rows", title: "その1 点検項目", labels: PAGE1_ITEMS },
                { key: "page2_rows", title: "その2 点検項目", labels: PAGE2_ITEMS },
            ]}
            notesCardTitle="備考（その2）"
            notesRows={10}
        />
    )
}