/**
 * 物件編集画面 報告書表紙プレビュー 検証
 * env: PROPERTY_ID（編集テスト用・既存 PR-preview 物件）。出力: .tmp/preview-e2e/manifest.json
 * 注意: プレビューは保存しない（DB 変更なし）。
 */
import { chromium } from "@playwright/test"
import fs from "fs"
import path from "path"

const ENV = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].trim().replace(/^["']|["']$/g, "")])
)
const BASE = "http://localhost:3000"
const PROPERTY_ID = process.env.PROPERTY_ID
const OUT = path.join(process.cwd(), ".tmp", "preview-e2e")
fs.mkdirSync(OUT, { recursive: true })
const manifest = { checks: [], capturedBody: null, newBody: null }
function check(n, c, d = "") { manifest.checks.push({ name: n, pass: !!c, detail: d }); console.log(c ? "[PASS]" : "[FAIL]", n, d) }

async function main() {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ja-JP" })
  const page = await context.newPage()

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 90000 })
  await page.locator("#email").waitFor({ state: "visible", timeout: 90000 })
  await page.waitForTimeout(800)
  await page.fill("#email", ENV.TEST_EMAIL)
  await page.fill("#password", ENV.TEST_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 })

  const previewBtn = () => page.getByRole("button", { name: "報告書表紙プレビュー" })

  // capture generate-pdf request + response. window.open は about:blank になりがちなのでルート監視で確認。
  const waitGeneratePdf = () => page.waitForRequest((r) => r.url().includes("/api/generate-pdf") && r.method() === "POST", { timeout: 30000 })
  const waitGeneratePdfResp = () => page.waitForResponse((r) => r.url().includes("/api/generate-pdf"), { timeout: 30000 })

  // ===== Phase 1: 編集ページ（既存 PR-preview 物件） =====
  await page.goto(`${BASE}/properties/${PROPERTY_ID}/edit`, { waitUntil: "domcontentloaded", timeout: 120000 })
  await previewBtn().waitFor({ timeout: 120000 })
  await page.waitForTimeout(800)
  check("編集: プレビューボタンが存在", await previewBtn().isVisible())

  const [req, resp] = await Promise.all([waitGeneratePdf(), waitGeneratePdfResp(), previewBtn().click()])
  const body = JSON.parse(req.postData() || "{}")
  manifest.capturedBody = body
  check("編集: /api/generate-pdf に POST された", true, req.method())
  check("編集: 200 が返る", resp.status() === 200, `status=${resp.status()}`)
  check("編集: body.building_name が入っている", body.building_name === "PR-preview-building", body.building_name)
  check("編集: body.building_usage が入っている", String(body.building_usage || "").includes("共同住宅"), body.building_usage)
  check("編集: floor_above 数値化 (5)", body.floor_above === 5, JSON.stringify(body.floor_above))
  check("編集: total_floor_area 数値化 (1234.56)", body.total_floor_area === 1234.56, JSON.stringify(body.total_floor_area))
  check("編集: report_date は空（点検固有）", body.report_date === "", JSON.stringify(body.report_date))
  check("編集: fire_department_name は空", body.fire_department_name === "", JSON.stringify(body.fire_department_name))

  // ===== Phase 2: 新規ページ（未保存）でもプレビューできる =====
  await page.goto(`${BASE}/properties/new`, { waitUntil: "domcontentloaded", timeout: 120000 })
  await previewBtn().waitFor({ timeout: 120000 })
  await page.waitForTimeout(800)
  // 名称だけ入れて未保存のままプレビュー
  await page.fill("#buildingName", "PR-preview-未保存")
  const [req2, resp2] = await Promise.all([waitGeneratePdf(), waitGeneratePdfResp(), previewBtn().click()])
  const body2 = JSON.parse(req2.postData() || "{}")
  manifest.newBody = body2
  check("新規(未保存): /api/generate-pdf に POST", true)
  check("新規(未保存): 200 が返る", resp2.status() === 200, `status=${resp2.status()}`)
  check("新規(未保存): body.building_name が現在値", body2.building_name === "PR-preview-未保存", body2.building_name)

  // ===== Phase 3: プレビューで保存されていない（/properties に新物件が増えていない）=====
  // 新規ページで保存ボタンを押していないので、未保存物件は作られない（DB 検証は呼び出し側 SQL で）

  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8")
  await browser.close()
  const passed = manifest.checks.filter((c) => c.pass).length
  console.log(`\n=== checks: ${passed}/${manifest.checks.length} ===`)
  if (passed !== manifest.checks.length) process.exit(2)
}
main().catch((e) => { console.error("FATAL", e); try { fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2)) } catch {} process.exit(1) })
