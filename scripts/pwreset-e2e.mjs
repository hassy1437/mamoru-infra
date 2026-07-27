/**
 * パスワードリセット 自動検証（メール受信を伴わない範囲）
 * 出力: .tmp/pwreset/manifest.json
 * 注意: 本物のパスワードは変更しない（updateUser は呼ばない＝直アクセスはセッション無で弾かれる）。
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
const OUT = path.join(process.cwd(), ".tmp", "pwreset")
fs.mkdirSync(OUT, { recursive: true })
const manifest = { checks: [] }
function check(n, c, d = "") { manifest.checks.push({ name: n, pass: !!c, detail: d }); console.log(c ? "[PASS]" : "[FAIL]", n, d) }

async function main() {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ja-JP" })
  const page = await context.newPage()

  // ===== 1) /forgot-password が未ログインで開ける（middleware に弾かれない）=====
  await page.goto(`${BASE}/forgot-password`, { waitUntil: "domcontentloaded", timeout: 120000 })
  await page.getByText("パスワードの再設定").first().waitFor({ timeout: 60000 })
  await page.waitForTimeout(500)
  check("forgot: 未ログインで開ける（/login に飛ばされない）", page.url().includes("/forgot-password"), page.url())
  check("forgot: メール入力欄がある", await page.locator("#email").isVisible())

  // resetPasswordForEmail が呼ばれ、redirectTo が /update-password 直になっていること
  const reqP = page.waitForRequest((r) => r.url().includes("/auth/v1/recover") && r.method() === "POST", { timeout: 20000 }).catch(() => null)
  await page.fill("#email", ENV.TEST_EMAIL)
  await page.getByRole("button", { name: "リセットメールを送信" }).click()
  const recoverReq = await reqP
  check("forgot: resetPasswordForEmail(/auth/v1/recover) が POST される", !!recoverReq, recoverReq ? "ok" : "no-request")
  // recover の POST body に redirect_to=/update-password（callback ではない）が入る
  let redirectTo = ""
  try { redirectTo = JSON.parse(recoverReq?.postData() || "{}").redirect_to || recoverReq?.url() || "" } catch { redirectTo = recoverReq?.url() || "" }
  // body に無ければ URL クエリにも入りうるので両方見る（URLエンコードを decode して判定）
  const redirectStr = decodeURIComponent(`${redirectTo} ${recoverReq?.url() || ""}`)
  check("forgot: redirectTo が /update-password 直（/auth/callback ではない）",
    redirectStr.includes("/update-password") && !redirectStr.includes("/auth/callback"),
    redirectStr.slice(0, 160))
  await page.getByText(/再設定用のリンクを送信しました/).first().waitFor({ timeout: 15000 })
  check("forgot: 送信後に成功メッセージ表示（列挙対策）", true)

  // 存在しないメールでも同じ成功表示（列挙対策）。
  // ※ resetPasswordForEmail は短時間連続でレート制限されうるので、成功表示まで明示的に待つ。
  await page.goto(`${BASE}/forgot-password`, { waitUntil: "domcontentloaded", timeout: 60000 })
  await page.locator("#email").waitFor({ timeout: 30000 })
  await page.fill("#email", "no-such-user-pwreset@example.com")
  await page.getByRole("button", { name: "リセットメールを送信" }).click()
  const sameMsg = await page.getByText(/再設定用のリンクを送信しました/).first()
    .waitFor({ timeout: 20000 }).then(() => true).catch(() => false)
  check("forgot: 存在しないメールでも同じ成功表示（列挙対策）", sameMsg)

  // ===== 2) /update-password 直アクセス（セッション無・エラー無）→ 2秒待ちで「リンク無効」=====
  await page.goto(`${BASE}/update-password`, { waitUntil: "domcontentloaded", timeout: 120000 })
  await page.getByText("新しいパスワードの設定").first().waitFor({ timeout: 60000 })
  await page.waitForTimeout(3000) // onAuthStateChange 待ち + 2秒フォールバックの後
  check("update: 未ログインで開ける（/login に飛ばされない）", page.url().includes("/update-password"), page.url())
  const invalid = await page.getByText(/リンクが無効か期限切れ|有効期限が切れ/).first().isVisible().catch(() => false)
  check("update: セッション無で「リンク無効」表示（無限ローディングしない）", invalid)
  check("update: パスワード入力欄が出ていない（セッション無）", (await page.locator("#password").count()) === 0)

  // ===== 2b) /update-password#error=otp_expired → 専用の期限切れメッセージ =====
  // ※ 同一 pathname へのハッシュ違い遷移は SPA で再マウントされず lazy 初期化が再実行
  //   されないため、新しいコンテキスト（フルロード）でアクセスする。
  const ctxErr = await browser.newContext({ locale: "ja-JP" })
  const pageErr = await ctxErr.newPage()
  await pageErr.goto(`${BASE}/update-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`, { waitUntil: "domcontentloaded", timeout: 60000 })
  await pageErr.getByText("新しいパスワードの設定").first().waitFor({ timeout: 60000 })
  await pageErr.waitForTimeout(800)
  const bodyText = await pageErr.locator("body").innerText()
  check("update: #error=otp_expired で専用の期限切れメッセージ", bodyText.includes("有効期限"))
  const reReq = await pageErr.getByRole("link", { name: "再度リクエストする" }).isVisible().catch(() => false)
  check("update: 「再度リクエストする」リンクが出る", reReq)
  check("update: otp_expired 時もパスワード欄を出さない", (await pageErr.locator("#password").count()) === 0)
  await ctxErr.close()

  // ===== 3) login に「パスワードをお忘れの方」リンク → /forgot-password =====
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 })
  await page.locator("#email").waitFor({ timeout: 30000 })
  const forgotLink = page.getByRole("link", { name: "パスワードをお忘れの方" })
  check("login: 「パスワードをお忘れの方」リンクがある", await forgotLink.isVisible())
  await forgotLink.click()
  await page.waitForURL("**/forgot-password", { timeout: 15000 })
  check("login: リンクから /forgot-password に飛ぶ", page.url().includes("/forgot-password"))

  // ===== 4) 既存ログイン回帰（test@test.com でログイン→/tool）=====
  // クリーンなコンテキストで（前段のレート制限/状態を持ち込まない）。
  const ctx2 = await browser.newContext({ locale: "ja-JP" })
  const page2 = await ctx2.newPage()
  await page2.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 })
  await page2.locator("#email").waitFor({ timeout: 30000 })
  await page2.waitForTimeout(500)
  await page2.fill("#email", ENV.TEST_EMAIL)
  await page2.fill("#password", ENV.TEST_PASSWORD)
  await page2.click('button[type="submit"]')
  await page2.waitForURL("**/tool", { timeout: 60000 })
  check("回帰: 既存ログインが成功し /tool に遷移", page2.url().includes("/tool"), page2.url())
  await ctx2.close()

  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8")
  await browser.close()
  const passed = manifest.checks.filter((c) => c.pass).length
  console.log(`\n=== checks: ${passed}/${manifest.checks.length} ===`)
  if (passed !== manifest.checks.length) process.exit(2)
}
main().catch((e) => { console.error("FATAL", e); try { fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2)) } catch {} process.exit(1) })
