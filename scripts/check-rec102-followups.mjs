// 録音 102 の残り（2026-10-20 夜）で直した所が保たれているか。
//
// ■ なぜ要るか（どれも PDF の検査・画像の照合では出ない）
//   1. 画面を移るとき何も変わらず、押せていないと思って何度も押していた（loading.tsx は一部の画面だけ）
//   2. 「次へ」・PDF のボタンが上にしか無く、長い画面を最後まで入れたあと上へ戻っていた（点検票・別記ハブ・総括表）
//   3. 点検者一覧表を直しても保存済みの点検票の点検者（氏名・所属会社・住所・TEL）には届かず、古い値のまま印字された。
//      総括表の画面の PDF だけ、点検実施責任者が常に空だった
//   4. 選ぶだけの欄: 一覧に無い用途の保存値で物件・総括表を保存できない／31 階以上・地下 6 階以上が選べず消える／
//      宛名の敬称を「敬称なし」にしても 1 文字打つたびに消防署長に戻る／日付の形でない以前の日付が空に見える
//   5. 総括表 PDF の判定欄: 「不良」も「良」の字を含むので、古いデータ・自由入力の「不良」が「良」に○を打っていた（2026-10-21）
//
// ■ 検査すること
//   ・src/lib/inspector-sync.ts と report-readiness を実際に動かす（比べ方・出力前の確認の注意）
//   ・上の 1〜4 の配線
//
// 使い方: node scripts/check-rec102-followups.mjs [--self-test]
import fs from "fs"
import path from "path"
import { pathToFileURL } from "url"
import ts from "typescript"

const ROOT = process.cwd()
const SELF_TEST = process.argv.includes("--self-test")
const OUT = path.join(ROOT, "tmp", SELF_TEST ? "rec102-selftest" : "rec102")
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8")
const FORMS = ["bekki-result-form-base", "shokaki-bekki1-form", "shokasen-bekki2-form", "sprinkler-bekki3-form", "water-spray-bekki4-form",
    "foam-bekki5-form", "inert-gas-bekki6-form", "halogen-bekki7-form", "powder-bekki8-form"].map((n) => `src/components/${n}.tsx`)
const F = {
    layout: "src/app/layout.tsx", nav: "src/components/navigation-progress.tsx", css: "src/app/globals.css",
    hub: "src/app/inspection/[id]/itiran/[itiranId]/page.tsx", soukatsu: "src/app/inspection/[id]/page.tsx",
    sync: "src/lib/inspector-sync.ts", readiness: "src/lib/report-readiness.ts", notice: "src/components/inspector-sync-notice.tsx",
    usage: "src/components/usage-select.tsx", floor: "src/components/floor-select.tsx", cover: "src/components/soukatsu-cover-inputs.tsx",
    license: "src/components/license-editor.tsx", device: "src/components/device-table-inputs.tsx",
    property: "src/components/property-form.tsx", sForm: "src/components/soukatsu-form.tsx", sEdit: "src/components/soukatsu-edit-form.tsx",
    equip: "src/lib/soukatsu-equipment.ts", soukatuRoute: "src/app/api/generate-soukatu-pdf/route.ts",
}

// ── src のモジュールを ts から動かす（@/ と相対の import をたどって一時ファイルに書く）
fs.mkdirSync(OUT, { recursive: true })
const done = new Map()
function transpile(abs, overrides) {
    const key = abs
    if (done.has(key)) return done.get(key)
    const rel = path.relative(path.join(ROOT, "src"), abs)
    const outPath = path.join(OUT, `m${done.size}_${rel.replace(/[\\/]/g, "_")}`.replace(/\.tsx?$/, ".mjs"))
    done.set(key, outPath)
    let src = overrides?.[path.relative(ROOT, abs).replace(/\\/g, "/")] ?? fs.readFileSync(abs, "utf8")
    const resolve = (spec, from) => {
        const base = spec.startsWith("@/") ? path.join(ROOT, "src", spec.slice(2)) : path.resolve(path.dirname(from), spec)
        for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c
        return null
    }
    src = src.replace(/from\s+"((?:@\/|\.)[^"]+)"/g, (whole, spec) => {
        const r = resolve(spec, abs)
        return r ? `from "${pathToFileURL(transpile(r, overrides)).href}"` : whole
    })
    const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
    fs.writeFileSync(outPath, js, "utf8")
    return outPath
}
async function load(file, overrides) {
    done.clear()
    return import(`${pathToFileURL(transpile(path.join(ROOT, file), overrides)).href}?v=${Date.now()}${Math.random()}`)
}

