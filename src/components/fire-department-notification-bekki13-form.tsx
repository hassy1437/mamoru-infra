"use client"

import BekkiResultFormBase, { type BekkiBasePayload } from "@/components/bekki-result-form-base"

type FireDepartmentNotificationBekki13Payload = BekkiBasePayload

interface Props {
    initial: {
        building_name?: string | null
        building_address?: string | null
        notifier_name?: string | null
        fire_manager_name?: string | null
        inspector_name?: string | null
        inspector_company?: string | null
        inspector_address?: string | null
        inspector_tel?: string | null
        inspection_date?: string | null
        inspection_type?: string | null
    }
    soukatsuId: string
    itiranId: string
    propertyId?: string | null
    savedPayload?: Partial<FireDepartmentNotificationBekki13Payload> | null
    savedUpdatedAt?: string | null
}

const PAGE1_ITEMS = [
    "予備電源 / 外形",
    "予備電源 / 表示",
    "予備電源 / 結線接続",
    "予備電源 / 電圧（Ｖ）",
    "予備電源 / 切替装置",
    "予備電源 / 充電装置",
    "本体 / 周囲の状況",
    "本体 / 外形",
    "本体 / 表示",
    "本体 / ヒューズ類（Ａ）",
    "本体 / 予備品等",
    // ★「起動機能」は行ではない。帯11・帯12 の左セルにある小分類の見出しで、
    //   「手動起動装置」「連動起動機能」をまとめている（雛形の文字を帯ごとに読んで確認・2026-10-07）。
    //   以前はこれを 1 行として数え、帯12〜帯19 の 8 行が 1 行下に印字されていた
    //   （画面の「連動起動機能」の判定が紙の「優先通報機能」に載る）。
    //   ★保存済みの付け替えはしない: 本番の保存は 2026-07-27 の検証用 1 件だけで、しかも今の 22 行
    //     ではなく 40 行の古い形だった（添字で付け替えると別の誤りになる）。
    "本体 / 起動機能 / 手動起動装置",
    "本体 / 起動機能 / 連動起動機能",
    "本体 / 優先通報機能",
    "本体 / 通報頭出し機能",
    "本体 / 手動起動装置優先機能",
    "本体 / 蓄積音声情報機能",
    "本体 / 再呼出し機能",
    // ★「通話機能等（特定火災通報装置を除く。）」は帯18〜帯21 をまとめる見出し。
    //   「不応答時の通報継続」と「切替」は雛形では別の行（帯19・帯20）。以前は 1 行にまとめていた。
    "本体 / 通話機能等 / 蓄積音声情報送出後の呼返し",
    "本体 / 通話機能等 / 不応答時の通報継続（特定火災通報装置を除く｡）",
    "本体 / 通話機能等 / 切替（特定火災通報装置を除く｡）",
    "本体 / 通話機能等 / 通話終了後の呼返し",
] as const
const PAGE2_ITEMS = [
    "本体 / 通話機能等 / ハンズフリー通話への移行",
    "本体 / 通話機能等 / 切替（特定火災通報装置に限る。）",
    "本体 / 通話機能等 / 電話回線の保持",
    "本体 / 通話機能等 / モニター機能",
    "遠隔起動装置 / 周囲の状況",
    "遠隔起動装置 / 外形",
    "遠隔起動装置 / 表示",
    "遠隔起動装置 / 機能",
    "回線終端装置等 / 外形",
    // ★テンプレートは帯8・帯9の二つに「外形」を刷っている。ラベルが1つしか無く、
    //   ここから下が1行上へずれて印字されていた。
    //   帯8 は回線終端装置等そのもの、帯9 以降は小分類セル「予備電源」（帯9〜12）の
    //   中にある。罫線から実測した所属で、同名が並ばないよう区別する。
    "回線終端装置等 / 予備電源 / 外形",
    "回線終端装置等 / 予備電源 / 回線終端装置等との接続",
    "回線終端装置等 / 予備電源 / 切替装置",
    "回線終端装置等 / 予備電源 / 充電装置",
    "発信機 / 周囲の状況",
    "発信機 / 外形",
    "発信機 / 押しボタン",
    // ★「機能」は行ではない。帯15の左セル（x96.7-142.6）にある小分類の見出しで、
    //   「押しボタン」「連動起動機能」をまとめている。
    "発信機 / 連動起動機能",
    "発信機 / 結線接続",
    "標識 / 外形",
    // ★「標識板」も行ではない。帯18の左セルにある小分類の見出し。
    "標識 / 常夜灯",
    "標識 / 標識灯",
] as const

export default function FireDepartmentNotificationBekki13Form(props: Props) {
    return (
        <BekkiResultFormBase
            {...props}
            title="消防機関へ通報する火災報知設備点検票（別記様式13）"
            iframeTitle="消防機関へ通報する火災報知設備点検票（別記様式13）PDFプレビュー"
            apiPath="/api/generate-fire-department-notification-bekki13-pdf"
            dbTable="inspection_fire_department_notification_bekki13"
            downloadFilenamePrefix="消防機関へ通報する火災報知設備点検票"
            sections={[
                { key: "page1_rows", title: "（その1）機器点検", labels: PAGE1_ITEMS },
                { key: "page2_rows", title: "（その2）機器点検", labels: PAGE2_ITEMS },
            ]}
            notesCardTitle="（その2）備考・測定機器"
            notesRows={8}
        />
    )
}
