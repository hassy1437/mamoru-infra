/**
 * トップ（/）ログイン画面化 E2E（入口の両系統を必ず確認）
 * 出力: .tmp/top-login/manifest.json
 * 既存 test@test.com を使用（新規データ作成なし）。
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
const OUT = path.join(process.cwd(), ".tmp", "top-login")
fs.mkdirSync(OUT, { recursive: true })
const manifest = { checks: [] }
function check(n, c, d = "") { manifest.checks.push({ name: n, pass: !!c, detail: d }); console.log(c ? "[PASS]" : "[FAIL]", n, d) }
const pathOf = (u) => { try { return new URL(u).pathname + new URL(u).search } catch { return u } }

async function main() {
  const browser = await chromium.launch()

  // ===== 未ログイン系（fresh context, no cookies）=====
  {
    const ctx = await browser.newContext({ locale: "ja-JP" })
    const page = await ctx.newPage()

    // 1) 未ログインで / → /login
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 90000 })
    await page.waitForTimeout(800)
    check("未ログイン: / → /login", new URL(page.url()).pathname === "/login", pathOf(page.url()))
    check("未ログイン: /login にログインフォーム表示", await page.locator("#email").isVisible().catch(() => false))

    // 2) 未ログインで /tool（保護パス）→ /login?redirectTo=/tool
    await page.goto(`${BASE}/tool`, { waitUntil: "domcontentloaded", timeout: 90000 })
    await page.waitForTimeout(800)
    check("未ログイン: /tool → /login?redirectTo=/tool",
      new URL(page.url()).pathname === "/login" && new URL(page.url()).searchParams.get("redirectTo") === "/tool",
      pathOf(page.url()))

    await ctx.close()
  }

  // ===== ログイン系 =====
  {
    const ctx = await browser.newContext({ locale: "ja-JP" })
    const page = await ctx.newPage()

    // 3) /login でログイン → /tool
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 90000 })
    await page.locator("#email").waitFor({ state: "visible", timeout: 90000 })
    await page.waitForTimeout(800)
    await page.fill("#email", ENV.TEST_EMAIL)
    await page.fill("#password", ENV.TEST_PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 })
    check("ログイン → /tool", new URL(page.url()).pathname === "/tool", pathOf(page.url()))

    // 4) ログイン済みで / → /tool
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 90000 })
    await page.waitForTimeout(800)
    check("ログイン済み: / → /tool", new URL(page.url()).pathname === "/tool", pathOf(page.url()))

    // 5) ログイン済みで /login → /tool（既存 middleware ガード維持）
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 90000 })
    await page.waitForTimeout(800)
    check("ログイン済み: /login → /tool（既ガード維持）", new URL(page.url()).pathname === "/tool", pathOf(page.url()))

    // 6) ログアウト → /login
    await page.goto(`${BASE}/tool`, { waitUntil: "domcontentloaded", timeout: 90000 })
    await page.getByRole("button", { name: /ログアウト/ }).first().click().catch(async () => {
      // ボタン名が異なる場合のフォールバック
      await page.locator("button", { hasText: "ログアウト" }).first().click()
    })
    await page.waitForURL((u) => u.pathname === "/login", { timeout: 60000 }).catch(() => {})
    check("ログアウト → /login", new URL(page.url()).pathname === "/login", pathOf(page.url()))

    // 7) ログアウト後に / → /login（未ログインに戻った確認）
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 90000 })
    await page.waitForTimeout(800)
    check("ログアウト後: / → /login", new URL(page.url()).pathname === "/login", pathOf(page.url()))

    await ctx.close()
  }

  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8")
  await browser.close()
  const passed = manifest.checks.filter((c) => c.pass).length
  console.log(`\n=== checks: ${passed}/${manifest.checks.length} ===`)
  if (passed !== manifest.checks.length) process.exit(2)
}
main().catch((e) => { console.error("FATAL", e); try { fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2)) } catch {} process.exit(1) })