async function behaviour(overrides) {
    const problems = []
    const sync = await load(F.sync, overrides)
    const src = sync.itiranInspectorFields({ name: "鈴木 一郎", company: "株式会社見本防災", address: "大阪市北区1-2-3", tel: "06-1234-5678" })
    const eq = (got, want, label) => { if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`${F.sync}: ${label}: ${JSON.stringify(got)}（期待 ${JSON.stringify(want)}）`) }
    eq(sync.inspectorDiff({ name: "点検者　鈴木一郎", company: "株式会社見本防災", address: "大阪市北区１−２−３".replace(/−/g, "-"), tel: "06-1234-5678" }, src), [], "空白・全角半角・前置きの違いは同じ")
    eq(sync.inspectorDiff({ name: "鈴木 一郎", company: "旧社名", address: "", tel: "06-1234-5678" }, src), ["company", "address"], "違う欄と空の欄を挙げる")
    eq(sync.inspectorDiff({ name: "鈴木 一郎", company: "旧社名", address: "", tel: "" }, sync.itiranInspectorFields({ name: "鈴木 一郎", company: "", address: "", tel: "" })), [], "点検者一覧表が空の欄は比べない（空で上書きしない）")
    const rr = await load(F.readiness, overrides)
    const base = {
        soukatsu: { building_name: "x", building_address: "x", building_usage: "15項", floor_above: 3, notifier_name: "x", fire_department_name: "x", report_date: "2026-10-20", inspection_type: "機器点検", inspection_period_start: "2026-10-14", inspection_period_end: "2026-10-14", equipment_results: [] },
        itiran: { inspector1: { name: "鈴木 一郎", company: "株式会社見本防災", address: "大阪市北区1-2-3", phone: "06-1234-5678" } },
        stepIds: ["fire-water", "smoke-control"],
        bekkiPayloads: {
            "fire-water": { inspector_name: "鈴木 一郎", inspector_company: "旧社名", inspector_address: "大阪市北区1-2-3", inspector_tel: "06-1234-5678" },
            "smoke-control": { inspector_name: "鈴木 一郎", inspector_company: "株式会社見本防災", inspector_address: "大阪市北区1-2-3", inspector_tel: "06-1234-5678" },
        },
    }
    const w = rr.checkReportReadiness(base).warnings.filter((x) => x.id.startsWith("bekki_inspector:"))
    eq(w.map((x) => x.id), ["bekki_inspector:fire-water"], "出力前の確認: 点検者一覧表と違う点検票だけに注意")
    eq(w[0]?.details, ["所属会社"], "出力前の確認: 違う欄の名前")
    // 5. 総括表 PDF の判定欄（良に○を打つか）
    const equip = await load(F.equip, overrides)
    const cases = { "": true, "指摘なし": true, "良": true, "good": true, "要改善": false, "不良": false, "不良あり": false, "指摘あり": false, "否": false }
    eq(Object.fromEntries(Object.keys(cases).map((k) => [k, equip.isGoodResult(k)])), cases, "総括表の判定: 「不良」を「良」に数えない")
    return problems
}

