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
      page1_rows: makeRows(20, "B16-P1"),
      page2_rows: makeRows(20, "B16-P2"),
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
        smoke_machine_maker: "SmokeMakerCo",
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
        motor_maker: "MotorCo",
        motor_model: "MTR-2026",
        pump_maker: "PumpCo",
        pump_model: "PMP-9000",
      },
      page1_rows: makeRows(30, "B20-P1"),
      page2_rows: makeRows(40, "B20-P2"),
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
        cable_maker: "CableCo",
        cable_model: "CBL-10",
        antenna_maker: "AntennaCo",
        antenna_model: "ANT-20",
        amplifier_maker: "AmplifierCo",
        amplifier_model: "AMP-30",
      },
      page1_rows: makeRows(20, "B22-P1"),
    },
  },
];

for (const job of jobs) {
  const result = await runRoutePdf(job);
  console.log(job.key, result.outPdfPath, result.bytes);
}
