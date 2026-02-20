/**
 * bekki_itiran.pdf キャリブレーション & テスト生成スクリプト
 * 実行: node scripts/test-itiran-pdf.mjs
 * 出力: public/debug/test_itiran.pdf
 *
 * 赤枠 = 各セルの想定範囲
 * 青文字 = drawInCell で書き込むテキスト
 * 赤文字 = 右揃えの年月日テキスト
 */
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";

const pdfPath  = path.join(process.cwd(), "public", "PDF", "bekki_itiran.pdf");
const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf");
const outDir   = path.join(process.cwd(), "public", "debug");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const pdfBytes  = fs.readFileSync(pdfPath);
const fontBytes = fs.readFileSync(fontPath);
const pdfDoc    = await PDFDocument.load(pdfBytes);
pdfDoc.registerFontkit(fontkit);
const font = await pdfDoc.embedFont(fontBytes);
const page = pdfDoc.getPages()[0];
const { width, height } = page.getSize();

console.log(`Page size: ${width} x ${height}`);

// ===== ヘルパー関数 =====

// セル枠を赤で描画
const drawBox = (x, fromTop, w, h, color = rgb(1,0,0)) => {
  const y = height - fromTop - h;
  page.drawRectangle({ x, y, width: w, height: h,
    borderColor: color, borderWidth: 0.5, opacity: 0, borderOpacity: 0.8 });
};

// アンカー縦線（右揃えの基準点）
const drawAnchor = (anchorX, fromTop, h, label) => {
  page.drawLine({
    start: { x: anchorX, y: height - fromTop },
    end:   { x: anchorX, y: height - fromTop - h },
    thickness: 0.6, color: rgb(0,0.6,0), opacity: 0.9,
  });
  page.drawText(label, {
    x: anchorX - 2, y: height - fromTop - h - 5,
    size: 3.5, font, color: rgb(0,0.5,0),
  });
};

// セル内テキスト描画（縮小あり）
const drawInCell = (text, cellX, cellTopFT, cellW, cellH, fontSize = 7, align = "left") => {
  const norm = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!norm) return;
  const px = 2, py = 2;
  const maxW = Math.max(1, cellW - px * 2);
  const maxH = Math.max(1, cellH - py * 2);
  let sz = fontSize;
  if (font.widthOfTextAtSize(norm, sz) > maxW) sz *= maxW / font.widthOfTextAtSize(norm, sz);
  const hh = font.heightAtSize(sz, { descender: true });
  if (hh > maxH) sz *= maxH / hh;
  sz = Math.max(sz, 3);
  const textH = font.heightAtSize(sz, { descender: true });
  const textW = font.widthOfTextAtSize(norm, sz);
  const textTopFT = cellTopFT + (cellH - textH) / 2;
  const y = height - (textTopFT + textH * 0.78);
  const x = align === "center" ? cellX + (cellW - textW) / 2 : cellX + px;
  page.drawText(norm, { x, y, size: sz, font, color: rgb(0, 0, 0.8) });
};

// 右揃え描画
const drawRA = (text, anchorX, rowTopFT, rowH, sz = 6) => {
  const s = String(text ?? "").trim();
  if (!s) return;
  const textH = font.heightAtSize(sz, { descender: true });
  const textTopFT = rowTopFT + (rowH - textH) / 2;
  const y = height - (textTopFT + textH * 0.78);
  const w = font.widthOfTextAtSize(s, sz);
  page.drawText(s, { x: anchorX - w, y, size: sz, font, color: rgb(0.8, 0, 0) });
};

// ===== 座標定義（PDF解析キャリブレーション済み）=====
const INSP1 = {
  address_row_top: 95.5,  // fromTop 95.5-110 (水平線分析: 95.5に内端線)
  company_row_top: 110,   // fromTop 110-124.5
  row_h: 14.5,
  address_x: 110.8, address_w: 180.4,  // x=109-291
  name_x:    340.1, name_w:     95.2,  // x=339-435
  company_x: 110.8, company_w: 180.4,
  phone_x:   340.1, phone_w:    95.2,
  equipment_x: 437.0, equipment_w: 95.0, equipment_top: 80.0, equipment_h: 135.0,
};
const OFFSET2 = 297.8;