function wiring(files) {
    const problems = []
    const has = (f, re, msg) => { if (!re.test(files[f])) problems.push(`${f}: ${msg}`) }
    // 1. 読み込み中
    has(F.layout, /<Suspense fallback=\{null\}>\s*<NavigationProgress \/>\s*<\/Suspense>/, "画面を移るときの「読み込み中」を出していない")
    has(F.nav, /window\.addEventListener\("click", onClick\)/, "クリックを泡立ち（bubble）の window で受けていない（leave-guard で断られたクリックにも出る／出ない）")
    has(F.nav, /if \(url\.origin !== location\.origin\) return/, "別のサイトへのリンクでも出す")
    has(F.nav, /url\.pathname === location\.pathname && url\.search === location\.search\) return/, "同じ画面（# だけ）でも出す")
    has(F.nav, /if \(shownUrl !== current\) \{\s*setShownUrl\(current\)\s*setPendingFrom\(null\)/, "画面が変わっても消えない")
    has(F.nav, /setTimeout\(\(\) => setPendingFrom\(null\), 15_000\)/, "出たまま消えないことがある（15 秒で消す）")
    has(F.css, /\.nav-progress \{\s*animation: nav-progress-in 0\.15s ease-out 0\.15s both;/, "すぐ切り替わるときにちらつく（0.15 秒待ってから出す）")
    // 2. 下にもボタン
    has(F.hub, /いちばん下にも主の CTA[\s\S]*?href=\{primaryCta\.href\}[\s\S]*?<ItiranPdfButton/, "別記ハブのいちばん下に主の CTA と点検者一覧の PDF が無い")
    has(F.soukatsu, /下にも PDF と「次へ」[\s\S]*?<SoukatsuPdfButton[\s\S]*?href=\{nextItiranHref\}/, "総括表の画面の下に PDF と「次へ」が無い")
    // 3. 点検者
    for (const f of FORMS) {
        has(f, /<InspectorSyncNotice\n\s*current=\{\{ name: inspectorName, company: inspectorCompany, address: inspectorAddress, tel: inspectorTel \}\}\n\s*fromItiran=\{\{ name: initial\.inspector_name, company: initial\.inspector_company, address: initial\.inspector_address, tel: initial\.inspector_tel \}\}/, "点検者一覧表と違うときの知らせが無い")
        has(f, /if \(next\.tel !== undefined\) setInspectorTel\(next\.tel\)/, "「点検者一覧表の内容に合わせる」で TEL を合わせない")
    }
    has(F.soukatsu, /inspector_responsible: \(itiranForName\?\.inspector1 as \{ name\?: string \} \| null\)\?\.name \?\? ""/, "総括表の画面の PDF の点検実施責任者が点検者一覧表の氏名でない（空）")
    if (/inspector_responsible: ""/.test(files[F.soukatsu])) problems.push(`${F.soukatsu}: 点検実施責任者を空に決め打ちしている`)
    // 4. 選ぶだけの欄
    has(F.usage, /<option value=\{OTHER\}>その他（一覧に無い用途を書く）<\/option>/, "用途に「その他（一覧に無い用途を書く）」が無い")
    has(F.usage, /const showOther = otherMode \|\| \(value !== "" && !known\)/, "一覧に無い保存値の用途を見せていない（保存できなくなる）")
    has(F.floor, /if \(value !== "" && Number\.isInteger\(n\) && !options\.includes\(n\)\) options\.push\(n\)/, "範囲の外の階数の保存値を消してしまう")
    for (const f of [F.property, F.sForm]) has(f, /min=\{1\}\n\s*max=\{80\}[\s\S]*min=\{0\}\n\s*max=\{10\}/, "階数の範囲が狭い（地上 80・地下 10 まで）")
    has(F.sEdit, /min=\{1\} max=\{80\} value=\{floorAbove\}[\s\S]*min=\{0\} max=\{10\} value=\{floorBelow\}/, "階数の範囲が狭い（地上 80・地下 10 まで）")
    has(F.cover, /const t = title === "" && name\.trim\(\) === "" && next\.trim\(\) !== "" \? FIRE_DEPARTMENT_TITLES\[0\] : title/, "宛名の敬称を「敬称なし」にしても 1 文字ごとに消防署長に戻る")
    if ((files[F.license].match(/\{legacyDateNote\((issueDate|expiryDate|trainingMonth), /g) ?? []).length !== 8) problems.push(`${F.license}: 免状の日付 8 か所で、日付の形でない保存値を見せていない`)
    if ((files[F.device].match(/type=\{isLegacyDate\(row\.calibrated_at\) \? "text" : "date"\}/g) ?? []).length !== 2) problems.push(`${F.device}: 校正年月日で、日付の形でない保存値を見せていない`)
    // 5. 総括表 PDF の判定欄は lib の判定を使う（ルートの中に「良」の字だけを見る判定を戻さない）
    has(F.soukatuRoute, /import \{ isGoodResult \} from "@\/lib\/soukatsu-equipment";/, "総括表の判定欄が lib の判定（「不良」を良に数えない）を使っていない")
    if (/includes\("良"\)/.test(files[F.soukatuRoute])) problems.push(`${F.soukatuRoute}: 「良」の字だけで判定している（「不良」も良になる）`)
    return problems
}

const files = Object.fromEntries([...Object.values(F), ...FORMS].map((f) => [f, read(f)]))

if (SELF_TEST) {
    const neg = [...await behaviour(), ...wiring(files)]
    if (neg.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of neg) console.log("   ", p)
        process.exit(1)
    }
    const mut = (f, from, to) => {
        const next = files[f].replace(from, to)
        if (next === files[f]) { console.log(`自己診断: 書き換えられない: ${f} ${String(from).slice(0, 50)}`); process.exit(1) }
        return { ...files, [f]: next }
    }
    const wm = [
        ["読み込み中を外す", mut(F.layout, "<NavigationProgress />", "{null}"), "読み込み中"],
        ["画面が変わっても消さない", mut(F.nav, "setPendingFrom(null)\n    }", "\n    }"), "消えない"],
        ["別記ハブの下の CTA を外す", mut(F.hub, "いちばん下にも主の CTA", "（なし）"), "別記ハブのいちばん下"],
        ["第3 の知らせを外す", mut(FORMS[3], "<InspectorSyncNotice\n", "<InspectorSyncNoticeX\n"), "知らせが無い"],
        ["総括表の点検実施責任者を空に戻す", mut(F.soukatsu, 'inspector_responsible: (itiranForName?.inspector1 as { name?: string } | null)?.name ?? ""', 'inspector_responsible: ""'), "点検実施責任者"],
        ["用途の「その他」を外す", mut(F.usage, "<option value={OTHER}>その他（一覧に無い用途を書く）</option>", ""), "その他"],
        ["範囲の外の階数を消す", mut(F.floor, "!options.includes(n)) options.push(n)", "!options.includes(n)) void n"), "範囲の外"],
        ["敬称を 1 文字ごとに付け直す", mut(F.cover, 'title === "" && name.trim() === "" && next.trim() !== ""', 'title === "" && next.trim() !== ""'), "消防署長に戻る"],
        ["校正年月日の文字の欄を外す", mut(F.device, 'type={isLegacyDate(row.calibrated_at) ? "text" : "date"}', 'type="date"'), "校正年月日"],
        ["総括表のルートに「良」だけの判定を戻す", mut(F.soukatuRoute, "drawJudgeCircle(page, pageHeight, isGoodResult(item.result),", 'drawJudgeCircle(page, pageHeight, String(item.result ?? "").includes("良"),'), "「良」の字だけで判定"],
    ]
    for (const [label, m, expect] of wm) {
        if (!wiring(m).some((x) => x.includes(expect))) { console.log(`自己診断: ${label} → 検出できない`); process.exit(1) }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    // 振る舞い: 比べ方を壊す・出力前の確認を外す
    const syncSrc = files[F.sync]
    const bm = [
        ["空白の違いを違いとみなす", { [F.sync]: syncSrc.replace('.replace(/\\s+/g, "")', "") }, "空白・全角半角"],
        ["点検者一覧表が空の欄も比べる", { [F.sync]: syncSrc.replace('.filter((k) => fromItiran[k] !== "" && ', ".filter((k) => ") }, "空の欄は比べない"],
        ["出力前の確認から外す", { [F.readiness]: files[F.readiness].replace("if (itiranInspector) {", "if (false) {") }, "点検者一覧表と違う点検票だけ"],
        ["「不良」を先に見ない", { [F.equip]: files[F.equip].replace("if (BAD_RESULT_WORDS.some((w) => t.includes(w))) return false", "") }, "「不良」を「良」に数えない"],
    ]
    for (const [label, ov, expect] of bm) {
        if (Object.entries(ov).some(([k, v]) => v === files[k])) { console.log(`自己診断: 書き換えられない: ${label}`); process.exit(1) }
        if (!(await behaviour(ov)).some((x) => x.includes(expect))) { console.log(`自己診断: ${label} → 検出できない`); process.exit(1) }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    console.log("  陰性対照: 読み込み中・下のボタン・点検者の知らせと確認・総括表の点検実施責任者・用途・階数・敬称・以前の日付・総括表の判定欄")
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const problems = [...await behaviour(), ...wiring(files)]
console.log("録音 102 の残りを検査: 読み込み中・下のボタン・点検者の知らせ・選ぶだけの欄・総括表の判定欄")
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("REC102_FOLLOWUPS_OK")
