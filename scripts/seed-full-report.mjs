// 実機テスト用に「全23様式が入った報告書」を1件シードする。
//
// ■ なぜ要るか
//   23様式を手で入力するのは現実的でない。一方で様式ごとに payload の構造が違う
//   （page1_rows / marks / device1,2 / summary_rows …）ので、推測で組むと
//   画面で開いたときに空になるか、PDFで落ちる。
//
// ■ 何を入れるか
//   scripts/generate-realistic-route-tests.mjs が作る「現実値payload」をそのまま入れる。
//   これは全25ルートについて「はみ出し0・切り詰め0・字形化け0」で検証済みの入力である。
//
//   ★DBの payload jsonb と PDFルートのPOSTボディは同じ形であることを確認済み（2026-07-25）。
//     bekki-result-form-base.tsx が同一の payload オブジェクトを
//     fetch(apiRoute, body) と supabase.from(dbTable).upsert({...payload}) の両方に渡している。
//     ＝ 変換不要で素通しでよい。この前提が崩れたら（フォーム側が整形して保存するように
//     なったら）ここも直すこと。
//
// ■ ★親2行（総括表・点検者一覧）は「素通し」できない
//   23様式は payload jsonb に素通しでよいが、この2つだけは実カラムに写す必要がある。
//   さらに現実値payload の soukatsu / itiran は汚染されている:
//   現実値ジェネレータがキー名 `name` を一律「圧力計」に置換するため、
//   equipment_results[].name（設備名）と inspector1.name（人名）まで「圧力計」になっている。
//   ＝ ここは payload をそのまま写さず、正しい値を組み立てる。
//   設備名の正典は src/lib/itiran-input-flow.ts の equipmentKeyword（23件）。
//   様式が23種類あるのに総括表の設備一覧が別内容だと、「点検したと書いてある設備」と
//   「様式が存在する設備」が食い違うので、23設備を全て列挙する。
//
// ■ ルート⇔テーブルの対応
//   src/lib/pdf-merge-config.ts の PDF_MERGE_CONFIG から読む。ハードコードしない
//   （report_form_tables() との23本一致は DB 側の drift テストが保証している）。
//
// ■ 冪等性
//   物件名 SEED_NAME で既存の soukatsu を探し、あれば作り直さず payload だけ入れ直す。
//   様式テーブルは UNIQUE(itiran_id) なので onConflict で上書きになる。
//
// 使い方:
//   node scripts/generate-realistic-route-tests.mjs   # 先に現実値payloadを作る
//   node scripts/seed-full-report.mjs                 # 投入（既定は dry-run）
//   node scripts/seed-full-report.mjs --apply
//
// 環境変数:
//   SEED_DB_URL       … postgres 接続文字列（必須）
//   SEED_USER_ID      … 所有者の auth.users.id（必須）
import fs from "fs"
import path from "path"
import { execFileSync } from "child_process"
import ts from "typescript"
import { pathToFileURL } from "url"

const APPLY = process.argv.includes("--apply")
const DB_URL = process.env.SEED_DB_URL
const USER_ID = process.env.SEED_USER_ID
const REAL_DIR = path.join(process.cwd(), "tmp", "pdf-realistic")

// 実機で探しやすく、後片付けの対象と分かる名前にする
const SEED_NAME = "【検証】全設備テストビル"
const SEED_ADDRESS = "大阪府大阪市北区天神西町8-19"
const INSPECTOR_NAME = "橋本 拓也"
const INSPECTOR_COMPANY = "株式会社検証防災"
// 今日直した字形化け（英字+ハイフン+数字）の回帰確認を実機でもできるようにする
const MODEL_NO = "PMP-9000-EX"

if (!DB_URL || !USER_ID) {
    console.error("SEED_DB_URL と SEED_USER_ID が要る")
    process.exit(2)
}
if (!fs.existsSync(REAL_DIR)) {
    console.error(`${REAL_DIR} が無い。先に node scripts/generate-realistic-route-tests.mjs`)
    process.exit(2)
}

