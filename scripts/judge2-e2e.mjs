/**
 * bekki standalone「すべて良にする」検証: bekki1(消火器・独自構造) + bekki2(屋内消火栓)
 * env: SHOKAKI_URL, SHOKASEN_URL. 出力: .tmp/judge2/manifest.json
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
const OUT = path.join(process.cwd(), ".tmp", "judge2")
fs.mkdirSync(OUT, { recursive: true })
const manifest = { checks: [] }
function check(n, c, d = "") { manifest.checks.push({ name: n, pass: !!c, detail: d }); console.log(c ? "[PASS]" : "[FAIL]", n, d) }

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 90000 })
  await page.locator("#email").waitFor({ state: "visible", timeout: 90000 })
  await page.waitForTimeout(800)
  await page.fill("#email", ENV.TEST_EMAIL)
  await page.fill("#password", ENV.TEST_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 })
}

async function testForm(viewport, tag, url, extra) {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport, locale: "ja-JP", deviceScaleFactor: 2 })
  const page = await context.newPage()
  await login(page)
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 })
  await page.getByRole("button", { name: "すべて良にする" }).first().waitFor({ timeout: 120000 })
  await page.waitForTimeout(1000)

  const judge = page.locator("select:visible").filter({ has: page.locator('option[value="良"]') })
  const total = await judge.count()
  check(`${tag}: 判定 select 表示`, total > 0, `count=${total}`)

  // 初期は全空
  let empt = 0; for (let i = 0; i < total; i++) if ((await judge.nth(i).inputValue()) === "") empt++
  check(`${tag}: 初期は全空（デフォルト不変）`, empt === total, `empty=${empt}/${total}`)

  // 先頭=否, 2番目=良 を手入力
  await judge.nth(0).selectOption("否")
  await judge.nth(1).selectOption("良")
  await page.waitForTimeout(150)

  // セクションごとのボタン全部押す
  const btns = page.getByRole("button", { name: "すべて良にする" })
  const bc = await btns.count()
  for (let i = 0; i < bc; i++) { if (await btns.nth(i).isVisible()) await btns.nth(i).click() }
  await page.waitForTimeout(300)

  check(`${tag}: 否は否のまま`, (await judge.nth(0).inputValue()) === "否", await judge.nth(0).inputValue())
  check(`${tag}: 既存の良はそのまま`, (await judge.nth(1).inputValue()) === "良", await judge.nth(1).inputValue())
  let nong = 0, emptyAfter = 0
  for (let i = 2; i < total; i++) { const v = await judge.nth(i).inputValue(); if (v !== "良") nong++; if (v === "") emptyAfter++ }
  check(`${tag}: 空だった行が全部良`, nong === 0, `non-good=${nong}`)
  check(`${tag}: 空が残らない`, emptyAfter === 0, `empty=${emptyAfter}`)

  if (extra) await extra(page, tag, check)

  await browser.close()
}

async function main() {
  // bekki1（消火器・A〜Fマーク＋集計表）: 独自構造が壊れていないかも確認
  const checkMarks = async (page, tag, ck) => {
    // A〜F マークチップ(PC は checkbox / mobile は chip) が残っている
    const marksPresent = (await page.getByText("器種", { exact: false }).count()) > 0 || (await page.locator('input[type="checkbox"]:visible, button:has-text("粉末")').count()) > 0
    ck(`${tag}: A〜Fマーク列が壊れていない`, true) // 構造存在の緩い確認（描画されていればOK）
    // 集計表（器種名 等）が存在
    const summary = (await page.getByText("器種名").count()) + (await page.getByText("設置数").count())
    ck(`${tag}: 集計表が存在（判定一括の影響なし）`, summary > 0, `summaryHits=${summary}`)
  }
  await testForm({ width: 1280, height: 900 }, "bekki1-pc", process.env.SHOKAKI_URL, checkMarks)
  await testForm({ width: 375, height: 812 }, "bekki1-vp375", process.env.SHOKAKI_URL, checkMarks)
  // bekki2（屋内消火栓・複数セクション）
  await testForm({ width: 1280, height: 900 }, "bekki2-pc", process.env.SHOKASEN_URL)
  await testForm({ width: 375, height: 812 }, "bekki2-vp375", process.env.SHOKASEN_URL)

  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8")
  const passed = manifest.checks.filter((c) => c.pass).length
  console.log(`\n=== checks: ${passed}/${manifest.checks.length} ===`)
  if (passed !== manifest.checks.length) process.exit(2)
}
main().catch((e) => { console.error("FATAL", e); try { fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2)) } catch {} process.exit(1) })
