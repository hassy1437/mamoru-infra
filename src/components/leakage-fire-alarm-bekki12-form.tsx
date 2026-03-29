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
    "周囲の状況",
    "外形",
    "表示",
    "受電源表示灯",
    "スイッチ類",
    "ヒューズ類",
    "信試験装置",
    "表示灯",
    "結線接続",
    "接地 / 機",
    "感度調整装置",
    "予備品等",
    "外形",
    "表示 / 変",
    "流未警戒",
    "器容量",
    "外形",
    "音 / 取付状態 / 響",
    "装音圧等 / 置",
    "置 / 周囲の状況 / 漏電火災警",
    "報器の作動 / 外形 / と連動して",
    "と連動して / 電流の遮断定格電流容量",
    "を行う装置 / 作動状況",
] as const
const PAGE2_ITEMS = [
    "作動範囲",
    "漏電表示灯",
    "音響装置の音圧",
    "漏電火災警報器の作動と連動 / して電流の遮断を行う装置",
] as const

export default function LeakageFireAlarmBekki12Form(props: Props) {
    return (
        <BekkiResultFormBase
            {...props}
            title="???????????????12???"
            iframeTitle="???????????????12?PDF?????"
            apiPath="/api/generate-leakage-fire-alarm-bekki12-pdf"
            dbTable="inspection_leakage_fire_alarm_bekki12"
            downloadFilenamePrefix="??????????"
            sections={[
                { key: "page1_rows", title: "??1 ????", labels: PAGE1_ITEMS },
                { key: "page2_rows", title: "??2 ????", labels: PAGE2_ITEMS },
            ]}
            notesCardTitle="??2 ??????"
            notesRows={10}
        />
    )
}
