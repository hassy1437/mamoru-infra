"use client"

import BekkiResultFormBase, { type BekkiBasePayload } from "@/components/bekki-result-form-base"

type GasLeakFireAlarmBekki11_2Payload = BekkiBasePayload

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
    savedPayload?: Partial<GasLeakFireAlarmBekki11_2Payload> | null
    savedUpdatedAt?: string | null
}

const PAGE1_ITEMS = [
    "機器点検（見出し行・通常入力不要）",
    "予備電源・非常電源（内蔵型） / 外形",
    "予備電源・非常電源（内蔵型） / 表示",
    "予備電源・非常電源（内蔵型） / 端子電圧（Ｖ）",
    "予備電源・非常電源（内蔵型） / 切替装置",
    "予備電源・非常電源（内蔵型） / 充電装置",
    "予備電源・非常電源（内蔵型） / 結線接続",
    "受信機・中継器 / 周囲の状況",
    "受信機・中継器 / 外形",
    "受信機・中継器 / 表示",
    "受信機・中継器 / 警戒区域の表示装置",
    "受信機・中継器 / 電圧計（Ｖ）",
    "受信機・中継器 / スイッチ類",
    "受信機・中継器 / ヒューズ類（Ａ）",
    "受信機・中継器 / 継電器",
    "受信機・中継器 / 表示灯",
    "受信機・中継器 / 通話装置",
    "受信機・中継器 / 結線接続",
    "受信機・中継器 / 接地",
    "受信機・中継器 / 附属装置",
    "受信機・中継器 / ガス漏れ表示",
    "受信機・中継器 / 回路導通",
    "受信機・中継器 / 故障表示",
    "受信機・中継器 / 予備品等",
] as const
const PAGE2_ITEMS = [
    "ガス漏れ検知器 / 外形",
    "ガス漏れ検知器 / 警戒状況 / 未警戒部分",
    "ガス漏れ検知器 / 警戒状況 / 設置場所・設置位置",
    "ガス漏れ検知器 / 警戒状況 / 適応性",
    "ガス漏れ検知器 / 警戒状況 / 機能障害",
    "ガス漏れ検知器 / 作動等",
    "警報装置 / 音声警報装置 / 外形",
    "警報装置 / 音声警報装置 / 取付状態",
    "警報装置 / 音声警報装置 / 増幅器、操作部",
    "警報装置 / 音声警報装置 / 音圧等",
    "警報装置 / ガス漏れ表示灯",
    "警報装置 / 検知区域警報装置 / 外形",
    "警報装置 / 検知区域警報装置 / 取付状態",
    "警報装置 / 検知区域警報装置 / 音圧等",
    "警報装置 / 検知区域警報装置 / 鳴動区域",
    "総合点検（見出し行・通常入力不要）",
    "同時作動",
    "検知区域警報装置（db）",
    "総合作動",
] as const

export default function GasLeakFireAlarmBekki11_2Form(props: Props) {
    return (
        <BekkiResultFormBase
            {...props}
            title="ガス漏れ火災警報設備点検票（別記様式11の2）"
            iframeTitle="ガス漏れ火災警報設備点検票（別記様式11の2）PDFプレビュー"
            apiPath="/api/generate-gas-leak-fire-alarm-bekki11-2-pdf"
            dbTable="inspection_gas_leak_fire_alarm_bekki11_2"
            downloadFilenamePrefix="ガス漏れ火災警報設備点検票"
            defaultInspectionType="機器・総合"
            sections={[
                { key: "page1_rows", title: "（その1）機器点検", labels: PAGE1_ITEMS },
                { key: "page2_rows", title: "（その2）機器・総合点検", labels: PAGE2_ITEMS },
            ]}
            extraFieldsTitle="設備情報"
            extraFields={[
                { key: "receiver_maker", label: "受信機 製造者名" },
                { key: "receiver_model", label: "受信機 型式等" },
                { key: "repeater_maker", label: "中継器 製造者名" },
                { key: "repeater_model", label: "中継器 型式等" },
            ]}
            notesCardTitle="（その2）備考・測定機器"
            notesRows={6}
        />
    )
}
