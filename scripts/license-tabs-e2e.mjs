/**
 * LicenseEditor モバイル 2択タブ E2E（点検者マスタ /inspectors）
 * 出力: .tmp/license-tabs/manifest.json + shots/*.png
 * テストデータは PR-license2- プレフィクスで作成 → 検証後に呼び出し側で削除。
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
const OUT = path.join(process.cwd(), ".tmp", "license-tabs")
const SHOTS = path.join(OUT, "shots")
fs.mkdirSync(SHOTS, { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
const manifest = { checks: [], bothId: null, shoubouOnlyId: null }
function check(n, c, d = "") { manifest.checks.push({ name: n, pass: !!c, detail: d }); console.log(c ? "[PASS]" : "[FAIL]", n, d) }

async function main() {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, locale: "ja-JP" })
  const page = await context.newPage()

  // タブは正規表現で識別（kensa ラベルは「消防設備 / 点検資格者」の2行＝名前に空白が入るため）
  const tabShoubou = () => page.getByRole("button", { name: /消防設備士/ })
  const tabKensa = () => page.getByRole("button", { name: /点検資格者/ })
  const settle = async () => {
    await tabShoubou().waitFor({ timeout: 120000 })
    await page.waitForTimeout(800)
  }
  // 表示中の数（display:none は offsetParent=null で除外）
  const shoubouVisible = () => page.locator('input[placeholder="知事名"]').evaluateAll(els => els.filter(e => e.offsetParent !== null).length)   // 交付知事は消防設備士のみ
  const kensaVisible = () => page.getByText("有効期限", { exact: true }).evaluateAll(els => els.filter(e => e.offsetParent !== null).length)
  // 表示中のモバイルブロック（active のみ md:hidden space-y-3）内の最初の交付番号
  const activeFirstBangou = () => page.locator('div.md\\:hidden.space-y-3 input[placeholder="交付番号"]').first()

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 90000 })
  await page.locator("#email").waitFor({ state: "visible", timeout: 90000 })
  await page.waitForTimeout(1000) // dev hydration を待つ（クリックが no-op になるのを防ぐ）
  await page.fill("#email", ENV.TEST_EMAIL)
  await page.fill("#password", ENV.TEST_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 })

  const getIdByLabel = async (label) => {
    await page.goto(`${BASE}/inspectors`, { waitUntil: "domcontentloaded", timeout: 60000 })
    await page.locator('a[href*="/inspectors/"]', { hasText: label }).first().waitFor({ timeout: 15000 }).catch(() => {})
    const card = page.locator("div", { hasText: label }).filter({ has: page.locator('a[href*="/edit"]') }).first()
    const href = await card.locator('a[href*="/edit"]').first().getAttribute("href").catch(() => null)
    if (href) { const m = href.match(UUID_RE); return m ? m[0] : null }
    const hrefs = await page.locator('a[href*="/inspectors/"]').evaluateAll(as => as.map(a => a.getAttribute("href")))
    const m = hrefs.map(h => (h || "").match(UUID_RE)).find(Boolean)
    return m ? m[0] : null
  }

  // ===== Phase A: 新規 — 既定タブ=kensa、切替、データ保持、保存（両方入力）=====
  await page.goto(`${BASE}/inspectors/new`, { waitUntil: "domcontentloaded", timeout: 120000 })
  await settle()
  check("新規: 既定タブは点検資格者(kensa)が開いている", (await kensaVisible()) === 3 && (await shoubouVisible()) === 0, `kensa=${await kensaVisible()} shoubou=${await shoubouVisible()}`)
  check("新規: 消防設備士8種別ブロックは出ていない（縦長解消）", (await shoubouVisible()) === 0)
  await page.screenshot({ path: path.join(SHOTS, "01_new_default_kensa_vp375.png"), fullPage: true })

  await tabShoubou().click()
  await page.waitForTimeout(300)
  check("消防設備士タップ → 8種別表示・点検資格者非表示", (await shoubouVisible()) === 8 && (await kensaVisible()) === 0, `shoubou=${await shoubouVisible()} kensa=${await kensaVisible()}`)
  await page.screenshot({ path: path.join(SHOTS, "02_shoubou_tab_vp375.png"), fullPage: true })

  await activeFirstBangou().fill("PR-license2 甲-001")
  await tabKensa().click()
  await page.waitForTimeout(300)
  check("点検資格者タブへ切替 → kensa表示", (await kensaVisible()) === 3 && (await shoubouVisible()) === 0)
  await activeFirstBangou().fill("PR-license2 検-001")
  await tabShoubou().click()
  await page.waitForTimeout(300)
  check("タブ切替後も消防設備士の入力が保持されている", (await activeFirstBangou().inputValue()) === "PR-license2 甲-001", await activeFirstBangou().inputValue())

  await page.fill("#label", `PR-license2-both-${stamp}`)
  await page.fill("#name", "PR-license2 太郎")
  await page.getByRole("button", { name: "点検者を登録する" }).click()
  await page.waitForURL("**/inspectors", { timeout: 30000 })
  check("両方入力で保存 → /inspectors 遷移", page.url().endsWith("/inspectors"))
  manifest.bothId = await getIdByLabel(`PR-license2-both-${stamp}`)

  // ===== Phase B: 新規 — 消防設備士のみ入力して保存 =====
  await page.goto(`${BASE}/inspectors/new`, { waitUntil: "domcontentloaded", timeout: 120000 })
  await settle()
  await tabShoubou().click()
  await page.waitForTimeout(300)
  await activeFirstBangou().fill("PR-license2 甲-ONLY")
  await page.fill("#label", `PR-license2-shoubouonly-${stamp}`)
  await page.fill("#name", "PR-license2 次郎")
  await page.getByRole("button", { name: "点検者を登録する" }).click()
  await page.waitForURL("**/inspectors", { timeout: 30000 })
  manifest.shoubouOnlyId = await getIdByLabel(`PR-license2-shoubouonly-${stamp}`)

  // ===== Phase C: 編集の初期タブ出し分け =====
  if (manifest.bothId) {
    await page.goto(`${BASE}/inspectors/${manifest.bothId}/edit`, { waitUntil: "domcontentloaded", timeout: 120000 })
    await settle()
    check("編集(両方入力,kensa優先): 初期タブ=点検資格者", (await kensaVisible()) === 3 && (await shoubouVisible()) === 0, `kensa=${await kensaVisible()} shoubou=${await shoubouVisible()}`)
  }
  if (manifest.shoubouOnlyId) {
    await page.goto(`${BASE}/inspectors/${manifest.shoubouOnlyId}/edit`, { waitUntil: "domcontentloaded", timeout: 120000 })
    await settle()
    check("編集(消防設備士のみ): 初期タブ=消防設備士", (await shoubouVisible()) === 8 && (await kensaVisible()) === 0, `shoubou=${await shoubouVisible()} kensa=${await kensaVisible()}`)
  }

  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8")
  await browser.close()
  const passed = manifest.checks.filter((c) => c.pass).length
  console.log(`\n=== checks: ${passed}/${manifest.checks.length} | both=${manifest.bothId} shoubouOnly=${manifest.shoubouOnlyId} ===`)
  if (passed !== manifest.checks.length) process.exit(2)
}
main().catch((e) => { console.error("FATAL", e); try { fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2)) } catch {} process.exit(1) })
