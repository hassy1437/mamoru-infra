/**
 * マウント時 点検年月日→点検期間 自動補完 検証
 * env: PROPERTY_ID. 出力: .tmp/mount-autofill/manifest.json
 * phase3 のみ soukatsu を作成 → id 出力（呼び出し側で削除）。
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
const OUT = path.join(process.cwd(), ".tmp", "mount-autofill")
fs.mkdirSync(OUT, { recursive: true })
const manifest = { checks: [], createdSoukatsuId: null, today: null }
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
    await page.waitForTimeout(800) // マウント useEffect の補完まで待つ
  }
  const val = (sel) => page.locator(sel).first().inputValue()
  const fill = (sel, v) => page.locator(sel).first().fill(v)

  // ---- Phase 1: マウント時、操作なしで3つとも today が入っている ----
  await load()
  const today = await val("#inspectionDate")
  manifest.today = today
  check("点検年月日に today が入っている", /^\d{4}-\d{2}-\d{2}$/.test(today), today)
  check("マウント時 開始=点検年月日（操作なし）", (await val("#periodStart")) === today, `start=${await val("#periodStart")} (today=${today})`)
  check("マウント時 終了=点検年月日（操作なし）", (await val("#periodEnd")) === today, `end=${await val("#periodEnd")} (today=${today})`)

  // ---- Phase 2: 手で別日に変更 → 点検年月日を変えても上書きされない（onChangeガード維持） ----
  await load()
  await fill("#periodStart", "2026-04-01")
  await fill("#periodEnd", "2026-04-03")
  await fill("#inspectionDate", "2026-05-20")
  await page.waitForTimeout(300)
  check("手入力済み開始は上書きされない", (await val("#periodStart")) === "2026-04-01", await val("#periodStart"))
  check("手入力済み終了は上書きされない", (await val("#periodEnd")) === "2026-04-03", await val("#periodEnd"))

  // ---- Phase 3: マウント補完のまま保存 → DB ----
  await load()
  const todayForSave = await val("#inspectionDate")
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL((u) => /\/inspection\/[0-9a-f-]{36}/.test(u.pathname), { timeout: 30000 })
  const sid = page.url().match(UUID_RE)[0]
  manifest.createdSoukatsuId = sid
  manifest.todayForSave = todayForSave
  check("保存 → soukatsu 作成", !!sid, sid)

  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8")
  await browser.close()
  const passed = manifest.checks.filter((c) => c.pass).length
  console.log(`\n=== checks: ${passed}/${manifest.checks.length} | soukatsu=${sid} today=${manifest.today} ===`)
  if (passed !== manifest.checks.length) process.exit(2)
}
main().catch((e) => { console.error("FATAL", e); try { fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2)) } catch {} process.exit(1) })
