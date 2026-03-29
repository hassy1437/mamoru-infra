import fs from "fs";
import path from "path";
import ts from "typescript";

const MARK_KEYS = ["A", "B", "C", "D", "E", "F"];
const SHOUBOU_LICENSE_KEYS = ["toku", "class1", "class2", "class3", "class4", "class5", "class6", "class7"];
const KENSA_LICENSE_KEYS = ["toku", "class1", "class2"];
const SOURCE_FILE_CACHE = new Map();

export const GROUP_TITLES = {
  report: "報告書",
  overview: "総括・一覧",
  bekki: "別記",
};

const REPORT_EQUIPMENT_TYPES = [
  "消火器",
  "屋内消火栓設備",
  "スプリンクラー設備",
  "水噴霧消火設備",
  "泡消火設備",
  "不活性ガス消火設備",
  "ハロゲン化物消火設備",
  "粉末消火設備",
  "屋外消火栓設備",
  "動力消防ポンプ設備",
  "自動火災報知設備",
  "ガス漏れ火災警報設備",
  "漏電火災警報器",
  "消防機関へ通報する火災報知設備",
  "非常警報設備",
  "避難器具",
  "誘導灯及び誘導標識",
  "消防用水",
  "排煙設備",
  "連結散水設備",
  "連結送水管",
  "非常コンセント設備",
  "無線通信補助設備",
];

const LONG_NOTE =
  "東棟・西棟・地下機械室を含む全系統でレビュー用長文を印字する。英数確認用: ABCDEFGHIJKLMNOPQRSTUVWXYZ-0123456789。";

const LONG_SUFFIX = "LONGTEXT-CHECK-ABCDEFGHIJKLMNOPQRSTUVWXYZ-0123456789";

const SHARED_BUILDING = {
  report_date: "2026-03-01",
  inspection_date: "2026-03-01",
  inspection_period_start: "2026-02-01",
  inspection_period_end: "2026-02-28",
  period_start: "2026-02-01",
  period_end: "2026-02-28",
  inspection_type: "機器・総合",
  fire_department_name: "千代田消防署",
  building_name: "丸の内防災センター東西連結棟 長文確認用",
  building_address: "東京都千代田区丸の内一丁目二番三号 丸の内防災センター東西連結棟 12F",
  building_usage: "事務所・物販店舗・機械室",
  building_structure: "鉄骨鉄筋コンクリート造 一部鉄骨造",
  floor_above: 12,
  floor_below: 2,
  total_floor_area: 12580.45,
  notifier_name: "丸の内防災管理株式会社 代表取締役 山田太郎",
  notifier_address: "東京都港区芝公園四丁目二番八号 点検センタービル三階",
  notifier_phone: "03-1234-5678",
  form_name: "丸の内防災センター東西連結棟 長文確認用",
  fire_manager: "統括防火管理者 佐藤花子",
  witness: "立会者 田中一郎",
  location: "東京都千代田区丸の内一丁目二番三号 丸の内防災センター東西連結棟 低層部・高層部・地下機械室",
  inspector_name: "主任点検者 鈴木健一",
  inspector_company: "防災設備メンテナンス株式会社 東京本店",
  inspector_address: "東京都新宿区西新宿六丁目六番一号 テストメンテナンスタワー 8F",
  inspector_tel: "03-9876-5432",
  notes: `${LONG_NOTE} 点検結果の転記、機器校正、再確認の流れまで含めて確認する。`,
};

const unwrapExpression = (node) => {
  let current = node;
  while (ts.isAsExpression(current) || ts.isParenthesizedExpression(current) || ts.isTypeAssertionExpression(current)) {
    current = current.expression;
  }
  return current;
};

