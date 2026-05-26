/**
 * 点検フォーム画面 自動スクリーンショット（文字化け修復の検証用）
 *
 * 前提:
 *   - 開発サーバが起動していること（npm run dev → http://localhost:3000）
 *   - .env.local に以下を記載（認証情報はチャット/コードに残さない）:
 *       TEST_EMAIL / TEST_PASSWORD … 実在するテストユーザーの認証情報
 *
 * フロー:
 *   1. /login でサインイン
 *   2. /properties/new で全23設備を選択したテスト物件を作成（UI操作）
 *   3. /inspection/new?propertyId= で総括表を作成（UI操作）
 *   4. /inspection/{id}/itiran で点検者一覧を作成（UI操作）
 *   5. 23様式のフォーム画面を順に開きフルページ撮影
 *
 * 実行: node scripts/screenshot-forms.mjs
 * 出力: screenshots/bekkiNN_<slug>.png  +  screenshots/_manifest.json
 */
import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";

function readEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  const txt = fs.readFileSync(p, "utf8");
  const out = {};
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const ENV = readEnvLocal();
const BASE_URL = process.env.BASE_URL || ENV.BASE_URL || "http://localhost:3000";
// 認証情報は .env.local からのみ取得（チャット/コードには残さない）
const EMAIL = ENV.TEST_EMAIL || process.env.TEST_EMAIL;
const PASSWORD = ENV.TEST_PASSWORD || process.env.TEST_PASSWORD;
const OUT_DIR = path.join(process.cwd(), "screenshots");

if (!EMAIL || !PASSWORD) {
  console.error("ERROR: .env.local に TEST_EMAIL / TEST_PASSWORD を記載してください。");
  process.exit(1);
}

// --- 設備カテゴリの選択ラベル（property-form の EQUIPMENT_CATEGORIES と一致、23種） ---
const ALL_EQUIPMENT_LABELS = [
  "消火器", "屋内消火栓設備", "スプリンクラー設備", "水噴霧消火設備", "泡消火設備",
  "不活性ガス消火設備", "ハロゲン化物消火設備", "粉末消火設備", "屋外消火栓設備", "動力消防ポンプ設備",
  "自動火災報知設備", "ガス漏れ火災警報設備", "漏電火災警報器", "消防機関へ通報する火災報知設備", "非常警報器具・設備",
  "避難器具", "誘導灯及び誘導標識", "消防用水", "排煙設備", "連結散水設備",
  "連結送水管", "非常コンセント設備", "無線通信補助設備",
];

