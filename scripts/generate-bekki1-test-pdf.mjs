import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";

const pdfPath = path.join(process.cwd(), "public", "PDF", "s50_kokuji14_bekki1.pdf");
const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf");

const MARK_KEYS = ["A", "B", "C", "D", "E", "F"];

const P1_TYPE_COLS = [
  { x: 206.52, w: 18.36 },
  { x: 225.84, w: 17.52 },
  { x: 244.32, w: 17.28 },
  { x: 263.04, w: 17.04 },
  { x: 281.04, w: 17.4 },
  { x: 299.4, w: 17.4 },
];

const P2_TYPE_COLS = [
  { x: 201.84, w: 18.0 },
  { x: 222.36, w: 19.2 },
  { x: 242.52, w: 19.08 },
  { x: 262.56, w: 19.2 },
  { x: 282.72, w: 19.2 },
  { x: 302.88, w: 19.2 },
];

const P1_ROW_BOUNDS = [
  319.8, 338.88, 357.84, 376.8, 395.88,
  414.84, 433.8, 452.88, 471.84, 490.8,
  509.88, 528.84, 547.8, 566.88, 585.84,
  604.8, 623.88, 642.84, 661.8, 681.36,
];

const P2_ROW_BOUNDS = [
  84.0, 101.52, 119.04, 136.44, 153.96,
  171.48, 189.0, 206.52, 224.04, 241.44,
  258.96, 276.48, 294.0, 337.44, 354.96,
  372.48, 390.0, 407.52, 425.04, 442.44, 459.96,
];

const PERIOD_ROW = { top: 167.52, h: 19.92 };
const PERIOD_START_ANCHORS = { year: 299.2, month: 330.6, day: 362.2 };
const PERIOD_END_ANCHORS = { year: 414.7, month: 446.4, day: 477.9 };

const normalizeText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const formatDateText = (value) => {
  const raw = normalizeText(value);
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
};

const parseDateParts = (value) => {
  const raw = normalizeText(value);
  if (!raw) return null;

  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) {
    return {
      year: String(date.getFullYear()),
      month: String(date.getMonth() + 1),
      day: String(date.getDate()),
    };
  }

  const match = raw.match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})$/);
  if (!match) return null;
  return {
    year: match[1],
    month: String(Number(match[2])),
    day: String(Number(match[3])),
  };
};

const existingPdfBytes = fs.readFileSync(pdfPath);
const fontBytes = fs.readFileSync(fontPath);

const pdfDoc = await PDFDocument.load(existingPdfBytes);
pdfDoc.registerFontkit(fontkit);
const customFont = await pdfDoc.embedFont(fontBytes);

const page1 = pdfDoc.getPages()[0];
const page2 = pdfDoc.getPages()[1];
const p1Height = page1.getSize().height;
const p2Height = page2.getSize().height;

const truncateToFitWidth = (value, size, maxWidth) => {
  if (!value) return "";
  if (customFont.widthOfTextAtSize(value, size) <= maxWidth) {
    return value;
  }

  const suffix = "...";
  if (customFont.widthOfTextAtSize(suffix, size) > maxWidth) return "";

  let cut = value.length;
  while (cut > 0) {
    const candidate = `${value.slice(0, cut).trimEnd()}${suffix}`;
    if (customFont.widthOfTextAtSize(candidate, size) <= maxWidth) {
      return candidate;
    }
    cut -= 1;
  }

  return suffix;
};

const wrapTextByWidth = (value, size, maxWidth) => {
  const lines = [];
  let current = "";

  for (const ch of Array.from(value)) {
    if (!current && ch === " ") continue;

    const candidate = `${current}${ch}`;
    if (current && customFont.widthOfTextAtSize(candidate, size) > maxWidth + 0.1) {
      const trimmed = current.trimEnd();
      if (trimmed) lines.push(trimmed);
      current = ch === " " ? "" : ch;
      continue;
    }

    current = candidate;
  }

  const last = current.trimEnd();
  if (last) lines.push(last);
  return lines;
};

