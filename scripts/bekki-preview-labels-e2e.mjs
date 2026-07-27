/**
 * PR-A 検証: bekki プレビュー新タブ化＋ボタン文言。
 * 出力: .tmp/bekki-preview-labels/manifest.json
 *
 * テストユーザーでログイン → supabase-js で PR-prev- の 物件/点検/itiran を seed →
 * base(standpipe) と standalone(shokaki) の bekki ページで:
 *   - ラベルが「保存」「プレビュー」「PDFダウンロード」、旧「DB保存」「PDFプレビュー更新」が無い
 *   - 「プレビュー」押下で window.open（新タブ/popup）が開く（iframe ではない）
 *   - ページ内に <iframe> が無い
 *   - 「保存」押下で「保存しました」トースト（persistDraft 成功＝機能維持）
 * 最後に id 指定で全削除（本物データ無接触）。
 */
import { chromium } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"
import fs from "fs"
import path from "path"

const ENV = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].trim().replace(/^["']|["']$/g, "")])
)
const BASE = "http://localhost:3000"
const OUT = path.join(process.cwd(), ".tmp", "bekki-preview-labels")
fs.mkdirSync(OUT, { recursive: true })
const manifest = { checks: [] }
function check(n, c, d = "") { manifest.checks.push({ name: n, pass: !!c, detail: d }); console.log(c ? "[PASS]" : "[FAIL]", n, d) }

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 })
  await page.locator("#email").waitFor({ timeout: 30000 })
  await page.fill("#email", ENV.TEST_EMAIL)
  await page.fill("#password", ENV.TEST_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL("**/tool", { timeout: 60000 })
}

