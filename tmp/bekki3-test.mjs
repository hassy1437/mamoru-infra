import { runRoutePdf } from "../scripts/run-route-pdf.mjs";
import path from "path";

// スプリンクラー設備 (bekki3) - 全項目入力テスト
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
    pump_model: "SPF-40-50.75",
    motor_maker: "三菱電機",
    motor_model: "SF-JR-0.75kW-4P",
    // Page 1: 設備概要・電源 (19 rows)
    page1_rows: [
        { content: "地下式", judgment: "良" },                     // 0: 貯水槽(種別)
        { content: "45", judgment: "良" },                        // 1: 水量(m³)
        { content: "異常なし", judgment: "良" },                   // 2: 水質
        { content: "良好", judgment: "良" },                       // 3: 水位
        { content: "適正", judgment: "良" },                       // 4: バルブ類
        { content: "異常なし", judgment: "良" },                   // 5: 給水装置
        { content: "良好", judgment: "良" },                       // 6: 排水
        { content: "異常なし", judgment: "良" },                   // 7: 配管
        { content: "適正", judgment: "良" },                       // 8: 表示
        { content: "異常なし", judgment: "良" },                   // 9: 電源切替装置
        { content: "AC200/15.5", judgment: "良" },                // 10: 電圧計・電流計 (V/A自動分割)
        { content: "1750", judgment: "良" },                      // 11: 回転数(r/min)
        { content: "異常なし", judgment: "良" },                   // 12: 始動装置
        { content: "30", judgment: "良" },                        // 13: ヒューズ類(A)
        { content: "異常なし", judgment: "良" },                   // 14: 表示灯
        { content: "良好", judgment: "良" },                       // 15: 結線接続
        { content: "異常なし", judgment: "良" },                   // 16: 接地
        { content: "D種", judgment: "良" },                       // 17: 接地(種接地)
        { content: "良好", judgment: "良" },                       // 18: 予備品
    ],
    // Page 2: ポンプ・性能 (34 rows)
    page2_rows: [
        { content: "荏原", judgment: "良" },                       // 0: ポンプ製造者
        { content: "SPF-40", judgment: "良" },                    // 1: 型式
        { content: "異常なし", judgment: "良" },                   // 2: 外形
        { content: "良好", judgment: "良" },                       // 3: 基礎ボルト
        { content: "0.98", judgment: "良" },                      // 4: 設定圧力(上段)(MPa)
        { content: "0.15", judgment: "良" },                      // 5: 設定圧力(下段)(MPa)
        { content: "0.95", judgment: "良" },                      // 6: 作動圧力(MPa)
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
        { content: "良好", judgment: "良" },                       // 18: 流水検知装置
        { content: "異常なし", judgment: "良" },                   // 19: 一斉開放弁
        { content: "0.25/300", judgment: "良" },                  // 20: 流量(MPa+L/min 自動分割)
        { content: "150", judgment: "良" },                       // 21: 放水量(L)
        { content: "良好", judgment: "良" },                       // 22: 末端試験弁
        { content: "異常なし", judgment: "良" },                   // 23: 制御弁
        { content: "適正", judgment: "良" },                       // 24: 開放型ヘッド
        { content: "良好", judgment: "良" },                       // 25: 閉鎖型ヘッド
        { content: "異常なし", judgment: "良" },                   // 26: 散水障害
        { content: "適正", judgment: "良" },                       // 27: デフレクター
        { content: "良好", judgment: "良" },                       // 28: 感熱部
        { content: "異常なし", judgment: "良" },                   // 29: 取付方向
        { content: "適正", judgment: "良" },                       // 30: 未警戒部分
        { content: "0.35", judgment: "良" },                      // 31: 放水圧力1(MPa)
        { content: "0.32", judgment: "良" },                      // 32: 放水圧力2(MPa)
        { content: "良好", judgment: "良" },                       // 33: 補助散水栓
    ],
    // Page 3: 送水口・付属装置 (36 rows)
    page3_rows: [
        { content: "異常なし", judgment: "良" },                   // 0
        { content: "良好", judgment: "良" },                       // 1
        { content: "適正", judgment: "良" },                       // 2
        { content: "異常なし", judgment: "良" },                   // 3
        { content: "良好", judgment: "良" },                       // 4
        { content: "適正", judgment: "良" },                       // 5
        { content: "異常なし", judgment: "良" },                   // 6
        { content: "良好", judgment: "良" },                       // 7
        { content: "適正", judgment: "良" },                       // 8
        { content: "異常なし", judgment: "良" },                   // 9
        { content: "良好", judgment: "良" },                       // 10
        { content: "適正", judgment: "良" },                       // 11
        { content: "異常なし", judgment: "良" },                   // 12
        { content: "良好", judgment: "良" },                       // 13
        { content: "適正", judgment: "良" },                       // 14
        { content: "0.28", judgment: "良" },                      // 15: 放水圧力(MPa)
        { content: "異常なし", judgment: "良" },                   // 16
        { content: "0.85/0.82", judgment: "良" },                  // 17: 圧力スイッチ(設定圧力0.85/作動圧力0.82)
        { content: "良好", judgment: "良" },                       // 18
        { content: "適正", judgment: "良" },                       // 19
        { content: "異常なし", judgment: "良" },                   // 20
        { content: "良好", judgment: "良" },                       // 21
        { content: "適正", judgment: "良" },                       // 22
        { content: "異常なし", judgment: "良" },                   // 23
        { content: "良好", judgment: "良" },                       // 24
        { content: "25/2/19", judgment: "良" },                    // 25: ホース25m×2本/ノズル径19mm
        { content: "適正", judgment: "良" },                       // 26
        { content: "異常なし", judgment: "良" },                   // 27
        { content: "良好", judgment: "良" },                       // 28
        { content: "適正", judgment: "良" },                       // 29
        { content: "異常なし", judgment: "良" },                   // 30
        { content: "良好", judgment: "良" },                       // 31
        { content: "適正", judgment: "良" },                       // 32
        { content: "異常なし", judgment: "良" },                   // 33
        { content: "良好", judgment: "良" },                       // 34
        { content: "適正", judgment: "良" },                       // 35
    ],
    // Page 4: 総合点検1 (23 rows)
    page4_rows: [
        { content: "異常なし", judgment: "良" },                   // 0
        { content: "良好", judgment: "良" },                       // 1
        { content: "適正", judgment: "良" },                       // 2
        { content: "12.5", judgment: "良" },                      // 3: 電流(A)
        { content: "異常なし", judgment: "良" },                   // 4
        { content: "0.42", judgment: "良" },                      // 5: 放水圧力(MPa)
        { content: "良好", judgment: "良" },                       // 6
        { content: "適正", judgment: "良" },                       // 7
        { content: "0.38", judgment: "良" },                      // 8: 放水圧力(MPa)
        { content: "異常なし", judgment: "良" },                   // 9
        { content: "0.35", judgment: "良" },                      // 10: 放水圧力(MPa)
        { content: "良好", judgment: "良" },                       // 11
        { content: "適正", judgment: "良" },                       // 12
        { content: "異常なし", judgment: "良" },                   // 13
        { content: "11.8", judgment: "良" },                      // 14: 電流2(A)
        { content: "良好", judgment: "良" },                       // 15
        { content: "適正", judgment: "良" },                       // 16
        { content: "異常なし", judgment: "良" },                   // 17
        { content: "良好", judgment: "良" },                       // 18
        { content: "適正", judgment: "良" },                       // 19
        { content: "異常なし", judgment: "良" },                   // 20
        { content: "良好", judgment: "良" },                       // 21
        { content: "適正", judgment: "良" },                       // 22
    ],
    // Page 5: 総合点検2 (11 rows)
    page5_rows: [
        { content: "異常なし", judgment: "良" },                   // 0
        { content: "良好", judgment: "良" },                       // 1
        { content: "13.2", judgment: "良" },                      // 2: 電流(A)
        { content: "適正", judgment: "良" },                       // 3
        { content: "0.40", judgment: "良" },                      // 4: 放水圧力(MPa)
        { content: "280", judgment: "良" },                       // 5: 放水量(L/min)
        { content: "異常なし", judgment: "良" },                   // 6
        { content: "良好", judgment: "良" },                       // 7
        { content: "0.38", judgment: "良" },                      // 8: 放水圧力(MPa)
        { content: "260", judgment: "良" },                       // 9: 放水量(L/min)
        { content: "適正", judgment: "良" },                       // 10
    ],
    notes: "全系統でスプリンクラー設備の機器点検・総合点検を実施。ポンプ起動圧力・放水圧力とも基準値内。閉鎖型ヘッドの感熱部・散水障害は異常なし。",
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

const outPath = path.resolve("tmp/bekki3_test.pdf");
console.log("Generating bekki3 test PDF...");
const result = await runRoutePdf({
    routePath: "src/app/api/generate-sprinkler-bekki3-pdf/route.ts",
    payload,
    outPdfPath: outPath,
});
console.log(`Done: ${result.outPdfPath} (${result.bytes} bytes)`);
