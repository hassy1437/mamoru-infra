/**
 * 物件の防火管理者を bekki に転記（PR-2）検証。
 * 出力: .tmp/property-fire-manager-pr2/manifest.json
 *
 * テストユーザーでログイン → supabase クライアント（RLS 準拠・自分のデータ）で
 * PR-fm2- プレフィクスの 物件/点検(soukatsu)/itiran/保存済 bekki を seed →
 * bekki ページで防火管理者欄の初期値を検証 → 最後に id 指定で全削除。
 * 本物データには触れない（作成した行のみ id で削除）。
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
const OUT = path.join(process.cwd(), ".tmp", "property-fire-manager-pr2")
fs.mkdirSync(OUT, { recursive: true })
const manifest = { checks: [] }
function check(n, c, d = "") { manifest.checks.push({ name: n, pass: !!c, detail: d }); console.log(c ? "[PASS]" : "[FAIL]", n, d) }

const FM = "PR-fm2-防火 花子"          // 物件Aの防火管理者
const NOTIF_A = "PR-fm2-届出 太郎"       // 物件Aの届出者
const NOTIF_B = "PR-fm2-届出B 次郎"      // 物件Bの届出者（Aと別）
const SAVED = "PR-fm2-保存済 三郎"       // 保存済み bekki の fire_manager

// 防火管理者 Input（id 無し）を label の次の input として取得する xpath
const FM_INPUT_XPATH = `xpath=//label[normalize-space(.)="防火管理者"]/following-sibling::input[1]`

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 })
  await page.locator("#email").waitFor({ timeout: 30000 })
  await page.fill("#email", ENV.TEST_EMAIL)
  await page.fill("#password", ENV.TEST_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL("**/tool", { timeout: 60000 })
}

