/**
 * 用途 項別セレクト E2E（property-form + soukatsu-form）
 * 出力: .tmp/usage-e2e/manifest.json + shots/*.png
 * テストデータは PR-usage- プレフィクスで作成 → 検証後に呼び出し側で削除。
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
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/
const OUT = path.join(process.cwd(), ".tmp", "usage-e2e")
const SHOTS = path.join(OUT, "shots")
fs.mkdirSync(SHOTS, { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
const BUILDING_NAME = `PR-usage-bldg-${stamp}`
const USAGE_PROP = "(五)ロ 寄宿舎、下宿又は共同住宅"
const USAGE_SOUKATSU = "(十五) 前各項に該当しない事業場"
const manifest = { checks: [], buildingName: BUILDING_NAME, propertyId: null, soukatsuId: null }
function check(n, c, d = "") { manifest.checks.push({ name: n, pass: !!c, detail: d }); console.log(c ? "[PASS]" : "[FAIL]", n, d) }

async function main() {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, locale: "ja-JP" })
  const page = await context.newPage()
  const settle = async (sel) => {
    await page.locator(sel).first().waitFor({ timeout: 120000 })
    await page.waitForFunction((s) => document.querySelectorAll(s).length === 1, sel, { timeout: 120000 }).catch(() => {})
    await page.waitForTimeout(600)
  }

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 })
  await page.fill("#email", ENV.TEST_EMAIL)
  await page.fill("#password", ENV.TEST_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 })

  // ===== Phase 1: property-form =====
  await page.goto(`${BASE}/properties/new`, { waitUntil: "domcontentloaded", timeout: 120000 })
  await settle("#buildingUsage")
  // select か / optgroup があるか
  const tag = await page.locator("#buildingUsage").first().evaluate((el) => el.tagName)
  check("用途が <select> になっている", tag === "SELECT", tag)
  const optgroups = await page.locator("#buildingUsage optgroup").count()
  check("optgroup で大項目グルーピング(22群)", optgroups >= 20, `optgroup=${optgroups}`)
  // required: 空のまま valueMissing か
  const missing = await page.locator("#buildingUsage").first().evaluate((el) => el.validity.valueMissing)
  check("未選択は required で無効（valueMissing）", missing === true, `valueMissing=${missing}`)
  await page.screenshot({ path: path.join(SHOTS, "property_usage_vp375.png"), fullPage: true })

  // 必須項目を埋めて 用途を選択 → 保存
  await page.fill("#notifierName", "PR-usage 太郎")
  await page.fill("#notifierAddress", "東京都千代田区丸の内一丁目1番1号")
  await page.fill("#notifierPhone", "03-1234-5678")
  await page.fill("#buildingName", BUILDING_NAME)
  await page.fill("#buildingAddress", "東京都千代田区丸の内一丁目1番1号")
  await page.locator("#buildingUsage").first().selectOption({ value: USAGE_PROP })
  await page.waitForTimeout(200)
  check("用途を選択できた", (await page.locator("#buildingUsage").first().inputValue()) === USAGE_PROP)
  // property-form は設備1つ以上が必須（既存仕様）
  await page.locator("label", { hasText: "消火器" }).locator('input[type="checkbox"]').first().check()
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL("**/properties", { timeout: 30000 })

  // propertyId を一覧から取得
  await page.goto(`${BASE}/properties`, { waitUntil: "domcontentloaded", timeout: 60000 })
  const propLink = page.locator('a[href^="/properties/"]', { hasText: BUILDING_NAME }).first()
  await propLink.waitFor({ timeout: 15000 })
  const propHref = await propLink.getAttribute("href")
  const propertyId = propHref.split("/").pop().match(UUID_RE)[0]
  manifest.propertyId = propertyId
  check("物件作成 → id 取得", !!propertyId, propertyId)

  // ===== Phase 2: soukatsu-form（転記＋変更＋保存）=====
  await page.goto(`${BASE}/inspection/new?propertyId=${propertyId}`, { waitUntil: "domcontentloaded", timeout: 120000 })
  await settle("#buildingUsage")
  const transferred = await page.locator("#buildingUsage").first().inputValue()
  check("soukatsu に物件の用途が転記され選択状態", transferred === USAGE_PROP, transferred)
  // 別の用途に変更
  await page.locator("#buildingUsage").first().selectOption({ value: USAGE_SOUKATSU })
  await page.waitForTimeout(200)
  check("soukatsu で別の用途に変更できる", (await page.locator("#buildingUsage").first().inputValue()) === USAGE_SOUKATSU)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL((u) => /\/inspection\/[0-9a-f-]{36}/.test(u.pathname), { timeout: 30000 })
  const sid = page.url().match(UUID_RE)[0]
  manifest.soukatsuId = sid
  check("総括表作成 → id 取得", !!sid, sid)

  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8")
  await browser.close()
  const passed = manifest.checks.filter((c) => c.pass).length
  console.log(`\n=== checks: ${passed}/${manifest.checks.length} | property=${manifest.propertyId} soukatsu=${sid} ===`)
  if (passed !== manifest.checks.length) process.exit(2)
}
main().catch((e) => { console.error("FATAL", e); try { fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2)) } catch {} process.exit(1) })
