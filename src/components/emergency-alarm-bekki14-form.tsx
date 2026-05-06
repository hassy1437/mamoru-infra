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
    "非常電源（内蔵型） / 外形",
    "非常電源（内蔵型） / 表示",
    "非常電源（内蔵型） / 端子電圧（Ｖ）",
    "非常電源（内蔵型） / 切替装置",
    "非常電源（内蔵型） / 充電装置",
    "非常電源（内蔵型） / 結線接続",
    "非常ベル・自動式サイレン / 起動装置 / 周囲の状況",
    "非常ベル・自動式サイレン / 起動装置 / 外形",
    "非常ベル・自動式サイレン / 起動装置 / 表示",
    "非常ベル・自動式サイレン / 起動装置 / 機能",
    "非常ベル・自動式サイレン / 操作部・複合装置 / 外形",
    "非常ベル・自動式サイレン / 操作部・複合装置 / 表示",
    "非常ベル・自動式サイレン / 操作部・複合装置 / 電圧計（Ｖ）",
    "非常ベル・自動式サイレン / 操作部・複合装置 / スイッチ類",
    "非常ベル・自動式サイレン / 操作部・複合装置 / ヒューズ類（Ａ）",
    "非常ベル・自動式サイレン / 操作部・複合装置 / 継電器",
    "非常ベル・自動式サイレン / 操作部・複合装置 / 表示灯",
    "非常ベル・自動式サイレン / 操作部・複合装置 / 結線接続",
    "非常ベル・自動式サイレン / 操作部・複合装置 / 接地",
    "非常ベル・自動式サイレン / 操作部・複合装置 / 予備品等",
    "非常ベル・自動式サイレン / ベル・サイレン / 外形",
    "非常ベル・自動式サイレン / ベル・サイレン / 取付状態",
    "非常ベル・自動式サイレン / ベル・サイレン / 音圧等",
    "非常ベル・自動式サイレン / ベル・サイレン / 鳴動方式（一斉・区分・相互・再鳴動）",
    "非常ベル・自動式サイレン / ベル・サイレン / 表示灯",
] as const
const PAGE2_ITEMS = [
    "放送設備 / 起動装置 / 周囲の状況",
    "放送設備 / 起動装置 / 外形",
    "放送設備 / 起動装置 / 押しボタン等",
    "放送設備 / 起動装置 / 発信機・非常電話",
    "放送設備 / 起動装置 / 自動火災報知設備との連動",
    "放送設備 / 増幅器等 / 周囲の状況",
    "放送設備 / 増幅器等 / 外形",
    "放送設備 / 増幅器等 / 表示",
    "放送設備 / 増幅器等 / 電圧計（Ｖ）",
    "放送設備 / 増幅器等 / スイッチ類",
    "放送設備 / 増幅器等 / 保護板",
    "放送設備 / 増幅器等 / ヒューズ類（Ａ）",
    "放送設備 / 増幅器等 / 継電器",
    "放送設備 / 増幅器等 / 計器類",
    "放送設備 / 増幅器等 / 表示灯",
    "放送設備 / 増幅器等 / 結線接続",
    "放送設備 / 増幅器等 / 接地",
    "放送設備 / 増幅器等 / 回路選択",
    "放送設備 / 増幅器等 / ２以上の操作部等",
    "放送設備 / 増幅器等 / 遠隔操作器の連動",
    "放送設備 / 増幅器等 / 非常用放送切替",
    "放送設備 / 増幅器等 / ※地震動予報等に係る放送切替",
    "放送設備 / 増幅器等 / 回路短絡",
    "放送設備 / 増幅器等 / 音声警報音",
    "放送設備 / 増幅器等 / 火災音信号",
    "放送設備 / 増幅器等 / マイクロホン",
    "放送設備 / 増幅器等 / 予備品等",
    "放送設備 / スピーカー / 外形",
    "放送設備 / スピーカー / 取付状態",
    "放送設備 / スピーカー / 音圧等",
    "放送設備 / スピーカー / 鳴動方式（一斉・区分・相互・再鳴動）",
    "放送設備 / スピーカー / 音量調整器",
    "放送設備 / スピーカー / 表示灯",
    "警鐘・ゴング等 / 周囲の状況",
    "警鐘・ゴング等 / 外形",
    "警鐘・ゴング等 / 機能",
] as const
const PAGE3_ITEMS = [
    "音響装置・スピーカーの音圧",
    "総合作動",
] as const

export default function EmergencyAlarmBekki14Form(props: Props) {
    return (
        <BekkiResultFormBase
            {...props}
            title="非常警報器具及び設備点検票（別記様式14）"
            iframeTitle="非常警報器具及び設備点検票（別記様式14）PDFプレビュー"
            apiPath="/api/generate-emergency-alarm-bekki14-pdf"
            dbTable="inspection_emergency_alarm_bekki14"
            downloadFilenamePrefix="非常警報器具及び設備点検票"
            sections={[
                { key: "page1_rows", title: "（その1）機器点検", labels: PAGE1_ITEMS },
                { key: "page2_rows", title: "（その2）機器点検", labels: PAGE2_ITEMS },
                { key: "page3_rows", title: "（その3）総合点検", labels: PAGE3_ITEMS },
            ]}
            notesCardTitle="（その3）備考・測定機器"
            notesRows={12}
        />
    )
}
