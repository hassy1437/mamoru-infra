/**
 * 階数プルダウン + 延べ面積 数字キーパッド E2E（property-form + soukatsu-form）
 * 出力: .tmp/floors-e2e/manifest.json + shots/*.png
 * テストデータは PR-floors- プレフィクスで作成 → 検証後に呼び出し側で削除。
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
const OUT = path.join(process.cwd(), ".tmp", "floors-e2e")
const SHOTS = path.join(OUT, "shots")
fs.mkdirSync(SHOTS, { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
const BUILDING_NAME = `PR-floors-bldg-${stamp}`
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

  // ===== property-form =====
  await page.goto(`${BASE}/properties/new`, { waitUntil: "domcontentloaded", timeout: 120000 })
  await settle("#floorAbove")
  // select か / flex 無しか
  const aboveTag = await page.locator("#floorAbove").first().evaluate((el) => el.tagName)
  const belowTag = await page.locator("#floorBelow").first().evaluate((el) => el.tagName)
  check("地上階数が <select>", aboveTag === "SELECT", aboveTag)
  check("地下階数が <select>", belowTag === "SELECT", belowTag)
  const aboveDisplay = await page.locator("#floorAbove").first().evaluate((el) => getComputedStyle(el).display)
  check("地上 select に display:flex が付いていない（iOS対策）", aboveDisplay !== "flex", `display=${aboveDisplay}`)
  // option 範囲: 地上=空+1..30=31, 地下=空+0..5=7
  const aboveOpts = await page.locator("#floorAbove option").count()
  const belowOpts = await page.locator("#floorBelow option").count()
  check("地上は 1〜30（空込み31）", aboveOpts === 31, `options=${aboveOpts}`)
  check("地下は 0〜5（空込み7）", belowOpts === 7, `options=${belowOpts}`)
  // 面積 inputMode
  const areaMode = await page.locator("#totalFloorArea").first().getAttribute("inputmode")
  check("延べ面積 inputmode=decimal", areaMode === "decimal", `inputmode=${areaMode}`)
  await page.screenshot({ path: path.join(SHOTS, "property_floors_vp375.png"), fullPage: true })

  // 入力 → 保存
  await page.fill("#notifierName", "PR-floors 太郎")
  await page.fill("#notifierAddress", "東京都千代田区丸の内一丁目1番1号")
  await page.fill("#notifierPhone", "03-1234-5678")
  await page.fill("#buildingName", BUILDING_NAME)
  await page.fill("#buildingAddress", "東京都千代田区丸の内一丁目1番1号")
  await page.locator("#buildingUsage").first().selectOption({ value: "(十五) 前各項に該当しない事業場" })
  await page.locator("#floorAbove").first().selectOption("8")
  await page.locator("#floorBelow").first().selectOption("2")
  await page.fill("#totalFloorArea", "1234.56")
  await page.locator("label", { hasText: "消火器" }).locator('input[type="checkbox"]').first().check()
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL("**/properties", { timeout: 30000 })

  await page.goto(`${BASE}/properties`, { waitUntil: "domcontentloaded", timeout: 60000 })
  const propLink = page.locator('a[href^="/properties/"]', { hasText: BUILDING_NAME }).first()
  await propLink.waitFor({ timeout: 15000 })
  const propertyId = (await propLink.getAttribute("href")).split("/").pop().match(UUID_RE)[0]
  manifest.propertyId = propertyId
  check("物件作成 → id 取得", !!propertyId, propertyId)

  // ===== soukatsu-form（転記＋変更）=====
  await page.goto(`${BASE}/inspection/new?propertyId=${propertyId}`, { waitUntil: "domcontentloaded", timeout: 120000 })
  await settle("#floorAbove")
  const sTag = await page.locator("#floorAbove").first().evaluate((el) => el.tagName)
  check("soukatsu 地上階数も <select>", sTag === "SELECT", sTag)
  check("soukatsu に階数が転記（地上=8）", (await page.locator("#floorAbove").first().inputValue()) === "8", await page.locator("#floorAbove").first().inputValue())
  check("soukatsu に階数が転記（地下=2）", (await page.locator("#floorBelow").first().inputValue()) === "2", await page.locator("#floorBelow").first().inputValue())
  check("soukatsu に面積が転記", (await page.locator("#totalFloorArea").first().inputValue()) === "1234.56", await page.locator("#totalFloorArea").first().inputValue())
  // 別の階に変更して保存
  await page.locator("#floorAbove").first().selectOption("12")
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
