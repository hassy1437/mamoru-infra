"use client"

import BekkiResultFormBase, { type BekkiBasePayload } from "@/components/bekki-result-form-base"

type DoryokuPumpBekki10Payload = BekkiBasePayload

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
    savedPayload?: Partial<DoryokuPumpBekki10Payload> | null
    savedUpdatedAt?: string | null
}

const PAGE1_ITEMS = [
    "周囲の状況等",
    "水源 / 貯水槽",
    "水源 / 水量（ｍ3）",
    "水源 / 水状",
    "水源 / 給水装置",
    "採水口 / 周囲の状況",
    "採水口 / 吸管投入口（本体）",
    "採水口 / 吸管投入孔・採水口",
    "採水口 / 開閉弁",
    "採水口 / 標識",
    "内燃機関 / 燃料（Ｌ）",
    "内燃機関 / 潤滑油",
    "内燃機関 / 外形",
    "内燃機関 / 蓄電池電解液",
    "内燃機関 / 端子電圧（Ｖ）",
    "内燃機関 / 起動装置",
    "内燃機関 / 動力伝達装置",
    "内燃機関 / 冷却装置 / ラジエータ等",
    "内燃機関 / 冷却装置 / 冷却ファン",
    "内燃機関 / 吸排気装置",
    "ポンプ / 本体",
    "ポンプ / 真空潤滑剤",
    "ポンプ / 自動停止スイッチ",
    "ポンプ / 計器類",
    "ポンプ / 作動",
] as const
const PAGE2_ITEMS = [
    "車台装置・搬送装置",
    "積載器具 / 装備",
    "積載器具 / 吸管・ストレーナー",
    "積載器具 / ホース・ノズル等 / 外形（ホース寸法・ノズル径）",
    "積載器具 / ホース・ノズル等 / ホースの耐圧性能",
    "積載器具 / はしご",
    "積載器具 / 破壊器具その他の器具",
    "総合点検（見出し行・通常入力不要）",
    "運転状況",
    "吸水性能",
    "放水性能 / 放水圧力",
    "放水性能 / 放水量",
    "走行性能",
] as const

export default function DoryokuPumpBekki10Form(props: Props) {
    return (
        <BekkiResultFormBase
            {...props}
            title="動力消防ポンプ設備点検票（別記様式10）"
            iframeTitle="動力消防ポンプ設備点検票（別記様式10）PDFプレビュー"
            apiPath="/api/generate-doryoku-pump-bekki10-pdf"
            dbTable="inspection_doryoku_pump_bekki10"
            downloadFilenamePrefix="動力消防ポンプ設備点検票"
            sections={[
                { key: "page1_rows", title: "（その1）機器点検", labels: PAGE1_ITEMS },
                { key: "page2_rows", title: "（その2）点検結果", labels: PAGE2_ITEMS },
            ]}
            extraFieldsTitle="設備情報"
            extraFields={[
                { key: "body_maker", label: "本体 製造者名" },
                { key: "body_model", label: "本体 型式等" },
            ]}
            notesCardTitle="（その2）備考・測定機器"
            notesRows={8}
        />
    )
}
