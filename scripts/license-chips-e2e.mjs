/**
 * LicenseEditor モバイル チップ選択式 E2E（点検者マスタ /inspectors/new・/edit）
 * 出力: .tmp/license-chips/manifest.json + shots/*.png
 * テストデータは PR-license- プレフィクスで作成 → 検証後に呼び出し側で削除。
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
const OUT = path.join(process.cwd(), ".tmp", "license-chips")
const SHOTS = path.join(OUT, "shots")
fs.mkdirSync(SHOTS, { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
const LABEL = `PR-license-${stamp}`
const manifest = { checks: [], label: LABEL }
function check(n, c, d = "") { manifest.checks.push({ name: n, pass: !!c, detail: d }); console.log(c ? "[PASS]" : "[FAIL]", n, d) }

async function main() {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, locale: "ja-JP" })
  const page = await context.newPage()
  page.on("dialog", async (d) => { await d.accept() }) // confirm は OK

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 })
  await page.fill("#email", ENV.TEST_EMAIL)
  await page.fill("#password", ENV.TEST_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 })

  const settle = async () => {
    await page.getByText("資格：消防設備士").first().waitFor({ timeout: 120000 })
    await page.waitForTimeout(1000)
  }
  // 消防設備士チップ（モバイル md:hidden 内のボタン）
  const shoubouChip = (label) => page.locator("div.md\\:hidden button", { hasText: label }).first()
  const kensaChip = (label) => page.locator("div.md\\:hidden button", { hasText: label }).first()
  // 展開された入力欄（md:hidden 内の交付番号 input）数で展開数を測る
  const mobileBangouInputs = () => page.locator('div.md\\:hidden input[placeholder="交付番号"]')

  // ===== 新規: チップ全未選択・入力欄ゼロ =====
  await page.goto(`${BASE}/inspectors/new`, { waitUntil: "domcontentloaded", timeout: 120000 })
  await settle()
  check("新規: モバイルで交付番号入力欄が0（縦長解消）", (await mobileBangouInputs().count()) === 0, `inputs=${await mobileBangouInputs().count()}`)
  // 備考はチップ未選択時、モバイルでは非表示（hidden md:block 化）
  const notesVisibleInit = await page.locator('div.md\\:hidden textarea, textarea').filter({ hasText: "" }).first().isVisible().catch(() => false)
  await page.screenshot({ path: path.join(SHOTS, "01_new_empty_vp375.png"), fullPage: true })

  // チップ「甲・乙種　４類」(class4) を選択 → 入力欄が1つ展開
  await shoubouChip("４類").click()
  await page.waitForTimeout(400)
  check("チップ選択で入力欄が1つ展開", (await mobileBangouInputs().count()) === 1, `inputs=${await mobileBangouInputs().count()}`)
  await page.screenshot({ path: path.join(SHOTS, "02_one_chip_expanded_vp375.png"), fullPage: true })

  // 交付番号入力
  await mobileBangouInputs().first().fill("PR-license 甲4-0001")
  // 点検資格者チップ「第　１　種」選択 → 入力
  await kensaChip("第　１　種").click()
  await page.waitForTimeout(400)
  const kensaBangou = page.locator('div.md\\:hidden input[placeholder="交付番号"]')
  check("点検資格者もチップ展開（交付番号 input 増）", (await kensaBangou.count()) >= 2, `inputs=${await kensaBangou.count()}`)
  // ラベル入力（マスタ識別名・必須でないが一覧用）
  await page.fill("#label", LABEL)
  await page.fill("#name", "PR-license 太郎")

  // 保存
  await page.getByRole("button", { name: "点検者を登録する" }).click()
  await page.waitForURL("**/inspectors", { timeout: 30000 })
  check("マスタ保存 → /inspectors 遷移", page.url().endsWith("/inspectors"))

  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8")
  await browser.close()
  const passed = manifest.checks.filter((c) => c.pass).length
  console.log(`\n=== checks: ${passed}/${manifest.checks.length} | label=${LABEL} ===`)
  if (passed !== manifest.checks.length) process.exit(2)
}
main().catch((e) => { console.error("FATAL", e); try { fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2)) } catch {} process.exit(1) })