async function makeAuthedClient() {
  const supabase = createClient(ENV.NEXT_PUBLIC_SUPABASE_URL, ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await supabase.auth.signInWithPassword({ email: ENV.TEST_EMAIL, password: ENV.TEST_PASSWORD })
  if (error) throw new Error("signIn: " + error.message)
  return { supabase, uid: data.user.id }
}

async function seed(supabase, uid) {
  const { data: p, error: ep } = await supabase.from("properties").insert({
    user_id: uid, name: "PR-prev-ビル", address: "PR-prev-県市1-2-3", usage_type: "(一)イ 劇場、映画館、演芸場又は観覧場",
    notifier_name: "PR-prev-届出 太郎", notifier_address: "PR-prev-県市1-2-3",
    building_name: "PR-prev-ビル", building_address: "PR-prev-県市4-5-6",
    building_usage: "(一)イ 劇場、映画館、演芸場又は観覧場",
    equipment_types: ["消火器", "連結送水管"], fire_manager_name: "PR-prev-防火 花子",
  }).select("id").single()
  if (ep) throw new Error("prop: " + ep.message)
  const { data: s, error: es } = await supabase.from("inspection_soukatsu").insert({
    user_id: uid, inspection_date: "2026-02-01", inspection_type: "機器・総合点検",
    notifier_address: "PR-prev-県市1-2-3", notifier_name: "PR-prev-届出 太郎",
    building_address: "PR-prev-県市4-5-6", building_name: "PR-prev-ビル",
    building_usage: "(一)イ 劇場、映画館、演芸場又は観覧場", property_id: p.id,
  }).select("id").single()
  if (es) throw new Error("soukatsu: " + es.message)
  const { data: it, error: ei } = await supabase.from("inspection_itiran").insert({
    user_id: uid, soukatsu_id: s.id, inspector1: { name: "PR-prev-点検 一郎" },
  }).select("id").single()
  if (ei) throw new Error("itiran: " + ei.message)
  return { p: p.id, s: s.id, it: it.id }
}

async function cleanup(supabase, ids) {
  await supabase.from("inspection_shokaki_bekki1").delete().eq("itiran_id", ids.it)
  await supabase.from("inspection_standpipe_bekki20").delete().eq("itiran_id", ids.it)
  await supabase.from("inspection_itiran").delete().eq("id", ids.it)
  await supabase.from("inspection_soukatsu").delete().eq("id", ids.s)
  await supabase.from("properties").delete().eq("id", ids.p)
}

async function checkForm(page, label, soukatsuId, itiranId, device) {
  await page.goto(`${BASE}/inspection/${soukatsuId}/itiran/${itiranId}/${device}`, { waitUntil: "domcontentloaded", timeout: 60000 })
  // フォーム（防火管理者欄＝ボタン領域より上）が出るまで待つ
  await page.getByRole("button", { name: "PDFダウンロード" }).waitFor({ state: "visible", timeout: 45000 })

  // ラベル検証
  check(`${label}: 「保存」ボタンがある`, await page.getByRole("button", { name: "保存", exact: true }).isVisible().catch(() => false))
  check(`${label}: 「プレビュー」ボタンがある`, await page.getByRole("button", { name: "プレビュー", exact: true }).isVisible().catch(() => false))
  check(`${label}: 「PDFダウンロード」ボタンがある`, await page.getByRole("button", { name: "PDFダウンロード" }).isVisible().catch(() => false))
  check(`${label}: 旧「DB保存」が無い`, (await page.getByRole("button", { name: "DB保存", exact: true }).count()) === 0)
  check(`${label}: 旧「PDFプレビュー更新」が無い`, (await page.getByText("PDFプレビュー更新").count()) === 0)

  // window.open の呼び出し引数を記録（クリック同期で先に "" が開かれることを検証するため）
  await page.evaluate(() => {
    window.__openArgs = []
    const orig = window.open.bind(window)
    window.open = (...args) => { window.__openArgs.push(args[0]); return orig(...args) }
  })

  // プレビュー押下 → PDF生成API が呼ばれ、window.open（新タブ/popup）が開く
  const pdfReqPromise = page.waitForRequest((r) => /\/api\/generate-.*-pdf/.test(r.url()) && r.method() === "POST", { timeout: 30000 }).catch(() => null)
  const popupPromise = page.waitForEvent("popup", { timeout: 30000 }).catch(() => null)
  await page.getByRole("button", { name: "プレビュー", exact: true }).click()
  const popup = await popupPromise
  // 生成中（PDF応答前）にローディング表示が書かれている
  let loadingText = ""
  if (popup) loadingText = await popup.locator("body").innerText().catch(() => "")
  check(`${label}: 生成中に「PDFを生成しています」ローディングが出る`, loadingText.includes("生成しています"), loadingText.slice(0, 40))
  const pdfReq = await pdfReqPromise
  check(`${label}: プレビューで PDF生成API(/api/generate-*-pdf) が呼ばれる`, !!pdfReq, pdfReq ? pdfReq.url().replace(BASE, "") : "no-req")
  check(`${label}: プレビューで新タブ(window.open)が開く（iframe ではない）`, !!popup)
  // ポップアップブロック対策: 最初の window.open がクリック同期で "" で呼ばれている（fetch 前に空タブ先行）
  const openArgs = await page.evaluate(() => window.__openArgs || [])
  check(`${label}: window.open が先に空文字("")で呼ばれる（クリック同期・fetch前）`, openArgs.length >= 1 && openArgs[0] === "", JSON.stringify(openArgs))
  if (popup) { await popup.close().catch(() => {}) }

  // プレビュー用 iframe が無い（新タブ化により撤去。無関係な iframe〔チャット等〕は除外）
  check(`${label}: プレビュー用 <iframe> が無い`, (await page.locator('iframe[title*="プレビュー"]').count()) === 0)

  // 保存押下 → 「保存しました」トースト（persistDraft 成功＝機能維持）
  await page.getByRole("button", { name: "保存", exact: true }).click()
  const savedToast = await page.getByText("保存しました").first().waitFor({ state: "visible", timeout: 20000 }).then(() => true).catch(() => false)
  check(`${label}: 「保存」で保存できる（保存しましたトースト）`, savedToast)
}

async function main() {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ja-JP" })
  const page = await context.newPage()
  page.on("dialog", (d) => d.accept().catch(() => {}))

  await login(page)
  const authed = await makeAuthedClient()

  // PDF生成API を少し遅延させ、生成中のローディング表示を観測できるようにする（1回だけ設定）
  await page.route("**/api/generate-**-pdf", async (route) => {
    await new Promise((r) => setTimeout(r, 1500))
    try { await route.continue() } catch { /* unroute 等で既に処理済みなら無視 */ }
  })

  let ids = null
  try {
    ids = await seed(authed.supabase, authed.uid)
    check("seed: テストデータ作成成功", !!ids && !!ids.p, JSON.stringify(ids))

    await checkForm(page, "standalone(shokaki)", ids.s, ids.it, "shokaki")
    await checkForm(page, "base(standpipe)", ids.s, ids.it, "standpipe")
  } finally {
    if (ids) { try { await cleanup(authed.supabase, ids); console.log("[cleanup] done") } catch (e) { console.log("[cleanup] FAILED", e.message) } }
  }

  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8")
  await browser.close()
  const passed = manifest.checks.filter((c) => c.pass).length
  console.log(`\n=== checks: ${passed}/${manifest.checks.length} ===`)
  if (passed !== manifest.checks.length) process.exit(2)
}
main().catch((e) => { console.error("FATAL", e); try { fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2)) } catch {} process.exit(1) })