const SHB_ROW_H = 14.5;
const SHB_ROWS_1 = [156, 170.5, 185, 200, 214.5, 229, 243.5, 258.5];
// 水平線: 141(ヘッダ下), 156(row1), 170.5, 185, 200, 214.5, 229, 243.5, 258.5
const SHB = {
  issue_year: 142,   // x=109-144 年列 右端アンカー
  issue_month: 192,  // 月列アンカー
  issue_day: 241,    // 日列アンカー
  license:  { x: 244, w: 64 },   // 交付番号 x=244-308 (垂直線: x=308)
  governor: { x: 308, w: 49 },   // 交付知事 x=308-357 (垂直線: x=357)
  tr_year: 383, tr_month: 431,
};
const BIKO1 = { top: 273, h: 14.5, x: 65.6, w: 370.0 };
// SHB row8終端: 258.5+14.5=273 → BIKO fromTop 273-287.5

const KSA_ROW_H = 14.5;
const KSA_ROWS_1 = [304.5, 319, 333.5];
// 水平線: 303-304(ヘッダ下), 304(row1), 319, 333.5, 348
// 垂直線: x=241 が 305-319, 319-334, 334-348 に出現
const KSA = {
  issue_year: 174, issue_month: 206, issue_day: 238,
  license: { x: 241, w: 98 },   // 交付番号 x=241-339 (垂直線: x=241, 339)
  exp_year: 368, exp_month: 400, exp_day: 432,
};

// ===== セル枠描画（赤枠＋アンカー線） =====
const drawCellGuides = (topOffset) => {
  const g = rgb(0,0,1);
  // 基本情報セル
  drawBox(INSP1.address_x, INSP1.address_row_top+topOffset, INSP1.address_w, INSP1.row_h);
  drawBox(INSP1.name_x,    INSP1.address_row_top+topOffset, INSP1.name_w,    INSP1.row_h);
  drawBox(INSP1.company_x, INSP1.company_row_top+topOffset, INSP1.company_w, INSP1.row_h);
  drawBox(INSP1.phone_x,   INSP1.company_row_top+topOffset, INSP1.phone_w,   INSP1.row_h);
  drawBox(INSP1.equipment_x, INSP1.equipment_top+topOffset, INSP1.equipment_w, INSP1.equipment_h, g);

  // 消防設備士 行
  SHB_ROWS_1.forEach((rowTop, i) => {
    const ft = rowTop + topOffset;
    // 交付年月日 列全体 (x=109-244)
    drawBox(109, ft, 135, SHB_ROW_H, rgb(1,0.5,0));
    // 交付番号
    drawBox(SHB.license.x, ft, SHB.license.w, SHB_ROW_H);
    // 交付知事
    drawBox(SHB.governor.x, ft, SHB.governor.w, SHB_ROW_H);
    // 講習受講年月 列全体 (x=338.6-435)
    drawBox(338.6, ft, 96.4, SHB_ROW_H, rgb(1,0.5,0));
    // アンカー線
    drawAnchor(SHB.issue_year,  ft, SHB_ROW_H, "Y");
    drawAnchor(SHB.issue_month, ft, SHB_ROW_H, "M");
    drawAnchor(SHB.issue_day,   ft, SHB_ROW_H, "D");
    drawAnchor(SHB.tr_year,     ft, SHB_ROW_H, "tY");
    drawAnchor(SHB.tr_month,    ft, SHB_ROW_H, "tM");
  });

  // 備考セル
  drawBox(BIKO1.x, BIKO1.top+topOffset, BIKO1.w, BIKO1.h, g);

  // 消防設備点検資格者 行
  KSA_ROWS_1.forEach((rowTop) => {
    const ft = rowTop + topOffset;
    drawBox(65.6,        ft, 78.6,         KSA_ROW_H, rgb(0.5,0,0.5));
    drawBox(144.8,       ft, 96.6,         KSA_ROW_H, rgb(1,0.5,0));
    drawBox(KSA.license.x, ft, KSA.license.w, KSA_ROW_H);
    drawBox(339.1,       ft, 96.1,         KSA_ROW_H, rgb(1,0.5,0));
    drawAnchor(KSA.issue_year,  ft, KSA_ROW_H, "Y");
    drawAnchor(KSA.issue_month, ft, KSA_ROW_H, "M");
    drawAnchor(KSA.issue_day,   ft, KSA_ROW_H, "D");
    drawAnchor(KSA.exp_year,    ft, KSA_ROW_H, "eY");
    drawAnchor(KSA.exp_month,   ft, KSA_ROW_H, "eM");
    drawAnchor(KSA.exp_day,     ft, KSA_ROW_H, "eD");
  });
};

