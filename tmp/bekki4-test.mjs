import { runRoutePdf } from "../scripts/run-route-pdf.mjs";
import path from "path";

// 水噴霧消火設備 (bekki4) - 全項目入力テスト
const payload = {
    form_name: "丸の内防災センター東西連結棟",
    fire_manager: "統括防火管理者 佐藤花子",
    witness: "立会者 田中一郎",
    location: "東京都千代田区丸の内一丁目二番三号 丸の内防災センター東西連結棟",
    inspection_type: "機器・総合",
    period_start: "2026-02-01",
    period_end: "2026-02-28",
    inspector_name: "主任点検者 鈴木健一",
    inspector_company: "防災設備メンテナンス株式会社",
    inspector_address: "東京都新宿区西新宿六丁目六番一号",
    inspector_tel: "03-9876-5432",
    pump_maker: "荏原製作所",
    pump_model: "WPF-50-65.4",
    motor_maker: "日立産機システム",
    motor_model: "TFOA-LKK-4.0kW-4P",
    // Page 1: 設備概要・電源 (18 rows)
    page1_rows: [
        { content: "地下式", judgment: "良" },                     // 0: 貯水槽(種別)
        { content: "60", judgment: "良" },                        // 1: 水量(m³)
        { content: "異常なし", judgment: "良" },                   // 2: 水質
        { content: "良好", judgment: "良" },                       // 3: 水位
        { content: "適正", judgment: "良" },                       // 4: バルブ類
        { content: "異常なし", judgment: "良" },                   // 5: 給水装置
        { content: "良好", judgment: "良" },                       // 6: 排水
        { content: "異常なし", judgment: "良" },                   // 7: 配管
        { content: "適正", judgment: "良" },                       // 8: 表示
        { content: "異常なし", judgment: "良" },                   // 9: 電源切替装置
        { content: "AC200/18.5", judgment: "良" },                // 10: 電圧計・電流計 (V/A自動分割)
        { content: "異常なし", judgment: "良" },                   // 11: 始動装置
        { content: "40", judgment: "良" },                        // 12: ヒューズ類(A)
        { content: "異常なし", judgment: "良" },                   // 13: 表示灯
        { content: "良好", judgment: "良" },                       // 14: 結線接続
        { content: "異常なし", judgment: "良" },                   // 15: 接地
        { content: "良好", judgment: "良" },                       // 16: 絶縁抵抗
        { content: "異常なし", judgment: "良" },                   // 17: 予備品
    ],
    // Page 2: ポンプ・性能 (35 rows)
    page2_rows: [
        { content: "荏原", judgment: "良" },                       // 0: ポンプ製造者
        { content: "WPF-50", judgment: "良" },                    // 1: 型式
        { content: "異常なし", judgment: "良" },                   // 2: 外形
        { content: "良好", judgment: "良" },                       // 3: 基礎ボルト
        { content: "1.05", judgment: "良" },                      // 4: 設定圧力(上段)(MPa)
        { content: "0.20", judgment: "良" },                      // 5: 設定圧力(下段)(MPa)
        { content: "1.02", judgment: "良" },                      // 6: 作動圧力(MPa)
        { content: "専用", judgment: "良" },                       // 7: 専用/兼用(circle)
        { content: "異常なし", judgment: "良" },                   // 8: 逆止弁
        { content: "適正", judgment: "良" },                       // 9: 止水弁
        { content: "良好", judgment: "良" },                       // 10: 連成計
        { content: "異常なし", judgment: "良" },                   // 11: 圧力計
        { content: "良好", judgment: "良" },                       // 12: 流量計
        { content: "適正", judgment: "良" },                       // 13: 配管
        { content: "異常なし", judgment: "良" },                   // 14: 弁類
        { content: "良好", judgment: "良" },                       // 15: 支持金具
        { content: "異常なし", judgment: "良" },                   // 16: 管接合部
        { content: "適正", judgment: "良" },                       // 17: 塗装
        { content: "異常なし", judgment: "良" },                   // 18: 一斉開放弁
        { content: "0.30/350", judgment: "良" },                  // 19: 流量(MPa+L/min 自動分割)
        { content: "200", judgment: "良" },                       // 20: 放水量(L)
        { content: "良好", judgment: "良" },                       // 21: 制御弁
        { content: "異常なし", judgment: "良" },                   // 22: 噴霧ヘッド
        { content: "適正", judgment: "良" },                       // 23: 散水障害
        { content: "良好", judgment: "良" },                       // 24: デフレクター
        { content: "異常なし", judgment: "良" },                   // 25: 感熱部
        { content: "0.42", judgment: "良" },                      // 26: 放水圧力1(MPa)
        { content: "0.38", judgment: "良" },                      // 27: 放水圧力2(MPa)
        { content: "適正", judgment: "良" },                       // 28: 取付方向
        { content: "良好", judgment: "良" },                       // 29: 未警戒部分
        { content: "異常なし", judgment: "良" },                   // 30: 手動起動装置
        { content: "適正", judgment: "良" },                       // 31: 自動起動装置
        { content: "良好", judgment: "良" },                       // 32: 送水口
        { content: "異常なし", judgment: "良" },                   // 33: 表示
        { content: "適正", judgment: "良" },                       // 34: 排水設備
    ],
    // Page 3: 総合点検 (24 rows)
    page3_rows: [
        { content: "異常なし", judgment: "良" },                   // 0
        { content: "良好", judgment: "良" },                       // 1
        { content: "適正", judgment: "良" },                       // 2
        { content: "0.45", judgment: "良" },                      // 3: 放水圧力(MPa)
        { content: "異常なし", judgment: "良" },                   // 4
        { content: "0.95/0.92", judgment: "良" },                  // 5: 設定圧力/作動圧力(compound "/" split)
        { content: "良好", judgment: "良" },                       // 6
        { content: "適正", judgment: "良" },                       // 7
        { content: "異常なし", judgment: "良" },                   // 8
        { content: "良好", judgment: "良" },                       // 9
        { content: "適正", judgment: "良" },                       // 10
        { content: "異常なし", judgment: "良" },                   // 11
        {},                                                       // 12: セクションヘッダー(skip)
        { content: "良好", judgment: "良" },                       // 13
        { content: "適正", judgment: "良" },                       // 14
        { content: "16.2", judgment: "良" },                      // 15: 電流(A)
        { content: "異常なし", judgment: "良" },                   // 16
        { content: "良好", judgment: "良" },                       // 17
        { content: "適正", judgment: "良" },                       // 18
        { content: "異常なし", judgment: "良" },                   // 19
        { content: "良好", judgment: "良" },                       // 20
        { content: "適正", judgment: "良" },                       // 21
        { content: "異常なし", judgment: "良" },                   // 22
        { content: "良好", judgment: "良" },                       // 23
    ],
    notes: "水噴霧消火設備の機器点検・総合点検を実施。ポンプ起動圧力・放水圧力とも基準値内。噴霧ヘッドの散水障害・デフレクターは異常なし。一斉開放弁の作動を確認済。",
    device1: {
        name: "デジタル圧力計",
        model: "PG-9000-EX",
        calibrated_at: "2026-01-15",
        maker: "計測器工業株式会社",
    },
    device2: {
        name: "絶縁抵抗計",
        model: "IR-4200-L",
        calibrated_at: "2026-01-20",
        maker: "電気試験ラボ株式会社",
    },
};

const outPath = path.resolve("tmp/bekki4_test.pdf");
console.log("Generating bekki4 test PDF...");
const result = await runRoutePdf({
    routePath: "src/app/api/generate-water-spray-bekki4-pdf/route.ts",
    payload,
    outPdfPath: outPath,
});
console.log(`Done: ${result.outPdfPath} (${result.bytes} bytes)`);
