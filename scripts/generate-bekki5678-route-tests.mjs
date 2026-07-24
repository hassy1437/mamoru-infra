import { runRoutePdf } from "./run-route-pdf.mjs";
import fs from "fs";

const makeRows = (count, prefix) =>
  Array.from({ length: count }, (_, i) => ({
    content: `${prefix} 点検項目 ${i + 1}`,
    judgment: i % 5 === 2 ? "否" : "良",
    bad_content:
      i % 5 === 2
        ? "作動不良・圧力低下・表示劣化あり。継続使用前に再点検が必要です。"
        : "",
    action_content:
      i % 5 === 2
        ? "部品交換および再試験を実施予定（長文フィット確認用テキスト）"
        : "",
  }));

const makeCylinderRows = (count, cols, includeSpec45 = false, useDateValue = false, useDateTempValue = false) =>
  Array.from({ length: count }, (_, i) => {
    const base = {
      no: String(i + 1),
      cylinder_no: `CYL-${1000 + i}`,
      spec1: "SPEC-A",
      spec2: "SPEC-B",
      spec3: "SPEC-C",
    };
    if (useDateTempValue) {
      // PR4 様式6: 各セルに (date, temp, value) trio を投入
      for (let n = 1; n <= cols; n += 1) {
        const dd = String(((i + n) % 28) + 1).padStart(2, "0");
        base[`measure${n}_date`] = `2026/02/${dd}`;
        base[`measure${n}_temp`] = `${15 + n}℃`;
        base[`measure${n}_value`] = `${(i % 9) + 1}.${n}`;
      }
    } else if (useDateValue) {
      // 新形式：各セルに (date, value) ペアを投入（PR2 様式7 が初出。PR3 で 様式8 にも展開）
      for (let n = 1; n <= cols; n += 1) {
        const dd = String(((i + n) % 28) + 1).padStart(2, "0");
        base[`measure${n}_date`] = `2026/02/${dd}`;
        base[`measure${n}_value`] = `${(i % 9) + 1}.${n}`;
      }
    } else {
      // 旧形式：1セル=1値テキスト
      base.measure1 = `${(i % 9) + 1}.1`;
      base.measure2 = `${(i % 9) + 1}.2`;
      base.measure3 = `${(i % 9) + 1}.3`;
      base.measure4 = `${(i % 9) + 1}.4`;
      if (cols >= 5) base.measure5 = `${(i % 9) + 1}.5`;
      if (cols >= 6) base.measure6 = `${(i % 9) + 1}.6`;
    }
    if (includeSpec45) {
      base.spec4 = "SPEC-D";
      base.spec5 = "SPEC-E";
    }
    return base;
  });

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
    key: "bekki5",
    routePath: "src/app/api/generate-foam-bekki5-pdf/route.ts",
    outPdfPath: "tmp/pdf-test-bekki5678/bekki5_test.pdf",
    payload: {
      ...shared,
      equipment_name: "主ポンプ系統",
      pump_maker: "ポンプ製造株式会社",
      pump_model: "PMP-9000-EX",
      motor_maker: "電機",
      motor_model: "MTR-2026",
      foam_maker: "サンプル",
      foam_model: "FM-12A",
      page1_rows: makeRows(19, "B5-P1").map((row, i) =>
        i === 11 ? { ...row, content: "200", current_value: "5.2" } : row
      ),
      page2_rows: makeRows(34, "B5-P2").map((row, i) => {
        // row 7: 火災感知装置 感知器（専用・兼用）— 丸囲み確認用に「専用」を投入
        if (i === 7) return { ...row, content: "専用" };
        // row 19: ポンプ 性能 — 吐出圧力(MPa)=content, 吐出量(L/min)=flow_value
        if (i === 19) return { ...row, content: "0.65", flow_value: "1200" };
        return row;
      }),
      page3_rows: makeRows(27, "B5-P3").map((row, i) => {
        // row 21: ホース・ノズル / 外形 — 長さ/本数/口径を個別キーで投入
        if (i === 21) return { ...row, content: "30", hose_count: "2", nozzle_dia: "19" };
        return row;
      }),
      page4_rows: makeRows(23, "B5-P4"),
    },
  },
  {
    key: "bekki6",
    routePath: "src/app/api/generate-inert-gas-bekki6-pdf/route.ts",
    outPdfPath: "tmp/pdf-test-bekki5678/bekki6_test.pdf",
    payload: {
      ...shared,
      zone_name: "A区画",
      equipment_system: "不活性ガス消火設備",
      page1_rows: makeRows(32, "B6-P1"),
      page2_rows: makeRows(40, "B6-P2").map((row, i) =>
        // row 17: 起動装置 自動式 火災感知装置（専用・兼用）— 丸囲み確認用に「兼用」を投入
        i === 17 ? { ...row, content: "兼用" } : row
      ),
      page3_rows: makeRows(36, "B6-P3"),
      page4_rows: makeRows(12, "B6-P4"),
      page5_rows: makeCylinderRows(29, 4, true, false, true),
    },
  },
  {
    key: "bekki7",
    routePath: "src/app/api/generate-halogen-bekki7-pdf/route.ts",
    outPdfPath: "tmp/pdf-test-bekki5678/bekki7_test.pdf",
    payload: {
      ...shared,
      zone_name: "B区画",
      equipment_system: "ハロゲン化物消火設備",
      page1_rows: makeRows(37, "B7-P1"),
      page2_rows: makeRows(47, "B7-P2").map((row, i) =>
        // row 26: 起動装置 自動式 火災感知装置（専用・兼用）— 丸囲み確認用に「専用」を投入
        i === 26 ? { ...row, content: "専用" } : row
      ),
      page3_rows: makeRows(27, "B7-P3"),
      page4_rows: makeRows(11, "B7-P4"),
      page5_rows: makeCylinderRows(19, 6, false, true),
    },
  },
  {
    key: "bekki8",
    routePath: "src/app/api/generate-powder-bekki8-pdf/route.ts",
    outPdfPath: "tmp/pdf-test-bekki5678/bekki8_test.pdf",
    payload: {
      ...shared,
      zone_name: "C区画",
      equipment_system: "粉末消火設備",
      page1_rows: makeRows(39, "B8-P1"),
      page2_rows: makeRows(45, "B8-P2").map((row, i) =>
        // row 26: 起動装置 自動式 火災感知装置（専用・兼用）— 丸囲み確認用に「兼用」を投入
        i === 26 ? { ...row, content: "兼用" } : row
      ),
      page3_rows: makeRows(25, "B8-P3"),
      page4_rows: makeRows(11, "B8-P4"),
      page5_rows: makeCylinderRows(19, 6, false, true),
    },
  },
];

for (const job of jobs) {
  const result = await runRoutePdf(job);
  // 切り詰め内訳の突き合わせ用に入力値も残す（scripts/check-truncation.py が読む）。
  // PDFに描かれた「…」付きの文字列だけでは、何文字落ちたかが分からないため。
  fs.writeFileSync(job.outPdfPath.replace(/[.]pdf$/, '.payload.json'), JSON.stringify(job.payload));
  console.log(job.key, result.outPdfPath, result.bytes);
}