// ===== テキスト描画 =====
const drawInspector = (n, topOffset) => {
  drawCellGuides(topOffset);
  drawInCell(`住所${n}:東京都千代田区テスト1-2-3テストビル12F`, INSP1.address_x, INSP1.address_row_top+topOffset, INSP1.address_w, INSP1.row_h);
  drawInCell(`氏名${n}:消防設備太郎`, INSP1.name_x, INSP1.address_row_top+topOffset, INSP1.name_w, INSP1.row_h);
  drawInCell(`社名${n}:消防設備点検株式会社`, INSP1.company_x, INSP1.company_row_top+topOffset, INSP1.company_w, INSP1.row_h);
  drawInCell(`電話${n}:03-1234-5678`, INSP1.phone_x, INSP1.company_row_top+topOffset, INSP1.phone_w, INSP1.row_h);
  drawInCell(`設備名:消火器,自動火災報知設備`, INSP1.equipment_x, INSP1.equipment_top+topOffset, INSP1.equipment_w, INSP1.equipment_h);

  SHB_ROWS_1.forEach((rowTop, i) => {
    const ft = rowTop + topOffset;
    drawRA(`20${25+i}`, SHB.issue_year,  ft, SHB_ROW_H);
    drawRA(`${i+1}`,    SHB.issue_month, ft, SHB_ROW_H);
    drawRA(`${i+10}`,   SHB.issue_day,   ft, SHB_ROW_H);
    drawInCell(`番号${n}-${i}`, SHB.license.x,  ft, SHB.license.w,  SHB_ROW_H, 5.5, "center");
    drawInCell(`知事${n}`,      SHB.governor.x, ft, SHB.governor.w, SHB_ROW_H, 5.5, "center");
    drawRA(`20${24+i}`, SHB.tr_year,  ft, SHB_ROW_H);
    drawRA(`${i+1}`,    SHB.tr_month, ft, SHB_ROW_H);
  });

  drawInCell(`備考${n}:電気工事士 第二種 番号12345 令和4年3月1日`, BIKO1.x, BIKO1.top+topOffset, BIKO1.w, BIKO1.h, 5.5);

  KSA_ROWS_1.forEach((rowTop, i) => {
    const ft = rowTop + topOffset;
    drawRA(`202${i}`,   KSA.issue_year,  ft, KSA_ROW_H);
    drawRA(`${i+3}`,    KSA.issue_month, ft, KSA_ROW_H);
    drawRA(`${i+20}`,   KSA.issue_day,   ft, KSA_ROW_H);
    drawInCell(`K番号${n}-${i}`, KSA.license.x, ft, KSA.license.w, KSA_ROW_H, 5.5, "center");
    drawRA(`202${i+3}`, KSA.exp_year,  ft, KSA_ROW_H);
    drawRA(`${i+6}`,    KSA.exp_month, ft, KSA_ROW_H);
    drawRA(`${i+15}`,   KSA.exp_day,   ft, KSA_ROW_H);
  });
};

drawInspector(1, 0);
drawInspector(2, OFFSET2);

const outBytes = await pdfDoc.save();
const outPath = path.join(outDir, "test_itiran.pdf");
fs.writeFileSync(outPath, outBytes);
console.log(`出力: ${outPath}`);