// Node 側で supabase-js をテストユーザーでサインインし、RLS 準拠で seed/cleanup する。
async function makeAuthedClient() {
  const supabase = createClient(ENV.NEXT_PUBLIC_SUPABASE_URL, ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await supabase.auth.signInWithPassword({ email: ENV.TEST_EMAIL, password: ENV.TEST_PASSWORD })
  if (error) throw new Error("signIn: " + error.message)
  return { supabase, uid: data.user.id }
}

async function seed(supabase, uid) {
  {
    const propBase = (name, fm, notif) => ({
      user_id: uid,
      name, address: "PR-fm2-県市1-2-3", usage_type: "(一)イ 劇場、映画館、演芸場又は観覧場",
      notifier_name: notif, notifier_address: "PR-fm2-県市1-2-3",
      building_name: name, building_address: "PR-fm2-県市4-5-6",
      building_usage: "(一)イ 劇場、映画館、演芸場又は観覧場",
      equipment_types: ["消火器", "連結送水管"],
      fire_manager_name: fm,
    })
    const { data: pA, error: eA } = await supabase.from("properties").insert(propBase("PR-fm2-ビルA", FM, NOTIF_A)).select("id").single()
    if (eA) throw new Error("propA: " + eA.message)
    const { data: pB, error: eB } = await supabase.from("properties").insert(propBase("PR-fm2-ビルB", null, NOTIF_B)).select("id").single()
    if (eB) throw new Error("propB: " + eB.message)

    const souBase = (propId, notif, bname) => ({
      user_id: uid, inspection_date: "2026-02-01", inspection_type: "機器・総合点検",
      notifier_address: "PR-fm2-県市1-2-3", notifier_name: notif,
      building_address: "PR-fm2-県市4-5-6", building_name: bname,
      building_usage: "(一)イ 劇場、映画館、演芸場又は観覧場", property_id: propId,
    })
    const { data: sA, error: esA } = await supabase.from("inspection_soukatsu").insert(souBase(pA.id, NOTIF_A, "PR-fm2-ビルA")).select("id").single()
    if (esA) throw new Error("souA: " + esA.message)
    const { data: sB, error: esB } = await supabase.from("inspection_soukatsu").insert(souBase(pB.id, NOTIF_B, "PR-fm2-ビルB")).select("id").single()
    if (esB) throw new Error("souB: " + esB.message)

    const itiran = (souId) => ({ user_id: uid, soukatsu_id: souId, inspector1: { name: "PR-fm2-点検 一郎" } })
    const { data: iA1, error: eiA1 } = await supabase.from("inspection_itiran").insert(itiran(sA.id)).select("id").single()
    if (eiA1) throw new Error("itiranA1: " + eiA1.message)
    const { data: iA2, error: eiA2 } = await supabase.from("inspection_itiran").insert(itiran(sA.id)).select("id").single()
    if (eiA2) throw new Error("itiranA2: " + eiA2.message)
    const { data: iB, error: eiB } = await supabase.from("inspection_itiran").insert(itiran(sB.id)).select("id").single()
    if (eiB) throw new Error("itiranB: " + eiB.message)

    // itiranA2 の standpipe(base) に保存済み fire_manager を入れる（saved 優先テスト用）
    const { error: ebk } = await supabase.from("inspection_standpipe_bekki20").insert({
      soukatsu_id: sA.id, itiran_id: iA2.id, property_id: pA.id,
      payload: { form_name: "PR-fm2-ビルA", fire_manager: SAVED, witness: "", location: "" },
    })
    if (ebk) throw new Error("savedBekki: " + ebk.message)

    return { uid, pA: pA.id, pB: pB.id, sA: sA.id, sB: sB.id, iA1: iA1.id, iA2: iA2.id, iB: iB.id }
  }
}

async function cleanup(supabase, ids) {
  const del = async (table, col, val) => { await supabase.from(table).delete().eq(col, val) }
  // FK 安全順: bekki → itiran → soukatsu → property
  await del("inspection_standpipe_bekki20", "itiran_id", ids.iA2)
  for (const it of [ids.iA1, ids.iA2, ids.iB]) await del("inspection_itiran", "id", it)
  for (const s of [ids.sA, ids.sB]) await del("inspection_soukatsu", "id", s)
  for (const p of [ids.pA, ids.pB]) await del("properties", "id", p)
  return true
}

async function fmValueAt(page, soukatsuId, itiranId, device) {
  await page.goto(`${BASE}/inspection/${soukatsuId}/itiran/${itiranId}/${device}`, { waitUntil: "domcontentloaded", timeout: 60000 })
  // 防火管理者欄が現れるまで待つ
  const input = page.locator(FM_INPUT_XPATH).first()
  try {
    await input.waitFor({ state: "visible", timeout: 45000 })
  } catch (e) {
    const diag = await page.evaluate(() => ({
      url: location.href,
      h1: document.querySelector("h1")?.textContent ?? null,
      hasFmLabel: [...document.querySelectorAll("label")].some((l) => l.textContent?.trim() === "防火管理者"),
      labelCount: document.querySelectorAll("label").length,
      inputCount: document.querySelectorAll("input").length,
      bodyHead: document.body.innerText.slice(0, 300),
    })).catch(() => ({ err: "evaluate failed" }))
    console.log(`[DIAG ${device}]`, JSON.stringify(diag))
    throw e
  }
  return await input.inputValue()
}

async function main() {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ja-JP" })
  const page = await context.newPage()
  page.on("dialog", (d) => d.accept().catch(() => {}))

  await login(page)

  const { supabase, uid } = await makeAuthedClient()

  let ids = null
  try {
    ids = await seed(supabase, uid)
    check("seed: テストデータ作成成功", !!ids && !!ids.pA, JSON.stringify(ids))

    // 1) 物件A（防火管理者あり）× standalone(shokaki) 未保存 → 物件の防火管理者
    const v1 = await fmValueAt(page, ids.sA, ids.iA1, "shokaki")
    check("standalone(shokaki): 物件の防火管理者が初期表示", v1 === FM, v1)

    // 2) 物件A × base(standpipe) 未保存 → 物件の防火管理者
    const v2 = await fmValueAt(page, ids.sA, ids.iA1, "standpipe")
    check("base(standpipe): 物件の防火管理者が初期表示", v2 === FM, v2)

    // 3) 物件A × base(standpipe) 保存済み(itiranA2) → 保存値（saved 優先・物件で上書きしない）
    const v3 = await fmValueAt(page, ids.sA, ids.iA2, "standpipe")
    check("base(standpipe): 保存済み fire_manager が優先（saved 維持）", v3 === SAVED, v3)

    // 4) 物件B（防火管理者なし）× standalone(shokaki) → 届出者名にフォールバック
    const v4 = await fmValueAt(page, ids.sB, ids.iB, "shokaki")
    check("standalone(shokaki): 防火管理者が空なら届出者名に後方互換フォールバック", v4 === NOTIF_B, v4)

    // 5) 物件B × base(standpipe) → 届出者名にフォールバック
    const v5 = await fmValueAt(page, ids.sB, ids.iB, "standpipe")
    check("base(standpipe): 防火管理者が空なら届出者名にフォールバック", v5 === NOTIF_B, v5)

    // 6) 入力して保存 → payload.fire_manager に値、構造不変（standpipe の upsert を傍受）
    await page.goto(`${BASE}/inspection/${ids.sA}/itiran/${ids.iA1}/standpipe`, { waitUntil: "domcontentloaded", timeout: 60000 })
    const fmInput = page.locator(FM_INPUT_XPATH).first()
    await fmInput.waitFor({ state: "visible", timeout: 30000 })
    let savedPayload = null
    await page.route("**/rest/v1/inspection_standpipe_bekki20**", async (route) => {
      const req = route.request()
      if (req.method() === "POST" || req.method() === "PATCH") {
        try { const b = JSON.parse(req.postData() || "null"); savedPayload = Array.isArray(b) ? b[0] : b } catch { /* noop */ }
        return route.fulfill({ status: 201, contentType: "application/json", body: "[]" })
      }
      return route.continue()
    })
    await fmInput.fill("PR-fm2-入力 四郎")
    await page.getByRole("button", { name: "DB保存" }).click()
    for (let i = 0; i < 30 && savedPayload === null; i++) await page.waitForTimeout(100)
    await page.unroute("**/rest/v1/inspection_standpipe_bekki20**")
    const pl = savedPayload?.payload ?? null
    check("保存: upsert payload.fire_manager = 入力値", pl && pl.fire_manager === "PR-fm2-入力 四郎", JSON.stringify(pl?.fire_manager))
    check("保存: payload 構造が従来どおり（witness/location/page1_rows を含む）",
      pl && "witness" in pl && "location" in pl && "page1_rows" in pl, pl ? Object.keys(pl).join(",") : "null")
  } finally {
    if (ids) {
      try { await cleanup(supabase, ids); console.log("[cleanup] done") } catch (e) { console.log("[cleanup] FAILED", e.message) }
    }
  }

  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8")
  await browser.close()
  const passed = manifest.checks.filter((c) => c.pass).length
  console.log(`\n=== checks: ${passed}/${manifest.checks.length} ===`)
  if (passed !== manifest.checks.length) process.exit(2)
}
main().catch((e) => { console.error("FATAL", e); try { fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2)) } catch {} process.exit(1) })