const drawInCell = (
  page,
  pageHeight,
  text,
  cellX,
  cellTopFromTop,
  cellW,
  cellH,
  fontSize = 9,
  options,
) => {
  const normalized = normalizeText(text);
  if (!normalized) return;

  const paddingX = options?.paddingX ?? 3;
  const paddingY = options?.paddingY ?? 2;
  const minFontSize = options?.minFontSize ?? 3.5;
  let currentSize = Math.min(fontSize, options?.maxFontSize ?? fontSize);

  const maxWidth = Math.max(1, (cellW - paddingX * 2) * 0.85);
  const maxHeight = Math.max(1, cellH - paddingY * 2);

  const widthAtCurrent = customFont.widthOfTextAtSize(normalized, currentSize);
  if (widthAtCurrent > maxWidth) {
    currentSize = currentSize * (maxWidth / widthAtCurrent);
  }

  const heightAtCurrent = customFont.heightAtSize(currentSize, { descender: true });
  if (heightAtCurrent > maxHeight) {
    currentSize = currentSize * (maxHeight / heightAtCurrent);
  }

  currentSize = Math.max(currentSize, minFontSize);

  const textToDraw = truncateToFitWidth(normalized, currentSize, maxWidth);
  if (!textToDraw) return;

  const textWidth = customFont.widthOfTextAtSize(textToDraw, currentSize);
  const textHeight = customFont.heightAtSize(currentSize, { descender: true });
  const xOffset = options?.xOffset ?? 0;
  const yOffset = options?.yOffset ?? 0;
  let textX = cellX + paddingX + xOffset;

  if (options?.align === "center") {
    textX = cellX + (cellW - textWidth) / 2 + xOffset;
  }

  const textTopFromTop = cellTopFromTop + (cellH - textHeight) / 2 + yOffset;
  const baselineOffset = textHeight * 0.78;

  page.drawText(textToDraw, {
    x: textX,
    y: pageHeight - (textTopFromTop + baselineOffset),
    size: currentSize,
    font: customFont,
    color: rgb(0, 0, 0),
  });
};

const drawWrappedInCell = (
  page,
  pageHeight,
  text,
  cellX,
  cellTopFromTop,
  cellW,
  cellH,
  fontSize = 8.4,
) => {
  const normalized = normalizeText(text);
  if (!normalized) return;

  const paddingX = 3;
  const paddingY = 2;
  const minFontSize = 3.5;
  const lineGap = 1;
  const maxWidth = Math.max(1, cellW - paddingX * 2);
  const maxHeight = Math.max(1, cellH - paddingY * 2);

  const buildWrapped = (size) => {
    const lineHeight = size + lineGap;
    const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));
    const lines = wrapTextByWidth(normalized, size, maxWidth);
    return { lineHeight, maxLines, lines };
  };

  let size = fontSize;
  let wrapped = buildWrapped(size);

  while (size > minFontSize && wrapped.lines.length > wrapped.maxLines) {
    size = Math.max(minFontSize, size - 0.2);
    wrapped = buildWrapped(size);
  }

  if (wrapped.lines.length === 0) return;

  let lines = wrapped.lines;
  if (lines.length > wrapped.maxLines) {
    lines = lines.slice(0, wrapped.maxLines);
    const lastIndex = lines.length - 1;
    lines[lastIndex] = truncateToFitWidth(`${lines[lastIndex]}...`, size, maxWidth);
  }

  lines = lines
    .map((line) => truncateToFitWidth(line, size, maxWidth))
    .filter((line) => line.length > 0);

  if (lines.length === 0) return;

  const totalH = lines.length * wrapped.lineHeight;
  let top = cellTopFromTop + Math.max(paddingY, (cellH - totalH) / 2);

  for (const line of lines) {
    const h = customFont.heightAtSize(size, { descender: true });
    const baselineOffset = h * 0.78;
    page.drawText(line, {
      x: cellX + paddingX,
      y: pageHeight - (top + baselineOffset),
      size,
      font: customFont,
      color: rgb(0, 0, 0),
    });
    top += wrapped.lineHeight;
  }
};

const drawMark = (page, pageHeight, mark, cellX, cellTop, cellW, cellH) => {
  drawInCell(page, pageHeight, mark, cellX, cellTop, cellW, cellH, 9.8, {
    align: "center",
    paddingX: 0,
    paddingY: 0,
    minFontSize: 8,
  });
};

const drawRightAt = (page, pageHeight, text, anchorX, rowTop, rowH, size = 8.1) => {
  if (!text) return;
  const textHeight = customFont.heightAtSize(size, { descender: true });
  const textTop = rowTop + (rowH - textHeight) / 2;
  const y = pageHeight - (textTop + textHeight * 0.78);
  const w = customFont.widthOfTextAtSize(text, size);
  page.drawText(text, { x: anchorX - w, y, size, font: customFont, color: rgb(0, 0, 0) });
};

const drawPeriodDate = (page, pageHeight, dateValue, anchors) => {
  const parts = parseDateParts(dateValue);
  if (!parts) return;
  drawRightAt(page, pageHeight, parts.year, anchors.year, PERIOD_ROW.top, PERIOD_ROW.h, 8.1);
  drawRightAt(page, pageHeight, parts.month, anchors.month, PERIOD_ROW.top, PERIOD_ROW.h, 8.1);
  drawRightAt(page, pageHeight, parts.day, anchors.day, PERIOD_ROW.top, PERIOD_ROW.h, 8.1);
};

