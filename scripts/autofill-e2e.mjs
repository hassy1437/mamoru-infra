/**
 * 点検年月日→点検期間 自動補完 検証
 * env: PROPERTY_ID. 出力: .tmp/autofill/manifest.json
 * 注意: phase3 のみ soukatsu を作成 → id を出力（呼び出し側で削除）。
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
const OUT = path.join(process.cwd(), ".tmp", "autofill")
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
    // dev hydration の二重DOMが 1 個に落ち着くまで待つ
    await page.waitForFunction(() => document.querySelectorAll("#inspectionDate").length === 1, null, { timeout: 120000 }).catch(() => {})
    await page.waitForTimeout(600)
  }
  const val = (sel) => page.locator(sel).first().inputValue()
  const fill = (sel, v) => page.locator(sel).first().fill(v)

  // ---- Phase 1: 空の期間 → 点検年月日と同日に自動補完 ----
  await load()
  check("初期: 期間は空", (await val("#periodStart")) === "" && (await val("#periodEnd")) === "", `start=${await val("#periodStart")} end=${await val("#periodEnd")}`)
  await fill("#inspectionDate", "2026-03-15")
  await page.waitForTimeout(300)
  check("点検年月日を選ぶと開始=同日", (await val("#periodStart")) === "2026-03-15", await val("#periodStart"))
  check("点検年月日を選ぶと終了=同日", (await val("#periodEnd")) === "2026-03-15", await val("#periodEnd"))

  // ---- Phase 2: 期間を手入力済み → 上書きしない ----
  await load()
  await fill("#periodStart", "2026-04-01")
  await fill("#periodEnd", "2026-04-03")
  await fill("#inspectionDate", "2026-05-20")
  await page.waitForTimeout(300)
  check("手入力済み開始は上書きされない", (await val("#periodStart")) === "2026-04-01", await val("#periodStart"))
  check("手入力済み終了は上書きされない", (await val("#periodEnd")) === "2026-04-03", await val("#periodEnd"))

  // ---- Phase 2b: 片方だけ手入力（終了は空）→ 終了のみ補完 ----
  await load()
  await fill("#periodStart", "2026-06-01")
  await fill("#inspectionDate", "2026-07-07")
  await page.waitForTimeout(300)
  check("片方手入力: 開始は維持", (await val("#periodStart")) === "2026-06-01", await val("#periodStart"))
  check("片方手入力: 空の終了は補完", (await val("#periodEnd")) === "2026-07-07", await val("#periodEnd"))

  // ---- Phase 3: 保存 → DB ----
  await load()
  await fill("#inspectionDate", "2026-08-08")
  await page.waitForTimeout(300)
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
