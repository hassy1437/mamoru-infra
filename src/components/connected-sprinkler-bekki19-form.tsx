"use client"

import BekkiResultFormBase, { type BekkiBasePayload } from "@/components/bekki-result-form-base"

type ConnectedSprinklerBekki19Payload = BekkiBasePayload

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
    savedPayload?: Partial<ConnectedSprinklerBekki19Payload> | null
    savedUpdatedAt?: string | null
}

const PAGE1_ITEMS = [
    "送水口 周囲の状況",
    "送水口 外形",
    "送水口 本体",
    "送水口 標識・系統図",
    "選択弁 周囲の状況",
    "選択弁 表示",
    "選択弁 外形",
    "選択弁 機能",
    "一斉開放弁（電磁弁を含む。） 周囲の状況等",
    "一斉開放弁（電磁弁を含む。） 外形",
    "一斉開放弁（電磁弁を含む。） 機能",
    "配管等 管・管継手",
    "配管等 支持金具・つり金具",
    "配管等 耐熱措置",
    "配管等 バルブ類",
    "散水ヘッド 外形",
    "散水ヘッド 散水分布障害",
    "散水ヘッド 感熱障害",
    "散水ヘッド 未警戒部分",
    "散水ヘッド 耐震措置",
] as const

export default function ConnectedSprinklerBekki19Form(props: Props) {
    return (
        <BekkiResultFormBase
            {...props}
            title="連結散水設備点検票（別記様式19）"
            iframeTitle="連結散水設備点検票（別記様式19）PDFプレビュー"
            apiPath="/api/generate-connected-sprinkler-bekki19-pdf"
            dbTable="inspection_connected_sprinkler_bekki19"
            downloadFilenamePrefix="連結散水設備点検票"
            sections={[{ key: "page1_rows", title: "機器点検", labels: PAGE1_ITEMS }]}
            notesCardTitle="備考（その1）"
            notesRows={8}
        />
    )
}
