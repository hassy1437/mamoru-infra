"use client"

import BekkiResultFormBase, { type BekkiBasePayload } from "@/components/bekki-result-form-base"

type JidouKasaiHouchiBekki11_1Payload = BekkiBasePayload

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
    savedPayload?: Partial<JidouKasaiHouchiBekki11_1Payload> | null
    savedUpdatedAt?: string | null
}

const PAGE1_ITEMS = [
    "予備電源・非常電源（内蔵型） / 外形",
    "予備電源・非常電源（内蔵型） / 表示",
    "予備電源・非常電源（内蔵型） / ※端子電圧（Ｖ）",
    "予備電源・非常電源（内蔵型） / ※切替装置",
    "予備電源・非常電源（内蔵型） / ※充電装置",
    "予備電源・非常電源（内蔵型） / ※結線接続",
    "受信機・中継器 / 周囲の状況",
    "受信機・中継器 / 外形",
    "受信機・中継器 / 表示",
    "受信機・中継器 / 警戒区域の表示装置",
    "受信機・中継器 / 電圧計（Ｖ）",
    "受信機・中継器 / スイッチ類",
    "受信機・中継器 / ヒューズ類（Ａ）",
    "受信機・中継器 / ※継電器",
    "受信機・中継器 / 表示灯",
    "受信機・中継器 / 通話装置",
    "受信機・中継器 / ※結線接続",
    "受信機・中継器 / 接地",
    "受信機・中継器 / 附属装置",
    "受信機・中継器 / ※火災表示等 / 蓄積式",
    "受信機・中継器 / ※火災表示等 / アナログ式",
    "受信機・中継器 / ※火災表示等 / 二信号式",
    "受信機・中継器 / ※火災表示等 / その他",
    "受信機・中継器 / ※注意表示",
    "受信機・中継器 / 回路導通",
    "受信機・中継器 / 設定表示温度等",
    "受信機・中継器 / 感知器作動等の表示",
    "受信機・中継器 / 予備品等",
] as const
const PAGE2_ITEMS = [
    "感知器 / 外形",
    "感知器 / 警戒状況 / 未警戒部分",
    "感知器 / 警戒状況 / 感知区域",
    "感知器 / 警戒状況 / 適応性",
    "感知器 / 警戒状況 / 機能障害",
    "感知器 / ※熱感知器 / スポット型（差動・定温（再）・熱アナログ）",
    "感知器 / ※熱感知器 / 分布型 / 空気管式",
    "感知器 / ※熱感知器 / 分布型 / 熱電対式・熱半導体式",
    "感知器 / ※熱感知器 / 感知線型",
    "感知器 / ※煙感知器 / スポット型（イオン・光電・アナログ）",
    "感知器 / ※煙感知器 / 分離型",
    "感知器 / ※炎感知器（赤外線・紫外線）",
    "感知器 / ※多信号感知器・複合式感知器",
    "感知器 / 遠隔試験機能を有する感知器",
    "発信機 / 周囲の状況",
    "発信機 / 外形",
    "発信機 / 表示",
    "発信機 / 押しボタン・送受話器",
    "発信機 / 表示灯",
    "音響装置 / 外形",
    "音響装置 / 取付状態",
    "音響装置 / 音圧等",
    "音響装置 / 鳴動方式（一斉・区分・相互・再鳴動）",
    "音響装置 / ※蓄積機能",
    "音響装置 / ※二信号機能",
] as const
const PAGE3_ITEMS = [
    "自動試験機能 / 予備電源・非常電源",
    "自動試験機能 / 受信機の火災表示",
    "自動試験機能 / 受信機の注意表示",
    "自動試験機能 / 受信機・中継器の制御機能・電路",
    "自動試験機能 / 感知器",
    "自動試験機能 / 感知器回路・ベル回路",
    "自動試験機能 / 無線機能",
    "総合点検（見出し行・通常入力不要）",
    "同時作動",
    "※煙感知器等の感度",
    "地区音響装置の音圧",
    "※総合作動",
] as const

export default function JidouKasaiHouchiBekki11_1Form(props: Props) {
    return (
        <BekkiResultFormBase
            {...props}
            title="自動火災報知設備点検票（別記様式11の1）"
            iframeTitle="自動火災報知設備点検票（別記様式11の1）PDFプレビュー"
            apiPath="/api/generate-jidou-kasai-houchi-bekki11-1-pdf"
            dbTable="inspection_jidou_kasai_houchi_bekki11_1"
            downloadFilenamePrefix="自動火災報知設備点検票"
            sections={[
                { key: "page1_rows", title: "（その1）機器点検", labels: PAGE1_ITEMS },
                { key: "page2_rows", title: "（その2）機器点検", labels: PAGE2_ITEMS },
                { key: "page3_rows", title: "（その3）総合点検", labels: PAGE3_ITEMS },
            ]}
            extraFieldsTitle="設備情報"
            extraFields={[
                { key: "receiver_maker", label: "受信機 製造者名" },
                { key: "receiver_model", label: "受信機 型式等" },
            ]}
            notesCardTitle="（その3）備考・測定機器"
            notesRows={8}
        />
    )
}
