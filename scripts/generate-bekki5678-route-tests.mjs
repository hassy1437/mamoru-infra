import { runRoutePdf } from "./run-route-pdf.mjs";

const makeRows = (count, prefix) =>
  Array.from({ length: count }, (_, i) => ({
    content: `${prefix} item ${i + 1}`,
    judgment: i % 5 === 2 ? "NG" : "OK",
    bad_content:
      i % 5 === 2
        ? "LONGTEXTWITHOUTSPACES-ABNORMAL-CONDITION-DETECTED-NEEDS-RECHECK"
        : "",
    action_content:
      i % 5 === 2
        ? "REPLACE-PARTS-AND-RUN-RETEST-WITH-CALIBRATED-TOOL"
        : "",
  }));

const makeCylinderRows = (count, cols) =>
  Array.from({ length: count }, (_, i) => {
    const base = {
      no: String(i + 1),
      cylinder_no: `CYL-${1000 + i}`,
      spec1: "SPEC-A",
      spec2: "SPEC-B",
      spec3: "SPEC-C",
      measure1: `${(i % 9) + 1}.1`,
      measure2: `${(i % 9) + 1}.2`,
      measure3: `${(i % 9) + 1}.3`,
      measure4: `${(i % 9) + 1}.4`,
    };
    if (cols >= 5) base.measure5 = `${(i % 9) + 1}.5`;
    if (cols >= 6) base.measure6 = `${(i % 9) + 1}.6`;
    return base;
  });

const shared = {
  form_name: "Sample Building Long Name For Fit Test",
  fire_manager: "Fire Manager Taro Yamada",
  witness: "Facility Manager Hanako Sato",
  location: "1-1-1 Marunouchi Chiyoda-ku Tokyo Sample Tower South and North",
  inspection_type: "Equipment + General",
  period_start: "2026-02-01",
  period_end: "2026-02-26",
  inspector_name: "Ichiro Suzuki",
  inspector_company: "Sample Fire Equipment Maintenance Center",
  inspector_address: "4-2-8 Shibakoen Minato-ku Tokyo Building 3F",
  inspector_tel: "03-1234-5678 ext204",
  notes:
    "LONGTEXTWITHOUTSPACES-FOR-NOTES-CHECK-THIS-SHOULD-SHRINK-OR-TRUNCATE-WITHOUT-OVERFLOW",
  device1: {
    name: "Gauge",
    model: "PG-9000-LONG",
    calibrated_at: "2026/1/31",
    maker: "MeasureLab",
  },
  device2: {
    name: "Tester",
    model: "TT-42-EXT",
    calibrated_at: "2026/2/10",
    maker: "TestMaker",
  },
};

const jobs = [
  {
    key: "bekki5",
    routePath: "src/app/api/generate-foam-bekki5-pdf/route.ts",
    outPdfPath: "tmp/pdf-test-bekki5678/bekki5_test.pdf",
    payload: {
      ...shared,
      equipment_name: "Foam Main System",
      pump_maker: "PumpCo",
      pump_model: "PMP-9000",
      motor_maker: "MotorCo",
      motor_model: "MTR-2026",
      foam_maker: "FoamUnit",
      foam_model: "FM-12A",
      page1_rows: makeRows(19, "B5-P1").map((row, i) =>
        i === 11 ? { ...row, content: "200", current_value: "5.2" } : row
      ),
      page2_rows: makeRows(34, "B5-P2"),
      page3_rows: makeRows(27, "B5-P3"),
      page4_rows: makeRows(23, "B5-P4"),
    },
  },
  {
    key: "bekki6",
    routePath: "src/app/api/generate-inert-gas-bekki6-pdf/route.ts",
    outPdfPath: "tmp/pdf-test-bekki5678/bekki6_test.pdf",
    payload: {
      ...shared,
      zone_name: "A Zone",
      equipment_system: "Inert Gas System",
      page1_rows: makeRows(32, "B6-P1"),
      page2_rows: makeRows(40, "B6-P2"),
      page3_rows: makeRows(36, "B6-P3"),
      page4_rows: makeRows(12, "B6-P4"),
      page5_rows: makeCylinderRows(29, 4),
    },
  },
  {
    key: "bekki7",
    routePath: "src/app/api/generate-halogen-bekki7-pdf/route.ts",
    outPdfPath: "tmp/pdf-test-bekki5678/bekki7_test.pdf",
    payload: {
      ...shared,
      zone_name: "B Zone",
      equipment_system: "Halogen System",
      page1_rows: makeRows(37, "B7-P1"),
      page2_rows: makeRows(47, "B7-P2"),
      page3_rows: makeRows(27, "B7-P3"),
      page4_rows: makeRows(11, "B7-P4"),
      page5_rows: makeCylinderRows(19, 6),
    },
  },
  {
    key: "bekki8",
    routePath: "src/app/api/generate-powder-bekki8-pdf/route.ts",
    outPdfPath: "tmp/pdf-test-bekki5678/bekki8_test.pdf",
    payload: {
      ...shared,
      zone_name: "C Zone",
      equipment_system: "Powder System",
      page1_rows: makeRows(39, "B8-P1"),
      page2_rows: makeRows(45, "B8-P2"),
      page3_rows: makeRows(25, "B8-P3"),
      page4_rows: makeRows(11, "B8-P4"),
      page5_rows: makeCylinderRows(19, 6),
    },
  },
];

for (const job of jobs) {
  const result = await runRoutePdf(job);
  console.log(job.key, result.outPdfPath, result.bytes);
}
