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

    // P1: 26 rows — 全項目入力、一部不良判定
    page1_rows: [
        { content: "3階東側 非常階段付近", judgment: "良" },                                         // 0 設置場所
        { content: "操作面積1.5m²以上確保", judgment: "良" },                                        // 1 操作面積等
        { content: "開口部 0.5m×1.0m 確保", judgment: "良" },                                       // 2 開口部
        { content: "降下空間 障害物なし", judgment: "良" },                                           // 3 降下空間
        { content: "避難空地 十分確保", judgment: "良" },                                             // 4 避難空地
        { content: "標識 明瞭", judgment: "良" },                                                    // 5 標識
        { content: "変形・腐食なし", judgment: "良" },                                                // 6 縦棒
        { content: "横さん 塗装剥離あり", judgment: "不良", bad_content: "一部塗装剥離", action_content: "再塗装実施予定" },  // 7 横さん
        { content: "突子 異常なし", judgment: "良" },                                                 // 8 突子
        { content: "結合部 緩みなし", judgment: "良" },                                               // 9 結合部等
        { content: "外形 異常なし", judgment: "良" },                                                 // 10 可動部外形
        { content: "展張・収納動作 正常", judgment: "良" },                                            // 11 機能（はしご）
        { content: "つり下げ金具 堅固", judgment: "良" },                                             // 12 つり下げ金具（はしご）
        { content: "外形 腐食・変形なし", judgment: "良" },                                            // 13 調速機外形
        { content: "降下速度 規定値内 1.0m/s", judgment: "良" },                                      // 14 調速機機能
        { content: "連結部 緩みなし", judgment: "良" },                                               // 15 調速機の連結部
        { content: "ロープ 摩耗・損傷なし", judgment: "良" },                                          // 16 ロープ（緩降機）
        { content: "着用具 劣化なし", judgment: "良" },                                               // 17 着用具
        { content: "緊結部 異常なし", judgment: "良" },                                               // 18 ロープと着用具の緊結部
        { content: "底板・側板 破損なし", judgment: "良" },                                            // 19 底板及び側板
        { content: "勾配 規定値内", judgment: "良" },                                                 // 20 すべり面の勾配
        { content: "手すり 堅固に固定", judgment: "良" },                                             // 21 手すり
        { content: "すべり棒 変形なし", judgment: "良" },                                             // 22 すべり棒
        { content: "ロープ 摩耗なし", judgment: "良" },                                               // 23 ロープ本体
        { content: "結合部 異常なし", judgment: "良" },                                               // 24 結合部（避難ロープ）
        { content: "つり下げ金具 堅固", judgment: "良" },                                             // 25 つり下げ金具（避難ロープ）
    ],

    // P2: 22 rows — 全項目入力、一部不良判定
    page2_rows: [
        { content: "床板・手すり 堅固", judgment: "良" },                                             // 0 床板・手すり等
        { content: "接合部 緩みなし", judgment: "良" },                                               // 1 接合部（避難橋）
        { content: "外形 変形なし", judgment: "良" },                                                 // 2 可動部外形（避難橋）
        { content: "動作 円滑", judgment: "良" },                                                    // 3 機能（避難橋）
        { content: "踏み板・手すり 堅固", judgment: "良" },                                            // 4 踏み板・手すり等
        { content: "接合部 緩みなし", judgment: "良" },                                               // 5 接合部（タラップ）
        { content: "外形 腐食なし", judgment: "良" },                                                 // 6 可動部外形（タラップ）
        { content: "昇降動作 正常", judgment: "良" },                                                 // 7 機能（タラップ）
        { content: "本体布 破れ・劣化なし", judgment: "良" },                                          // 8 本体布及び展張部材
        { content: "縫い合せ部 ほつれあり", judgment: "不良", bad_content: "縫い合せ部に軽微なほつれ", action_content: "補修済み 次回経過観察" },  // 9 縫い合せ部
        { content: "保護装置 正常作動", judgment: "良" },                                              // 10 保護装置
        { content: "結合部 堅固", judgment: "良" },                                                   // 11 結合部（救助袋）
        { content: "外形 変形なし", judgment: "良" },                                                 // 12 可動部外形（救助袋）
        { content: "展張・収納 正常", judgment: "良" },                                               // 13 機能（救助袋）
        { content: "取付具 堅固に固定", judgment: "良" },                                              // 14 取付具
        { content: "可動部 動作正常", judgment: "良" },                                                // 15 可動部（取付具）
        { content: "支持部 亀裂・腐食なし", judgment: "良" },                                          // 16 支持部
        { content: "固定環 変形・腐食なし", judgment: "良" },                                          // 17 固定環
        { content: "上蓋 開閉正常", judgment: "良" },                                                 // 18 上蓋
        { content: "下蓋 開閉正常", judgment: "良" },                                                 // 19 下蓋
        { content: "使用方法の表示 明瞭", judgment: "良" },                                            // 20 使用方法の表示
        { content: "格納箱 施錠確認済", judgment: "良" },                                              // 21 格納箱（格納状況）
    ],

    notes: "令和8年2月度定期点検実施。全避難器具について機器点検及び総合点検を実施した。避難はしご（3階東側）の横さんに軽微な塗装剥離を確認したが、構造強度に問題なし。再塗装を実施予定。救助袋（5階北側）の縫い合せ部に軽微なほつれを確認し、補修済み。次回点検時に経過観察を行う。次回点検は令和8年8月予定。",

    device1: {
        name: "荷重計",
        model: "FG-5000",
        calibrated_at: "2026-01-15",
        maker: "計測器工業株式会社",
    },
    device2: {
        name: "ストップウォッチ",
        model: "SW-200",
        calibrated_at: "2026-01-20",
        maker: "精密計測株式会社",
    },
};

const outPath = path.resolve("tmp/bekki15_full_test3.pdf");
console.log("Generating bekki15 FULL test PDF (all fields populated)...");
const result = await runRoutePdf({
    routePath: "src/app/api/generate-evacuation-equipment-bekki15-pdf/route.ts",
    payload,
    outPdfPath: outPath,
});
console.log(`Done: ${result.outPdfPath} (${result.bytes} bytes)`);