const readSourceFile = (componentPath) => {
  const absPath = path.resolve(componentPath);
  if (SOURCE_FILE_CACHE.has(absPath)) {
    return SOURCE_FILE_CACHE.get(absPath);
  }

  const sourceText = fs.readFileSync(absPath, "utf8");
  const sourceFile = ts.createSourceFile(absPath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  SOURCE_FILE_CACHE.set(absPath, sourceFile);
  return sourceFile;
};

const findConstInitializer = (componentPath, constName) => {
  const sourceFile = readSourceFile(componentPath);
  let initializer = null;

  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.name.text === constName
      && node.initializer
    ) {
      initializer = unwrapExpression(node.initializer);
      return;
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return initializer;
};

const getConstArrayLength = (componentPath, constName) => {
  const initializer = findConstInitializer(componentPath, constName);
  if (!initializer) return null;
  if (!ts.isArrayLiteralExpression(initializer)) {
    throw new Error(`Expected ${constName} in ${componentPath} to be an array literal.`);
  }
  return initializer.elements.length;
};

const getConstNumber = (componentPath, constName) => {
  const initializer = findConstInitializer(componentPath, constName);
  if (!initializer) return null;
  if (!ts.isNumericLiteral(initializer)) {
    throw new Error(`Expected ${constName} in ${componentPath} to be a numeric literal.`);
  }
  return Number(initializer.text);
};

export const getPageRowSpecs = (componentPath) => {
  const specs = {};
  for (let page = 1; page <= 5; page += 1) {
    const key = `page${page}_rows`;
    const itemLength = getConstArrayLength(componentPath, `PAGE${page}_ITEMS`);
    if (itemLength !== null) {
      specs[key] = itemLength;
      continue;
    }

    const rowCount = getConstNumber(componentPath, `PAGE${page}_ROW_COUNT`);
    if (rowCount !== null) {
      specs[key] = rowCount;
    }
  }
  return specs;
};

const textValue = (label, index, extra = "") =>
  `${label} ${String(index + 1).padStart(2, "0")} ${extra}`.trim();

const makeRow = (label, index) => {
  const isBad = index % 4 === 1;
  return {
    content: textValue(label, index, `系統・区画・機器識別 ${LONG_SUFFIX}`),
    judgment: isBad ? "否" : "良",
    bad_content: isBad
      ? textValue(label, index, "圧力低下・表示不良・締付不足を確認")
      : textValue(label, index, "異常なし・点検基準範囲内"),
    action_content: isBad
      ? textValue(label, index, "部品交換予定・再測定実施・結果再確認")
      : textValue(label, index, "清掃・締付確認済み・再点検不要"),
  };
};

const makeMarks = (index) => {
  const marks = Object.fromEntries(MARK_KEYS.map((key) => [key, false]));
  marks[MARK_KEYS[index % MARK_KEYS.length]] = true;
  if (index % 5 === 0) {
    marks[MARK_KEYS[(index + 2) % MARK_KEYS.length]] = true;
  }
  return marks;
};

const makeMarkedRow = (label, index) => ({
  ...makeRow(label, index),
  marks: makeMarks(index),
});

const makeRowsByCount = (count, prefix, factory = makeRow) =>
  Array.from({ length: count }, (_, index) => factory(prefix, index));

const makeDevice = (slot) => ({
  name: slot === 1 ? "デジタル圧力計" : "絶縁抵抗計",
  model: slot === 1 ? "PG-9000-EX" : "IR-4200-L",
  calibrated_at: slot === 1 ? "2026-01-15" : "2026-01-20",
  maker: slot === 1 ? "計測器工業株式会社" : "電気試験ラボ株式会社",
});

const makeCylinderRows = (count, measureColumns, prefix) =>
  Array.from({ length: count }, (_, index) => {
    const row = {
      no: String(index + 1),
      cylinder_no: `${prefix}-CYL-${1000 + index}`,
      spec1: `容器区分-${(index % 3) + 1}`,
      spec2: `薬剤区分-${(index % 4) + 1}`,
      spec3: `設置区画-${(index % 5) + 1}`,
    };

    for (let column = 1; column <= measureColumns; column += 1) {
      row[`measure${column}`] = `${(index % 9) + 1}.${column}`;
    }

    return row;
  });

const makeSummaryRows = () => ([
  { kind: "ABC粉末", installed: "120", inspected: "120", passed: "118", repair_needed: "2", removed: "0" },
  { kind: "強化液", installed: "36", inspected: "36", passed: "36", repair_needed: "0", removed: "0" },
  { kind: "二酸化炭素", installed: "24", inspected: "24", passed: "23", repair_needed: "1", removed: "0" },
  { kind: "泡", installed: "12", inspected: "12", passed: "12", repair_needed: "0", removed: "0" },
  { kind: "ハロゲン化物", installed: "6", inspected: "6", passed: "6", repair_needed: "0", removed: "0" },
  { kind: "移動式大型", installed: "3", inspected: "3", passed: "2", repair_needed: "1", removed: "0" },
]);

const makeBaseBekkiPayload = (componentPath, extraFields = {}) => {
  const rowSpecs = getPageRowSpecs(componentPath);
  return {
    form_name: SHARED_BUILDING.form_name,
    fire_manager: SHARED_BUILDING.fire_manager,
    witness: SHARED_BUILDING.witness,
    location: SHARED_BUILDING.location,
    inspection_type: SHARED_BUILDING.inspection_type,
    period_start: SHARED_BUILDING.period_start,
    period_end: SHARED_BUILDING.period_end,
    inspector_name: SHARED_BUILDING.inspector_name,
    inspector_company: SHARED_BUILDING.inspector_company,
    inspector_address: SHARED_BUILDING.inspector_address,
    inspector_tel: SHARED_BUILDING.inspector_tel,
    notes: SHARED_BUILDING.notes,
    device1: makeDevice(1),
    device2: makeDevice(2),
    extra_fields: extraFields,
    ...Object.fromEntries(
      Object.entries(rowSpecs).map(([key, count]) => [key, makeRowsByCount(count, `${path.basename(componentPath, ".tsx")}-${key}`)]),
    ),
  };
};

const buildReportPayload = () => ({
  report_date: SHARED_BUILDING.report_date,
  fire_department_name: SHARED_BUILDING.fire_department_name,
  notifier_address: SHARED_BUILDING.notifier_address,
  notifier_name: SHARED_BUILDING.notifier_name,
  notifier_phone: SHARED_BUILDING.notifier_phone,
  building_address: SHARED_BUILDING.building_address,
  building_name: SHARED_BUILDING.building_name,
  building_usage: SHARED_BUILDING.building_usage,
  floor_above: SHARED_BUILDING.floor_above,
  floor_below: SHARED_BUILDING.floor_below,
  total_floor_area: SHARED_BUILDING.total_floor_area,
  equipment_types: REPORT_EQUIPMENT_TYPES,
});

const buildSoukatsuPayload = () => ({
  inspection_date: SHARED_BUILDING.inspection_date,
  inspection_type: "機器点検",
  inspection_period_start: SHARED_BUILDING.inspection_period_start,
  inspection_period_end: SHARED_BUILDING.inspection_period_end,
  notifier_address: SHARED_BUILDING.notifier_address,
  notifier_name: SHARED_BUILDING.notifier_name,
  notifier_phone: SHARED_BUILDING.notifier_phone,
  building_address: SHARED_BUILDING.building_address,
  building_name: SHARED_BUILDING.building_name,
  building_usage: SHARED_BUILDING.building_usage,
  building_structure: SHARED_BUILDING.building_structure,
  floor_above: SHARED_BUILDING.floor_above,
  floor_below: SHARED_BUILDING.floor_below,
  total_floor_area: SHARED_BUILDING.total_floor_area,
  overall_judgment: "全体として概ね良好。指摘箇所は補修計画に反映し、次回立会時に再確認する。",
  notes: LONG_NOTE,
  equipment_results: REPORT_EQUIPMENT_TYPES.map((name, index) => {
    if (index >= 17) {
      return { name, result: "該当なし" };
    }

    const isBad = index % 5 === 2;
    return {
      name,
      result: isBad ? "要改善" : "指摘なし",
      bad_detail: isBad ? textValue(name, index, "警報表示または圧力値に軽微な偏差あり") : undefined,
      action: isBad ? textValue(name, index, "現地是正後に再確認予定") : undefined,
      witness: isBad ? "管理会社 佐藤花子" : undefined,
    };
  }),
});

const makeShoubouLicense = (baseYear, index, inspectorNo) => ({
  issue_year: String(baseYear + index),
  issue_month: String((index % 12) + 1),
  issue_day: String((index % 27) + 1),
  license_number: `消${inspectorNo}-${index + 1}-2026`,
  issuing_governor: inspectorNo === 1 ? "東京都知事" : "大阪府知事",
  training_year: String(baseYear + index - 1),
  training_month: String(((index + 3) % 12) + 1),
});

const makeKensaLicense = (baseYear, index, inspectorNo) => ({
  issue_year: String(baseYear + index),
  issue_month: String((index % 12) + 1),
  issue_day: String((index % 27) + 1),
  license_number: `点${inspectorNo}-${index + 1}-2026`,
  expiry_year: String(baseYear + index + 3),
  expiry_month: String(((index + 5) % 12) + 1),
  expiry_day: String(((index + 7) % 27) + 1),
});

const makeInspector = (inspectorNo) => ({
  address:
    inspectorNo === 1
      ? "東京都港区芝公園四丁目二番八号 点検センタービル三階"
      : "大阪府大阪市中央区本町二丁目三番四号 西日本メンテナンスビル五階",
  name: inspectorNo === 1 ? "主任点検者 鈴木健一" : "副主任点検者 中村真一",
  company: inspectorNo === 1 ? "防災設備メンテナンス株式会社 東京本店" : "防災設備メンテナンス株式会社 西日本支店",
  phone: inspectorNo === 1 ? "03-9876-5432" : "06-5555-1234",
  equipment_names:
    inspectorNo === 1
      ? "消火器、屋内消火栓設備、スプリンクラー設備、非常警報設備"
      : "排煙設備、連結送水管、非常コンセント設備、無線通信補助設備",
  shoubou_notes: inspectorNo === 1 ? LONG_NOTE : `${LONG_NOTE} 西日本担当者用の備考も同時確認する。`,
  shoubou_licenses: Object.fromEntries(
    SHOUBOU_LICENSE_KEYS.map((key, index) => [key, makeShoubouLicense(2018 + inspectorNo, index, inspectorNo)]),
  ),
  kensa_licenses: Object.fromEntries(
    KENSA_LICENSE_KEYS.map((key, index) => [key, makeKensaLicense(2020 + inspectorNo, index, inspectorNo)]),
  ),
});

const buildItiranPayload = () => ({
  inspector1: makeInspector(1),
  inspector2: makeInspector(2),
});

const buildBekki1Payload = (componentPath) => {
  const rowSpecs = getPageRowSpecs(componentPath);
  return {
    form_name: SHARED_BUILDING.form_name,
    fire_manager: SHARED_BUILDING.fire_manager,
    witness: SHARED_BUILDING.witness,
    location: SHARED_BUILDING.location,
    period_start: SHARED_BUILDING.period_start,
    period_end: SHARED_BUILDING.period_end,
    inspector_name: SHARED_BUILDING.inspector_name,
    inspector_company: SHARED_BUILDING.inspector_company,
    inspector_address: SHARED_BUILDING.inspector_address,
    inspector_tel: SHARED_BUILDING.inspector_tel,
    page1_rows: makeRowsByCount(rowSpecs.page1_rows, "別記1-page1", makeMarkedRow),
    page2_rows: makeRowsByCount(rowSpecs.page2_rows, "別記1-page2", makeMarkedRow),
    notes: SHARED_BUILDING.notes,
    device1: makeDevice(1),
    device2: makeDevice(2),
    summary_rows: makeSummaryRows(),
  };
};

const buildBekki2Payload = (componentPath) => ({
  ...makeBaseBekkiPayload(componentPath),
  equipment_name: "屋内消火栓主配管系統A",
  pump_maker: "東京ポンプ工業株式会社",
  pump_model: "PMP-9000-L",
  motor_maker: "東都モーター株式会社",
  motor_model: "MTR-2026-X",
});

const buildBekki3Payload = (componentPath) => ({
  ...makeBaseBekkiPayload(componentPath),
  equipment_name: "スプリンクラー設備 高層階統合系統",
  pump_maker: "東京ポンプ工業株式会社",
  pump_model: "SP-7000-EX",
  motor_maker: "東都モーター株式会社",
  motor_model: "SPM-2026",
});

const buildBekki4Payload = (componentPath) => ({
  ...makeBaseBekkiPayload(componentPath),
  equipment_name: "水噴霧消火設備 地下機械室系統",
  pump_maker: "関東ポンプ株式会社",
  pump_model: "WP-5500-RT",
  motor_maker: "日本モーター研究所",
  motor_model: "WM-2026-R",
});

const buildBekki5Payload = (componentPath) => ({
  ...makeBaseBekkiPayload(componentPath),
  equipment_name: "泡消火設備 駐車場泡放射系統",
  pump_maker: "関東ポンプ株式会社",
  pump_model: "FOAM-PMP-88",
  motor_maker: "日本モーター研究所",
  motor_model: "FOAM-MTR-26",
  foam_maker: "フォームユニット株式会社",
  foam_model: "FM-12A-LONG",
});

const buildBekki6Payload = (componentPath) => {
  const payload = makeBaseBekkiPayload(componentPath);
  const rowSpecs = getPageRowSpecs(componentPath);
  return {
    ...payload,
    zone_name: "高層階サーバー室 Zone-A",
    equipment_system: "全域放出方式",
    page5_rows: makeCylinderRows(rowSpecs.page5_rows, 4, "B6"),
  };
};

const buildBekki7Payload = (componentPath) => {
  const payload = makeBaseBekkiPayload(componentPath);
  const rowSpecs = getPageRowSpecs(componentPath);
  return {
    ...payload,
    zone_name: "低層階免震フロア Zone-B",
    equipment_system: "移動式・ハロゲン系統",
    page5_rows: makeCylinderRows(rowSpecs.page5_rows, 6, "B7"),
  };
};

const buildBekki8Payload = (componentPath) => {
  const payload = makeBaseBekkiPayload(componentPath);
  const rowSpecs = getPageRowSpecs(componentPath);
  return {
    ...payload,
    zone_name: "地下機械室・変電室 Zone-C",
    equipment_system: "粉末消火設備 全域系統",
    page5_rows: makeCylinderRows(rowSpecs.page5_rows, 6, "B8"),
  };
};

const buildCommonBekkiPayload = (componentPath, extraFields) => makeBaseBekkiPayload(componentPath, extraFields);

const validateString = (errors, value, label) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${label} is empty`);
  }
};

const validateNumber = (errors, value, label) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    errors.push(`${label} is not a valid number`);
  }
};

const validateDevice = (errors, device, label) => {
  ["name", "model", "calibrated_at", "maker"].forEach((key) => validateString(errors, device?.[key], `${label}.${key}`));
};

const validateRows = (errors, rows, label) => {
  if (!Array.isArray(rows)) {
    errors.push(`${label} is not an array`);
    return;
  }

  rows.forEach((row, index) => {
    validateString(errors, row?.content, `${label}[${index}].content`);
    validateString(errors, row?.judgment, `${label}[${index}].judgment`);
    validateString(errors, row?.bad_content, `${label}[${index}].bad_content`);
    validateString(errors, row?.action_content, `${label}[${index}].action_content`);
  });
};

const validateArrayLength = (errors, rows, expected, label) => {
  if (!Array.isArray(rows) || rows.length !== expected) {
    errors.push(`${label} length expected ${expected} but got ${Array.isArray(rows) ? rows.length : "non-array"}`);
  }
};

const validateBekkiBase = (payload, componentPath, options = {}) => {
  const errors = [];
  const rowSpecs = getPageRowSpecs(componentPath);
  const topLevelKeys = [
    "form_name",
    "fire_manager",
    "witness",
    "location",
    "period_start",
    "period_end",
    "inspector_name",
    "inspector_company",
    "inspector_address",
    "inspector_tel",
    "notes",
    ...(options.includeInspectionType === false ? [] : ["inspection_type"]),
    ...(options.topLevelKeys ?? []),
  ];

  topLevelKeys.forEach((key) => validateString(errors, payload?.[key], key));
  validateDevice(errors, payload?.device1, "device1");
  validateDevice(errors, payload?.device2, "device2");

  Object.entries(rowSpecs).forEach(([key, count]) => {
    if (options.skipRowKeys?.includes(key)) {
      return;
    }
    validateArrayLength(errors, payload?.[key], count, key);
    validateRows(errors, payload?.[key], key);
  });

  if (options.extraFieldKeys?.length) {
    options.extraFieldKeys.forEach((key) => validateString(errors, payload?.extra_fields?.[key], `extra_fields.${key}`));
  }

  return errors;
};

const validateBekki1Payload = (payload, componentPath) => {
  const errors = validateBekkiBase(payload, componentPath, {
    includeInspectionType: false,
  });
  const markCoverage = new Set();

  ["page1_rows", "page2_rows"].forEach((key) => {
    payload?.[key]?.forEach((row, rowIndex) => {
      if (!row?.marks || typeof row.marks !== "object") {
        errors.push(`${key}[${rowIndex}].marks missing`);
        return;
      }

      let anyMark = false;
      MARK_KEYS.forEach((markKey) => {
        if (row.marks[markKey]) {
          anyMark = true;
          markCoverage.add(markKey);
        }
      });

      if (!anyMark) {
        errors.push(`${key}[${rowIndex}].marks has no selected item`);
      }
    });
  });

  MARK_KEYS.forEach((markKey) => {
    if (!markCoverage.has(markKey)) {
      errors.push(`marks coverage missing ${markKey}`);
    }
  });

  validateArrayLength(errors, payload?.summary_rows, 6, "summary_rows");
  payload?.summary_rows?.forEach((row, index) => {
    ["kind", "installed", "inspected", "passed", "repair_needed", "removed"].forEach((key) => {
      validateString(errors, row?.[key], `summary_rows[${index}].${key}`);
    });
  });

  return errors;
};

const validateCylinderRows = (payload, key, expectedCount, measureColumns) => {
  const errors = [];
  validateArrayLength(errors, payload?.[key], expectedCount, key);
  payload?.[key]?.forEach((row, index) => {
    ["no", "cylinder_no", "spec1", "spec2", "spec3"].forEach((field) => {
      validateString(errors, row?.[field], `${key}[${index}].${field}`);
    });
    for (let column = 1; column <= measureColumns; column += 1) {
      validateString(errors, row?.[`measure${column}`], `${key}[${index}].measure${column}`);
    }
  });
  return errors;
};

const validateReportPayload = (payload) => {
  const errors = [];
  [
    "report_date",
    "fire_department_name",
    "notifier_address",
    "notifier_name",
    "notifier_phone",
    "building_address",
    "building_name",
    "building_usage",
  ].forEach((key) => validateString(errors, payload?.[key], key));
  validateNumber(errors, payload?.floor_above, "floor_above");
  validateNumber(errors, payload?.floor_below, "floor_below");
  validateNumber(errors, payload?.total_floor_area, "total_floor_area");

  if (!Array.isArray(payload?.equipment_types) || payload.equipment_types.length === 0) {
    errors.push("equipment_types is empty");
  } else {
    payload.equipment_types.forEach((item, index) => validateString(errors, item, `equipment_types[${index}]`));
  }
  return errors;
};

const validateSoukatsuPayload = (payload) => {
  const errors = [];
  [
    "inspection_date",
    "inspection_type",
    "inspection_period_start",
    "inspection_period_end",
    "notifier_address",
    "notifier_name",
    "notifier_phone",
    "building_address",
    "building_name",
    "building_usage",
    "building_structure",
    "overall_judgment",
    "notes",
  ].forEach((key) => validateString(errors, payload?.[key], key));
  validateNumber(errors, payload?.floor_above, "floor_above");
  validateNumber(errors, payload?.floor_below, "floor_below");
  validateNumber(errors, payload?.total_floor_area, "total_floor_area");

  if (!Array.isArray(payload?.equipment_results) || payload.equipment_results.length !== REPORT_EQUIPMENT_TYPES.length) {
    errors.push(`equipment_results length expected ${REPORT_EQUIPMENT_TYPES.length}`);
    return errors;
  }

  payload.equipment_results.forEach((item, index) => {
    validateString(errors, item?.name, `equipment_results[${index}].name`);
    validateString(errors, item?.result, `equipment_results[${index}].result`);
  });
  return errors;
};

const validateItiranPayload = (payload) => {
  const errors = [];

  ["inspector1", "inspector2"].forEach((inspectorKey) => {
    const inspector = payload?.[inspectorKey];
    ["address", "name", "company", "phone", "equipment_names", "shoubou_notes"].forEach((key) => {
      validateString(errors, inspector?.[key], `${inspectorKey}.${key}`);
    });

    SHOUBOU_LICENSE_KEYS.forEach((licenseKey) => {
      const license = inspector?.shoubou_licenses?.[licenseKey];
      ["issue_year", "issue_month", "issue_day", "license_number", "issuing_governor", "training_year", "training_month"].forEach((key) => {
        validateString(errors, license?.[key], `${inspectorKey}.shoubou_licenses.${licenseKey}.${key}`);
      });
    });

    KENSA_LICENSE_KEYS.forEach((licenseKey) => {
      const license = inspector?.kensa_licenses?.[licenseKey];
      ["issue_year", "issue_month", "issue_day", "license_number", "expiry_year", "expiry_month", "expiry_day"].forEach((key) => {
        validateString(errors, license?.[key], `${inspectorKey}.kensa_licenses.${licenseKey}.${key}`);
      });
    });
  });

  return errors;
};

const createCommonBekkiJob = ({
  key,
  title,
  routePath,
  componentPath,
  extraFields = {},
  extraFieldKeys = [],
}) => ({
  key,
  title,
  group: "bekki",
  format: "pdf",
  routePath,
  componentPath,
  buildPayload: () => buildCommonBekkiPayload(componentPath, extraFields),
  validatePayload: (payload) => validateBekkiBase(payload, componentPath, { extraFieldKeys }),
});

export const createReviewJobs = () => {
  const shokakiComponent = "src/components/shokaki-bekki1-form.tsx";
  const shokasenComponent = "src/components/shokasen-bekki2-form.tsx";
  const sprinklerComponent = "src/components/sprinkler-bekki3-form.tsx";
  const waterSprayComponent = "src/components/water-spray-bekki4-form.tsx";
  const foamComponent = "src/components/foam-bekki5-form.tsx";
  const inertGasComponent = "src/components/inert-gas-bekki6-form.tsx";
  const halogenComponent = "src/components/halogen-bekki7-form.tsx";
  const powderComponent = "src/components/powder-bekki8-form.tsx";

  return [
    {
      key: "report_pdf",
      title: "報告書PDF",
      group: "report",
      format: "pdf",
      routePath: "src/app/api/generate-pdf/route.ts",
      buildPayload: buildReportPayload,
      validatePayload: validateReportPayload,
    },
    {
      key: "report_docx",
      title: "報告書Word",
      group: "report",
      format: "docx",
      routePath: "src/app/api/generate-docx/route.ts",
      buildPayload: buildReportPayload,
      validatePayload: validateReportPayload,
    },
    {
      key: "soukatsu",
      title: "総括表PDF",
      group: "overview",
      format: "pdf",
      routePath: "src/app/api/generate-soukatu-pdf/route.ts",
      buildPayload: buildSoukatsuPayload,
      validatePayload: validateSoukatsuPayload,
    },
    {
      key: "itiran",
      title: "点検者一覧PDF",
      group: "overview",
      format: "pdf",
      routePath: "src/app/api/generate-itiran-pdf/route.ts",
      buildPayload: buildItiranPayload,
      validatePayload: validateItiranPayload,
    },
    {
      key: "bekki1",
      title: "別記1 消火器点検票",
      group: "bekki",
      format: "pdf",
      routePath: "src/app/api/generate-shokaki-bekki1-pdf/route.ts",
      componentPath: shokakiComponent,
      buildPayload: () => buildBekki1Payload(shokakiComponent),
      validatePayload: (payload) => validateBekki1Payload(payload, shokakiComponent),
    },
    {
      key: "bekki2",
      title: "別記2 屋内消火栓設備点検票",
      group: "bekki",
      format: "pdf",
      routePath: "src/app/api/generate-shokasen-bekki2-pdf/route.ts",
      componentPath: shokasenComponent,
      buildPayload: () => buildBekki2Payload(shokasenComponent),
      validatePayload: (payload) => validateBekkiBase(payload, shokasenComponent, {
        topLevelKeys: ["equipment_name", "pump_maker", "pump_model", "motor_maker", "motor_model"],
      }),
    },
    {
      key: "bekki3",
      title: "別記3 スプリンクラー設備点検票",
      group: "bekki",
      format: "pdf",
      routePath: "src/app/api/generate-sprinkler-bekki3-pdf/route.ts",
      componentPath: sprinklerComponent,
      buildPayload: () => buildBekki3Payload(sprinklerComponent),
      validatePayload: (payload) => validateBekkiBase(payload, sprinklerComponent, {
        topLevelKeys: ["equipment_name", "pump_maker", "pump_model", "motor_maker", "motor_model"],
      }),
    },
    {
      key: "bekki4",
      title: "別記4 水噴霧消火設備点検票",
      group: "bekki",
      format: "pdf",
      routePath: "src/app/api/generate-water-spray-bekki4-pdf/route.ts",
      componentPath: waterSprayComponent,
      buildPayload: () => buildBekki4Payload(waterSprayComponent),
      validatePayload: (payload) => validateBekkiBase(payload, waterSprayComponent, {
        topLevelKeys: ["equipment_name", "pump_maker", "pump_model", "motor_maker", "motor_model"],
      }),
    },
    {
      key: "bekki5",
      title: "別記5 泡消火設備点検票",
      group: "bekki",
      format: "pdf",
      routePath: "src/app/api/generate-foam-bekki5-pdf/route.ts",
      componentPath: foamComponent,
      buildPayload: () => buildBekki5Payload(foamComponent),
      validatePayload: (payload) => validateBekkiBase(payload, foamComponent, {
        topLevelKeys: [
          "equipment_name",
          "pump_maker",
          "pump_model",
          "motor_maker",
          "motor_model",
          "foam_maker",
          "foam_model",
        ],
      }),
    },
    {
      key: "bekki6",
      title: "別記6 不活性ガス消火設備点検票",
      group: "bekki",
      format: "pdf",
      routePath: "src/app/api/generate-inert-gas-bekki6-pdf/route.ts",
      componentPath: inertGasComponent,
      buildPayload: () => buildBekki6Payload(inertGasComponent),
      validatePayload: (payload) => [
        ...validateBekkiBase(payload, inertGasComponent, {
          topLevelKeys: ["zone_name", "equipment_system"],
          skipRowKeys: ["page5_rows"],
        }),
        ...validateCylinderRows(payload, "page5_rows", getPageRowSpecs(inertGasComponent).page5_rows, 4),
      ],
    },
    {
      key: "bekki7",
      title: "別記7 ハロゲン化物消火設備点検票",
      group: "bekki",
      format: "pdf",
      routePath: "src/app/api/generate-halogen-bekki7-pdf/route.ts",
      componentPath: halogenComponent,
      buildPayload: () => buildBekki7Payload(halogenComponent),
      validatePayload: (payload) => [
        ...validateBekkiBase(payload, halogenComponent, {
          topLevelKeys: ["zone_name", "equipment_system"],
          skipRowKeys: ["page5_rows"],
        }),
        ...validateCylinderRows(payload, "page5_rows", getPageRowSpecs(halogenComponent).page5_rows, 6),
      ],
    },
    {
      key: "bekki8",
      title: "別記8 粉末消火設備点検票",
      group: "bekki",
      format: "pdf",
      routePath: "src/app/api/generate-powder-bekki8-pdf/route.ts",
      componentPath: powderComponent,
      buildPayload: () => buildBekki8Payload(powderComponent),
      validatePayload: (payload) => [
        ...validateBekkiBase(payload, powderComponent, {
          topLevelKeys: ["zone_name", "equipment_system"],
          skipRowKeys: ["page5_rows"],
        }),
        ...validateCylinderRows(payload, "page5_rows", getPageRowSpecs(powderComponent).page5_rows, 6),
      ],
    },
    createCommonBekkiJob({
      key: "bekki9",
      title: "別記9 屋外消火栓設備点検票",
      routePath: "src/app/api/generate-okugai-shokasen-bekki9-pdf/route.ts",
      componentPath: "src/components/okugai-shokasen-bekki9-form.tsx",
      extraFields: {
        pump_maker: "東京ポンプ工業株式会社",
        pump_model: "OUT-9000",
        motor_maker: "東都モーター株式会社",
        motor_model: "OUT-MTR-26",
      },
      extraFieldKeys: ["pump_maker", "pump_model", "motor_maker", "motor_model"],
    }),
    createCommonBekkiJob({
      key: "bekki10",
      title: "別記10 動力消防ポンプ設備点検票",
      routePath: "src/app/api/generate-doryoku-pump-bekki10-pdf/route.ts",
      componentPath: "src/components/doryoku-pump-bekki10-form.tsx",
      extraFields: {
        body_maker: "エンジンテック株式会社",
        body_model: "ENG-5000-R",
      },
      extraFieldKeys: ["body_maker", "body_model"],
    }),
    createCommonBekkiJob({
      key: "bekki11_1",
      title: "別記11-1 自動火災報知設備点検票",
      routePath: "src/app/api/generate-jidou-kasai-houchi-bekki11-1-pdf/route.ts",
      componentPath: "src/components/jidou-kasai-houchi-bekki11-1-form.tsx",
      extraFields: {
        receiver_maker: "レシーバーテック株式会社",
        receiver_model: "RCV-11-ALPHA",
      },
      extraFieldKeys: ["receiver_maker", "receiver_model"],
    }),
    createCommonBekkiJob({
      key: "bekki11_2",
      title: "別記11-2 ガス漏れ火災警報設備点検票",
      routePath: "src/app/api/generate-gas-leak-fire-alarm-bekki11-2-pdf/route.ts",
      componentPath: "src/components/gas-leak-fire-alarm-bekki11-2-form.tsx",
      extraFields: {
        receiver_maker: "レシーバーテック株式会社",
        receiver_model: "RCV-11-BETA",
        repeater_maker: "リピーター工業株式会社",
        repeater_model: "RPT-22-X",
      },
      extraFieldKeys: ["receiver_maker", "receiver_model", "repeater_maker", "repeater_model"],
    }),
    createCommonBekkiJob({
      key: "bekki12",
      title: "別記12 漏電火災警報器点検票",
      routePath: "src/app/api/generate-leakage-fire-alarm-bekki12-pdf/route.ts",
      componentPath: "src/components/leakage-fire-alarm-bekki12-form.tsx",
    }),
    createCommonBekkiJob({
      key: "bekki13",
      title: "別記13 消防機関へ通報する火災報知設備点検票",
      routePath: "src/app/api/generate-fire-department-notification-bekki13-pdf/route.ts",
      componentPath: "src/components/fire-department-notification-bekki13-form.tsx",
    }),
    createCommonBekkiJob({
      key: "bekki14",
      title: "別記14 非常警報設備点検票",
      routePath: "src/app/api/generate-emergency-alarm-bekki14-pdf/route.ts",
      componentPath: "src/components/emergency-alarm-bekki14-form.tsx",
    }),
    createCommonBekkiJob({
      key: "bekki15",
      title: "別記15 避難器具点検票",
      routePath: "src/app/api/generate-evacuation-equipment-bekki15-pdf/route.ts",
      componentPath: "src/components/evacuation-equipment-bekki15-form.tsx",
    }),
    createCommonBekkiJob({
      key: "bekki16",
      title: "別記16 誘導灯及び誘導標識点検票",
      routePath: "src/app/api/generate-guidance-lights-signs-bekki16-pdf/route.ts",
      componentPath: "src/components/guidance-lights-signs-bekki16-form.tsx",
    }),
    createCommonBekkiJob({
      key: "bekki17",
      title: "別記17 消防用水点検票",
      routePath: "src/app/api/generate-fire-water-bekki17-pdf/route.ts",
      componentPath: "src/components/fire-water-bekki17-form.tsx",
    }),
    createCommonBekkiJob({
      key: "bekki18",
      title: "別記18 排煙設備点検票",
      routePath: "src/app/api/generate-smoke-control-bekki18-pdf/route.ts",
      componentPath: "src/components/smoke-control-bekki18-form.tsx",
      extraFields: {
        smoke_machine_maker: "排煙テック株式会社",
        smoke_machine_model: "SMK-2000-L",
      },
      extraFieldKeys: ["smoke_machine_maker", "smoke_machine_model"],
    }),
    createCommonBekkiJob({
      key: "bekki19",
      title: "別記19 連結散水設備点検票",
      routePath: "src/app/api/generate-connected-sprinkler-bekki19-pdf/route.ts",
      componentPath: "src/components/connected-sprinkler-bekki19-form.tsx",
    }),
    createCommonBekkiJob({
      key: "bekki20",
      title: "別記20 連結送水管点検票",
      routePath: "src/app/api/generate-standpipe-bekki20-pdf/route.ts",
      componentPath: "src/components/standpipe-bekki20-form.tsx",
      extraFields: {
        motor_maker: "東都モーター株式会社",
        motor_model: "STD-MTR-2026",
        pump_maker: "東京ポンプ工業株式会社",
        pump_model: "STD-PMP-2026",
      },
      extraFieldKeys: ["motor_maker", "motor_model", "pump_maker", "pump_model"],
    }),
    createCommonBekkiJob({
      key: "bekki21",
      title: "別記21 非常コンセント設備点検票",
      routePath: "src/app/api/generate-emergency-power-outlet-bekki21-pdf/route.ts",
      componentPath: "src/components/emergency-power-outlet-bekki21-form.tsx",
    }),
    createCommonBekkiJob({
      key: "bekki22",
      title: "別記22 無線通信補助設備点検票",
      routePath: "src/app/api/generate-radio-communication-support-bekki22-pdf/route.ts",
      componentPath: "src/components/radio-communication-support-bekki22-form.tsx",
      extraFields: {
        cable_maker: "ケーブル工業株式会社",
        cable_model: "CBL-10-RT",
        antenna_maker: "アンテナ工業株式会社",
        antenna_model: "ANT-20-L",
        amplifier_maker: "増幅器テック株式会社",
        amplifier_model: "AMP-30-Q",
      },
      extraFieldKeys: ["cable_maker", "cable_model", "antenna_maker", "antenna_model", "amplifier_maker", "amplifier_model"],
    }),
  ];
};
