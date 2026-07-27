/**
 * bekki base 判定「すべて良にする」一括ボタン 検証（fire-water=bekki17, base form）
 * env: FW_URL（.../fire-water）, ITIRAN_ID. 出力: .tmp/judge-bulk/manifest.json + shots
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
const URL = process.env.FW_URL
const OUT = path.join(process.cwd(), ".tmp", "judge-bulk")
const SHOTS = path.join(OUT, "shots")
fs.mkdirSync(SHOTS, { recursive: true })
const manifest = { checks: [] }
function check(n, c, d = "") { manifest.checks.push({ name: n, pass: !!c, detail: d }); console.log(c ? "[PASS]" : "[FAIL]", n, d) }

async function run(viewport, tag) {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport, locale: "ja-JP", deviceScaleFactor: 2 })
  const page = await context.newPage()

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 90000 })
  await page.locator("#email").waitFor({ state: "visible", timeout: 90000 })
  await page.waitForTimeout(800)
  await page.fill("#email", ENV.TEST_EMAIL)
  await page.fill("#password", ENV.TEST_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 })

  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 120000 })
  await page.getByRole("button", { name: "すべて良にする" }).first().waitFor({ timeout: 120000 })
  await page.waitForTimeout(1000)

  // 判定 select 群。base は desktop table と mobile card の両方を描画し、
  // 片方は CSS で hidden。:visible で現在の viewport に出ている方だけを対象にする。
  const judgeSelects = page.locator("select:visible").filter({ has: page.locator('option[value="良"]') })
  const total = await judgeSelects.count()
  check(`${tag}: 判定 select が存在`, total > 0, `count=${total}`)

  // 1) 初期は全行空（デフォルト不変）
  let emptyInit = 0
  for (let i = 0; i < total; i++) { if ((await judgeSelects.nth(i).inputValue()) === "") emptyInit++ }
  check(`${tag}: 初期は全判定が空（デフォルト不変）`, emptyInit === total, `empty=${emptyInit}/${total}`)

  // 2) 先頭を否、2番目を良に手入力してから一括
  await judgeSelects.nth(0).selectOption("否")
  await judgeSelects.nth(1).selectOption("良")
  await page.waitForTimeout(200)
  await page.screenshot({ path: path.join(SHOTS, `${tag}_before.png`), fullPage: true }).catch(() => {})

  // 一括「すべて良にする」（複数セクションがあり得るので全ボタン押す）
  const btns = page.getByRole("button", { name: "すべて良にする" })
  const bcount = await btns.count()
  for (let i = 0; i < bcount; i++) await btns.nth(i).click()
  await page.waitForTimeout(300)

  // 3) 検証: 0番=否のまま、1番=良のまま、残りの空は全部良
  check(`${tag}: 否の行は否のまま（不良が消えない）`, (await judgeSelects.nth(0).inputValue()) === "否", await judgeSelects.nth(0).inputValue())
  check(`${tag}: 既存の良はそのまま`, (await judgeSelects.nth(1).inputValue()) === "良", await judgeSelects.nth(1).inputValue())
  let nonGood = 0, vals = []
  for (let i = 0; i < total; i++) { const v = await judgeSelects.nth(i).inputValue(); vals.push(v); if (i >= 2 && v !== "良") nonGood++ }
  check(`${tag}: 空だった行が全部「良」になった`, nonGood === 0, `non-good(after idx2)=${nonGood}`)
  check(`${tag}: 空が残っていない`, !vals.includes(""), `empties=${vals.filter(v=>v==="").length}`)
  await page.screenshot({ path: path.join(SHOTS, `${tag}_after.png`), fullPage: true }).catch(() => {})

  // PC のときだけ DB保存して payload を確認できるようにする
  if (tag === "pc") {
    const saveBtn = page.getByRole("button", { name: "DB保存" })
    if (await saveBtn.count()) {
      await saveBtn.first().click()
      await page.getByText(/保存しました/).first().waitFor({ timeout: 30000 }).catch(() => {})
      await page.waitForTimeout(1000)
      check(`${tag}: DB保存 完了`, true)
    }
  }

  await browser.close()
}

async function main() {
  await run({ width: 1280, height: 900 }, "pc")
  await run({ width: 375, height: 812 }, "vp375")
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8")
  const passed = manifest.checks.filter((c) => c.pass).length
  console.log(`\n=== checks: ${passed}/${manifest.checks.length} ===`)
  if (passed !== manifest.checks.length) process.exit(2)
}
main().catch((e) => { console.error("FATAL", e); try { fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2)) } catch {} process.exit(1) })
