"use client"

import BekkiResultFormBase, { type BekkiBasePayload } from "@/components/bekki-result-form-base"

type OkugaiShokasenBekki9Payload = BekkiBasePayload

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
    savedPayload?: Partial<OkugaiShokasenBekki9Payload> | null
    savedUpdatedAt?: string | null
}

const PAGE1_ITEMS = [
    "水源 / 貯水槽",
    "水源 / 水量（ｍ3）",
    "水源 / 水状",
    "水源 / 給水装置",
    "水源 / 水位計",
    "水源 / 圧力計",
    "水源 / バルブ類",
    "加圧送水装置 / 周囲の状況",
    "加圧送水装置 / 外形",
    "加圧送水装置 / 表示",
    "加圧送水装置 / 電圧計・電流計（Ｖ・Ａ）",
    "加圧送水装置 / 開閉器・スイッチ類",
    "加圧送水装置 / ヒューズ類（Ａ）",
    "加圧送水装置 / 継電器",
    "加圧送水装置 / 表示灯",
    "加圧送水装置 / 結線接続",
    "加圧送水装置 / 接地",
    "加圧送水装置 / 予備品等",
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
    "加圧送水装置 / 起動用水圧開閉装置 / 圧力スイッチ（設定圧力 MPa）",
    "加圧送水装置 / 起動用水圧開閉装置 / 起動用圧力タンク（MPa）",
    "加圧送水装置 / 起動用水圧開閉装置 / 機能（作動圧力 MPa）",
    "加圧送水装置 / 電動機 / 外形",
    "加圧送水装置 / 電動機 / 回転軸",
    "加圧送水装置 / 電動機 / 軸受部",
    "加圧送水装置 / 電動機 / 軸継手",
    "加圧送水装置 / 電動機 / 機能",
    "加圧送水装置 / ポンプ / 外形",
    "加圧送水装置 / ポンプ / 回転軸",
    "加圧送水装置 / ポンプ / 軸受部",
    "加圧送水装置 / ポンプ / グランド部",
    "加圧送水装置 / ポンプ / 連成計・圧力計",
    "加圧送水装置 / ポンプ / 性能（MPa・L/min）",
    "加圧送水装置 / 呼水装置 / 呼水槽（L）",
    "加圧送水装置 / 呼水装置 / バルブ類",
    "加圧送水装置 / 呼水装置 / 自動給水装置",
    "加圧送水装置 / 呼水装置 / 減水警報装置",
    "加圧送水装置 / 呼水装置 / フート弁",
    "加圧送水装置 / 性能試験装置",
    "加圧送水装置 / 高架水槽方式（MPa）",
    "加圧送水装置 / 圧力水槽方式（MPa）",
    "加圧送水装置 / 減圧のための装置",
    "配管等 / 管・管継手",
    "配管等 / 支持金具・つり金具",
    "配管等 / バルブ類",
    "配管等 / ろ過装置",
    "配管等 / 逃し配管",
] as const
const PAGE3_ITEMS = [
    "屋外消火栓箱 / 位置・周囲の状況",
    "屋外消火栓箱 / 外形",
    "屋外消火栓箱 / 表示",
    "屋外消火栓箱 / ホース・ノズル / 外形（ホース寸法・ノズル径）",
    "屋外消火栓箱 / ホース・ノズル / ホースの耐圧性能",
    "屋外消火栓 / 周囲の状況",
    "屋外消火栓 / 外形",
    "屋外消火栓 / 標識",
    "消火栓開閉弁",
    "始動表示灯",
    "耐震措置",
    "総合点検（見出し行・通常入力不要）",
    "加圧送水装置",
    "表示・警報等",
    "電動機の運転電流（Ａ）",
    "運転状況",
    "放水圧力（MPa）",
    "放水量（L/min）",
    "減圧のための措置",
    "高架水槽方式・圧力水槽方式 / 放水圧力（MPa）",
    "高架水槽方式・圧力水槽方式 / 放水量（L/min）",
    "高架水槽方式・圧力水槽方式 / 減圧のための措置",
] as const

export default function OkugaiShokasenBekki9Form(props: Props) {
    return (
        <BekkiResultFormBase
            {...props}
            title="屋外消火栓設備点検票（別記様式9）"
            iframeTitle="屋外消火栓設備点検票（別記様式9）PDFプレビュー"
            apiPath="/api/generate-okugai-shokasen-bekki9-pdf"
            dbTable="inspection_okugai_shokasen_bekki9"
            downloadFilenamePrefix="屋外消火栓設備点検票"
            sections={[
                { key: "page1_rows", title: "（その1）機器点検", labels: PAGE1_ITEMS, currentValueRowIndex: 10 },
                { key: "page2_rows", title: "（その2）機器点検", labels: PAGE2_ITEMS },
                { key: "page3_rows", title: "（その3）総合点検", labels: PAGE3_ITEMS },
            ]}
            extraFieldsTitle="設備情報"
            extraFields={[
                { key: "pump_maker", label: "ポンプ 製造者名" },
                { key: "pump_model", label: "ポンプ 型式等" },
                { key: "motor_maker", label: "電動機 製造者名" },
                { key: "motor_model", label: "電動機 型式等" },
            ]}
            notesCardTitle="（その3）備考・測定機器"
            notesRows={4}
        />
    )
}
