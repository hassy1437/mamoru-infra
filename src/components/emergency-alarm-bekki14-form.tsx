"use client"

import BekkiResultFormBase, { type BekkiBasePayload } from "@/components/bekki-result-form-base"

type EmergencyAlarmBekki14Payload = BekkiBasePayload

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
    savedPayload?: Partial<EmergencyAlarmBekki14Payload> | null
    savedUpdatedAt?: string | null
}

const PAGE1_ITEMS = [
    "外形 / 非",
    "非 / 表示 / 常",
    "電 / 端子電圧 / 源",
    "源 / 切替装置 / （",
    "内充電装置 / 蔵",
    "蔵 / 結線接続 / 型",
    "）周囲の状況",
    "起外形",
    "動 / 表示 / 非 / 装",
    "装 / 機能 / 置 / 常",
    "常 / 外形",
    "ベ表示 / 操",
    "操 / 電圧計 / ル / 作",
    "作 / スイッチ類 / ・部",
    "・部 / ヒューズ類",
    "・ / 自継電器",
    "複 / 表示灯 / 動",
    "合 / 結線接続",
    "式装 / 接地",
    "置 / サ予備品等",
    "外形 / イベ",
    "ル取付状態 / ・",
    "・ / レ / サ音圧等 / イ",
    "イ / ンレ鳴動方式 / ン",
    "ン / 表示灯",
] as const
const PAGE2_ITEMS = [
    "周囲の状況",
    "外形 / 起",
    "押しボタン等 / 動",
    "装発信機・非常電話",
    "置自動火災報知設備との連動",
    "周囲の状況",
    "外形",
    "表示",
    "電圧計",
    "スイッチ類",
    "保護板",
    "増ヒューズ類 / 放",
    "放 / 継電器",
    "計器類",
    "表示灯 / 幅",
    "送結線接続",
    "接地",
    "回路選択",
    "器 / ２以上の操作部等 / 設",
    "遠隔操作器の連動",
    "非常用放送切替",
    "等※地震動予報等に係る放送切替",
    "備 / 回路短絡",
    "音声警報音",
    "火災音信号",
    "マイクロホン",
    "予備品等",
    "外形",
    "ス / 取付状態",
    "ピ / 音圧等 / ー",
    "ー / 鳴動方式 / カ",
    "カ / 音量調整器 / ー",
    "表示灯",
    "周囲の状況",
    "警ゴ / 外形 / ン / 鐘",
    "鐘 / グ / 機能 / ・等",
] as const
const PAGE3_ITEMS = [
    "音響装置・スピーカーの音圧",
    "総合作動",
] as const

export default function EmergencyAlarmBekki14Form(props: Props) {
    return (
        <BekkiResultFormBase
            {...props}
            title="??????????????????14???"
            iframeTitle="??????????????????14?PDF?????"
            apiPath="/api/generate-emergency-alarm-bekki14-pdf"
            dbTable="inspection_emergency_alarm_bekki14"
            downloadFilenamePrefix="?????????????"
            sections={[
                { key: "page1_rows", title: "??1 ????", labels: PAGE1_ITEMS },
                { key: "page2_rows", title: "??2 ????", labels: PAGE2_ITEMS },
                { key: "page3_rows", title: "??3 ????", labels: PAGE3_ITEMS },
            ]}
            notesCardTitle="??3 ??????"
            notesRows={12}
        />
    )
}
