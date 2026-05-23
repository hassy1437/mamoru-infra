import { runRoutePdf } from "./run-route-pdf.mjs";

const makeRows = (count, prefix) =>
  Array.from({ length: count }, (_, i) => ({
    content: `${prefix} 点検項目 ${i + 1}`,
    judgment: i % 5 === 2 ? "不良" : "良",
    bad_content:
      i % 5 === 2
        ? "作動不良・圧力低下・表示劣化あり。継続使用前に再点検が必要です。"
        : "",
    action_content:
      i % 5 === 2
        ? "部品交換および再試験を実施予定（長文フィット確認用テキスト）"
        : "",
  }));

const shared = {
  form_name: "高層複合施設サンプル棟（長文フィット確認）",
  fire_manager: "消防管理者 山田太郎",
  witness: "管理会社 立会担当 佐藤花子",
  location: "東京都千代田区丸の内一丁目一番一号 サンプルタワー南館・北館 共用部全域",
  inspection_type: "機器・総合点検",
  period_start: "2026-02-01",
  period_end: "2026-02-26",
  inspector_name: "鈴木一郎",
  inspector_company: "株式会社サンプル消防設備保守センター",
  inspector_address: "東京都港区芝公園四丁目二番八号 メンテナンスビル3階 点検部",
  inspector_tel: "03-1234-5678（内線204）",
  notes:
    "備考欄の長文テストです。日本語文章がスペースなしでもはみ出さないこと、狭いセルで縮小や切り詰めが効くことを確認します。必要に応じて省略記号で表示します。",
  device1: {
    name: "圧力計",
    model: "PG-9000-LONG",
    calibrated_at: "2026/1/31",
    maker: "計測機器製作所",
  },
  device2: {
    name: "試験器",
    model: "TT-42-EXT",
    calibrated_at: "2026/2/10",
    maker: "試験機メーカー",
  },
};

const jobs = [
  {
    key: "bekki9",
    routePath: "src/app/api/generate-okugai-shokasen-bekki9-pdf/route.ts",
    outPdfPath: "tmp/pdf-test-bekki9to12/bekki9_test.pdf",
    payload: {
      ...shared,
      extra_fields: {
        pump_maker: "ポンプ製造株式会社",
        pump_model: "PMP-9000-EX",
        motor_maker: "電機サンプル",
        motor_model: "MTR-2026-L",
      },
      page1_rows: makeRows(18, "B9-P1").map((row, i) =>
        i === 10 ? { ...row, content: "200", current_value: "5.2" } : row
      ),
      page2_rows: makeRows(36, "B9-P2").map((row, i) =>
        // row 7: 遠隔操作部 機能（専用・兼用）— 丸囲み確認用に「専用」を投入
        i === 7 ? { ...row, content: "専用" } : row
      ),
      page3_rows: makeRows(22, "B9-P3"),
    },
  },
  {
    key: "bekki10",
    routePath: "src/app/api/generate-doryoku-pump-bekki10-pdf/route.ts",
    outPdfPath: "tmp/pdf-test-bekki9to12/bekki10_test.pdf",
    payload: {
      ...shared,
      extra_fields: {
        body_maker: "動力消防ポンプ製造株式会社",
        body_model: "ENG-5000",
      },
      page1_rows: makeRows(25, "B10-P1"),
      page2_rows: makeRows(13, "B10-P2"),
    },
  },
  {
    key: "bekki11_1",
    routePath: "src/app/api/generate-jidou-kasai-houchi-bekki11-1-pdf/route.ts",
    outPdfPath: "tmp/pdf-test-bekki9to12/bekki11_1_test.pdf",
    payload: {
      ...shared,
      extra_fields: {
        receiver_maker: "受信機製造株式会社",
        receiver_model: "RCV-11",
      },
      page1_rows: makeRows(28, "B11-1-P1"),
      page2_rows: makeRows(25, "B11-1-P2"),
      page3_rows: makeRows(12, "B11-1-P3"),
    },
  },
  {
    key: "bekki11_2",
    routePath: "src/app/api/generate-gas-leak-fire-alarm-bekki11-2-pdf/route.ts",
    outPdfPath: "tmp/pdf-test-bekki9to12/bekki11_2_test.pdf",
    payload: {
      ...shared,
      extra_fields: {
        receiver_maker: "受信機製造株式会社",
        receiver_model: "RCV-11",
        repeater_maker: "中継器製造株式会社",
        repeater_model: "RPT-22",
      },
      page1_rows: makeRows(24, "B11-2-P1"),
      page2_rows: makeRows(19, "B11-2-P2"),
    },
  },
  {
    key: "bekki12",
    routePath: "src/app/api/generate-leakage-fire-alarm-bekki12-pdf/route.ts",
    outPdfPath: "tmp/pdf-test-bekki9to12/bekki12_test.pdf",
    payload: {
      ...shared,
      page1_rows: makeRows(23, "B12-P1"),
      page2_rows: makeRows(4, "B12-P2"),
    },
  },
];

for (const job of jobs) {
  const result = await runRoutePdf(job);
  console.log(job.key, result.outPdfPath, result.bytes);
}
