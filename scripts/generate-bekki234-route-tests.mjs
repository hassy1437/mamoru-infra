import path from "path";
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
  equipment_name: "主ポンプ系統",
  pump_maker: "ポンプ製造株式会社",
  pump_model: "PMP-9000-EX",
  motor_maker: "電機サンプル",
  motor_model: "MTR-2026-L",
  notes:
    "備考欄の長文テストです。日本語文章がスペースなしでもはみ出さないこと、狭いセルで縮小や切り詰めが効くことを確認します。必要に応じて省略記号で表示します。",
  device1: {
    name: "圧力計",
    model: "PG-9000-LONG",
    calibrated_at: "2026/1/31",
    maker: "計測機器サンプル製作所",
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
    key: "bekki2",
    routePath: "src/app/api/generate-shokasen-bekki2-pdf/route.ts",
    outPdfPath: "tmp/pdf-test-bekki234/bekki2_test.pdf",
    payload: {
      ...shared,
      page1_rows: makeRows(18, "別記2-1").map((row, i) =>
        // row 10: 電圧計・電流計 — 電圧値(V)と電流値(A)を個別にテスト
        i === 10 ? { ...row, content: "200", current_value: "5.2" } : row
      ),
      page2_rows: makeRows(34, "別記2-2").map((row, i) =>
        // row 24: 性能 — MPa値とL/min値を個別にテスト
        i === 24 ? { ...row, content: "0.40", flow_value: "300" } : row
      ),
      page3_rows: makeRows(32, "別記2-3"),
    },
  },
  {
    key: "bekki3",
    routePath: "src/app/api/generate-sprinkler-bekki3-pdf/route.ts",
    outPdfPath: "tmp/pdf-test-bekki234/bekki3_test.pdf",
    payload: {
      ...shared,
      page1_rows: makeRows(19, "別記3-1").map((row, i) =>
        i === 10 ? { ...row, content: "200", current_value: "5.2" } : row
      ),
      page2_rows: makeRows(34, "別記3-2"),
      page3_rows: makeRows(36, "別記3-3"),
      page4_rows: makeRows(23, "別記3-4"),
      page5_rows: makeRows(11, "別記3-5"),
    },
  },
  {
    key: "bekki4",
    routePath: "src/app/api/generate-water-spray-bekki4-pdf/route.ts",
    outPdfPath: "tmp/pdf-test-bekki234/bekki4_test.pdf",
    payload: {
      ...shared,
      page1_rows: makeRows(18, "別記4-1").map((row, i) =>
        i === 10 ? { ...row, content: "200", current_value: "5.2" } : row
      ),
      page2_rows: makeRows(35, "別記4-2"),
      page3_rows: makeRows(24, "別記4-3"),
    },
  },
];

for (const job of jobs) {
  const result = await runRoutePdf(job);
  console.log(job.key, result.outPdfPath, result.bytes);
}
