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
    "貯水槽",
    "水水量",
    "水状",
    "給水装置 / 源",
    "周囲の状況",
    "吸管投入口 / 吸管投入",
    "吸管投入 / 本体 / 孔・採水口採水口",
    "孔・採水口採水口 / 開閉弁",
    "標識",
    "燃料",
    "潤滑油",
    "外形",
    "内蓄電池電解液",
    "端子電圧 / 燃",
    "燃 / 起動装置",
    "機動力伝達装置",
    "冷却ラジエータ等 / 関",
    "装置冷却ファン",
    "吸排気装置",
    "本体",
    "真空潤滑剤 / ポ",
    "ポンプ自動停止スイッチ",
    "ン / 計器類",
    "プ作動",
] as const
const PAGE2_ITEMS = [
    "車台装置・搬送装置",
    "装備",
    "吸管・ストレーナー / 積",
    "積 / 外形 / ホース・ / 載",
    "ノズル等 / ホースの耐圧性能 / 器",
    "はしご / 具",
    "破壊器具その他の器具",
    "??8",
    "運転状況",
    "吸水性能",
    "放水圧力 / 放水性能",
    "放水性能 / 放水量",
    "走行性能",
] as const

export default function DoryokuPumpBekki10Form(props: Props) {
    return (
        <BekkiResultFormBase
            {...props}
            title="?????????????????10???"
            iframeTitle="?????????????????10?PDF?????"
            apiPath="/api/generate-doryoku-pump-bekki10-pdf"
            dbTable="inspection_doryoku_pump_bekki10"
            downloadFilenamePrefix="????????????"
            sections={[
                { key: "page1_rows", title: "??1 ????", labels: PAGE1_ITEMS },
                { key: "page2_rows", title: "??2 ????", labels: PAGE2_ITEMS },
            ]}
            extraFieldsTitle="??????"
            extraFields={[
                { key: "body_maker", label: "?? ????" },
                { key: "body_model", label: "?? ???" },
            ]}
            notesCardTitle="??2 ??????"
            notesRows={8}
        />
    )
}
