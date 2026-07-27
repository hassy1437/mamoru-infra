/**
 * 物件 防火管理者（PR-1）検証: property-form の入力欄と保存 payload。
 * 出力: .tmp/property-fire-manager-pr1/manifest.json
 *
 * 注意: migration（properties.fire_manager_name 追加）は未適用（承認待ち）。
 *   実DBには列が無いため、実 insert は PostgREST に拒否される。よってここでは
 *   /rest/v1/properties への insert リクエストを傍受（route.fulfill 201）して
 *   フォームが送る payload を検証する＝実DBに書き込まない（テストデータも作らない・
 *   本物データに触れない）。実DB永続化は migration 適用後に確認する。
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
const OUT = path.join(process.cwd(), ".tmp", "property-fire-manager-pr1")
fs.mkdirSync(OUT, { recursive: true })
const manifest = { checks: [] }
function check(n, c, d = "") { manifest.checks.push({ name: n, pass: !!c, detail: d }); console.log(c ? "[PASS]" : "[FAIL]", n, d) }

// /properties/new の DOM が落ち着く（ハイドレーション完了で #notifierName が1個）まで待つ
async function waitFormSettled(page) {
  await page.waitForLoadState("networkidle").catch(() => {})
  await page.waitForFunction(() => document.querySelectorAll("#notifierName").length === 1, { timeout: 30000 })
  await page.locator("#notifierName").waitFor({ state: "visible", timeout: 30000 })
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 })
  await page.locator("#email").waitFor({ timeout: 30000 })
  await page.fill("#email", ENV.TEST_EMAIL)
  await page.fill("#password", ENV.TEST_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL("**/tool", { timeout: 60000 })
}

// /properties/new を開き、必須項目＋（任意で）防火管理者を埋めて送信し、
// 傍受した properties insert の body を返す（実DBには書き込まない）。
async function fillAndCaptureInsert(page, { fireManager }) {
  let capturedBody = null
  await page.route("**/rest/v1/properties**", async (route) => {
    const req = route.request()
    if (req.method() === "POST") {
      try { capturedBody = JSON.parse(req.postData() || "null") } catch { capturedBody = req.postData() }
      // PR-1 段階は列未適用のため実DBへは飛ばさず 201 を返す（テストデータを作らない）
      return route.fulfill({ status: 201, contentType: "application/json", body: "[]" })
    }
    return route.continue()
  })

  await page.goto(`${BASE}/properties/new`, { waitUntil: "domcontentloaded", timeout: 60000 })
  await waitFormSettled(page)

  // 必須項目
  await page.fill("#notifierName", "PR-fm-届出 太郎")
  await page.fill("#notifierAddress", "PR-fm-県PR-fm-市1-2-3")
  await page.fill("#buildingName", "PR-fm-テストビル")
  await page.selectOption("#buildingUsage", { index: 1 }) // 先頭の実値
  await page.fill("#buildingAddress", "PR-fm-県PR-fm-市4-5-6")
  // 防火管理者（任意）
  if (fireManager) await page.fill("#fireManagerName", fireManager)
  // 設備を1つ選択（未選択だと送信前バリデーションで弾かれる）
  await page.locator('label:has-text("消火器")').first().click()

  await page.click('button[type="submit"]')
  // insert が傍受されるまで待つ（成功後は /properties に遷移）
  await page.waitForFunction(() => true, { timeout: 1000 }).catch(() => {})
  await page.waitForURL("**/properties", { timeout: 15000 }).catch(() => {})
  // postData は同期的に取得済み。少し待って取りこぼし防止。
  for (let i = 0; i < 20 && capturedBody === null; i++) await page.waitForTimeout(100)
  await page.unroute("**/rest/v1/properties**")
  return capturedBody
}

function asRow(body) {
  if (Array.isArray(body)) return body[0] || {}
  return body || {}
}

async function main() {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ja-JP" })
  const page = await context.newPage()
  // unsaved-changes の beforeunload ダイアログは自動で受理
  page.on("dialog", (d) => d.accept().catch(() => {}))

  await login(page)

  // ===== 1) 入力欄の存在 =====
  await page.goto(`${BASE}/properties/new`, { waitUntil: "domcontentloaded", timeout: 60000 })
  await waitFormSettled(page)
  const fmInput = page.locator("#fireManagerName")
  check("入力欄: 防火管理者（氏名）の Input がある", await fmInput.count() === 1)
  check("入力欄: ラベル『防火管理者（氏名）』がある", await page.getByText("防火管理者（氏名）").first().isVisible().catch(() => false))
  check("入力欄: 任意（required 属性が無い）", await fmInput.getAttribute("required") === null)

  // ===== 2) 入力して保存 → payload に fire_manager_name = 入力値 =====
  const body1 = asRow(await fillAndCaptureInsert(page, { fireManager: "PR-fm-防火 花子" }))
  check("保存(入力あり): insert が傍受された", body1 && Object.keys(body1).length > 0)
  check("保存(入力あり): fire_manager_name = 入力値", body1.fire_manager_name === "PR-fm-防火 花子", JSON.stringify(body1.fire_manager_name))
  // 回帰: 既存フィールドも含まれている
  check("回帰: notifier_name が含まれる", body1.notifier_name === "PR-fm-届出 太郎", JSON.stringify(body1.notifier_name))
  check("回帰: building_name が含まれる", body1.building_name === "PR-fm-テストビル", JSON.stringify(body1.building_name))
  check("回帰: equipment_types が含まれる（消火器）", Array.isArray(body1.equipment_types) && body1.equipment_types.includes("消火器"), JSON.stringify(body1.equipment_types))
  check("回帰: building_usage が空でない", typeof body1.building_usage === "string" && body1.building_usage.length > 0, JSON.stringify(body1.building_usage))

  // ===== 3) 空のまま保存 → fire_manager_name = null =====
  const body2 = asRow(await fillAndCaptureInsert(page, { fireManager: "" }))
  check("保存(空): insert が傍受された", body2 && Object.keys(body2).length > 0)
  check("保存(空): fire_manager_name = null（任意・空は null）", body2.fire_manager_name === null, JSON.stringify(body2.fire_manager_name))
  check("回帰(空): notifier_name は入る", body2.notifier_name === "PR-fm-届出 太郎")

  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8")
  await browser.close()
  const passed = manifest.checks.filter((c) => c.pass).length
  console.log(`\n=== checks: ${passed}/${manifest.checks.length} ===`)
  if (passed !== manifest.checks.length) process.exit(2)
}
main().catch((e) => { console.error("FATAL", e); try { fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2)) } catch {} process.exit(1) })