// --- 23様式の slug と様式番号（撮影順 = itiran-input-flow の表示順） ---
const FORMS = [
  { no: "1",    slug: "shokaki",                       title: "消火器（様式1）" },
  { no: "12",   slug: "leakage-fire-alarm",            title: "漏電火災警報器（様式12）" },
  { no: "13",   slug: "fire-department-notification",  title: "消防機関へ通報する火災報知設備（様式13）" },
  { no: "14",   slug: "emergency-alarm",               title: "非常警報器具・設備（様式14）" },
  { no: "15",   slug: "evacuation-equipment",          title: "避難器具（様式15）" },
  { no: "16",   slug: "guidance-lights-signs",         title: "誘導灯及び誘導標識（様式16）" },
  { no: "17",   slug: "fire-water",                    title: "消防用水（様式17）" },
  { no: "18",   slug: "smoke-control",                 title: "排煙設備（様式18）" },
  { no: "19",   slug: "connected-sprinkler",           title: "連結散水設備（様式19）" },
  { no: "20",   slug: "standpipe",                     title: "連結送水管（様式20）" },
  { no: "21",   slug: "emergency-power-outlet",        title: "非常コンセント設備（様式21）" },
  { no: "22",   slug: "radio-communication-support",   title: "無線通信補助設備（様式22）" },
  { no: "2",    slug: "shokasen",                      title: "屋内消火栓設備（様式2）" },
  { no: "3",    slug: "sprinkler",                     title: "スプリンクラー設備（様式3）" },
  { no: "4",    slug: "water-spray",                   title: "水噴霧消火設備（様式4）" },
  { no: "5",    slug: "foam",                          title: "泡消火設備（様式5）" },
  { no: "6",    slug: "inert-gas",                     title: "不活性ガス消火設備（様式6）" },
  { no: "7",    slug: "halogen",                       title: "ハロゲン化物消火設備（様式7）" },
  { no: "8",    slug: "powder",                        title: "粉末消火設備（様式8）" },
  { no: "9",    slug: "okugai-shokasen",               title: "屋外消火栓設備（様式9）" },
  { no: "10",   slug: "doryoku-pump",                  title: "動力消防ポンプ設備（様式10）" },
  { no: "11-1", slug: "jidou-kasai-houchi",            title: "自動火災報知設備（様式11の1）" },
  { no: "11-2", slug: "gas-leak-fire-alarm",           title: "ガス漏れ火災警報設備（様式11の2）" },
];

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const BUILDING_NAME = `点検フォーム検証物件_${stamp}`;

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const manifest = { building: BUILDING_NAME, baseUrl: BASE_URL, results: [] };

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: "ja-JP",
  });
  // 物件作成フォームは「設備設定」で有効化された設備のみチェックボックスを描画する。
  // 既定は7種のみなので、localStorage を全23設備に設定して全チェックボックスを表示させる。
  await context.addInitScript((types) => {
    try {
      localStorage.setItem("enabled_equipment_types", JSON.stringify(types));
    } catch {
      /* ignore */
    }
  }, ALL_EQUIPMENT_LABELS);
  const page = await context.newPage();

  // ---------- 1. ログイン ----------
  console.log("[1] ログイン...");
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
  console.log("    OK →", page.url());

  // ---------- 2. テスト物件作成（UI） ----------
  console.log("[2] テスト物件を作成...");
  await page.goto(`${BASE_URL}/properties/new`, { waitUntil: "networkidle" });
  await page.fill("#notifierName", "検証 太郎");
  await page.fill("#notifierAddress", "東京都千代田区丸の内一丁目1番1号");
  await page.fill("#notifierPhone", "03-1234-5678");
  await page.fill("#buildingName", BUILDING_NAME);
  await page.fill("#buildingUsage", "事務所");
  await page.fill("#buildingAddress", "東京都千代田区丸の内一丁目1番1号");
  // 全23設備チェック
  for (const label of ALL_EQUIPMENT_LABELS) {
    const cb = page.locator("label", { hasText: label }).locator('input[type="checkbox"]').first();
    if (!(await cb.isChecked())) await cb.check();
  }
  await page.click('button[type="submit"]');
  await page.waitForURL("**/properties", { timeout: 30000 });
  console.log("    物件保存 OK");

  // propertyId を一覧から取得
  await page.goto(`${BASE_URL}/properties`, { waitUntil: "networkidle" });
  const propLink = page.locator(`a[href^="/properties/"]`, { hasText: BUILDING_NAME }).first();
  await propLink.waitFor({ timeout: 15000 });
  const propHref = await propLink.getAttribute("href");
  const propertyId = propHref.split("/").pop();
  console.log("    propertyId =", propertyId);

  const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

  // ---------- 3. 総括表(soukatsu)作成（UI） ----------
  console.log("[3] 総括表を作成...");
  await page.goto(`${BASE_URL}/inspection/new?propertyId=${propertyId}`, { waitUntil: "networkidle" });
  await page.click('button[type="submit"]');
  // /inspection/new → /inspection/{uuid} への遷移を待つ（"new" を弾く）
  await page.waitForURL((u) => /\/inspection\/[0-9a-f-]{36}/.test(u.pathname), { timeout: 30000 });
  const soukatsuId = page.url().match(UUID_RE)[0];
  console.log("    soukatsuId =", soukatsuId);

  // ---------- 4. 点検者一覧(itiran)作成（UI） ----------
  console.log("[4] 点検者一覧を作成...");
  await page.goto(`${BASE_URL}/inspection/${soukatsuId}/itiran`, { waitUntil: "networkidle" });
  await page.click('button[type="submit"]');
  // /inspection/{id}/itiran → /inspection/{id}/itiran/{uuid} への遷移を待つ
  await page.waitForURL((u) => /\/itiran\/[0-9a-f-]{36}/.test(u.pathname), { timeout: 30000 });
  const itiranId = page.url().split("/itiran/")[1].match(UUID_RE)[0];
  console.log("    itiranId =", itiranId);

  // ---------- 5. 23様式を撮影 ----------
  console.log("[5] 23様式を撮影...");
  for (const f of FORMS) {
    const url = `${BASE_URL}/inspection/${soukatsuId}/itiran/${itiranId}/${f.slug}`;
    const fileName = `bekki${f.no}_${f.slug}.png`;
    const filePath = path.join(OUT_DIR, fileName);
    try {
      // Turbopack の初回オンデマンドコンパイルがあるため domcontentloaded + 余裕のある timeout
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
      const status = resp ? resp.status() : 0;
      // 404 / notFound 判定
      const is404 =
        status === 404 ||
        (await page.locator("text=This page could not be found").count()) > 0;
      if (is404) {
        console.log(`    [NG] 様式${f.no} ${f.slug} → 404`);
        await page.screenshot({ path: filePath, fullPage: true });
        manifest.results.push({ no: f.no, slug: f.slug, title: f.title, status: "404", file: fileName });
        continue;
      }
      // フォーム描画待ち（各様式は点検項目テーブルを描画する。form 要素は使わない）
      await page.locator("table").first().waitFor({ timeout: 60000 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: filePath, fullPage: true });
      console.log(`    [OK] 様式${f.no} ${f.slug} → ${fileName}`);
      manifest.results.push({ no: f.no, slug: f.slug, title: f.title, status: "ok", file: fileName });
    } catch (e) {
      console.log(`    [ERR] 様式${f.no} ${f.slug} → ${e.name}: ${e.message.split("\n")[0]}`);
      // エラーでも現状を撮影して記録
      await page.screenshot({ path: filePath, fullPage: true }).catch(() => {});
      manifest.results.push({ no: f.no, slug: f.slug, title: f.title, status: "error", file: fileName, error: e.message.split("\n")[0] });
    }
  }

  fs.writeFileSync(
    path.join(OUT_DIR, "_manifest.json"),
    JSON.stringify({ ...manifest, soukatsuId, itiranId, propertyId }, null, 2),
    "utf8",
  );

  await browser.close();
  const ok = manifest.results.filter((r) => r.status === "ok").length;
  console.log(`\n=== 完了: ${ok}/${FORMS.length} 様式 撮影 → ${OUT_DIR} ===`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
