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
        motor_maker: "三菱電機株式会社",
        motor_model: "SF-JR 3.7kW 4P",
        pump_maker: "荏原製作所",
        pump_model: "50x40FSED 5.15",
    },

    // P1: 25 rows
    page1_rows: [
        { content: "障害物なし", judgment: "良" },         // 0 送水口: 周囲の状況
        { content: "変形・腐食なし", judgment: "良" },      // 1 送水口: 外形
        { content: "表示 明瞭", judgment: "良" },           // 2 送水口: 表示
        { content: "弁体 正常", judgment: "良" },           // 3 送水口: 弁体
        { content: "障害物なし", judgment: "良" },           // 4 放水口（ホース接続口）: 周囲の状況
        { content: "変形なし", judgment: "良" },             // 5 放水口: 外形
        { content: "開閉 正常", judgment: "良" },            // 6 放水口: 弁類
        { content: "20/2/25", judgment: "良" },                   // 7 ホース・ノズル: m×本 ノズル径mm (20m×2本 25mm)
        { content: "ホースの耐圧 正常", judgment: "良" },        // 8 ホースの耐圧性能
        { content: "障害物なし", judgment: "良" },           // 9 配管: 周囲の状況
        { content: "変形・腐食なし", judgment: "良" },       // 10 配管: 外形
        { content: "開閉 正常", judgment: "良" },            // 11 配管: 弁類
        { content: "緩みなし", judgment: "良" },             // 12 配管: 管接続部
        { content: "耐圧性能 正常", judgment: "良" },        // 13 耐震措置
        { content: "障害物なし", judgment: "良" },           // 14 加圧送水装置: 周囲の状況
        { content: "変形・腐食なし", judgment: "良" },       // 15 加圧送水装置: 外形
        { content: "正常動作", judgment: "良" },             // 16 加圧送水装置（電動機）: 回転
        { content: "AC200/15.5", judgment: "良" },             // 17 電動機: 電圧計V / 電流計A
        { content: "1750r/min 正常", judgment: "良" },      // 18 電動機: 回転数・運転電流
        { content: "障害物なし", judgment: "良" },           // 19 加圧送水装置: 周囲の状況
        { content: "規定品使用", judgment: "良" },           // 20 加圧送水装置: ヒューズ
        { content: "接点良好", judgment: "良" },             // 21 加圧送水装置: 継電器
        { content: "全灯正常", judgment: "良" },             // 22 加圧送水装置: 表示灯
        { content: "緩みなし", judgment: "良" },             // 23 加圧送水装置: 結線
        { content: "D種 確認済", judgment: "良" },           // 24 加圧送水装置: 接地
    ],

    // P2: 35 rows
    page2_rows: [
        { content: "障害物なし", judgment: "良" },           // 0 呼水装置（ポンプ方式）: 周囲の状況
        { content: "変形なし", judgment: "良" },             // 1 呼水装置: 外形
        { content: "障害物なし", judgment: "良" },           // 2 呼水装置: 周囲の状況
        { content: "変形なし", judgment: "良" },             // 3 呼水装置: 外形
        { content: "障害物なし", judgment: "良" },           // 4 呼水装置: 周囲の状況
        { content: "変形なし", judgment: "良" },             // 5 呼水装置: 外形
        { content: "障害物なし", judgment: "良" },           // 6 呼水装置: 周囲の状況
        { content: "専用", judgment: "良" },                   // 7 機能: 専用/兼用 (circle)
        { content: "変形なし", judgment: "良" },             // 8 水源: 外形
        { content: "規定水量確保", judgment: "良" },         // 9 水源: 水量等
        { content: "水質 清浄", judgment: "良" },            // 10 水源: 水質
        { content: "正常作動", judgment: "良" },             // 11 水源: 給水装置
        { content: "正常表示", judgment: "良" },             // 12 水源: 水位計
        { content: "正常指示", judgment: "良" },             // 13 水源: 圧力計
        { content: "開閉正常", judgment: "良" },             // 14 水源: バルブ類
        { content: "適量確保", judgment: "良" },             // 15 水源: 補助水槽等
        { content: "障害物なし", judgment: "良" },           // 16 非常電源: 周囲の状況
        { content: "AC200V 異常なし", judgment: "良" },     // 17 非常電源: 端子電圧
        { content: "0.65/400", judgment: "良" },              // 18 性能: MPa / L/min
        { content: "正常表示", judgment: "良" },             // 19 起動装置: 表示等
        { content: "正常動作", judgment: "良" },             // 20 起動装置: 起動操作
        { content: "規定値内", judgment: "良" },             // 21 起動装置: 設定圧力・作動圧力
        { content: "正常表示", judgment: "良" },             // 22 起動装置: 確認灯等
        { content: "異常なし", judgment: "良" },             // 23 起動装置: 配管等
        { content: "変形なし", judgment: "良" },             // 24 操作回路: 外形
        { content: "正常導通", judgment: "良" },             // 25 操作回路: 操作回路
        { content: "正常動作", judgment: "良" },             // 26 操作回路: 起動操作部
        { content: "正常表示", judgment: "良" },             // 27 操作回路: 確認灯
        { content: "異常なし", judgment: "良" },             // 28 操作回路: 配管等
        { content: "変形なし", judgment: "良" },             // 29 制御盤: 外形
        { content: "正常動作", judgment: "良" },             // 30 制御盤: 表示灯・スイッチ類
        { content: "結線緩みなし", judgment: "良" },         // 31 制御盤: 結線接続等
        { content: "正常表示", judgment: "良" },             // 32 制御盤: 表示灯等
        { content: "正常動作", judgment: "良" },             // 33 制御盤: 接地
        { content: "予備品 確認済", judgment: "良" },        // 34 制御盤: 予備品等
    ],

    // P3: 3 rows (「総合点検」ヘッダーは除外)
    page3_rows: [
        { content: "正常運転", judgment: "良" },               // 0 加圧送水装置
        { content: "15.5A 正常", judgment: "良" },             // 1 電動機の運転電流
        { content: "正常運転確認", judgment: "良" },            // 2 運転状況
    ],

    notes: "令和8年2月度定期点検実施。連結送水管について機器点検及び総合点検を実施した。加圧送水装置の全回線について運転確認、送水圧力0.6MPa以上を確認。放水口からの放水試験も実施し、放水圧力0.35MPa・放水量400L/min以上を確認。配管の耐圧試験も全区間で異常なし。次回点検は令和8年8月予定。",

    device1: {
        name: "圧力計",
        model: "PG-250",
        calibrated_at: "2026-01-15",
        maker: "長野計器株式会社",
    },
    device2: {
        name: "流量計",
        model: "FW-100",
        calibrated_at: "2026-01-20",
        maker: "愛知時計電機株式会社",
    },
};

const outPath = path.resolve("tmp/bekki20_full_test2.pdf");
console.log("Generating bekki20 FULL test PDF...");
const result = await runRoutePdf({
    routePath: "src/app/api/generate-standpipe-bekki20-pdf/route.ts",
    payload,
    outPdfPath: outPath,
});
console.log(`Done: ${result.outPdfPath} (${result.bytes} bytes)`);
