/**
 * ダークモード見え方 before/after 検証スクリプト（Chromium で prefers-color-scheme: dark をエミュレート）
 *
 * 前提: 開発サーバ起動済み (http://localhost:3000)、.env.local に TEST_EMAIL/TEST_PASSWORD。
 *       LABEL=before|after, SOUKATSU_ID=<点検フォーム用 soukatsu id> を env で渡す。
 * 出力: .tmp/darkmode/<LABEL>/*.png + computed.json
 *
 * 注意: フォームには一切 submit しない（DB を変更しない）。表示のみ撮影。
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
const LABEL = process.env.LABEL || "before"
const SID = process.env.SOUKATSU_ID
const OUT = path.join(process.cwd(), ".tmp", "darkmode", LABEL)
fs.mkdirSync(OUT, { recursive: true })

const PAGES = [
  { slug: "inspectors-new", url: `${BASE}/inspectors/new`, wait: "#name" },          // 免状フォーム (LicenseEditor)
  { slug: "properties-new", url: `${BASE}/properties/new`, wait: "#buildingName" },   // 物件フォーム
  { slug: "properties-list", url: `${BASE}/properties`, wait: "body" },               // 一覧
  { slug: "itiran-form", url: `${BASE}/inspection/${SID}/itiran`, wait: "input" },     // 点検フォーム
]

async function main() {
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    locale: "ja-JP",
    colorScheme: "dark", // ★ prefers-color-scheme: dark をエミュレート
  })
  const page = await context.newPage()
  const computed = {}

  // login
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 })
  await page.fill("#email", ENV.TEST_EMAIL)
  await page.fill("#password", ENV.TEST_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 })

  for (const p of PAGES) {
    try {
      await page.goto(p.url, { waitUntil: "domcontentloaded", timeout: 90000 })
      await page.locator(p.wait).first().waitFor({ timeout: 60000 })
      await page.waitForTimeout(1200)
      await page.screenshot({ path: path.join(OUT, `${p.slug}.png`), fullPage: true })
      // 代表 input の計算済み色を採取
      const inp = page.locator("input").first()
      if (await inp.count()) {
        computed[p.slug] = await inp.evaluate((el) => {
          const s = getComputedStyle(el)
          return { background: s.backgroundColor, color: s.color, colorScheme: getComputedStyle(document.documentElement).colorScheme }
        })
      }
      console.log(`[OK] ${p.slug} ${computed[p.slug] ? JSON.stringify(computed[p.slug]) : ""}`)
    } catch (e) {
      console.log(`[ERR] ${p.slug}: ${e.message.split("\n")[0]}`)
    }
  }

  fs.writeFileSync(path.join(OUT, "computed.json"), JSON.stringify(computed, null, 2), "utf8")
  await browser.close()
  console.log(`=== ${LABEL} done -> ${OUT} ===`)
}
main().catch((e) => { console.error("FATAL", e); process.exit(1) })
