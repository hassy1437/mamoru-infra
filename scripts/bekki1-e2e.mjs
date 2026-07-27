/**
 * bekki1（消火器点検票）モバイル対応 before/after 検証（vp375）
 * env: LABEL=before|after, MODE=shots|full, SHOKAKI_URL=<.../shokaki>
 * 出力: .tmp/bekki1-mobile/<LABEL>/full.png + (full時) manifest.json
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
const LABEL = process.env.LABEL || "after"
const MODE = process.env.MODE || "shots"
const URL = process.env.SHOKAKI_URL
const OUT = path.join(process.cwd(), ".tmp", "bekki1-mobile", LABEL)
fs.mkdirSync(OUT, { recursive: true })

const manifest = { checks: [] }
function check(n, c, d = "") { manifest.checks.push({ name: n, pass: !!c, detail: d }); console.log(c ? "[PASS]" : "[FAIL]", n, d) }

async function main() {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, locale: "ja-JP" })
  const page = await context.newPage()

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 })
  await page.fill("#email", ENV.TEST_EMAIL)
  await page.fill("#password", ENV.TEST_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 })

  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 120000 })
  await page.getByText("消火器点検票 入力").first().waitFor({ state: "visible", timeout: 120000 })
  await page.getByText("設置場所").filter({ visible: true }).first().waitFor({ timeout: 60000 })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: path.join(OUT, "full.png"), fullPage: true })

  if (MODE === "full") {
    const visible = { visible: true }
    // 1) A〜F チップ: 6器種名が見える
    for (const name of ["粉末", "泡", "強化液", "二酸化炭素", "ハロゲン化物", "水"]) {
      const n = await page.getByRole("button", { name: new RegExp(name) }).filter(visible).count()
      check(`チップに器種名「${name}」が表示`, n > 0, `count=${n}`)
    }
    // 2) page2 index>=18（水量等）はチップ非表示
    const suiryoCard = page.locator("div.bg-white").filter({ hasText: "水量等" }).filter(visible).first()
    const suiryoChips = await suiryoCard.getByRole("button").filter(visible).count()
    check("page2「水量等」にマークチップ無し", suiryoChips === 0, `buttons=${suiryoChips}`)

    // 3) item0（設置場所）で 粉末(A)・強化液(C) をトグル
    const setchiCard = page.locator("div.bg-white").filter({ hasText: "設置場所" }).filter(visible).first()
    await setchiCard.getByRole("button", { name: /粉末/ }).click()
    await setchiCard.getByRole("button", { name: /強化液/ }).click()
    // 判定 否 + 不良内容
    await setchiCard.locator("select").selectOption("否")
    await page.waitForTimeout(300)
    const badAppeared = await setchiCard.getByText("不良内容").filter(visible).count()
    check("判定「否」で不良内容が展開", badAppeared > 0)
    const badInput = setchiCard.locator('input[type="text"], input:not([type])').last()
    await badInput.fill("PR4TEST 不良サンプル")

    // 4) 集計表カード: 6枚 / 先頭に入力
    const sumCount = await page.getByText("設置数").filter(visible).count()
    check("集計カードが6枚（設置数ラベル）", sumCount === 6, `count=${sumCount}`)
    const sumCard0 = page.locator("div.bg-white").filter({ has: page.getByText("器種名") }).filter(visible).first()
    await sumCard0.locator("input").first().fill("PR4TEST粉末")
    // 設置数（最初の数値）
    const kindGrid = sumCard0.locator("input")
    await kindGrid.nth(1).fill("10")

    // 5) 保存
    await page.getByRole("button", { name: "DB保存" }).click()
    await page.getByText(/保存しました/).waitFor({ timeout: 30000 })
    check("DB保存 完了メッセージ", true)

    await page.screenshot({ path: path.join(OUT, "full_after_input.png"), fullPage: true })
    fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8")
    const passed = manifest.checks.filter((c) => c.pass).length
    console.log(`\n=== checks: ${passed}/${manifest.checks.length} ===`)
  }

  await browser.close()
  console.log(`=== ${LABEL}/${MODE} done -> ${OUT} ===`)
}
main().catch((e) => { console.error("FATAL", e); process.exit(1) })
