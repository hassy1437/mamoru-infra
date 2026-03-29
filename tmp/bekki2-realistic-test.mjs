import { runRoutePdf } from "../scripts/run-route-pdf.mjs";

// 屋内消火栓設備 リアルなテストデータ
const makeRow = (content, judgment = "良", bad = "", action = "") => ({
  content, judgment, bad_content: bad, action_content: action,
});

// P1: 18行（設備の基本情報・電気系統）
const page1_rows = [
  makeRow("1号消火栓"),           // 0: 種別（加圧送水装置）
  makeRow("15"),                   // 1: m³
  makeRow(""),                     // 2: 開閉弁の状況
  makeRow(""),                     // 3: 水量確認
  makeRow(""),                     // 4: 外形
  makeRow(""),                     // 5: 表示
  makeRow(""),                     // 6: 変形損傷
  makeRow(""),                     // 7: 周囲の状況
  makeRow(""),                     // 8: 外形
  makeRow(""),                     // 9: 表示
  makeRow("AC200/15.5"),           // 10: 電圧計・電流計（V/A）
  makeRow("1750"),                 // 11: 回転計（r/min）
  makeRow("30", "良"),             // 12: ヒューズ類（A）
  makeRow(""),                     // 13: 開閉器・スイッチ類
  makeRow(""),                     // 14: 接地
  makeRow(""),                     // 15: 軸受部
  makeRow(""),                     // 16: 外形
  makeRow(""),                     // 17: 回転
];

// P2: 34行（性能・機能）
const page2_rows = [
  makeRow(""),                          // 0: 軸受部
  makeRow(""),                          // 1: 軸継手
  makeRow(""),                          // 2: ポンプ性能
  makeRow(""),                          // 3: グランドパッキン
  makeRow("0.35"),                      // 4: 設定圧力（MPa）
  makeRow("0.80"),                      // 5: MPa
  makeRow("0.32"),                      // 6: 作動圧力（MPa）
  makeRow("専用"),                      // 7: 専用/兼用
  makeRow(""),                          // 8: 構造
  makeRow(""),                          // 9: 精度
  makeRow(""),                          // 10: 表示
  makeRow(""),                          // 11: 圧力計
  makeRow(""),                          // 12: 外形
  makeRow(""),                          // 13: 機能
  makeRow(""),                          // 14: 表示
  makeRow(""),                          // 15: 呼水装置 外形
  makeRow(""),                          // 16: 機能
  makeRow(""),                          // 17: 減水警報装置
  makeRow(""),                          // 18: 起動装置
  makeRow(""),                          // 19: フート弁
  makeRow(""),                          // 20: 回転軸
  makeRow("350"),                       // 21: L
  makeRow(""),                          // 22: 自動給水装置
  makeRow(""),                          // 23: 減水警報装置
  { content: "0.25", judgment: "良", bad_content: "", action_content: "", flow_value: "300" },  // 24: 性能 MPa + L/min
  makeRow(""),                          // 25: 圧力水槽方式
  makeRow(""),                          // 26: 圧力水槽 外形
  makeRow(""),                          // 27: 表示
  makeRow(""),                          // 28: 安全装置
  makeRow(""),                          // 29: 圧力計
  makeRow(""),                          // 30: 自動給水装置
  makeRow("0.45"),                      // 31: MPa
  makeRow("0.40"),                      // 32: MPa
  makeRow(""),                          // 33: 電磁弁
];

// P3: 22行A + 10行B
const page3_a = [
  makeRow(""),                          // 0: 配管等 外形
  makeRow(""),                          // 1: 吊り金具
  makeRow(""),                          // 2: バルブ
  makeRow(""),                          // 3: 濾過装置
  makeRow(""),                          // 4: 逃し配管
  makeRow(""),                          // 5: 送水口 周囲
  makeRow(""),                          // 6: 外形
  makeRow(""),                          // 7: 機能
  makeRow(""),                          // 8: 消火栓 表示灯
  makeRow(""),                          // 9: 消火栓箱 外形
  makeRow("65A"),                       // 10: 消火栓 号口径
  makeRow(""),                          // 11: ノズル
  makeRow(""),                          // 12: ホース
  makeRow(""),                          // 13: 格納状態
  makeRow(""),                          // 14: 降下装置
  makeRow(""),                          // 15: 配管 外形
  makeRow(""),                          // 16: 開閉弁
  makeRow(""),                          // 17: 表示
  makeRow(""),                          // 18: 安全装置
  makeRow(""),                          // 19: 圧力計
  makeRow("0.75"),                      // 20: MPa
  makeRow("1.0"),                       // 21: 圧力水槽 MPa
];
const page3_b = [
  makeRow(""),                          // 0: テスト弁
  makeRow(""),                          // 1: 非常電源
  makeRow("正常", "良"),                // 2: 運転電流（A）
  makeRow(""),                          // 3: 非常電源
  makeRow(""),                          // 4: 外形
  makeRow(""),                          // 5: ホース接続口
  makeRow(""),                          // 6: m × 本
  makeRow(""),                          // 7: ホース
  makeRow(""),                          // 8: 使用方法
  makeRow(""),                          // 9: 降下装置
];

const page3_rows = [...page3_a, ...page3_b];

const payload = {
  form_name: "丸の内防災センター",
  fire_manager: "防火管理者 佐藤花子",
  witness: "立会者 田中一郎",
  location: "東京都千代田区丸の内一丁目2番3号",
  inspection_type: "機器・総合",
  period_start: "2026-02-01",
  period_end: "2026-02-28",
  inspector_name: "主任点検者 鈴木健一",
  inspector_company: "防災メンテナンス株式会社",
  inspector_address: "東京都新宿区西新宿六丁目六番一号 テストメンテナンスタワー 8F",
  inspector_tel: "03-9876-5432",
  equipment_name: "屋内消火栓1号",
  pump_maker: "東芝テック工業株式会社",
  pump_model: "PKN-5 0 5 E",
  motor_maker: "東芝テック工業株式会社",
  motor_model: "IK-FBKA8-4P 3.7kW",
  page1_rows,
  page2_rows,
  page3_rows,
  notes: "",
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

const outPath = "tmp/bekki2_realistic_test.pdf";
await runRoutePdf({
  routePath: "src/app/api/generate-shokasen-bekki2-pdf/route.ts",
  outPdfPath: outPath,
  payload,
});
console.log(`Generated: ${outPath}`);