const page1Rows = Array.from({ length: 19 }, (_, i) => ({
  marks: {
    A: i % 3 === 0,
    C: i % 5 === 0,
    F: i === 2 || i === 10,
  },
  judgment: i % 4 === 2 ? "不良" : "良",
  bad_content: i % 4 === 2
    ? "作動不良・圧力低下・表示劣化が見られるため継続使用不可の可能性あり"
    : "",
  action_content: i % 4 === 2
    ? "当日一次対応済み。部品交換および再点検を次回訪問時に実施予定"
    : "",
}));

const page2Rows = Array.from({ length: 20 }, (_, i) => ({
  marks: {
    B: i % 2 === 0,
    D: i % 5 === 1,
  },
  judgment: i === 1 || i === 16 ? "不良" : "良",
  bad_content: i === 1
    ? "変形・腐食・漏れ跡あり"
    : (i === 16 ? "放射能力不足が疑われるため再測定要" : ""),
  action_content: i === 1
    ? "分解点検と部材交換を手配済み"
    : (i === 16 ? "測定器校正後に再試験予定" : ""),
}));

const testBody = {
  form_name: "高層複合施設サンプル棟（消火器点検票 長文フィット確認）",
  fire_manager: "消防管理者 山田太郎",
  witness: "管理会社 立会担当 佐藤花子",
  location: "東京都千代田区丸の内一丁目一番一号 サンプルタワー南館・北館 共用部全域",
  period_start: "2026-02-01",
  period_end: "2026-02-26",
  inspector_name: "鈴木一郎",
  inspector_company: "株式会社サンプル消防設備保守センター",
  inspector_address: "東京都港区芝公園四丁目二番八号 メンテナンスビル3階 点検部",
  inspector_tel: "03-1234-5678（内線204）",
  page1_rows: page1Rows,
  page2_rows: page2Rows,
  notes: "備考欄の長文テストです。日本語文章がスペースなしでもはみ出さないこと、複数行セルで縮小しつつ可能な範囲で表示されることを確認します。必要に応じて末尾を省略記号で切り詰めます。",
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
    maker: "試験機器製作所",
  },
  summary_rows: [
    { kind: "ABC粉末", installed: "120", inspected: "120", passed: "118", repair_needed: "2", removed: "0" },
    { kind: "強化液", installed: "18", inspected: "18", passed: "18", repair_needed: "0", removed: "0" },
    { kind: "CO2", installed: "24", inspected: "24", passed: "23", repair_needed: "1", removed: "0" },
    { kind: "泡", installed: "8", inspected: "8", passed: "8", repair_needed: "0", removed: "0" },
    { kind: "ハロゲン", installed: "0", inspected: "0", passed: "0", repair_needed: "0", removed: "0" },
    { kind: "その他長名称", installed: "3", inspected: "3", passed: "2", repair_needed: "1", removed: "0" },
  ],
};

drawInCell(page1, p1Height, testBody.form_name, 118.8, 111.48, 251.52, 27.96, 9.2);
drawInCell(page1, p1Height, testBody.fire_manager, 411.84, 111.48, 117.72, 27.96, 8.6);
drawInCell(page1, p1Height, testBody.location, 118.8, 139.44, 251.52, 28.08, 8.8);
drawInCell(page1, p1Height, testBody.witness, 411.84, 139.44, 117.72, 28.08, 8.6);

const periodStart = formatDateText(testBody.period_start);
const periodEnd = formatDateText(testBody.period_end);
if (parseDateParts(testBody.period_start) || parseDateParts(testBody.period_end)) {
  drawPeriodDate(page1, p1Height, testBody.period_start, PERIOD_START_ANCHORS);
  drawPeriodDate(page1, p1Height, testBody.period_end, PERIOD_END_ANCHORS);
} else {
  const periodText = periodStart && periodEnd ? `${periodStart} - ${periodEnd}` : (periodStart || periodEnd);
  drawInCell(page1, p1Height, periodText, 208.92, PERIOD_ROW.top, 320.64, PERIOD_ROW.h, 8.8);
}

drawInCell(page1, p1Height, testBody.inspector_name, 117.84, 187.44, 88.2, 56.4, 8.8);
drawInCell(page1, p1Height, testBody.inspector_company, 291.0, 187.44, 100.0, 28.44, 8.6);
drawInCell(page1, p1Height, testBody.inspector_tel, 411.84, 187.44, 117.72, 28.44, 8.6);
drawInCell(page1, p1Height, testBody.inspector_address, 291.0, 215.88, 237.0, 27.96, 8.4);

