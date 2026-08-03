import path from "path";
import fs from "fs";
import { runRoutePdf } from "./run-route-pdf.mjs";
import { applyNumericRows, applyChoiceRows, numericStressValue } from "./lib-numeric-rows.mjs";
import { applyLongText } from "./lib-long-text.mjs";
import { applyBoundaryRows } from "./lib-boundary-rows.mjs";

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
    choiceRows: { page2_rows: { 7: "専用" }, page3_rows: { 13: "専用" } },
    outPdfPath: "tmp/pdf-test-bekki234/bekki2_test.pdf",
    payload: {
      ...shared,
      page1_rows: makeRows(18, "別記2-1").map((row, i) =>
        // row 10: 電圧計・電流計 — 電圧値(V)と電流値(A)を個別にテスト
        i === 10 ? { ...row, content: "200", current_value: "5.2" } : row
      ),
      page2_rows: makeRows(34, "別記2-2").map((row, i) => {
        // row 7: 機能（専用/兼用）— 丸囲み確認用に「専用」を投入
        if (i === 7) return { ...row, content: "専用" };
        // row 24: 性能 — MPa値とL/min値を個別にテスト
        if (i === 24) return { ...row, content: "0.40", flow_value: "300" };
        return row;
      }),
      page3_rows: makeRows(32, "別記2-3").map((row, i) => {
        // row 8/9: ホース・ノズル径（1号/易操作1・2号）— 長さ/本数/口径を "/" 区切りで投入
        if (i === 8) return { ...row, content: "20/2/19" };
        if (i === 9) return { ...row, content: "15/1/25" };
        // row 13: 表示灯（専用/兼用）— 丸囲み確認用に「兼用」を投入
        if (i === 13) return { ...row, content: "兼用" };
        return row;
      }),
    },
  },
  {
    key: "bekki3",
    routePath: "src/app/api/generate-sprinkler-bekki3-pdf/route.ts",
    choiceRows: { page2_rows: { 7: "専用" } },
    outPdfPath: "tmp/pdf-test-bekki234/bekki3_test.pdf",
    payload: {
      ...shared,
      page1_rows: makeRows(19, "別記3-1").map((row, i) =>
        i === 10 ? { ...row, content: "200", current_value: "5.2" } : row
      ),
      page2_rows: makeRows(34, "別記3-2").map((row, i) => {
        // row 7: 火災感知装置 感知器（専用/兼用）— 丸囲み確認用に「専用」を投入
        if (i === 7) return { ...row, content: "専用" };
        // row 20: ポンプ 性能 — 吐出圧力(MPa)=content, 吐出量(L/min)=flow_value
        if (i === 20) return { ...row, content: "0.85", flow_value: "1800" };
        return row;
      }),
      page3_rows: makeRows(36, "別記3-3").map((row, i) => {
        // row 25: 補助散水栓箱等 ホース・ノズル外形 — 長さ/本数/口径を個別キーで投入
        if (i === 25) return { ...row, content: "20", hose_count: "2", nozzle_dia: "25" };
        return row;
      }),
      page4_rows: makeRows(23, "別記3-4"),
      page5_rows: makeRows(11, "別記3-5"),
    },
  },
  {
    key: "bekki4",
    routePath: "src/app/api/generate-water-spray-bekki4-pdf/route.ts",
    choiceRows: { page2_rows: { 7: "専用" } },
    outPdfPath: "tmp/pdf-test-bekki234/bekki4_test.pdf",
    payload: {
      ...shared,
      page1_rows: makeRows(18, "別記4-1").map((row, i) =>
        i === 10 ? { ...row, content: "200", current_value: "5.2" } : row
      ),
      page2_rows: makeRows(35, "別記4-2").map((row, i) => {
        // row 7: 火災感知装置 感知器（専用/兼用）— 丸囲み確認用に「兼用」を投入
        if (i === 7) return { ...row, content: "兼用" };
        // row 19: ポンプ 性能 — 吐出圧力(MPa)=content, 吐出量(L/min)=flow_value
        if (i === 19) return { ...row, content: "0.75", flow_value: "950" };
        return row;
      }),
      page3_rows: makeRows(24, "別記4-3"),
    },
  },
];

const fitErrors = [];
for (const job of jobs) {
  // 数値しか入らないセルには長文ではなく数値を入れる（共有部品で行番号を判定）
  // ★長文の基準は scripts/lib-long-text.mjs に1本化。ここで種別ごとの長文に置き換える。
  //   （以前は各生成スクリプトに直書きで、fixture 系4本には仕組み自体が無かった）
  job.payload = applyLongText(job.payload).payload;
  // ★文字種の軸: 数値欄には和文を入れる（長さは他の欄で振っている）。
  //   値と根拠は lib-numeric-rows.mjs の NUMERIC_JP_STANDARD に1本化。
  applyNumericRows(job.payload, job.routePath, numericStressValue(), { ignoreNarrow: true });
  // ★狭めたセルに「収まるはずの長さ」を入れて実際に踏む（測定誤りのあぶり出し）
  applyBoundaryRows(job.payload, job.routePath);
  // ★選択肢は必ず最後に入れる（applyNumericRows / applyBoundaryRows の後）。
  //   選択肢の行は skipContentRows に載るので数値置換の対象になり、
  //   override 行でもあれば境界値の対象にもなる。先に入れると上書きされ、
  //   ○が1つも描かれない状態に戻る（＝PDFは正常に出たまま情報だけ落ちる）。
  applyChoiceRows(job.payload, job.routePath, job.choiceRows);
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
