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
    key: "bekki9",
    routePath: "src/app/api/generate-okugai-shokasen-bekki9-pdf/route.ts",
    outPdfPath: "tmp/pdf-test-bekki9to12/bekki9_test.pdf",
    payload: {
      ...shared,
      extra_fields: {
        pump_maker: "PumpCo",
        pump_model: "PMP-9000",
        motor_maker: "MotorCo",
        motor_model: "MTR-2026",
      },
      page1_rows: makeRows(18, "B9-P1").map((row, i) =>
        i === 10 ? { ...row, content: "200", current_value: "5.2" } : row
      ),
      page2_rows: makeRows(36, "B9-P2"),
      page3_rows: makeRows(22, "B9-P3"),
    },
  },
  {
    key: "bekki10",
    routePath: "src/app/api/generate-doryoku-pump-bekki10-pdf/route.ts",
    outPdfPath: "tmp/pdf-test-bekki9to12/bekki10_test.pdf",
    payload: {
      ...shared,
      extra_fields: {
        body_maker: "EngineCo",
        body_model: "ENG-5000",
      },
      page1_rows: makeRows(25, "B10-P1"),
      page2_rows: makeRows(13, "B10-P2"),
    },
  },
  {
    key: "bekki11_1",
    routePath: "src/app/api/generate-jidou-kasai-houchi-bekki11-1-pdf/route.ts",
    outPdfPath: "tmp/pdf-test-bekki9to12/bekki11_1_test.pdf",
    payload: {
      ...shared,
      extra_fields: {
        receiver_maker: "ReceiverTech",
        receiver_model: "RCV-11",
      },
      page1_rows: makeRows(28, "B11-1-P1"),
      page2_rows: makeRows(25, "B11-1-P2"),
      page3_rows: makeRows(12, "B11-1-P3"),
    },
  },
  {
    key: "bekki11_2",
    routePath: "src/app/api/generate-gas-leak-fire-alarm-bekki11-2-pdf/route.ts",
    outPdfPath: "tmp/pdf-test-bekki9to12/bekki11_2_test.pdf",
    payload: {
      ...shared,
      extra_fields: {
        receiver_maker: "ReceiverTech",
        receiver_model: "RCV-11",
        repeater_maker: "RepeaterTech",
        repeater_model: "RPT-22",
      },
      page1_rows: makeRows(24, "B11-2-P1"),
      page2_rows: makeRows(19, "B11-2-P2"),
    },
  },
  {
    key: "bekki12",
    routePath: "src/app/api/generate-leakage-fire-alarm-bekki12-pdf/route.ts",
    outPdfPath: "tmp/pdf-test-bekki9to12/bekki12_test.pdf",
    payload: {
      ...shared,
      page1_rows: makeRows(23, "B12-P1"),
      page2_rows: makeRows(4, "B12-P2"),
    },
  },
];

for (const job of jobs) {
  const result = await runRoutePdf(job);
  console.log(job.key, result.outPdfPath, result.bytes);
}
