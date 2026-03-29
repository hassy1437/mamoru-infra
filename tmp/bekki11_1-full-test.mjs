import path from "path";
import { runRoutePdf } from "../scripts/run-route-pdf.mjs";

const payload = {
    form_name: "丸の内防災センター東西連結棟",
    fire_manager: "佐藤花子",
    witness: "田中一郎",
    location: "東京都千代田区丸の内一丁目二番三号 丸の内防災センター東西連結棟",
    inspection_type: "機器・総合",
    period_start: "2026-02-01",
    period_end: "2026-02-28",
    inspector_name: "主任点検者 鈴木健一",
    inspector_company: "防災設備メンテナンス株式会社",
    inspector_address: "東京都新宿区西新宿六丁目六番一号 新宿防災ビル3階",
    inspector_tel: "03-9876-5432",

    extra_fields: {
        receiver_maker: "能美防災株式会社",
        receiver_model: "FAP220-30L-3",
    },

    // P1: 28 rows
    page1_rows: [
        { content: "外形 異常なし", judgment: "良" },                            // 0 外形/予
        { content: "予備表示 正常", judgment: "良" },                             // 1 予/備表示
        { content: "端子電圧 AC100V", judgment: "良" },                          // 2 電源内蔵 端子電圧
        { content: "切替装置 自動切替正常", judgment: "良" },                      // 3 切替装置
        { content: "充電装置 正常動作", judgment: "良" },                          // 4 非常 充電装置
        { content: "結線接続 緩みなし", judgment: "良" },                          // 5 結線接続
        { content: "周囲の状況 障害物なし", judgment: "良" },                      // 6 周囲の状況
        { content: "外形 変形・腐食なし", judgment: "良" },                        // 7 外形
        { content: "表示 明瞭", judgment: "良" },                                // 8 表示
        { content: "警戒区域 全区域正常表示", judgment: "良" },                     // 9 警戒区域の表示装置
        { content: "電圧計 規定値内", judgment: "良" },                           // 10 電圧計/受
        { content: "スイッチ類 正常動作", judgment: "良" },                        // 11 スイッチ類
        { content: "ヒューズ類 規定品使用", judgment: "良" },                      // 12 ヒューズ類
        { content: "継電器 接点良好", judgment: "良" },                           // 13 継電器
        { content: "表示灯 全灯点灯", judgment: "良" },                          // 14 表示灯
        { content: "通話装置 送受話正常", judgment: "良" },                        // 15 通話装置
        { content: "結線接続 緩み・断線なし", judgment: "良" },                    // 16 結線接続
        { content: "接地 D種接地 確認済", judgment: "良" },                       // 17 接地
        { content: "附属装置 正常動作", judgment: "良" },                          // 18 附属装置
        { content: "蓄積式 蓄積時間規定値内", judgment: "良" },                    // 19 蓄積式/中
        { content: "アナログ式 表示値正常", judgment: "良" },                      // 20 アナログ式 火災表示等
        { content: "二信号式 正常動作", judgment: "良" },                          // 21 火災表示等 二信号式
        { content: "その他 異常なし", judgment: "良" },                           // 22 その他
        { content: "注意表示 正常", judgment: "良" },                             // 23 注意表示
        { content: "回路導通 全回路正常", judgment: "良" },                        // 24 回路導通
        { content: "設定表示温度等 規定値", judgment: "良" },                      // 25 設定表示温度等
        { content: "感知器作動 正常表示", judgment: "良" },                        // 26 感知器作動等の表示
        { content: "予備品等 規定数確認済", judgment: "良" },                      // 27 予備品等
    ],

    // P2: 25 rows — 一部不良判定
    page2_rows: [
        { content: "外形 変形なし", judgment: "良" },                             // 0 外形
        { content: "未警戒部分 なし", judgment: "良" },                           // 1 未警戒部分/警
        { content: "感知区域 適正", judgment: "良" },                             // 2 感知区域/戒
        { content: "適応性 適合", judgment: "良" },                               // 3 適応性/状
        { content: "機能障害 なし", judgment: "良" },                             // 4 機能障害/況
        { content: "差動", judgment: "良" },                                     // 5 スポット型(熱) → circle: 差動/定温/(再)/熱アナログ
        { content: "空気管式 作動正常", judgment: "良" },                          // 6 空気管式 熱/分
        { content: "熱電対式 正常動作", judgment: "良" },                          // 7 熱電対式・熱半導体式/型
        { content: "感知線型 正常", judgment: "良" },                             // 8 感知線型/器
        { content: "光電", judgment: "良" },                                     // 9 スポット型(煙) → circle: イオン/光電/アナログ
        { content: "分離型 光軸合致", judgment: "良" },                           // 10 分離型 煙/器知
        { content: "赤外線", judgment: "良" },                                    // 11 炎感知器 → circle: 赤外線/紫外線
        { content: "多信号・複合式 正常", judgment: "良" },                        // 12 多信号感知器・複合式感知器
        { content: "遠隔試験機能 正常作動", judgment: "良" },                      // 13 遠隔試験機能を有する感知器
        { content: "周囲の状況 障害物なし", judgment: "良" },                      // 14 周囲の状況
        { content: "外形 変形なし", judgment: "良" },                             // 15 外形/発
        { content: "表示 明瞭", judgment: "良" },                                // 16 表示/信
        { content: "押しボタン 正常動作", judgment: "良" },                        // 17 押しボタン・送受話器/機
        { content: "表示灯 点灯確認", judgment: "良" },                           // 18 表示灯
        { content: "外形 変形なし", judgment: "良" },                             // 19 外形
        { content: "取付状態 堅固", judgment: "良" },                             // 20 取付状態
        { content: "音圧 65dB以上確認", judgment: "良" },                         // 21 音圧等/装
        { content: "一斉", judgment: "良" },                                     // 22 鳴動方式 → circle: 一斉/区分/相互/再鳴動
        { content: "蓄積機能 正常動作", judgment: "良" },                          // 23 蓄積機能
        { content: "二信号機能 正常", judgment: "良" },                           // 24 二信号機能
    ],

    // P3: 12 rows — 一部不良判定
    page3_rows: [
        { content: "予備電源 切替正常", judgment: "良" },                          // 0 予備電源・非常電源
        { content: "火災表示 全区域正常", judgment: "良" },                        // 1 受信機の火災表示/自
        { content: "注意表示 正常動作", judgment: "良" },                          // 2 受信機の注意表示
        { content: "制御機能 正常動作", judgment: "良" },                          // 3 制御機能・電路/験
        { content: "感知器 全数作動確認", judgment: "良" },                        // 4 感知器
        { content: "回路 導通・絶縁正常", judgment: "良" },                        // 5 感知器回路・ベル回路
        { content: "無線機能 電波正常受信", judgment: "良" },                      // 6 無線機能
        { content: "予備電源容量 規定値以上", judgment: "良" },                     // 7 ??8
        { content: "同時作動 2回線正常", judgment: "良" },                         // 8 同時作動
        { content: "煙感知器 感度試験合格", judgment: "良" },                      // 9 煙感知器等の感度
        { content: "音圧 1m地点65dB以上", judgment: "良" },                       // 10 地区音響装置の音圧
        { content: "総合作動 全系統正常", judgment: "良" },                        // 11 総合作動
    ],

    notes: "令和8年2月度定期点検実施。自動火災報知設備について機器点検及び総合点検を実施した。受信機FAP220-30L-3の全回線について火災表示・注意表示・制御機能を確認し、異常なし。感知器は全数作動試験を実施、煙感知器の感度試験も合格。地区音響装置の音圧も規定値以上を確認。次回点検は令和8年8月予定。",

    device1: {
        name: "加熱試験器",
        model: "HT-200",
        calibrated_at: "2026-01-15",
        maker: "パーソレーター研究所",
    },
    device2: {
        name: "煙感知器用感度試験器",
        model: "ST-500",
        calibrated_at: "2026-01-20",
        maker: "日本消防検定協会",
    },
};

const outPath = path.resolve("tmp/bekki11_1_full_test2.pdf");
console.log("Generating bekki11-1 FULL test PDF...");
const result = await runRoutePdf({
    routePath: "src/app/api/generate-jidou-kasai-houchi-bekki11-1-pdf/route.ts",
    payload,
    outPdfPath: outPath,
});
console.log(`Done: ${result.outPdfPath} (${result.bytes} bytes)`);
