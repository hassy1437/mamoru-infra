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
    "貯水槽",
    "水量",
    "水状 / 水",
    "給水装置",
    "水位計 / 源",
    "源 / 圧力計",
    "バルブ類",
    "周囲の状況",
    "外形",
    "表示 / 加ポ電",
    "電圧計・電流計 / 動",
    "圧 / ン開閉器・スイッチ類 / 機",
    "送 / のヒューズ類 / プ",
    "プ / 制継電器 / 水",
    "御 / 方表示灯 / 装",
    "装 / 結線接続 / 置式置",
    "置式置 / 接地",
    "予備品等",
] as const
const PAGE2_ITEMS = [
    "周囲の状況",
    "直 / 外形 / 接",
    "起操表示",
    "作 / 機能 / 部",
    "部 / 周囲の状況 / 動 / 遠",
    "遠 / 外形 / 隔",
    "操表示",
    "装作 / 機能 / 部",
    "部 / ポ圧力スイッチ / 起開",
    "開 / 加動起動用圧力タンク / 置閉 / 用",
    "用 / 水装機能 / 圧",
    "圧置 / ン外形 / 圧",
    "回転軸 / 電",
    "軸受部 / 動",
    "動 / 送 / プ軸継手",
    "機 / 機能",
    "外形 / 水",
    "回転軸 / 方",
    "ポ / 軸受部",
    "装 / ングランド部",
    "連成計・圧力計 / 式プ",
    "性能 / 置",
    "呼水槽",
    "呼 / バルブ類",
    "水自動給水装置",
    "減水警報装置 / 装",
    "フート弁 / 置",
    "性能試験装置",
    "高架水槽方式",
    "圧力水槽方式",
    "減圧のための装置",
    "管・管継手",
    "支持金具・つり金具 / 配",
    "バルブ類 / 管",
    "管 / ろ過装置",
    "等 / 逃し配管",
] as const
const PAGE3_ITEMS = [
    "位置・周囲の状況",
    "屋外 / 外形 / 消火栓箱",
    "表示",
    "外形 / ホース・ / 屋",
    "外ノズル / ホースの耐圧性能 / 消",
    "火 / 周囲の状況 / 栓",
    "箱 / 外形 / 屋外消火 / 等",
    "栓 / 標識",
    "消火栓開閉弁",
    "始動表示灯",
    "耐震措置",
    "??12",
    "加圧送水装置",
    "起表示・警報等 / 動",
    "動 / ポ性電動機の運転電流 / 能",
    "能 / ン / 等運転状況 / プ",
    "プ / 放水圧力 / 方",
    "式 / 放水量",
    "減圧のための措置",
    "放水圧力 / 高架水槽方",
    "式・圧力水槽放水量",
    "方式 / 減圧のための措置",
] as const

export default function OkugaiShokasenBekki9Form(props: Props) {
    return (
        <BekkiResultFormBase
            {...props}
            title="???????????????9???"
            iframeTitle="???????????????9?PDF?????"
            apiPath="/api/generate-okugai-shokasen-bekki9-pdf"
            dbTable="inspection_okugai_shokasen_bekki9"
            downloadFilenamePrefix="??????????"
            sections={[
                { key: "page1_rows", title: "??1 ????", labels: PAGE1_ITEMS, currentValueRowIndex: 10 },
                { key: "page2_rows", title: "??2 ????", labels: PAGE2_ITEMS },
                { key: "page3_rows", title: "??3 ????", labels: PAGE3_ITEMS },
            ]}
            extraFieldsTitle="??????"
            extraFields={[
                { key: "pump_maker", label: "??? ????" },
                { key: "pump_model", label: "??? ???" },
                { key: "motor_maker", label: "??? ????" },
                { key: "motor_model", label: "??? ???" },
            ]}
            notesCardTitle="??3 ??????"
            notesRows={4}
        />
    )
}
