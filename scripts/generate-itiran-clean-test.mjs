/**
 * bekki_itiran.pdf クリーン出力テスト（補助線なし）
 * 実行: node scripts/generate-itiran-clean-test.mjs
 * 出力: public/test_output.pdf
 */
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";

const pdfPath  = path.join(process.cwd(), "public", "PDF", "bekki_itiran.pdf");
const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf");

const PAGE_HEIGHT = 841.92;
const INSP1 = {
  address_row_top: 95.5, company_row_top: 110, row_h: 14.5,
  address_x: 110.8, address_w: 180.4,
  name_x: 340.1, name_w: 95.2,
  company_x: 110.8, company_w: 180.4,
  phone_x: 340.1, phone_w: 95.2,
  equipment_x: 437.0, equipment_w: 95.0, equipment_top: 80.0, equipment_h: 135.0,
};
const OFFSET2 = 297.8;
const SHB_ROW_H = 14.5;
const SHB_ROWS_1 = [156, 170.5, 185, 200, 214.5, 229, 243.5, 258.5];
const SHB = {
  issue_year: 181, issue_month: 205, issue_day: 229,
  license: { x: 244, w: 64 }, governor: { x: 308, w: 49 },
  tr_year: 394, tr_month: 418,
};
const BIKO1 = { top: 273, h: 14.5, x: 65.6, w: 370.0 };
const KSA_ROW_H = 14.5;
const KSA_ROWS_1 = [319, 333.5, 348];
const KSA = {
  issue_year: 182, issue_month: 206, issue_day: 230,
  license: { x: 241, w: 98 },
  exp_year: 376, exp_month: 400, exp_day: 424,
};

const pdfDoc = await PDFDocument.load(fs.readFileSync(pdfPath));
pdfDoc.registerFontkit(fontkit);
const font = await pdfDoc.embedFont(fs.readFileSync(fontPath));
const page = pdfDoc.getPages()[0];

const drawInCell = (text, cellX, cellTopFT, cellW, cellH, fontSize = 7, align = "left") => {
  const norm = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!norm) return;
  const px = 2, py = 2;
  let sz = fontSize;
  const w = font.widthOfTextAtSize(norm, sz);
  const maxW = cellW - px * 2;
  if (w > maxW) sz *= maxW / w;
  const hh = font.heightAtSize(sz, { descender: true });
  if (hh > cellH - py * 2) sz *= (cellH - py * 2) / hh;
  sz = Math.max(sz, 3.5);
  const tw = font.widthOfTextAtSize(norm, sz);
  const th = font.heightAtSize(sz, { descender: true });
  const topFT = cellTopFT + (cellH - th) / 2;
  const y = PAGE_HEIGHT - (topFT + th * 0.78);
  const x = align === "center" ? cellX + (cellW - tw) / 2 : cellX + px;
  page.drawText(norm, { x, y, size: sz, font, color: rgb(0, 0, 0) });
};

const drawRA = (text, anchorX, rowTop, rowH, sz = 6) => {
  if (!text) return;
  const th = font.heightAtSize(sz, { descender: true });
  const y = PAGE_HEIGHT - (rowTop + (rowH - th) / 2 + th * 0.78);
  page.drawText(text, { x: anchorX - font.widthOfTextAtSize(text, sz), y, size: sz, font, color: rgb(0, 0, 0) });
};

const SHB_KEYS = ["toku", "class1", "class2", "class3", "class4", "class5", "class6", "class7"];
const KSA_KEYS = ["toku", "class1", "class2"];

