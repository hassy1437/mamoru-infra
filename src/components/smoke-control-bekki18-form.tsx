"use client"

import BekkiResultFormBase, { type BekkiBasePayload } from "@/components/bekki-result-form-base"

type SmokeControlBekki18Payload = BekkiBasePayload

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
    savedPayload?: Partial<SmokeControlBekki18Payload> | null
    savedUpdatedAt?: string | null
}

const PAGE1_ITEMS = [
    "防煙区画壁 / 固定壁",
    "防煙区画壁 / 周囲の状況",
    "防煙区画壁 / 可動壁 / 外形",
    "防煙区画壁 / 可動壁 / 機能",
    "排煙口・給気口 / 周囲の状況",
    "排煙口・給気口 / 外形",
    "排煙口・給気口 / 機能",
    "風道 / 周囲の状況",
    "風道 / 外形",
    "風道 / 支持部",
    "風道 / 防火ダンパー",
    "風道 / 接続部",
    "制御盤 / 周囲の状況",
    "制御盤 / 外形",
    "電動機の制御装置 / 表示",
    "電動機の制御装置 / 電圧計・電流計（Ｖ・Ａ）",
    "電動機の制御装置 / 開閉器・スイッチ類",
    "電動機の制御装置 / ヒューズ類（Ａ）",
    "電動機の制御装置 / 継電器",
    "電動機の制御装置 / 表示灯",
    "電動機の制御装置 / 結線接続",
    "電動機の制御装置 / 接地",
    "電動機の制御装置 / 予備品等",
] as const

const PAGE2_ITEMS = [
    "起動装置 / 自動式起動装置",
    "起動装置 / 自動式起動装置 / 周囲の状況",
    "起動装置 / 手動式起動装置 / 手動操作箱 / 外形",
    "起動装置 / 手動式起動装置 / 手動操作箱 / 表示",
    "起動装置 / 手動式起動装置 / ハンドル・レバー等",
    "起動装置 / 手動式起動装置 / 機能",
    "排煙機・給気機 / 電動機 / 回転軸",
    "排煙機・給気機 / 電動機 / 軸受部",
    "排煙機・給気機 / 電動機 / 動力伝達装置",
    "排煙機・給気機 / 電動機 / 機能",
    "排煙機・給気機 / 回転羽根等 / 回転軸",
    "排煙機・給気機 / 回転羽根等 / 軸受部",
    "排煙機・給気機 / 排煙出口",
    "総合点検（見出し行・通常入力不要）",
    "総合点検 / 排煙機・給気機",
    "総合点検 / 可動壁",
    "総合点検 / 電動機の運転電流（Ａ）",
    "総合点検 / 運転状況",
    "総合点検 / 回転羽根",
] as const

export default function SmokeControlBekki18Form(props: Props) {
    return (
        <BekkiResultFormBase
            {...props}
            title="排煙設備点検票（別記様式18）"
            iframeTitle="排煙設備点検票（別記様式18）PDFプレビュー"
            apiPath="/api/generate-smoke-control-bekki18-pdf"
            dbTable="inspection_smoke_control_bekki18"
            downloadFilenamePrefix="排煙設備点検票"
            extraFieldsTitle="排煙機（製造者・型式）"
            extraFields={[
                { key: "smoke_machine_maker", label: "製造者名" },
                { key: "smoke_machine_model", label: "型式等" },
            ]}
            sections={[
                { key: "page1_rows", title: "（その1）機器点検", labels: PAGE1_ITEMS, currentValueRowIndex: 15 },
                { key: "page2_rows", title: "（その2）点検結果", labels: PAGE2_ITEMS },
            ]}
            notesCardTitle="備考（その2）"
            notesRows={10}
        />
    )
}
