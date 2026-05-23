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
    key: "bekki13",
    routePath: "src/app/api/generate-fire-department-notification-bekki13-pdf/route.ts",
    outPdfPath: "tmp/pdf-test-bekki13to22/bekki13_test.pdf",
    payload: {
      ...shared,
      page1_rows: makeRows(40, "B13-P1"),
      page2_rows: makeRows(40, "B13-P2"),
    },
  },
  {
    key: "bekki14",
    routePath: "src/app/api/generate-emergency-alarm-bekki14-pdf/route.ts",
    outPdfPath: "tmp/pdf-test-bekki13to22/bekki14_test.pdf",
    payload: {
      ...shared,
      page1_rows: makeRows(40, "B14-P1"),
      page2_rows: makeRows(50, "B14-P2"),
      page3_rows: makeRows(10, "B14-P3"),
    },
  },
  {
    key: "bekki15",
    routePath: "src/app/api/generate-evacuation-equipment-bekki15-pdf/route.ts",
    outPdfPath: "tmp/pdf-test-bekki13to22/bekki15_test.pdf",
    payload: {
      ...shared,
      page1_rows: makeRows(40, "B15-P1"),
      page2_rows: makeRows(20, "B15-P2"),
    },
  },
  {
    key: "bekki16",
    routePath: "src/app/api/generate-guidance-lights-signs-bekki16-pdf/route.ts",
    outPdfPath: "tmp/pdf-test-bekki13to22/bekki16_test.pdf",
    payload: {
      ...shared,
      page1_rows: makeRows(20, "B16-P1"),
      page2_rows: makeRows(20, "B16-P2"),
    },
  },
  {
    key: "bekki17",
    routePath: "src/app/api/generate-fire-water-bekki17-pdf/route.ts",
    outPdfPath: "tmp/pdf-test-bekki13to22/bekki17_test.pdf",
    payload: {
      ...shared,
      page1_rows: makeRows(20, "B17-P1"),
    },
  },
  {
    key: "bekki18",
    routePath: "src/app/api/generate-smoke-control-bekki18-pdf/route.ts",
    outPdfPath: "tmp/pdf-test-bekki13to22/bekki18_test.pdf",
    payload: {
      ...shared,
      extra_fields: {
        smoke_machine_maker: "排煙機製造株式会社",
        smoke_machine_model: "SMK-2000",
      },
      page1_rows: makeRows(30, "B18-P1"),
      page2_rows: makeRows(30, "B18-P2"),
    },
  },
  {
    key: "bekki19",
    routePath: "src/app/api/generate-connected-sprinkler-bekki19-pdf/route.ts",
    outPdfPath: "tmp/pdf-test-bekki13to22/bekki19_test.pdf",
    payload: {
      ...shared,
      page1_rows: makeRows(25, "B19-P1"),
    },
  },
  {
    key: "bekki20",
    routePath: "src/app/api/generate-standpipe-bekki20-pdf/route.ts",
    outPdfPath: "tmp/pdf-test-bekki13to22/bekki20_test.pdf",
    payload: {
      ...shared,
      extra_fields: {
        motor_maker: "電機サンプル",
        motor_model: "MTR-2026-L",
        pump_maker: "ポンプ製造株式会社",
        pump_model: "PMP-9000-EX",
      },
      page1_rows: makeRows(30, "B20-P1"),
      page2_rows: makeRows(40, "B20-P2"),
      page3_rows: makeRows(10, "B20-P3"),
    },
  },
  {
    key: "bekki21",
    routePath: "src/app/api/generate-emergency-power-outlet-bekki21-pdf/route.ts",
    outPdfPath: "tmp/pdf-test-bekki13to22/bekki21_test.pdf",
    payload: {
      ...shared,
      page1_rows: makeRows(12, "B21-P1"),
    },
  },
  {
    key: "bekki22",
    routePath: "src/app/api/generate-radio-communication-support-bekki22-pdf/route.ts",
    outPdfPath: "tmp/pdf-test-bekki13to22/bekki22_test.pdf",
    payload: {
      ...shared,
      extra_fields: {
        cable_maker: "ケーブル製造",
        cable_model: "CBL-10",
        antenna_maker: "空中線製造",
        antenna_model: "ANT-20",
        amplifier_maker: "増幅器製造",
        amplifier_model: "AMP-30",
      },
      page1_rows: makeRows(20, "B22-P1"),
    },
  },
];

for (const job of jobs) {
  const result = await runRoutePdf(job);
  console.log(job.key, result.outPdfPath, result.bytes);
}
