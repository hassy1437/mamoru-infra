/**
 * PR-4 itiran×点検者マスタ統合 E2E 検証（test@test.com / vp375）
 *
 * 前提: 開発サーバ起動済み (http://localhost:3000)、.env.local に TEST_EMAIL/TEST_PASSWORD。
 *       SOUKATSU_ID env に PR4TEST 用 soukatsu の id（事前作成済み）。
 *
 * シナリオ:
 *   0件   : pre-fill されない / ヒント+登録リンク表示 / ドロップダウン無し / ＋追加→2人目→削除 / 手入力保存(回帰)
 *   1件   : 自動 pre-fill される
 *   複数   : 最新が pre-fill / ドロップダウンで別マスタに差し替え(入力済み→confirm)
 *   ＋追加  : 2人目表示 → 空Cardにマスタ選択(confirm無し) → ×削除でリセット
 *   保存    : showSecond=false → inspector2 空 / showSecond=true → inspector2 有
 * 出力: .tmp/pr4itiran-e2e/manifest.json + shots/*.png
 */
import { chromium } from "@playwright/test"
import fs from "fs"
import path from "path"

function readEnvLocal() {
  const txt = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8")
  const out = {}
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/)
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "")
  }
  return out
}

const ENV = readEnvLocal()
const BASE = "http://localhost:3000"
const EMAIL = ENV.TEST_EMAIL
const PASSWORD = ENV.TEST_PASSWORD
const SOUKATSU_ID = process.env.SOUKATSU_ID
const ITIRAN_URL = `${BASE}/inspection/${SOUKATSU_ID}/itiran`
const OUT = path.join(process.cwd(), ".tmp", "pr4itiran-e2e")
const SHOTS = path.join(OUT, "shots")
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/

if (!EMAIL || !PASSWORD || !SOUKATSU_ID) {
  console.error("ERROR: TEST_EMAIL/TEST_PASSWORD/SOUKATSU_ID が必要です")
  process.exit(1)
}
fs.mkdirSync(SHOTS, { recursive: true })

const manifest = { soukatsuId: SOUKATSU_ID, itiranIds: [], checks: [] }
function check(name, cond, detail = "") {
  manifest.checks.push({ name, pass: !!cond, detail })
  console.log(cond ? "[PASS]" : "[FAIL]", name, detail)
}

