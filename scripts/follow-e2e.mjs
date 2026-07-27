/**
 * 点検年月日→点検期間 追従（手動編集フラグ）検証
 * env: PROPERTY_ID. 出力: .tmp/follow/manifest.json
 * 最後の保存フェーズのみ soukatsu 作成 → id 出力（呼び出し側で削除）。
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
const FORM_URL = `${BASE}/inspection/new?propertyId=${PROPERTY_ID}`
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/
const OUT = path.join(process.cwd(), ".tmp", "follow")
fs.mkdirSync(OUT, { recursive: true })
const manifest = { checks: [], createdSoukatsuId: null }
function check(n, c, d = "") { manifest.checks.push({ name: n, pass: !!c, detail: d }); console.log(c ? "[PASS]" : "[FAIL]", n, d) }

async function main() {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ja-JP" })
  const page = await context.newPage()

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 })
  await page.fill("#email", ENV.TEST_EMAIL)
  await page.fill("#password", ENV.TEST_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 })

  const load = async () => {
    await page.goto(FORM_URL, { waitUntil: "domcontentloaded", timeout: 120000 })
    await page.locator("#inspectionDate").first().waitFor({ timeout: 120000 })
    await page.waitForFunction(() => document.querySelectorAll("#inspectionDate").length === 1, null, { timeout: 120000 }).catch(() => {})
    await page.waitForTimeout(700)
  }
  const val = (sel) => page.locator(sel).first().inputValue()
  const fill = async (sel, v) => { await page.locator(sel).first().fill(v); await page.waitForTimeout(250) }

  // ---- 1) マウント: 3つとも today ----
  await load()
  const today = await val("#inspectionDate")
  check("マウント: 開始=today", (await val("#periodStart")) === today, `${await val("#periodStart")} / today=${today}`)
  check("マウント: 終了=today", (await val("#periodEnd")) === today, `${await val("#periodEnd")} / today=${today}`)

  // ---- 2) 点検年月日を変える → 開始・終了が追従（★核心）----
  await fill("#inspectionDate", "2026-06-15")
  check("追従: 点検年月日変更で開始も追従", (await val("#periodStart")) === "2026-06-15", await val("#periodStart"))
  check("追従: 点検年月日変更で終了も追従", (await val("#periodEnd")) === "2026-06-15", await val("#periodEnd"))

  // ---- 3) さらに変える → 追従し続ける ----
  await fill("#inspectionDate", "2026-07-20")
  check("追従: 再変更でも開始追従", (await val("#periodStart")) === "2026-07-20", await val("#periodStart"))
  check("追従: 再変更でも終了追従", (await val("#periodEnd")) === "2026-07-20", await val("#periodEnd"))

  // ---- 4) 開始を手で変更 → 開始は手動、終了は追従継続 ----
  await fill("#periodStart", "2026-06-20")
  await fill("#inspectionDate", "2026-08-10")
  check("手動開始: 点検年月日変更でも開始は維持", (await val("#periodStart")) === "2026-06-20", await val("#periodStart"))
  check("手動開始: 終了は追従を継続", (await val("#periodEnd")) === "2026-08-10", await val("#periodEnd"))

  // ---- 5) 終了も手で変更 → 両方手動 → 追従停止 ----
  await fill("#periodEnd", "2026-06-25")
  await fill("#inspectionDate", "2026-09-09")
  check("両方手動: 開始は上書きされない", (await val("#periodStart")) === "2026-06-20", await val("#periodStart"))
  check("両方手動: 終了は上書きされない", (await val("#periodEnd")) === "2026-06-25", await val("#periodEnd"))

  // ---- 6) 保存 → DB（fresh load で追従 → 保存）----
  await load()
  await fill("#inspectionDate", "2026-10-01")
  check("保存前: 追従で開始=2026-10-01", (await val("#periodStart")) === "2026-10-01", await val("#periodStart"))
  check("保存前: 追従で終了=2026-10-01", (await val("#periodEnd")) === "2026-10-01", await val("#periodEnd"))
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL((u) => /\/inspection\/[0-9a-f-]{36}/.test(u.pathname), { timeout: 30000 })
  const sid = page.url().match(UUID_RE)[0]
  manifest.createdSoukatsuId = sid
  check("保存 → soukatsu 作成", !!sid, sid)

  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8")
  await browser.close()
  const passed = manifest.checks.filter((c) => c.pass).length
  console.log(`\n=== checks: ${passed}/${manifest.checks.length} | soukatsu=${sid} ===`)
  if (passed !== manifest.checks.length) process.exit(2)
}
main().catch((e) => { console.error("FATAL", e); try { fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2)) } catch {} process.exit(1) })
