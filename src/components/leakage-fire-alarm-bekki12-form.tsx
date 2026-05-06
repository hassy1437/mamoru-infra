"use client"

import BekkiResultFormBase, { type BekkiBasePayload } from "@/components/bekki-result-form-base"

type LeakageFireAlarmBekki12Payload = BekkiBasePayload

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
    savedPayload?: Partial<LeakageFireAlarmBekki12Payload> | null
    savedUpdatedAt?: string | null
}

const PAGE1_ITEMS = [
    "受信機 周囲の状況",
    "受信機 外形",
    "受信機 表示",
    "受信機 電源表示灯",
    "受信機 スイッチ類",
    "受信機 ヒューズ類（Ａ）",
    "受信機 試験装置",
    "受信機 表示灯",
    "受信機 結線接続",
    "受信機 接地",
    "受信機 感度調整装置（mA）",
    "受信機 予備品等",
    "変流器 外形",
    "変流器 表示",
    "変流器 未警戒",
    "変流器 容量（Ａ）",
    "音響装置 外形",
    "音響装置 取付状態",
    "音響装置 音圧等",
    "漏電火災警報器の作動と連動して電流の遮断を行う装置 周囲の状況",
    "漏電火災警報器の作動と連動して電流の遮断を行う装置 外形",
    "漏電火災警報器の作動と連動して電流の遮断を行う装置 定格電流容量（Ａ）",
    "漏電火災警報器の作動と連動して電流の遮断を行う装置 作動状況",
] as const
const PAGE2_ITEMS = [
    "作動範囲（－％～＋％）",
    "漏電表示灯",
    "音響装置の音圧（db）",
    "漏電火災警報器の作動と連動して電流の遮断を行う装置",
] as const

export default function LeakageFireAlarmBekki12Form(props: Props) {
    return (
        <BekkiResultFormBase
            {...props}
            title="漏電火災警報器点検票（別記様式12）"
            iframeTitle="漏電火災警報器点検票（別記様式12）PDFプレビュー"
            apiPath="/api/generate-leakage-fire-alarm-bekki12-pdf"
            dbTable="inspection_leakage_fire_alarm_bekki12"
            downloadFilenamePrefix="漏電火災警報器点検票"
            sections={[
                { key: "page1_rows", title: "（その1）機器点検", labels: PAGE1_ITEMS },
                { key: "page2_rows", title: "（その2）総合点検", labels: PAGE2_ITEMS },
            ]}
            notesCardTitle="（その2）備考・測定機器"
            notesRows={10}
        />
    )
}
