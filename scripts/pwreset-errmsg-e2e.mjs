/**
 * パスワードリセット: updateUser エラー出し分けの検証（実データ無影響）
 * 出力: .tmp/pwreset-errmsg/manifest.json
 *
 * 方針:
 *  - @supabase/ssr のセッション cookie（sb-<ref>-auth-token = base64-<base64url(JSON)>）を
 *    直接シードして getSession() を成立させ、/update-password のフォームを表示させる
 *    （実際の recovery リンク/トークン交換を経由しない）。
 *  - PUT /auth/v1/user（updateUser）を route.fulfill で差し替え、各エラーを再現。
 *    → 本物の updateUser は一切ネットワークに飛ばないので、本物パスワードは変更されない。
 *  - 画面に出る日本語メッセージが内容別に出し分けられること＋[debug] が無いことを確認。
 */
import { chromium } from "@playwright/test"
import fs from "fs"
import path from "path"

const BASE = "http://localhost:3000"
const OUT = path.join(process.cwd(), ".tmp", "pwreset-errmsg")
fs.mkdirSync(OUT, { recursive: true })
const manifest = { checks: [] }
function check(n, c, d = "") { manifest.checks.push({ name: n, pass: !!c, detail: d }); console.log(c ? "[PASS]" : "[FAIL]", n, d) }

const ENV = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].trim().replace(/^["']|["']$/g, "")])
)
const SUPA_URL = ENV.NEXT_PUBLIC_SUPABASE_URL
const REF = new URL(SUPA_URL).host.split(".")[0] // afvcgopyahepybxaoqjw
const STORAGE_KEY = `sb-${REF}-auth-token`

// 期限切れではない well-formed なダミー JWT（exp 遠未来）。
function b64url(obj) { return Buffer.from(JSON.stringify(obj)).toString("base64url") }
const FAKE_JWT = `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub: "00000000-0000-0000-0000-000000000000", role: "authenticated", aud: "authenticated", exp: 9999999999 })}.fakeSignature`
const FAKE_USER = { id: "00000000-0000-0000-0000-000000000000", aud: "authenticated", role: "authenticated", email: "recovery-mock@example.com", app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, identities: [], created_at: "2020-01-01T00:00:00Z", updated_at: "2020-01-01T00:00:00Z" }
const FAKE_SESSION = { access_token: FAKE_JWT, refresh_token: "fake-refresh-token", token_type: "bearer", expires_in: 3600, expires_at: 9999999999, user: FAKE_USER }

// @supabase/ssr が読める形式の cookie 値（base64- + base64url(JSON)）。
const COOKIE_VALUE = "base64-" + Buffer.from(JSON.stringify(FAKE_SESSION), "utf8").toString("base64url")

// updateUser(PUT /auth/v1/user) を任意のエラー応答に差し替えてフォームを送信し、表示メッセージを得る。
async function runCase(browser, { name, fulfill }) {
  const ctx = await browser.newContext({ locale: "ja-JP", viewport: { width: 1280, height: 900 } })
  // セッション cookie をシード（フォーム表示条件 hasSession=true を満たす）
  await ctx.addCookies([{ name: STORAGE_KEY, value: COOKIE_VALUE, domain: "localhost", path: "/" }])
  const page = await ctx.newPage()
  let logoutCalled = false

  // getUser（万一呼ばれても）→ user を返す。updateUser(PUT) → ケース別エラー。
  await page.route("**/auth/v1/user**", async (route) => {
    const req = route.request()
    if (req.method() === "PUT") return route.fulfill(fulfill)
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(FAKE_USER) })
  })
  // refresh が走っても落ちないように握る
  await page.route("**/auth/v1/token**", async (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(FAKE_SESSION) }))
  // signOut（成功後のリカバリーセッション終了）の発火を記録
  await page.route("**/auth/v1/logout**", async (route) => {
    logoutCalled = true
    return route.fulfill({ status: 204, body: "" })
  })

  await page.goto(`${BASE}/update-password`, { waitUntil: "domcontentloaded", timeout: 60000 })
  await page.getByText("新しいパスワードの設定").first().waitFor({ timeout: 60000 })

  // フォーム（#password）が出るまで待つ＝セッション成立
  const formShown = await page.locator("#password").waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false)
  check(`${name}: セッションでフォームが表示される`, formShown)
  if (!formShown) {
    const body = await page.locator("body").innerText().catch(() => "")
    await ctx.close()
    return { shown: "", bodyText: body, page: page.url(), formShown: false }
  }

  await page.fill("#password", "BrandNewPass123")
  await page.fill("#passwordConfirm", "BrandNewPass123")
  await page.getByRole("button", { name: "パスワードを変更" }).click()

  // 成功（PUT 200）の場合: 即 /login ではなく完了画面 → ボタンで /login。
  if (fulfill.status >= 200 && fulfill.status < 300) {
    // 完了画面の見出しが出るまで待つ（即リダイレクトしないこと）
    const doneShown = await page.getByText("パスワードを変更しました").first().waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false)
    const urlAtDone = page.url() // まだ /update-password のはず
    const passwordGoneOnDone = (await page.locator("#password").count()) === 0
    // 「ログイン画面へ」ボタンを押すと /login へ
    let redirectedAfterButton = false
    if (doneShown) {
      await page.getByRole("button", { name: "ログイン画面へ" }).click()
      redirectedAfterButton = await page.waitForURL("**/login", { timeout: 15000 }).then(() => true).catch(() => false)
    }
    const url = page.url()
    const bodyText = await page.locator("body").innerText().catch(() => "")
    await ctx.close()
    return { shown: "", bodyText, page: url, formShown: true, doneShown, urlAtDone, passwordGoneOnDone, redirectedAfterButton, logoutCalled }
  }

  const errBox = page.locator("div.bg-red-50").first()
  const shown = await errBox.waitFor({ state: "visible", timeout: 15000 }).then(() => errBox.innerText()).catch(() => "")
  const bodyText = await page.locator("body").innerText()
  const url = page.url()
  await ctx.close()
  return { shown, bodyText, page: url, formShown: true }
}

