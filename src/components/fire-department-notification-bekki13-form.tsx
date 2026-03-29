"use client"

import BekkiResultFormBase, { type BekkiBasePayload } from "@/components/bekki-result-form-base"

type FireDepartmentNotificationBekki13Payload = BekkiBasePayload

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
    savedPayload?: Partial<FireDepartmentNotificationBekki13Payload> | null
    savedUpdatedAt?: string | null
}

const PAGE1_ITEMS = [
    "外形",
    "表示",
    "予 / 結線接続",
    "備 / 電圧 / 電",
    "電 / 切替装置 / 源",
    "充電装置",
    "火周囲の状況",
    "外形",
    "災表示",
    "ヒューズ類 / 本",
    "通予備品等",
    "手動起動装置 / 起動機能",
    "起動機能 / 報連動起動機能",
    "優先通報機能",
    "装通報頭出し機能",
    "手動起動装置優先機能",
    "置蓄積音声情報機能",
    "再呼出し機能",
    "蓄積音声情報送出後の呼返し",
    "体 / 通話機能等 / 不応答時の通報継続 / （特定火災",
    "通報装置を / 切替 / 除く｡）",
    "通話終了後の呼返し",
] as const
const PAGE2_ITEMS = [
    "ハンズフリー通話への移行 / 通話機能等",
    "本（特定火災 / 切替 / 通報装置に",
    "限る。） / 電話回線の保持",
    "モニター機能 / 体 / 火",
    "火 / 周囲の状況 / 遠",
    "遠 / 災 / 隔外形",
    "起 / 通表示 / 動",
    "装 / 報機能 / 置",
    "外形 / 装 / 回",
    "回 / 外形 / 線 / 置",
    "置 / 終 / 回線終端装置等との接続 / 端予備電源",
    "端予備電源 / 切替装置 / 装",
    "置 / 充電装置 / 等",
    "等 / 周囲の状況 / 消",
    "発 / 防 / 外形 / 機",
    "関 / 押しボタン / へ / 信機能",
    "信機能 / 通 / 連動起動機能 / 報",
    "す / 結線接続 / る機",
    "機 / 火外形 / 災標識板",
    "標識板 / 標 / 報常夜灯 / 知",
    "設標識灯 / 備識",
] as const

export default function FireDepartmentNotificationBekki13Form(props: Props) {
    return (
        <BekkiResultFormBase
            {...props}
            title="???????????????????????13???"
            iframeTitle="???????????????????????13?PDF?????"
            apiPath="/api/generate-fire-department-notification-bekki13-pdf"
            dbTable="inspection_fire_department_notification_bekki13"
            downloadFilenamePrefix="??????????????????"
            sections={[
                { key: "page1_rows", title: "??1 ????", labels: PAGE1_ITEMS },
                { key: "page2_rows", title: "??2 ????", labels: PAGE2_ITEMS },
            ]}
            notesCardTitle="??2 ??????"
            notesRows={8}
        />
    )
}
