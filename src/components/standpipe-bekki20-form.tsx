"use client"

import BekkiResultFormBase, { type BekkiBasePayload } from "@/components/bekki-result-form-base"

type StandpipeBekki20Payload = BekkiBasePayload

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
    savedPayload?: Partial<StandpipeBekki20Payload> | null
    savedUpdatedAt?: string | null
}

const PAGE1_ITEMS = [
    "送水口 / 周囲の状況",
    "送水口 / 外形",
    "送水口 / 本体",
    "送水口 / 標識",
    "放水用器具格納箱等 / 周囲の状況",
    "放水用器具格納箱等 / 外形",
    "放水用器具格納箱等 / 標識",
    "ホース・ノズル / 外形・機能",
    "ホース・ノズル / ホースの耐圧性能",
    "放水口 / 周囲の状況",
    "放水口 / 外形",
    "放水口 / 標識",
    "放水口 / 開閉弁",
    "格納箱",
    "加圧送水装置 / 周囲の状況",
    "加圧送水装置 / 外形",
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
    "加圧送水装置 / 起動装置 / 直接操作部 / 周囲の状況",
    "加圧送水装置 / 起動装置 / 直接操作部 / 外形",
    "加圧送水装置 / 起動装置 / 直接操作部 / 表示",
    "加圧送水装置 / 起動装置 / 直接操作部 / 機能",
    "加圧送水装置 / 起動装置 / 遠隔操作部 / 周囲の状況",
    "加圧送水装置 / 起動装置 / 遠隔操作部 / 外形",
    "加圧送水装置 / 起動装置 / 遠隔操作部 / 表示",
    "加圧送水装置 / 起動装置 / 遠隔操作部 / 機能（専用・兼用）",
    "電動機 / 外形",
    "電動機 / 回転軸",
    "電動機 / 軸受部",
    "電動機 / 軸継手",
    "電動機 / 機能",
    "ポンプ / 外形",
    "ポンプ / 回転軸",
    "ポンプ / 軸受部",
    "ポンプ / グランド部",
    "ポンプ / 連成計・圧力計",
    "ポンプ / 性能（MPa・L/min）",
    "呼水装置 / 呼水槽",
    "呼水装置 / バルブ類",
    "呼水装置 / 自動給水装置",
    "呼水装置 / 減水警報装置",
    "中間水槽等 / 外形",
    "中間水槽等 / 中間水槽",
    "中間水槽等 / 水状",
    "中間水槽等 / 給水装置",
    "中間水槽等 / 水位計",
    "中間水槽等 / バルブ類",
    "配管等 / 外形",
    "配管等 / 管・管継手",
    "配管等 / 配管の耐圧性能",
    "配管等 / 支持金具・つり金具",
    "配管等 / バルブ類",
    "配管等 / ろ過装置",
    "配管等 / 逃し配管",
    "配管等 / 耐震措置",
] as const

const PAGE3_ITEMS = [
    "総合点検（見出し行・通常入力不要）",
    "総合点検 / 加圧送水装置",
    "総合点検 / 電動機の運転電流（Ａ）",
    "総合点検 / 運転状況",
] as const

export default function StandpipeBekki20Form(props: Props) {
    return (
        <BekkiResultFormBase
            {...props}
            title="連結送水管点検票（別記様式20）"
            iframeTitle="連結送水管点検票（別記様式20）PDFプレビュー"
            apiPath="/api/generate-standpipe-bekki20-pdf"
            dbTable="inspection_standpipe_bekki20"
            downloadFilenamePrefix="連結送水管点検票"
            extraFieldsTitle="電動機・ポンプ（製造者・型式）"
            extraFields={[
                { key: "motor_maker", label: "電動機 製造者名" },
                { key: "motor_model", label: "電動機 型式等" },
                { key: "pump_maker", label: "ポンプ 製造者名" },
                { key: "pump_model", label: "ポンプ 型式等" },
            ]}
            sections={[
                { key: "page1_rows", title: "（その1）機器点検", labels: PAGE1_ITEMS, currentValueRowIndex: 17, hoseRowIndexes: [7] },
                { key: "page2_rows", title: "（その2）機器点検", labels: PAGE2_ITEMS, pumpPerfRowIndex: 18 },
                { key: "page3_rows", title: "（その3）総合点検", labels: PAGE3_ITEMS },
            ]}
            notesCardTitle="備考（その3）"
            notesRows={12}
        />
    )
}
