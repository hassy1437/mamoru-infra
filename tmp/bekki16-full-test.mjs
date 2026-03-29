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

    // P1: 14 rows — 避難口/通路/客席 の3列
    page1_rows: [
        { content: "C級", content_tsuro: "C級", content_kyaku: "B級", judgment: "良" },                       // 0 種類
        { content: "障害なし", content_tsuro: "障害なし", content_kyaku: "障害なし", judgment: "良" },           // 1 視認障害等
        { content: "異常なし", content_tsuro: "異常なし", content_kyaku: "異常なし", judgment: "良" },           // 2 外形
        { content: "汚損なし", content_tsuro: "汚損なし", content_kyaku: "汚損なし", judgment: "良" },           // 3 表示
        { content: "異常なし", content_tsuro: "異常なし", content_kyaku: "異常なし", judgment: "良" },           // 4 非常電源 外形
        { content: "正常点灯", content_tsuro: "正常点灯", content_kyaku: "正常点灯", judgment: "良" },          // 5 非常電源 表示
        { content: "20分以上", content_tsuro: "20分以上", content_kyaku: "20分以上", judgment: "良" },          // 6 非常電源 機能
        { content: "異常なし", content_tsuro: "異常なし", content_kyaku: "異常なし", judgment: "良" },           // 7 光源
        { content: "正常動作", content_tsuro: "正常動作", content_kyaku: "正常動作", judgment: "良" },           // 8 点検スイッチ
        { content: "規定品", content_tsuro: "規定品", content_kyaku: "規定品", judgment: "良" },                // 9 ヒューズ類
        { content: "緩みなし", content_tsuro: "緩みなし", content_kyaku: "緩みなし", judgment: "良" },           // 10 結線接続
        { content: "異常なし", content_tsuro: "異常なし", content_kyaku: "異常なし", judgment: "良" },           // 11 外形（信号装置）
        { content: "正常", content_tsuro: "正常", content_kyaku: "正常", judgment: "良" },                     // 12 結線接続（信号装置）
        { content: "正常", content_tsuro: "正常", content_kyaku: "正常", judgment: "良" },                     // 13 機能（信号装置）
    ],

    // P2: 10 rows — 避難口/通路/客席 の3列
    page2_rows: [
        { content: "変形なし", content_tsuro: "変形なし", content_kyaku: "変形なし", judgment: "良" },           // 0 外形
        { content: "障害なし", content_tsuro: "障害なし", content_kyaku: "障害なし", judgment: "良" },           // 1 視認障害等
        { content: "十分", content_tsuro: "十分", content_kyaku: "十分", judgment: "良" },                     // 2 採光又は照明
        { content: "規定以上", content_tsuro: "規定以上", content_kyaku: "規定以上", judgment: "良" },           // 3 表示面の輝度
        { content: "1lx以上", content_tsuro: "1lx以上", content_kyaku: "1lx以上", judgment: "良" },            // 4 設置場所の照度
        { content: "規定品", content_tsuro: "規定品", content_kyaku: "規定品", judgment: "良" },                // 5 ヒューズ類
        { content: "緩みなし", content_tsuro: "緩みなし", content_kyaku: "緩みなし", judgment: "良" },           // 6 結線接続
        { content: "異常なし", content_tsuro: "異常なし", content_kyaku: "異常なし", judgment: "良" },           // 7 外形（非常電源）
        { content: "正常", content_tsuro: "正常", content_kyaku: "正常", judgment: "良" },                     // 8 非常電源表示
        { content: "20分以上", content_tsuro: "20分以上", content_kyaku: "20分以上", judgment: "良" },          // 9 機能（非常電源）
    ],

    notes: "令和8年2月度定期点検実施。誘導灯及び誘導標識について機器点検及び総合点検を実施した。全ての誘導灯について非常点灯試験を行い、20分以上の点灯を確認。誘導標識の輝度及び設置場所の照度も規定値以上を確認。次回点検は令和8年8月予定。",

    device1: {
        name: "照度計",
        model: "LX-1128SD",
        calibrated_at: "2026-01-15",
        maker: "カスタム計測器株式会社",
    },
    device2: {
        name: "輝度計",
        model: "LS-150",
        calibrated_at: "2026-01-20",
        maker: "コニカミノルタ株式会社",
    },
};

const outPath = path.resolve("tmp/bekki16_full_test3.pdf");
console.log("Generating bekki16 FULL test PDF...");
const result = await runRoutePdf({
    routePath: "src/app/api/generate-guidance-lights-signs-bekki16-pdf/route.ts",
    payload,
    outPdfPath: outPath,
});
console.log(`Done: ${result.outPdfPath} (${result.bytes} bytes)`);
