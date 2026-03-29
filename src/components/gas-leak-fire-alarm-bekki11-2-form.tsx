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
    "??1",
    "外形",
    "予 / 表示 / 備",
    "電（ / 端子電圧 / 源内",
    "源内 / ・蔵切替装置",
    "非型 / 充電装置 / 常）",
    "電 / 結線接続 / 源",
    "源 / 周囲の状況",
    "外形",
    "表示",
    "警戒区域の表示装置 / 受",
    "電圧計",
    "信スイッチ類",
    "ヒューズ類",
    "機継電器",
    "表示灯 / ・",
    "・ / 通話装置",
    "結線接続 / 中",
    "接地",
    "継附属装置",
    "ガス漏れ表示",
    "器回路導通",
    "故障表示",
    "予備品等",
] as const
const PAGE2_ITEMS = [
    "外形",
    "ガ / 未警戒部分 / ス警",
    "ス警 / 設置場所・設置位置 / 漏 / 戒",
    "戒 / れ適応性 / 状",
    "検 / 機能障害 / 知況",
    "作動等 / 器",
    "外形",
    "音 / 取付状態 / 声",
    "警 / 増幅器、操作部 / 警報",
    "装 / 音圧等 / 置",
    "報 / ガス漏れ表示灯",
    "外形 / 装",
    "取付状態 / 検知区域",
    "置 / 警報装置 / 音圧等",
    "鳴動区域",
    "??16",
    "同時作動",
    "検知区域警報装置",
    "総合作動",
] as const

export default function GasLeakFireAlarmBekki11_2Form(props: Props) {
    return (
        <BekkiResultFormBase
            {...props}
            title="??????????????????11?2???"
            iframeTitle="??????????????????11?2?PDF?????"
            apiPath="/api/generate-gas-leak-fire-alarm-bekki11-2-pdf"
            dbTable="inspection_gas_leak_fire_alarm_bekki11_2"
            downloadFilenamePrefix="?????????????"
            defaultInspectionType="?????"
            sections={[
                { key: "page1_rows", title: "??1 ????", labels: PAGE1_ITEMS },
                { key: "page2_rows", title: "??2 ????", labels: PAGE2_ITEMS },
            ]}
            extraFieldsTitle="??????"
            extraFields={[
                { key: "receiver_maker", label: "??? ????" },
                { key: "receiver_model", label: "??? ???" },
                { key: "repeater_maker", label: "??? ????" },
                { key: "repeater_model", label: "??? ???" },
            ]}
            notesCardTitle="??2 ??????"
            notesRows={6}
        />
    )
}