for (let i = 0; i < Math.min(testBody.page1_rows.length, P1_ROW_BOUNDS.length - 1); i += 1) {
  const row = testBody.page1_rows[i];
  const top = P1_ROW_BOUNDS[i];
  const bottom = P1_ROW_BOUNDS[i + 1];
  const h = bottom - top;

  MARK_KEYS.forEach((k, colIndex) => {
    if (!row?.marks?.[k]) return;
    const col = P1_TYPE_COLS[colIndex];
    drawMark(page1, p1Height, "レ", col.x, top, col.w, h);
  });

  drawInCell(page1, p1Height, row.judgment, 317.76, top, 30.6, h, 9.2, { align: "center" });
  drawWrappedInCell(page1, p1Height, row.bad_content, 349.32, top, 93.48, h, 7.3);
  drawWrappedInCell(page1, p1Height, row.action_content, 444.24, top, 85.32, h, 7.3);
}

for (let i = 0; i < Math.min(testBody.page2_rows.length, P2_ROW_BOUNDS.length - 1); i += 1) {
  const row = testBody.page2_rows[i];
  const top = P2_ROW_BOUNDS[i];
  const bottom = P2_ROW_BOUNDS[i + 1];
  const h = bottom - top;

  MARK_KEYS.forEach((k, colIndex) => {
    if (!row?.marks?.[k]) return;
    if (i >= 18) return; // 簡易消化用具行（外形・水量等）はマーク列なし
    const col = P2_TYPE_COLS[colIndex];
    drawMark(page2, p2Height, "レ", col.x, top, col.w, h);
  });

  drawInCell(page2, p2Height, row.judgment, 323.04, top, 36.24, h, 9.2, { align: "center" });
  drawWrappedInCell(page2, p2Height, row.bad_content, 359.5, top, 88.0, h, 7.2);
  drawWrappedInCell(page2, p2Height, row.action_content, 449.0, top, 80.0, h, 7.2);
}

drawWrappedInCell(page2, p2Height, testBody.notes, 80.52, 459.96, 449.04, 47.76, 7.9);

// device: V-lines 81.0,136.7,192.8,249.0,304.7,361.3,417.5,473.6,529.6 / H row top=524.6 h=17.1
const deviceTop = 524.6, deviceH = 17.1;
drawInCell(page2, p2Height, testBody.device1.name,          81.0, deviceTop, 55.7, deviceH, 7.8);
drawInCell(page2, p2Height, testBody.device1.model,        136.7, deviceTop, 56.1, deviceH, 7.8);
drawInCell(page2, p2Height, testBody.device1.calibrated_at, 192.8, deviceTop, 56.2, deviceH, 7.2);
drawInCell(page2, p2Height, testBody.device1.maker,        249.0, deviceTop, 55.7, deviceH, 7.4);
drawInCell(page2, p2Height, testBody.device2.name,         304.7, deviceTop, 56.6, deviceH, 7.8);
drawInCell(page2, p2Height, testBody.device2.model,        361.3, deviceTop, 56.2, deviceH, 7.8);
drawInCell(page2, p2Height, testBody.device2.calibrated_at, 417.5, deviceTop, 56.1, deviceH, 7.2);
drawInCell(page2, p2Height, testBody.device2.maker,        473.6, deviceTop, 56.0, deviceH, 7.4);

// summary: H-lines: 582.6(ヘッダー上端), 599.2(データrow0上端), 616.2, 633.1, 650.2, 667.2, 684.1, 700.7
// V-lines 65.5,142.3,219.8,297.4,374.8,452.3,529.6
const summaryBounds = [599.2, 616.2, 633.1, 650.2, 667.2, 684.1, 700.7];
for (let i = 0; i < Math.min(testBody.summary_rows.length, summaryBounds.length - 1); i += 1) {
  const row = testBody.summary_rows[i];
  const top = summaryBounds[i];
  const h = summaryBounds[i + 1] - summaryBounds[i];
  drawInCell(page2, p2Height, row.kind,           65.5, top, 76.8, h, 7.4, { align: "center" });
  drawInCell(page2, p2Height, row.installed,     142.3, top, 77.5, h, 7.4, { align: "center" });
  drawInCell(page2, p2Height, row.inspected,     219.8, top, 77.6, h, 7.4, { align: "center" });
  drawInCell(page2, p2Height, row.passed,        297.4, top, 77.4, h, 7.4, { align: "center" });
  drawInCell(page2, p2Height, row.repair_needed, 374.8, top, 77.5, h, 7.4, { align: "center" });
  drawInCell(page2, p2Height, row.removed,       452.3, top, 77.3, h, 7.4, { align: "center" });
}

const outDir = path.join(process.cwd(), "tmp", "pdf-test-fixed");
fs.mkdirSync(outDir, { recursive: true });
const outputPath = path.join(outDir, "bekki1_debug_test.pdf");
fs.writeFileSync(outputPath, await pdfDoc.save());
console.log(outputPath);