async function main() {
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    locale: "ja-JP",
  })
  const page = await context.newPage()

  const dialogs = []
  page.on("dialog", async (d) => { dialogs.push(d.message()); await d.accept() })

  const card = (n) => page.locator("div.border-2").filter({ has: page.getByRole("heading", { name: `点検者 ${n}` }) })
  const nameInput = (n) => card(n).getByPlaceholder("氏名を入力")
  const addrInput = (n) => card(n).getByPlaceholder("住所を入力")
  const companyInput = (n) => card(n).getByPlaceholder("社名を入力")
  const masterSelect = (n) => card(n).locator("select")
  const addBtn = () => page.getByRole("button", { name: "点検者を追加" })
  const removeBtn = (n) => card(n).getByRole("button", { name: "削除" })
  const saveBtn = () => page.getByRole("button", { name: "保存してプレビューへ" })

  async function gotoItiran() {
    await page.goto(ITIRAN_URL, { waitUntil: "domcontentloaded", timeout: 60000 })
    await card(1).waitFor({ timeout: 60000 })
    await page.waitForTimeout(1200) // dev hydration を落ち着かせる（瞬間的な二重DOM対策）
  }
  async function waitValue(loc, val, timeout = 12000) {
    await loc.waitFor({ timeout })
    const start = Date.now()
    while (Date.now() - start < timeout) {
      if ((await loc.inputValue()) === val) return true
      await page.waitForTimeout(120)
    }
    return false
  }
  async function createMaster(label, name) {
    // dev の初回オンデマンドコンパイルがあるため timeout は余裕を持たせる
    await page.goto(`${BASE}/inspectors/new`, { waitUntil: "domcontentloaded", timeout: 90000 })
    await page.fill("#label", label)
    await page.fill("#name", name)
    await page.getByRole("button", { name: "点検者を登録する" }).click()
    await page.waitForURL("**/inspectors", { timeout: 90000 })
  }
  async function submitAndGetId() {
    await saveBtn().click()
    await page.waitForURL((u) => /\/itiran\/[0-9a-f-]{36}/.test(u.pathname), { timeout: 90000 })
    return page.url().split("/itiran/")[1].match(UUID_RE)[0]
  }

  // ---------- login ----------
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 })
  await page.fill("#email", EMAIL)
  await page.fill("#password", PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 })
  console.log("login OK ->", page.url())

  // ========== PHASE 0件 ==========
  await gotoItiran()
  check("0件: ドロップダウン無し", (await masterSelect(1).count()) === 0)
  check("0件: ヒント表示", await page.getByText("点検者マスタに登録すると自動入力できます").first().isVisible())
  check("0件: 登録リンク表示", await page.getByRole("link", { name: "点検者を登録" }).first().isVisible())
  check("0件: 点検者1 未prefill(空)", (await nameInput(1).inputValue()) === "")
  check("0件: 点検者2 非表示", (await card(2).count()) === 0)
  check("0件: ＋追加ボタン表示", await addBtn().isVisible())
  await page.screenshot({ path: path.join(SHOTS, "00_empty_initial_vp375.png"), fullPage: true })
  // ＋追加 → 2人目 → ×削除
  await addBtn().click()
  await card(2).waitFor({ timeout: 8000 })
  check("0件: ＋追加で点検者2表示", (await card(2).count()) === 1)
  await removeBtn(2).click()
  await card(2).waitFor({ state: "detached", timeout: 8000 })
  check("0件: ×削除で点検者2消滅", (await card(2).count()) === 0)
  // 回帰: マスタ未使用で手入力 → 保存
  await nameInput(1).fill("PR4TEST 手入力太郎")
  await addrInput(1).fill("PR4TEST県手入力市1-2-3")
  await companyInput(1).fill("PR4TEST手入力商会")
  {
    const id = await submitAndGetId()
    manifest.itiranIds.push({ phase: "regression_manual_0masters", id, expect: { i1name: "PR4TEST 手入力太郎", i2empty: true } })
    console.log("regression save ->", id)
  }

  // ========== PHASE 1件 ==========
  await createMaster("PR4TEST-alpha", "PR4TEST 一郎")
  await gotoItiran()
  check("1件: ドロップダウン表示", (await masterSelect(1).count()) === 1)
  check("1件: 点検者1に最新を自動prefill", await waitValue(nameInput(1), "PR4TEST 一郎"),
    `value=${await nameInput(1).inputValue()}`)

  // ========== PHASE 複数 ==========
  await createMaster("PR4TEST-bravo", "PR4TEST 二郎")
  await createMaster("PR4TEST-charlie", "PR4TEST 三郎") // 最後に作成=最新
  await gotoItiran()
  check("複数: 最新(三郎)をprefill", await waitValue(nameInput(1), "PR4TEST 三郎"),
    `value=${await nameInput(1).inputValue()}`)
  await page.screenshot({ path: path.join(SHOTS, "01_multi_initial_vp375.png"), fullPage: true })

  // 入力済みCard1でドロップダウン差し替え → confirm 期待
  const dlgBefore = dialogs.length
  await masterSelect(1).selectOption({ label: "PR4TEST-alpha" })
  const swapped = await waitValue(nameInput(1), "PR4TEST 一郎")
  check("複数: ドロップダウンで別マスタ(一郎)に差し替え", swapped, `value=${await nameInput(1).inputValue()}`)
  check("複数: 入力済みCardの差し替えで confirm が出る", dialogs.length === dlgBefore + 1,
    `dialogs=${dialogs.length - dlgBefore}`)
  await page.screenshot({ path: path.join(SHOTS, "02_after_master_select_vp375.png"), fullPage: true })

  // ＋追加 → 2人目
  await addBtn().click()
  await card(2).waitFor({ timeout: 8000 })
  check("複数: ＋追加で点検者2表示", (await card(2).count()) === 1)
  await page.screenshot({ path: path.join(SHOTS, "03_second_added_vp375.png"), fullPage: true })
  // 空Card2にマスタ選択 → confirm 無し
  const dlgBefore2 = dialogs.length
  await masterSelect(2).selectOption({ label: "PR4TEST-bravo" })
  const filled2 = await waitValue(nameInput(2), "PR4TEST 二郎")
  check("複数: 空Card2へマスタ選択(二郎)", filled2, `value=${await nameInput(2).inputValue()}`)
  check("複数: 空Cardの選択は confirm 無し", dialogs.length === dlgBefore2, `dialogs=${dialogs.length - dlgBefore2}`)
  // ×削除 → リセット
  await removeBtn(2).click()
  await card(2).waitFor({ state: "detached", timeout: 8000 })
  check("複数: ×削除で点検者2消滅", (await card(2).count()) === 0)
  check("複数: ×削除後 ＋追加が再表示", await addBtn().isVisible())

  // ========== SAVE: showSecond=false → inspector2 空 ==========
  // 現状 Card1=一郎, Card2 非表示
  {
    const id = await submitAndGetId()
    manifest.itiranIds.push({ phase: "save_single_showSecondFalse", id, expect: { i1name: "PR4TEST 一郎", i2empty: true } })
    console.log("save single ->", id)
  }

  // ========== SAVE: showSecond=true → inspector2 有 ==========
  await gotoItiran()
  await waitValue(nameInput(1), "PR4TEST 三郎") // 再び最新prefill
  await addBtn().click()
  await masterSelect(2).selectOption({ label: "PR4TEST-bravo" })
  await waitValue(nameInput(2), "PR4TEST 二郎")
  {
    const id = await submitAndGetId()
    manifest.itiranIds.push({ phase: "save_double_showSecondTrue", id, expect: { i1name: "PR4TEST 三郎", i2name: "PR4TEST 二郎" } })
    console.log("save double ->", id)
  }

  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8")
  await browser.close()

  const passed = manifest.checks.filter((c) => c.pass).length
  console.log(`\n=== checks: ${passed}/${manifest.checks.length} passed ===`)
  console.log(`=== itiran rows created: ${manifest.itiranIds.map((x) => x.id).join(", ")} ===`)
  if (passed !== manifest.checks.length) process.exit(2)
}

main().catch((err) => {
  console.error("FATAL:", err)
  try { fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8") } catch {}
  process.exit(1)
})
