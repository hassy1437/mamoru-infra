"use client"

import BekkiResultFormBase, { type BekkiBasePayload } from "@/components/bekki-result-form-base"

type JidouKasaiHouchiBekki11_1Payload = BekkiBasePayload

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
    savedPayload?: Partial<JidouKasaiHouchiBekki11_1Payload> | null
    savedUpdatedAt?: string | null
}

const PAGE1_ITEMS = [
    "外形 / 予",
    "予 / 備表示",
    "電（ / ※端子電圧 / 源内",
    "源内 / ・※切替装置 / 蔵",
    "非 / 型※充電装置 / 常",
    "） / 電※結線接続",
    "源 / 周囲の状況",
    "外形",
    "表示",
    "警戒区域の表示装置",
    "電圧計 / 受",
    "受 / スイッチ類",
    "ヒューズ類",
    "信 / ※継電器",
    "表示灯",
    "機通話装置",
    "※結線接続",
    "接地 / ・",
    "附属装置",
    "蓄積式 / 中",
    "中 / アナログ式 / ※火災表示等",
    "※火災表示等 / 二信号式",
    "継 / その他",
    "※注意表示",
    "器回路導通",
    "設定表示温度等",
    "感知器作動等の表示",
    "予備品等",
] as const
const PAGE2_ITEMS = [
    "外形",
    "未警戒部分 / 警",
    "警 / 感知区域 / 戒",
    "戒 / 適応性 / 状",
    "感 / 機能障害 / 況",
    "スポット型 / ※",
    "※ / 空気管式 / 熱 / 分",
    "分 / 知感布熱電対式・熱半導体式 / 型",
    "知 / 感知線型 / 器",
    "※スポット型 / 煙",
    "煙 / 感 / 分離型 / 器知",
    "器 / ※炎感知器",
    "※多信号感知器・複合式感知器",
    "遠隔試験機能を有する感知器",
    "周囲の状況",
    "外形 / 発",
    "発 / 表示 / 信",
    "押しボタン・送受話器 / 機",
    "表示灯",
    "外形",
    "音 / 取付状態",
    "響 / 音圧等 / 装",
    "置鳴動方式",
    "※蓄積機能",
    "※二信号機能",
] as const
const PAGE3_ITEMS = [
    "予備電源・非常電源",
    "受信機の火災表示 / 自",
    "動受信機の注意表示",
    "試 / 受信機･中継器の制御機能･電路 / 験",
    "機感知器",
    "能 / 感知器回路・ベル回路",
    "無線機能",
    "??8",
    "同時作動",
    "※煙感知器等の感度",
    "地区音響装置の音圧",
    "※総合作動",
] as const

export default function JidouKasaiHouchiBekki11_1Form(props: Props) {
    return (
        <BekkiResultFormBase
            {...props}
            title="????????????????11?1???"
            iframeTitle="????????????????11?1?PDF?????"
            apiPath="/api/generate-jidou-kasai-houchi-bekki11-1-pdf"
            dbTable="inspection_jidou_kasai_houchi_bekki11_1"
            downloadFilenamePrefix="???????????"
            sections={[
                { key: "page1_rows", title: "??1 ????", labels: PAGE1_ITEMS },
                { key: "page2_rows", title: "??2 ????", labels: PAGE2_ITEMS },
                { key: "page3_rows", title: "??3 ????", labels: PAGE3_ITEMS },
            ]}
            extraFieldsTitle="??????"
            extraFields={[
                { key: "receiver_maker", label: "??? ????" },
                { key: "receiver_model", label: "??? ???" },
            ]}
            notesCardTitle="??3 ??????"
            notesRows={8}
        />
    )
}