async function main() {
  const browser = await chromium.launch()

  // ケース1: 422 same_password（今回確認された実メッセージ）→「現在のパスワードと異なるものを」
  const c1 = await runCase(browser, {
    name: "same_password",
    fulfill: { status: 422, contentType: "application/json", body: JSON.stringify({ code: 422, error_code: "same_password", msg: "New password should be different from the old password.", message: "New password should be different from the old password." }) },
  })
  if (c1?.formShown) {
    check("same_password: 「現在のパスワードと異なるものを」を日本語表示", c1.shown.includes("現在のパスワードと異なるもの"), c1.shown)
    check("same_password: [debug] 表示が無い", !c1.bodyText.includes("[debug]"))
    check("same_password: 生の英語メッセージを出さない", !c1.shown.includes("should be different"), c1.shown)
    check("same_password: /update-password に留まる（成功遷移していない）", c1.page.includes("/update-password"), c1.page)
  }

  // ケース2: 401 / 期限切れ・無効JWT（bad_jwt）→ 期限切れメッセージ
  // ※ error_code は auth-js が特別扱いしない値（session_not_found は AuthSessionMissingError に
  //   変換され message が変わるため使わない）。実トークン失効は bad_jwt(401, "expired") 形で来る。
  const c2 = await runCase(browser, {
    name: "expired",
    fulfill: { status: 401, contentType: "application/json", body: JSON.stringify({ code: 401, error_code: "bad_jwt", msg: "invalid JWT: unable to parse or verify signature, token is expired by 1h0m0s", message: "invalid JWT: unable to parse or verify signature, token is expired by 1h0m0s" }) },
  })
  if (c2?.formShown) {
    check("expired: 「有効期限が切れているか、無効」を表示", c2.shown.includes("有効期限") || c2.shown.includes("無効"), c2.shown)
    check("expired: [debug] 表示が無い", !c2.bodyText.includes("[debug]"))
  }

  // ケース3: 想定外エラー → 汎用フォールバック
  const c3 = await runCase(browser, {
    name: "generic",
    fulfill: { status: 500, contentType: "application/json", body: JSON.stringify({ code: 500, message: "Internal Server Error" }) },
  })
  if (c3?.formShown) {
    check("generic: 汎用「パスワードの変更に失敗しました」を表示", c3.shown.includes("パスワードの変更に失敗しました"), c3.shown)
    check("generic: [debug] 表示が無い", !c3.bodyText.includes("[debug]"))
  }

  // ケース4: 成功（PUT 200）→ 完了画面 →「ログイン画面へ」→ /login。本物の更新はモックなので実データ無影響。
  const c4 = await runCase(browser, {
    name: "success",
    fulfill: { status: 200, contentType: "application/json", body: JSON.stringify(FAKE_USER) },
  })
  if (c4?.formShown) {
    check("success: 更新成功で「パスワードを変更しました」完了画面が出る", !!c4.doneShown, c4.urlAtDone)
    check("success: 完了画面では即 /login に遷移していない", !!c4.urlAtDone && c4.urlAtDone.includes("/update-password"), c4.urlAtDone)
    check("success: 完了画面ではパスワード入力欄を出さない", !!c4.passwordGoneOnDone)
    check("success: 成功後に signOut（/auth/v1/logout）が呼ばれる", !!c4.logoutCalled)
    check("success: 「ログイン画面へ」ボタンで /login に遷移する", !!c4.redirectedAfterButton && c4.page.includes("/login"), c4.page)
    check("success: 完了画面に [debug] が無い", !c4.bodyText.includes("[debug]"))
  }

  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8")
  await browser.close()
  const passed = manifest.checks.filter((c) => c.pass).length
  console.log(`\n=== checks: ${passed}/${manifest.checks.length} ===`)
  if (passed !== manifest.checks.length) process.exit(2)
}
main().catch((e) => { console.error("FATAL", e); try { fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2)) } catch {} process.exit(1) })