const drawInspector = (insp, offset) => {
  if (!insp) return;
  drawInCell(insp.address,         INSP1.address_x, INSP1.address_row_top + offset, INSP1.address_w, INSP1.row_h);
  drawInCell(insp.name,            INSP1.name_x,    INSP1.address_row_top + offset, INSP1.name_w,    INSP1.row_h);
  drawInCell(insp.company,         INSP1.company_x, INSP1.company_row_top + offset, INSP1.company_w, INSP1.row_h);
  drawInCell(insp.phone,           INSP1.phone_x,   INSP1.company_row_top + offset, INSP1.phone_w,   INSP1.row_h);
  drawInCell(insp.equipment_names, INSP1.equipment_x, INSP1.equipment_top + offset, INSP1.equipment_w, INSP1.equipment_h, 6);

  SHB_KEYS.forEach((key, i) => {
    const lic = insp.shoubou_licenses?.[key];
    if (!lic) return;
    const ft = SHB_ROWS_1[i] + offset;
    drawRA(lic.issue_year,    SHB.issue_year,  ft, SHB_ROW_H);
    drawRA(lic.issue_month,   SHB.issue_month, ft, SHB_ROW_H);
    drawRA(lic.issue_day,     SHB.issue_day,   ft, SHB_ROW_H);
    drawInCell(lic.license_number,   SHB.license.x,  ft, SHB.license.w,  SHB_ROW_H, 6, "center");
    drawInCell(lic.issuing_governor, SHB.governor.x, ft, SHB.governor.w, SHB_ROW_H, 6, "center");
    drawRA(lic.training_year,  SHB.tr_year,  ft, SHB_ROW_H);
    drawRA(lic.training_month, SHB.tr_month, ft, SHB_ROW_H);
  });

  drawInCell(insp.shoubou_notes, BIKO1.x, BIKO1.top + offset, BIKO1.w, BIKO1.h, 6);

  KSA_KEYS.forEach((key, i) => {
    const lic = insp.kensa_licenses?.[key];
    if (!lic) return;
    const ft = KSA_ROWS_1[i] + offset;
    drawRA(lic.issue_year,  KSA.issue_year,  ft, KSA_ROW_H);
    drawRA(lic.issue_month, KSA.issue_month, ft, KSA_ROW_H);
    drawRA(lic.issue_day,   KSA.issue_day,   ft, KSA_ROW_H);
    drawInCell(lic.license_number, KSA.license.x, ft, KSA.license.w, KSA_ROW_H, 6, "center");
    drawRA(lic.expiry_year,  KSA.exp_year,  ft, KSA_ROW_H);
    drawRA(lic.expiry_month, KSA.exp_month, ft, KSA_ROW_H);
    drawRA(lic.expiry_day,   KSA.exp_day,   ft, KSA_ROW_H);
  });
};

// テストデータ
const insp1 = {
  address: "東京都千代田区テスト1-2-3テストビル12F",
  name: "消防設備太郎",
  company: "消防設備点検株式会社",
  phone: "03-1234-5678",
  equipment_names: "消火器,自動火災報知設備",
  shoubou_licenses: {
    toku:   { issue_year:"2025", issue_month:"1",  issue_day:"10", license_number:"番号1-0", issuing_governor:"東京都知事", training_year:"2024", training_month:"1" },
    class1: { issue_year:"2026", issue_month:"2",  issue_day:"11", license_number:"番号1-1", issuing_governor:"東京都知事", training_year:"2025", training_month:"2" },
    class2: { issue_year:"2027", issue_month:"3",  issue_day:"12", license_number:"番号1-2", issuing_governor:"東京都知事", training_year:"2026", training_month:"3" },
  },
  shoubou_notes: "電気工事士 第二種 番号12345 令和4年3月1日",
  kensa_licenses: {
    toku:   { issue_year:"2020", issue_month:"3", issue_day:"20", license_number:"K番号1-0", expiry_year:"2023", expiry_month:"6",  expiry_day:"15" },
    class1: { issue_year:"2021", issue_month:"4", issue_day:"21", license_number:"K番号1-1", expiry_year:"2024", expiry_month:"7",  expiry_day:"16" },
    class2: { issue_year:"2022", issue_month:"5", issue_day:"22", license_number:"K番号1-2", expiry_year:"2025", expiry_month:"8",  expiry_day:"17" },
  },
};

const insp2 = {
  address: "大阪府大阪市テスト4-5-6サンプルビル3F",
  name: "消防設備花子",
  company: "消防設備点検株式会社",
  phone: "06-9876-5432",
  equipment_names: "スプリンクラー設備,屋内消火栓",
  shoubou_licenses: {
    class3: { issue_year:"2023", issue_month:"6", issue_day:"1", license_number:"番号2-3", issuing_governor:"大阪府知事", training_year:"2022", training_month:"6" },
  },
  kensa_licenses: {
    class1: { issue_year:"2019", issue_month:"9", issue_day:"15", license_number:"K番号2-1", expiry_year:"2022", expiry_month:"9", expiry_day:"14" },
  },
};

drawInspector(insp1, 0);
drawInspector(insp2, OFFSET2);

fs.writeFileSync("public/test_output.pdf", await pdfDoc.save());
console.log("出力: public/test_output.pdf");
