/**
 * G1 検証: bekki1 判定の不良個数 UI（保存値 judgment="否"+bad_count、否のみ個数入力表示）。
 * 出力: .tmp/bekki1-bad-count/manifest.json
 * テストユーザーで seed（PR-g1- プレフィクス）→ フォーム検証 → id 指定削除。本物データ無接触。
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
const OUT = path.join(process.cwd(), ".tmp", "bekki1-bad-count")
fs.mkdirSync(OUT, { recursive: true })
const manifest = { checks: [] }
function check(n, c, d = "") { manifest.checks.push({ name: n, pass: !!c, detail: d }); console.log(c ? "[PASS]" : "[FAIL]", n, d) }

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 })
  await page.locator("#email").waitFor({ timeout: 30000 })
  await page.fill("#email", ENV.TEST_EMAIL); await page.fill("#password", ENV.TEST_PASSWORD)
  await page.click('button[type="submit"]'); await page.waitForURL("**/tool", { timeout: 60000 })
}
async function authed() {
  const supabase = createClient(ENV.NEXT_PUBLIC_SUPABASE_URL, ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await supabase.auth.signInWithPassword({ email: ENV.TEST_EMAIL, password: ENV.TEST_PASSWORD })
  if (error) throw new Error("signIn: " + error.message)
  return { supabase, uid: data.user.id }
}

async function seed(supabase, uid) {
  const { data: p, error: ep } = await supabase.from("properties").insert({
    user_id: uid, name: "PR-g1-ビル", address: "PR-g1-県市1", usage_type: "(一)イ 劇場、映画館、演芸場又は観覧場",
    notifier_name: "PR-g1-届出", notifier_address: "PR-g1-県市1", building_name: "PR-g1-ビル", building_address: "PR-g1-県市2",
    building_usage: "(一)イ 劇場、映画館、演芸場又は観覧場", equipment_types: ["消火器"],
  }).select("id").single()
  if (ep) throw new Error("prop:" + ep.message)
  const { data: s, error: es } = await supabase.from("inspection_soukatsu").insert({
    user_id: uid, inspection_date: "2026-02-01", inspection_type: "機器点検", notifier_address: "PR-g1-県市1", notifier_name: "PR-g1-届出",
    building_address: "PR-g1-県市2", building_name: "PR-g1-ビル", building_usage: "(一)イ 劇場、映画館、演芸場又は観覧場", property_id: p.id,
  }).select("id").single()
  if (es) throw new Error("soukatsu:" + es.message)
  const { data: it, error: ei } = await supabase.from("inspection_itiran").insert({ user_id: uid, soukatsu_id: s.id, inspector1: { name: "PR-g1-点検" } }).select("id").single()
  if (ei) throw new Error("itiran:" + ei.message)
  // 保存済み bekki1: page1_rows[0] = 否+不良個数7
  const { error: eb } = await supabase.from("inspection_shokaki_bekki1").insert({
    soukatsu_id: s.id, itiran_id: it.id, property_id: p.id,
    payload: { form_name: "PR-g1-ビル", page1_rows: [{ judgment: "否", bad_count: "7", marks: {}, bad_content: "", action_content: "" }], page2_rows: [] },
  })
  if (eb) throw new Error("bekki1:" + eb.message)
  return { p: p.id, s: s.id, it: it.id }
}
async function cleanup(supabase, ids) {
  await supabase.from("inspection_shokaki_bekki1").delete().eq("itiran_id", ids.it)
  await supabase.from("inspection_itiran").delete().eq("id", ids.it)
  await supabase.from("inspection_soukatsu").delete().eq("id", ids.s)
  await supabase.from("properties").delete().eq("id", ids.p)
}

async function main() {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ja-JP" })
  const page = await ctx.newPage()
  page.on("dialog", (d) => d.accept().catch(() => {}))
  await login(page)
  const a = await authed()
  let ids = null
  try {
    ids = await seed(a.supabase, a.uid)
    check("seed: テストデータ作成", !!ids?.p, JSON.stringify(ids))

    await page.goto(`${BASE}/inspection/${ids.s}/itiran/${ids.it}/shokaki`, { waitUntil: "domcontentloaded", timeout: 60000 })
    await page.getByRole("button", { name: "保存", exact: true }).waitFor({ state: "visible", timeout: 45000 })

    // 1) 保存済み 否+個数7 が読み戻され、不良個数入力に "7" が表示される（hydration + 否条件描画）
    const fmInput = page.getByPlaceholder("不良個数").first()
    const shown = await fmInput.waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false)
    check("否行に不良個数入力が表示される", shown)
    check("保存済み不良個数 7 が読み戻される", shown && (await fmInput.inputValue()) === "7", shown ? await fmInput.inputValue() : "no-input")

    // 2) 値を 9 に変更 → 保存 → upsert payload に judgment="否" + bad_count="9"
    let saved = null
    await page.route("**/rest/v1/inspection_shokaki_bekki1**", async (route) => {
      const req = route.request()
      if (req.method() === "POST" || req.method() === "PATCH") {
        try { const b = JSON.parse(req.postData() || "null"); saved = Array.isArray(b) ? b[0] : b } catch { /* */ }
        return route.fulfill({ status: 201, contentType: "application/json", body: "[]" })
      }
      return route.continue()
    })
    if (shown) { await fmInput.fill("9") }
    await page.getByRole("button", { name: "保存", exact: true }).click()
    for (let i = 0; i < 30 && saved === null; i++) await page.waitForTimeout(100)
    await page.unroute("**/rest/v1/inspection_shokaki_bekki1**")
    const r0 = saved?.payload?.page1_rows?.[0] ?? null
    check("保存: page1_rows[0].judgment は '否' のまま", r0?.judgment === "否", JSON.stringify(r0?.judgment))
    check("保存: page1_rows[0].bad_count = 入力値 '9'", r0?.bad_count === "9", JSON.stringify(r0?.bad_count))

    // 3) 不良個数入力は「否行のみ」表示（全行に出ない）。desktop/mobile 両描画のため可視のみで判定（否1行→可視1）。
    const visibleCount = await page.locator('input[placeholder="不良個数"]:visible').count()
    check("不良個数入力は否行のみ（可視=1。全行に出ていない）", visibleCount === 1, `visible=${visibleCount}`)
  } finally {
    if (ids) { try { await cleanup(a.supabase, ids); console.log("[cleanup] done") } catch (e) { console.log("[cleanup] FAILED", e.message) } }
  }
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8")
  await browser.close()
  const passed = manifest.checks.filter((c) => c.pass).length
  console.log(`\n=== checks: ${passed}/${manifest.checks.length} ===`)
  if (passed !== manifest.checks.length) process.exit(2)
}
main().catch((e) => { console.error("FATAL", e); try { fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2)) } catch {} process.exit(1) })
