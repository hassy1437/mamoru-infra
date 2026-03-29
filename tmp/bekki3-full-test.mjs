import { runRoutePdf } from "../scripts/run-route-pdf.mjs";
import path from "path";

// スプリンクラー設備 (bekki3) - 全123項目フル入力テスト
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
    inspector_address: "東京都新宿区西新宿六丁目六番一号",
    inspector_tel: "03-9876-5432",
    pump_maker: "荏原製作所",
    pump_model: "SPF-40-50.75",
    motor_maker: "三菱電機",
    motor_model: "SF-JR-0.75kW-4P",

    // ===== Page 1: (その1)機器点検 - 19 rows =====
    page1_rows: [
        // 0: 貯水槽 種別
        { content: "地下式", judgment: "良", bad_content: "", action_content: "" },
        // 1: 貯水槽 水量 (m³)
        { content: "45", judgment: "良", bad_content: "", action_content: "" },
        // 2: 貯水槽 水状
        { content: "清浄・適量", judgment: "良", bad_content: "", action_content: "" },
        // 3: 水源 給水装置
        { content: "異常なし", judgment: "良", bad_content: "", action_content: "" },
        // 4: 水源 水位計
        { content: "正常表示", judgment: "良", bad_content: "", action_content: "" },
        // 5: 水源 圧力計
        { content: "0.45MPa指示", judgment: "良", bad_content: "", action_content: "" },
        // 6: 水源 バルブ類
        { content: "全開固定", judgment: "良", bad_content: "", action_content: "" },
        // 7: 加圧送水装置 周囲の状況
        { content: "障害物なし", judgment: "良", bad_content: "", action_content: "" },
        // 8: 加圧送水装置 外形
        { content: "腐食・変形なし", judgment: "良", bad_content: "", action_content: "" },
        // 9: 加圧送水装置 表示
        { content: "銘板明瞭", judgment: "良", bad_content: "", action_content: "" },
        // 10: 加圧送水装置 電圧計・電流計 (V/A自動分割)
        { content: "AC200/15.5", judgment: "良", bad_content: "", action_content: "" },
        // 11: 加圧送水装置 回転計 (r/min)
        { content: "1750", judgment: "良", bad_content: "", action_content: "" },
        // 12: 加圧送水装置 開閉器・スイッチ類
        { content: "正常作動", judgment: "良", bad_content: "", action_content: "" },
        // 13: 加圧送水装置 ヒューズ類 (A)
        { content: "30", judgment: "良", bad_content: "", action_content: "" },
        // 14: 加圧送水装置 継電器
        { content: "接点良好", judgment: "良", bad_content: "", action_content: "" },
        // 15: 加圧送水装置 表示灯
        { content: "全灯点灯確認", judgment: "良", bad_content: "", action_content: "" },
        // 16: 加圧送水装置 結線接続
        { content: "緩み・断線なし", judgment: "良", bad_content: "", action_content: "" },
        // 17: 加圧送水装置 接地 (種接地)
        { content: "D種", judgment: "良", bad_content: "", action_content: "" },
        // 18: 加圧送水装置 予備品等
        { content: "規定数確認済", judgment: "良", bad_content: "", action_content: "" },
    ],

    // ===== Page 2: (その2)機器点検 - 34 rows =====
    page2_rows: [
        // 0: 操作部（手動式起動）周囲の状況
        { content: "障害物なし", judgment: "良", bad_content: "", action_content: "" },
        // 1: 操作部（手動式起動）外形
        { content: "変形・損傷なし", judgment: "良", bad_content: "", action_content: "" },
        // 2: 操作部（手動式起動）表示
        { content: "表示明瞭", judgment: "良", bad_content: "", action_content: "" },
        // 3: 操作部（手動式起動）機能
        { content: "正常作動確認", judgment: "良", bad_content: "", action_content: "" },
        // 4: 圧力スイッチ 設定圧力 (MPa) - 狭セルlatinFont
        { content: "0.98", judgment: "良", bad_content: "", action_content: "" },
        // 5: 起動用圧力タンク (MPa)
        { content: "0.15", judgment: "良", bad_content: "", action_content: "" },
        // 6: 機能・作動圧力 (MPa) - 狭セルlatinFont
        { content: "0.95", judgment: "良", bad_content: "", action_content: "" },
        // 7: 感知器（専用/兼用）- circle selection
        { content: "専用", judgment: "良", bad_content: "", action_content: "" },
        // 8: 閉鎖型SPヘッド
        { content: "未作動確認", judgment: "良", bad_content: "", action_content: "" },
        // 9: 電動機・内燃機関 外形
        { content: "腐食・損傷なし", judgment: "良", bad_content: "", action_content: "" },
        // 10: 電動機・内燃機関 回転軸
        { content: "偏心なし", judgment: "良", bad_content: "", action_content: "" },
        // 11: 電動機・内燃機関 軸受部
        { content: "異音・過熱なし", judgment: "良", bad_content: "", action_content: "" },
        // 12: 電動機・内燃機関 軸継手
        { content: "緩み・摩耗なし", judgment: "良", bad_content: "", action_content: "" },
        // 13: 電動機・内燃機関 燃料
        { content: "該当なし", judgment: "良", bad_content: "", action_content: "" },
        // 14: 電動機・内燃機関 機能
        { content: "正常運転", judgment: "良", bad_content: "", action_content: "" },
        // 15: ポンプ 外形
        { content: "腐食・変形なし", judgment: "良", bad_content: "", action_content: "" },
        // 16: ポンプ 回転軸
        { content: "偏心なし", judgment: "良", bad_content: "", action_content: "" },
        // 17: ポンプ 軸受部
        { content: "異音・過熱なし", judgment: "良", bad_content: "", action_content: "" },
        // 18: ポンプ グランド部
        { content: "漏水なし", judgment: "良", bad_content: "", action_content: "" },
        // 19: ポンプ 連成計・圧力計
        { content: "指示正常", judgment: "良", bad_content: "", action_content: "" },
        // 20: ポンプ 性能 (MPa/L/min 自動分割)
        { content: "0.25/300", judgment: "良", bad_content: "", action_content: "" },
        // 21: 呼水装置 呼水槽 (L)
        { content: "150", judgment: "良", bad_content: "", action_content: "" },
        // 22: 呼水装置 バルブ類
        { content: "全開確認", judgment: "良", bad_content: "", action_content: "" },
        // 23: 呼水装置 自動給水装置
        { content: "正常補水", judgment: "良", bad_content: "", action_content: "" },
        // 24: 呼水装置 減水警報装置
        { content: "警報作動確認", judgment: "良", bad_content: "", action_content: "" },
        // 25: 呼水装置 フート弁
        { content: "弁座漏れなし", judgment: "良", bad_content: "", action_content: "" },
        // 26: 性能試験装置
        { content: "配管接続良好", judgment: "良", bad_content: "", action_content: "" },
        // 27: 補助水槽 貯水槽
        { content: "水量適正", judgment: "良", bad_content: "", action_content: "" },
        // 28: 補助水槽 水状
        { content: "清浄", judgment: "良", bad_content: "", action_content: "" },
        // 29: 補助水槽 給水装置
        { content: "正常給水", judgment: "良", bad_content: "", action_content: "" },
        // 30: 補助水槽 バルブ類
        { content: "開閉正常", judgment: "良", bad_content: "", action_content: "" },
        // 31: 高架水槽方式/圧力水槽方式 (MPa)
        { content: "0.35", judgment: "良", bad_content: "", action_content: "" },
        // 32: 減圧のための措置 (MPa)
        { content: "0.32", judgment: "良", bad_content: "", action_content: "" },
        // 33: 減圧
        { content: "減圧弁正常", judgment: "良", bad_content: "", action_content: "" },
    ],

    // ===== Page 3: (その3)機器点検 - 36 rows =====
    page3_rows: [
        // 0: 配管等 管・管継手
        { content: "腐食・漏水なし", judgment: "良", bad_content: "", action_content: "" },
        // 1: 配管等 支持金具・つり金具
        { content: "緩み・脱落なし", judgment: "良", bad_content: "", action_content: "" },
        // 2: 配管等 バルブ類
        { content: "開閉正常", judgment: "良", bad_content: "", action_content: "" },
        // 3: 配管等 ろ過装置
        { content: "目詰まりなし", judgment: "良", bad_content: "", action_content: "" },
        // 4: 配管等 逃し配管
        { content: "接続良好", judgment: "良", bad_content: "", action_content: "" },
        // 5: 配管等 流水検知装置二次側配管
        { content: "漏水なし", judgment: "良", bad_content: "", action_content: "" },
        // 6: 配管等 標識
        { content: "表示明瞭", judgment: "良", bad_content: "", action_content: "" },
        // 7: 送水口 周囲の状況
        { content: "障害物なし", judgment: "良", bad_content: "", action_content: "" },
        // 8: 送水口 外形
        { content: "変形・損傷なし", judgment: "良", bad_content: "", action_content: "" },
        // 9: 送水口 標識
        { content: "表示明瞭", judgment: "良", bad_content: "", action_content: "" },
        // 10: SPヘッド 外形
        { content: "変形・腐食なし", judgment: "良", bad_content: "", action_content: "" },
        // 11: SPヘッド 感熱障害
        { content: "障害物なし", judgment: "良", bad_content: "", action_content: "" },
        // 12: SPヘッド 散水分布障害
        { content: "障害物なし", judgment: "良", bad_content: "", action_content: "" },
        // 13: SPヘッド 未警戒部分
        { content: "未警戒なし", judgment: "良", bad_content: "", action_content: "" },
        // 14: SPヘッド 適応性
        { content: "適合確認", judgment: "良", bad_content: "", action_content: "" },
        // 15: 圧力検知装置 バルブ本体等 (MPa)
        { content: "0.28", judgment: "良", bad_content: "", action_content: "" },
        // 16: 圧力検知装置 リターディング・チャンバー
        { content: "作動正常", judgment: "良", bad_content: "", action_content: "" },
        // 17: 圧力検知装置 圧力スイッチ (設定圧力/作動圧力 compound)
        { content: "0.85/0.82", judgment: "良", bad_content: "", action_content: "" },
        // 18: 圧力検知装置 音響警報装置・表示装置
        { content: "警報鳴動確認", judgment: "良", bad_content: "", action_content: "" },
        // 19: 圧力検知装置 減圧警報装置
        { content: "作動確認済", judgment: "良", bad_content: "", action_content: "" },
        // 20: 圧力検知装置 一斉開放弁
        { content: "開放正常", judgment: "良", bad_content: "", action_content: "" },
        // 21: 圧力検知装置 排水設備
        { content: "排水良好", judgment: "良", bad_content: "", action_content: "" },
        // 22: 補助散水栓箱等 周囲の状況
        { content: "障害物なし", judgment: "良", bad_content: "", action_content: "" },
        // 23: 補助散水栓箱等 外形
        { content: "変形・損傷なし", judgment: "良", bad_content: "", action_content: "" },
        // 24: 補助散水栓箱等 表示
        { content: "表示明瞭", judgment: "良", bad_content: "", action_content: "" },
        // 25: 補助散水栓箱等 ホース・ノズル外形 (compound: m/本/mm)
        { content: "25/2/19", judgment: "良", bad_content: "", action_content: "" },
        // 26: 補助散水栓箱等 ホース・ノズル操作性
        { content: "接続良好", judgment: "良", bad_content: "", action_content: "" },
        // 27: 補助散水栓箱等 補助散水栓開閉弁
        { content: "開閉正常", judgment: "良", bad_content: "", action_content: "" },
        // 28: 補助散水栓箱等 表示灯
        { content: "点灯確認", judgment: "良", bad_content: "", action_content: "" },
        // 29: 補助散水栓箱等 使用方法の表示
        { content: "表示明瞭", judgment: "良", bad_content: "", action_content: "" },
        // 30: 降下装置 周囲の状況
        { content: "障害物なし", judgment: "良", bad_content: "", action_content: "" },
        // 31: 降下装置 外形
        { content: "変形・損傷なし", judgment: "良", bad_content: "", action_content: "" },
        // 32: 降下装置 表示灯
        { content: "点灯確認", judgment: "良", bad_content: "", action_content: "" },
        // 33: 降下装置 表示
        { content: "表示明瞭", judgment: "良", bad_content: "", action_content: "" },
        // 34: 降下装置 機能
        { content: "降下正常", judgment: "良", bad_content: "", action_content: "" },
        // 35: 耐震措置
        { content: "固定良好", judgment: "良", bad_content: "", action_content: "" },
    ],

    // ===== Page 4: (その4)総合点検 - 22 rows =====
    page4_rows: [
        // 0: 閉鎖型SP ポンプ方式 加圧送水装置
        { content: "正常運転", judgment: "良", bad_content: "", action_content: "" },
        // 1: 閉鎖型SP ポンプ方式 表示・警報等
        { content: "全表示正常", judgment: "良", bad_content: "", action_content: "" },
        // 2: 閉鎖型SP ポンプ方式 電動機の運転電流 (A)
        { content: "12.5", judgment: "良", bad_content: "", action_content: "" },
        // 3: 閉鎖型SP ポンプ方式 運転状況
        { content: "異音・振動なし", judgment: "良", bad_content: "", action_content: "" },
        // 4: 閉鎖型SP ポンプ方式 放水圧力 (MPa)
        { content: "0.42", judgment: "良", bad_content: "", action_content: "" },
        // 5: 閉鎖型SP ポンプ方式 減圧のための措置
        { content: "減圧弁正常", judgment: "良", bad_content: "", action_content: "" },
        // 6: 閉鎖型SP 高架水槽方式 表示・警報等
        { content: "該当なし", judgment: "良", bad_content: "", action_content: "" },
        // 7: 閉鎖型SP 高架水槽方式 放水圧力 (MPa)
        { content: "0.38", judgment: "良", bad_content: "", action_content: "" },
        // 8: 閉鎖型SP 高架水槽方式 減圧のための措置
        { content: "該当なし", judgment: "良", bad_content: "", action_content: "" },
        // 9: 閉鎖型SP 水道連結方式 放水圧力 (MPa)
        { content: "0.35", judgment: "良", bad_content: "", action_content: "" },
        // 10: 閉鎖型SP 水道連結方式 減圧のための措置
        { content: "該当なし", judgment: "良", bad_content: "", action_content: "" },
        // 11: 開放型SP ポンプ方式 加圧送水装置
        { content: "正常運転", judgment: "良", bad_content: "", action_content: "" },
        // 12: 開放型SP ポンプ方式 表示・警報等
        { content: "全表示正常", judgment: "良", bad_content: "", action_content: "" },
        // 13: 開放型SP ポンプ方式 電動機の運転電流 (A)
        { content: "11.8", judgment: "良", bad_content: "", action_content: "" },
        // 14: 開放型SP ポンプ方式 運転状況
        { content: "異音・振動なし", judgment: "良", bad_content: "", action_content: "" },
        // 15: 開放型SP ポンプ方式 一斉開放弁
        { content: "開放正常", judgment: "良", bad_content: "", action_content: "" },
        // 16: 開放型SP ポンプ方式 減圧のための措置
        { content: "減圧弁正常", judgment: "良", bad_content: "", action_content: "" },
        // 17: 開放型SP 高架水槽方式 表示・警報等
        { content: "該当なし", judgment: "良", bad_content: "", action_content: "" },
        // 18: 開放型SP 高架水槽方式 一斉開放弁
        { content: "該当なし", judgment: "良", bad_content: "", action_content: "" },
        // 19: 開放型SP 高架水槽方式 減圧のための措置
        { content: "該当なし", judgment: "良", bad_content: "", action_content: "" },
        // 20: 開放型SP 水道連結方式 一斉開放弁
        { content: "該当なし", judgment: "良", bad_content: "", action_content: "" },
        // 21: 開放型SP 水道連結方式 減圧のための措置
        { content: "該当なし", judgment: "良", bad_content: "", action_content: "" },
    ],

    // ===== Page 5: (その5)補助散水栓 - 11 rows =====
    page5_rows: [
        // 0: 補助散水栓 ポンプ方式 加圧送水装置
        { content: "正常運転", judgment: "良", bad_content: "", action_content: "" },
        // 1: 補助散水栓 ポンプ方式 表示・警報等
        { content: "全表示正常", judgment: "良", bad_content: "", action_content: "" },
        // 2: 補助散水栓 ポンプ方式 電動機の運転電流 (A)
        { content: "13.2", judgment: "良", bad_content: "", action_content: "" },
        // 3: 補助散水栓 ポンプ方式 運転状況
        { content: "異音・振動なし", judgment: "良", bad_content: "", action_content: "" },
        // 4: 補助散水栓 ポンプ方式 放水圧力 (MPa)
        { content: "0.40", judgment: "良", bad_content: "", action_content: "" },
        // 5: 補助散水栓 ポンプ方式 放水量 (L/min)
        { content: "280", judgment: "良", bad_content: "", action_content: "" },
        // 6: 補助散水栓 ポンプ方式 減圧のための措置
        { content: "減圧弁正常", judgment: "良", bad_content: "", action_content: "" },
        // 7: 補助散水栓 高架水槽方式 表示・警報等
        { content: "該当なし", judgment: "良", bad_content: "", action_content: "" },
        // 8: 補助散水栓 高架水槽方式 放水圧力 (MPa)
        { content: "0.38", judgment: "良", bad_content: "", action_content: "" },
        // 9: 補助散水栓 高架水槽方式 放水量 (L/min)
        { content: "260", judgment: "良", bad_content: "", action_content: "" },
        // 10: 補助散水栓 高架水槽方式 減圧のための措置
        { content: "該当なし", judgment: "良", bad_content: "", action_content: "" },
    ],

    notes: "令和8年2月度機器点検・総合点検を全系統で実施。ポンプ起動圧力・放水圧力・放水量ともに基準値内。閉鎖型ヘッドの感熱部・散水障害は異常なし。補助散水栓のホース・ノズルは全数確認済。圧力スイッチの設定圧力・作動圧力は規定範囲内。次回点検は令和8年8月予定。",

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

const outPath = path.resolve("tmp/bekki3_full_test4.pdf");
console.log("Generating bekki3 FULL test PDF (all 123 items)...");
const result = await runRoutePdf({
    routePath: "src/app/api/generate-sprinkler-bekki3-pdf/route.ts",
    payload,
    outPdfPath: outPath,
});
console.log(`Done: ${result.outPdfPath} (${result.bytes} bytes)`);
