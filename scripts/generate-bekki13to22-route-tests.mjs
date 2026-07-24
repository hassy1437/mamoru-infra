import { runRoutePdf } from "./run-route-pdf.mjs";
import { applyNumericRows } from "./lib-numeric-rows.mjs";
import fs from "fs";

const makeRows = (count, prefix) =>
  Array.from({ length: count }, (_, i) => ({
    content: `${prefix} 点検項目 ${i + 1}`,
    judgment: i % 5 === 2 ? "否" : "良",
    bad_content:
      i % 5 === 2
        ? "作動不良・圧力低下・表示劣化あり。要再点検。"
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
      // 種別容量3列（避難口=content / 通路=content_tsuro / 客席=content_kyaku）の描画確認用
      page1_rows: makeRows(20, "B16-P1").map((row, i) =>
        i === 0 ? { ...row, content: "避難口20", content_tsuro: "通路15", content_kyaku: "客席8" } : row
      ),
      page2_rows: makeRows(20, "B16-P2").map((row, i) =>
        i === 0 ? { ...row, content: "避難口5", content_tsuro: "通路3", content_kyaku: "客席2" } : row
      ),
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
      page1_rows: makeRows(30, "B20-P1").map((row, i) => {
        // row 7: ホース・ノズル — 長さ(m)=content, 本数=hose_count, 口径(mm)=nozzle_dia
        if (i === 7) return { ...row, content: "20", hose_count: "2", nozzle_dia: "25" };
        // row 17: 電圧計・電流計 — 電圧値(V)と電流値(A)を個別にテスト
        if (i === 17) return { ...row, content: "200", current_value: "5.2" };
        return row;
      }),
      page2_rows: makeRows(40, "B20-P2").map((row, i) => {
        // row 7: 遠隔操作部 機能（専用・兼用）— 丸囲み確認用に「兼用」を投入
        if (i === 7) return { ...row, content: "兼用" };
        // row 18: ポンプ性能 — 吐出圧力(MPa)=content, 吐出量(L/min)=flow_value
        if (i === 18) return { ...row, content: "0.85", flow_value: "1800" };
        return row;
      }),
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

const fitErrors = [];
for (const job of jobs) {
  // 数値しか入らないセルには長文ではなく数値を入れる（共有部品で行番号を判定）
  applyNumericRows(job.payload, job.routePath);
  let result;
  try {
    result = await runRoutePdf(job);
  } catch (e) {
    // ⑧ 以降、長文セットは「収まらない」ことを 422 で表明する。
    // ストレステストなのでそれ自体が期待結果。落とさず記録して次へ進む。
    if (e.status === 422) {
      const b = JSON.parse(e.responseBody);
      fitErrors.push({ key: job.key, form: b.form, items: b.items.length });
      console.log(job.key, "FIT_FAILED", b.items.length, "件");
      continue;
    }
    throw e;
  }
  // 切り詰め内訳の突き合わせ用に入力値も残す（scripts/check-truncation.py が読む）。
  // PDFに描かれた「…」付きの文字列だけでは、何文字落ちたかが分からないため。
  fs.writeFileSync(job.outPdfPath.replace(/[.]pdf$/, '.payload.json'), JSON.stringify(job.payload));
  // 現実的payloadセットを組み立てるため、どのルートで描いたかも残す
  fs.writeFileSync(job.outPdfPath.replace(/[.]pdf$/, '.job.json'), JSON.stringify({ routePath: job.routePath }));
  console.log(job.key, result.outPdfPath, result.bytes);
}
if (fitErrors.length) console.log("FIT_FAILED 合計:", JSON.stringify(fitErrors));