/** psql をコンテナで実行する（ローカルに psql が無い前提） */
const psql = (sql, { file = null } = {}) => {
    const args = ["run", "--rm", "-i", "-e", `PGPASSWORD_UNUSED=1`]
    if (file) args.push("-v", `${path.resolve(file)}:/work/in.sql:ro`)
    args.push("postgres:16-alpine", "psql", DB_URL, "-v", "ON_ERROR_STOP=1", "-Atq")
    args.push(file ? "-f" : "-c", file ? "/work/in.sql" : sql)
    return execFileSync("docker", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
}

/** PDF_MERGE_CONFIG（TS）を読み込んで apiRoute⇔dbTable を得る */
const loadMergeConfig = async () => {
    const src = fs.readFileSync("src/lib/pdf-merge-config.ts", "utf8")
    // 型のみの import を落として単体で評価できるようにする
    const stripped = src.replace(/^import[^\n]*\n/gm, "").replace(/:\s*Record<[^=]*>/g, "")
    const js = ts.transpileModule(stripped, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText
    const out = path.join(process.cwd(), "tmp", "pdf-merge-config.seed.mjs")
    fs.writeFileSync(out, js)
    const mod = await import(pathToFileURL(out).href + `?t=${fs.statSync(out).mtimeMs}`)
    fs.unlinkSync(out)
    return mod.PDF_MERGE_CONFIG
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`
const qjson = (o) => `${q(JSON.stringify(o))}::jsonb`

/** 現実値payload に検証用の値を上書きする（様式ごとにキー名が違うので両方見る） */
const applySeedValues = (payload) => {
    const p = structuredClone(payload)
    const set = (k, v) => {
        if (k in p) p[k] = v
    }
    set("form_name", SEED_NAME)
    set("building_name", SEED_NAME)
    set("location", SEED_ADDRESS)
    set("building_address", SEED_ADDRESS)
    set("inspector_name", INSPECTOR_NAME)
    set("inspector_responsible", INSPECTOR_NAME)
    set("inspector_company", INSPECTOR_COMPANY)
    set("company", INSPECTOR_COMPANY)
    // 型式にあたる欄が1つでもあれば字形化けの回帰確認用の値を入れる
    for (const key of ["pump_model", "model", "device1"]) {
        if (key === "device1" && p.device1 && typeof p.device1 === "object" && "model" in p.device1) {
            p.device1.model = MODEL_NO
            break
        }
        if (key in p && typeof p[key] === "string") {
            p[key] = MODEL_NO
            break
        }
    }
    return p
}

/** 設備名の正典（itiran-input-flow.ts の equipmentKeyword）。ハードコードしない */
const loadEquipmentNames = () => {
    const src = fs.readFileSync("src/lib/itiran-input-flow.ts", "utf8")
    const names = [...src.matchAll(/id:\s*"[^"]+"[\s\S]{0,120}?equipmentKeyword:\s*"([^"]+)"/g)].map((m) => m[1])
    if (names.length !== 23) throw new Error(`設備名が23件でない: ${names.length}`)
    return names
}

/** 総括表の列（実カラム）。★payload を写すのではなく組み立てる（上のコメント参照） */
const buildSoukatsuColumns = (equipmentNames) => ({
    building_name: SEED_NAME,
    building_address: SEED_ADDRESS,
    building_usage: "特定防火対象物",
    building_structure: "鉄筋コンクリート造",
    floor_above: 5,
    floor_below: 1,
    total_floor_area: 2400.5,
    notifier_name: INSPECTOR_COMPANY,
    notifier_address: SEED_ADDRESS,
    notifier_phone: "06-6360-0001",
    inspection_type: "機器・総合",
    inspection_period_start: "2026-02-01",
    inspection_period_end: "2026-02-26",
    overall_judgment: "適",
    notes: "全設備の動作を確認。指摘事項なし。",
    // 様式が23種類あるのだから、点検した設備も23件そろえる（食い違いを作らない）
    equipment_results: equipmentNames.map((name, i) =>
        i === 2
            ? { name, result: "要改善", bad_detail: "接続部緩み", action: "締め直し" }
            : { name, result: "指摘なし" },
    ),
})

/** 点検者一覧の inspector1/2。構造は現実値payloadと実DBで一致しているので流用し、
 *  汚染されている name（「圧力計」になっている）だけ人名に直す。 */
const buildInspectors = (itiranPayload) => {
    const fix = (insp, name) => {
        if (!insp || typeof insp !== "object") return null
        const p = structuredClone(insp)
        p.name = name
        p.company = INSPECTOR_COMPANY
        p.address = SEED_ADDRESS
        return p
    }
    return {
        inspector1: fix(itiranPayload.inspector1, INSPECTOR_NAME),
        inspector2: fix(itiranPayload.inspector2, "検証 次郎"),
    }
}

const config = await loadMergeConfig()
const entries = Object.entries(config)
console.log(`PDF_MERGE_CONFIG: ${entries.length} 様式`)

// 現実値payload を apiRoute で引けるようにする。
// ★.job.json（routePath を持つ）は長文セットの出力先にあり、現実値ディレクトリには無い。
//   現実値の payload はファイル名（bekki1_test.payload.json）でしか様式が分からないので、
//   tmp/ 全体から同名の .job.json を探して routePath を得る。
function* findJobs(dir = path.join(process.cwd(), "tmp")) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) yield* findJobs(p)
        else if (e.name.endsWith(".job.json")) yield p
    }
}
const jobByName = new Map()
for (const j of findJobs()) {
    jobByName.set(path.basename(j).replace(/\.job\.json$/, ""), JSON.parse(fs.readFileSync(j, "utf8")).routePath)
}
const byRoute = new Map()
for (const f of fs.readdirSync(REAL_DIR)) {
    if (!f.endsWith(".payload.json")) continue
    const name = f.replace(/\.payload\.json$/, "")
    const routePath = jobByName.get(name)
    if (!routePath) continue
    const apiRoute = "/api/" + path.basename(path.dirname(routePath))
    byRoute.set(apiRoute, JSON.parse(fs.readFileSync(path.join(REAL_DIR, f), "utf8")))
}

const missing = entries.filter(([, cfg]) => !byRoute.has(cfg.apiRoute)).map(([id]) => id)
if (missing.length) {
    console.error(`現実値payloadが無い様式: ${missing.join(", ")}`)
    console.error("先に node scripts/generate-realistic-route-tests.mjs を実行すること")
    process.exit(2)
}
console.log(`現実値payload: ${byRoute.size} 件（うち様式 ${entries.length} 件を使う）`)

if (!APPLY) {
    console.log("\n--apply が無いので投入しない（dry-run）")
    for (const [id, cfg] of entries) console.log(`  ${id.padEnd(28)} → ${cfg.dbTable}`)
    process.exit(0)
}

// 1つのトランザクションで入れる（途中で失敗したら何も残さない）
const equipmentNames = loadEquipmentNames()
const soukatsu = buildSoukatsuColumns(equipmentNames)
const itiranPayload = byRoute.get("/api/generate-itiran-pdf")
if (!itiranPayload) {
    console.error("点検者一覧の現実値payloadが無い")
    process.exit(2)
}
const inspectors = buildInspectors(itiranPayload)

const sql = []
sql.push("begin;")
sql.push(`
create temporary table _seed_ids (k text primary key, v uuid) on commit drop;

with existing as (
  select id from inspection.properties
   where user_id = ${q(USER_ID)} and name = ${q(SEED_NAME)} limit 1
), ins as (
  insert into inspection.properties (user_id, name, address, usage_type)
  select ${q(USER_ID)}, ${q(SEED_NAME)}, ${q(SEED_ADDRESS)}, ${q(soukatsu.building_usage)}
   where not exists (select 1 from existing)
  returning id
)
insert into _seed_ids (k, v)
select 'property', coalesce((select id from existing), (select id from ins));

-- 総括表は全列を埋める。★ここが空だと「点検を行った消防用設備等」の一覧が空のPDFになる
with existing as (
  select id from inspection.inspection_soukatsu
   where user_id = ${q(USER_ID)} and building_name = ${q(SEED_NAME)} limit 1
), ins as (
  insert into inspection.inspection_soukatsu
    (user_id, property_id, building_name, building_address, building_usage, building_structure,
     floor_above, floor_below, total_floor_area,
     notifier_name, notifier_address, notifier_phone,
     inspection_type, inspection_date, inspection_period_start, inspection_period_end,
     equipment_results, overall_judgment, notes)
  select ${q(USER_ID)}, (select v from _seed_ids where k='property'),
         ${q(soukatsu.building_name)}, ${q(soukatsu.building_address)}, ${q(soukatsu.building_usage)},
         ${q(soukatsu.building_structure)}, ${soukatsu.floor_above}, ${soukatsu.floor_below},
         ${soukatsu.total_floor_area},
         ${q(soukatsu.notifier_name)}, ${q(soukatsu.notifier_address)}, ${q(soukatsu.notifier_phone)},
         ${q(soukatsu.inspection_type)}, current_date,
         ${q(soukatsu.inspection_period_start)}::date, ${q(soukatsu.inspection_period_end)}::date,
         ${qjson(soukatsu.equipment_results)}, ${q(soukatsu.overall_judgment)}, ${q(soukatsu.notes)}
   where not exists (select 1 from existing)
  returning id
)
insert into _seed_ids (k, v)
select 'soukatsu', coalesce((select id from existing), (select id from ins));

-- 冪等: 既存行だったときも欠けている列を埋め直す（前回は最小限しか入れていなかった）
update inspection.inspection_soukatsu set
  property_id = (select v from _seed_ids where k='property'),
  building_structure = ${q(soukatsu.building_structure)},
  floor_above = ${soukatsu.floor_above},
  floor_below = ${soukatsu.floor_below},
  total_floor_area = ${soukatsu.total_floor_area},
  notifier_phone = ${q(soukatsu.notifier_phone)},
  inspection_type = ${q(soukatsu.inspection_type)},
  inspection_period_start = ${q(soukatsu.inspection_period_start)}::date,
  inspection_period_end = ${q(soukatsu.inspection_period_end)}::date,
  equipment_results = ${qjson(soukatsu.equipment_results)},
  overall_judgment = ${q(soukatsu.overall_judgment)},
  notes = ${q(soukatsu.notes)},
  updated_at = now()
where id = (select v from _seed_ids where k='soukatsu');

with existing as (
  select id from inspection.inspection_itiran
   where soukatsu_id = (select v from _seed_ids where k='soukatsu') limit 1
), ins as (
  insert into inspection.inspection_itiran (user_id, soukatsu_id)
  select ${q(USER_ID)}, (select v from _seed_ids where k='soukatsu')
   where not exists (select 1 from existing)
  returning id
)
insert into _seed_ids (k, v)
select 'itiran', coalesce((select id from existing), (select id from ins));

-- 点検者一覧。★ここが null だと別記様式第3号（点検者一覧表）が空になる
update inspection.inspection_itiran set
  inspector1 = ${qjson(inspectors.inspector1)},
  inspector2 = ${qjson(inspectors.inspector2)},
  updated_at = now()
where id = (select v from _seed_ids where k='itiran');
`)

for (const [, cfg] of entries) {
    const payload = applySeedValues(byRoute.get(cfg.apiRoute))
    sql.push(`
insert into inspection.${cfg.dbTable} (soukatsu_id, itiran_id, property_id, payload)
values ((select v from _seed_ids where k='soukatsu'),
        (select v from _seed_ids where k='itiran'),
        (select v from _seed_ids where k='property'),
        ${qjson(payload)})
on conflict (itiran_id) do update set payload = excluded.payload, updated_at = now();`)
}

sql.push(`
select 'property_id=' || (select v from _seed_ids where k='property');
select 'soukatsu_id=' || (select v from _seed_ids where k='soukatsu');
select 'itiran_id='   || (select v from _seed_ids where k='itiran');
commit;`)

const sqlFile = path.join(process.cwd(), "tmp", "_seed-full-report.sql")
fs.writeFileSync(sqlFile, sql.join("\n"), "utf8")
const out = psql(null, { file: sqlFile })
fs.unlinkSync(sqlFile)
console.log(out.trim())
console.log("\nSEED_DONE")
