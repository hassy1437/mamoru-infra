// 確定前・出力前の不備チェック（src/lib/report-readiness.ts）が、決めたとおりに必須と注意を分けるかを検査する（2026-10-19・打合せ #101）。
//
// ■ なぜ要るか
//   確定の前に見ていたのは総括表の入力画面の HTML の required だけで、複製・転記・編集で空になった欄のまま
//   確定（＝利用料・業者都合では取り消せない）まで進めた。DB（finalize_soukatsu）は止めない方針なので、
//   ★画面の確定ボタンが唯一の止め口になる。ここが黙って緩むと、空欄の報告書がまた確定される。
//
// ■ 検査すること（★関数を実際に動かす。ソースの写しは検査しない）
//   1. 全部入っている → 確定できる・注意 0 件
//   2. 必須（届出者の氏名・住所／名称／所在地／用途／延べ面積／地上階数／点検年月日）を 1 つずつ空にする → その 1 つだけが必須で出て確定できない
//      ・空白だけ・null・キーが無い も空 ／ 延べ面積 0 は空・文字の数は数として読む ／ 地上階数 0 は通す
//   3. 設備: 0 件・名前が空の行だけ → 必須で止める（DB の normalize_equipment_codes と同じ数え方）
//   4. 注意は止めない: 総括表の「要改善」で不良内容が空／別記の「否」で不良内容が空（見出し行は数えない）／
//      点検者1の氏名・資格（★itiran を渡したときだけ）／未入力の様式
//   5. 直す画面のリンク（総括表の欄・点検者一覧・様式）
//   6. 呼び出し側: 総括表の確認画面がプレビュー → 確定前の確認 → 確定のボタンの順に並べ、空の必須を確定のボタンに渡す。
//      確定のボタンが押せなくなる。出力画面が点検者・別記まで渡す。共通の別記フォームが基本情報を畳める
//
// 使い方: node scripts/check-report-readiness.mjs [--self-test]
import fs from "fs"
import path from "path"
import { pathToFileURL } from "url"
import ts from "typescript"

const ROOT = process.cwd()
const SELF_TEST = process.argv.includes("--self-test")
// ★自己診断と本番で出力先を分ける（check-pdf-all は並列に走らせる）
const OUT = path.join(ROOT, "tmp", SELF_TEST ? "report-readiness-selftest" : "report-readiness")
const MODULES = ["report-readiness", "bekki-row-labels", "bekki-heading-row", "pdf-merge-config", "itiran-input-flow", "inspector-helpers", "bekki-default-good", "inspector-sync", "bekki-form-normalization", "bekki-header-normalization"]
const LIB = "src/lib/report-readiness.ts"
const PAGE = "src/app/inspection/[id]/page.tsx"
const OUTPUT = "src/app/inspection/[id]/itiran/[itiranId]/output/page.tsx"
const BUTTON = "src/components/finalize-soukatsu-button.tsx"
const BOX = "src/components/report-readiness-box.tsx"
const BASE = "src/components/bekki-result-form-base.tsx"
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8")

/** src/lib の TS を JS にして、@/lib と ./ の import を同じフォルダの .mjs に向け直す（src で中身を差し替えられる） */
async function load(src) {
    fs.mkdirSync(OUT, { recursive: true })
    const tag = Date.now() + Math.random().toString(36).slice(2, 6)
    for (const name of MODULES) {
        let js = ts.transpileModule(src(`src/lib/${name}.ts`), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
        js = js.replace(/from\s+"@\/lib\/([\w-]+)"/g, (_, m) => `from "./${m}.${tag}.mjs"`).replace(/from\s+"\.\/([\w-]+)"/g, (_, m) => `from "./${m}.${tag}.mjs"`)
        fs.writeFileSync(path.join(OUT, `${name}.${tag}.mjs`), js, "utf8")
    }
    return {
        lib: await import(pathToFileURL(path.join(OUT, `report-readiness.${tag}.mjs`)).href),
        labels: (await import(pathToFileURL(path.join(OUT, `bekki-row-labels.${tag}.mjs`)).href)).BEKKI_ROW_LABELS,
    }
}

const COMPLETE = {
    id: "s1", property_id: "p1",
    notifier_name: "山田太郎", notifier_address: "東京都千代田区1-1",
    building_name: "テストビル", building_address: "東京都千代田区2-2", building_usage: "（15）項",
    total_floor_area: 1200.5, floor_above: 5, floor_below: 1, inspection_date: "2026-10-19", report_date: "2026-10-20",
    equipment_results: [{ name: "消火器", result: "指摘なし" }, { name: "避難器具", result: "要改善", bad_detail: "標識の汚損" }],
}
const ITIRAN_OK = { inspector1: { name: "点検太郎", phone: "06-1234-5678", shoubou_licenses: { class6: { license_number: "第123号" } } } }
const STEP = "evacuation-equipment" // 別記15: その1 26 行・その2 27 行（23 が見出し「総合点検」）
const rows = (n, f = () => ({ judgment: "良" })) => Array.from({ length: n }, (_, i) => f(i))
// ★別記の頭の点検者は点検者一覧表の点検者 1 と同じにしておく（違うと bekki_inspector の注意が出る・録音 102）
const HEAD = { inspector_name: "点検太郎", inspector_tel: "06-1234-5678" }
const BEKKI_OK = { [STEP]: { ...HEAD, page1_rows: rows(26), page2_rows: rows(27) } }

const ids = (list) => list.map((r) => r.id)
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

function behaviour({ lib, labels }) {
    const problems = []
    const f = lib.checkReportReadiness
    if (typeof f !== "function") return ["checkReportReadiness が無い"]
    const full = (over = {}) => f({ soukatsu: COMPLETE, itiran: ITIRAN_OK, bekkiPayloads: BEKKI_OK, stepIds: [STEP], ...over })

    // 1. 全部入っている
    const ok = full()
    if (!ok.canFinalize || ok.missing.length || ok.warnings.length) problems.push(`全部入っている: 確定できて注意 0 件のはずが canFinalize=${ok.canFinalize} 必須=${ids(ok.missing)} 注意=${ids(ok.warnings)}`)
    if (ok.required.length !== 9 || ok.required.some((r) => !r.ok)) problems.push(`全部入っている: 必須のチェックリストが 9 項目すべて ok でない（${ok.required.length} 項目）`)

    // 2. 必須を 1 つずつ空にする
    const cols = lib.READINESS_REQUIRED_COLUMNS ?? []
    const WANT_COLS = ["notifier_name", "notifier_address", "building_name", "building_address", "building_usage", "total_floor_area", "floor_above", "inspection_date"]
    if (!same([...cols].sort(), [...WANT_COLS].sort())) problems.push(`必須の欄が決めたものと違う: ${JSON.stringify(cols)}`)
    for (const col of WANT_COLS) {
        for (const [how, value] of [["null", null], ["空文字", ""], ["空白だけ", "　 "], ["キーが無い", undefined]]) {
            const s = { ...COMPLETE }
            if (value === undefined) delete s[col]
            else s[col] = value
            const r = full({ soukatsu: s })
            if (r.canFinalize || !same(ids(r.missing), [col])) problems.push(`${col} が${how}: 必須で ${col} だけを出して止めるはずが canFinalize=${r.canFinalize} 必須=${ids(r.missing)}`)
        }
    }
    const notifier = full({ soukatsu: { ...COMPLETE, notifier_name: "" } })
    if (notifier.missing[0]?.label !== "届出者の氏名" || notifier.missing[0]?.fix?.anchor !== "notifierName") problems.push("届出者の氏名が空: 表記か直す欄（notifierName）が違う")
    const numCases = [
        ["延べ面積 0", { total_floor_area: 0 }, ["total_floor_area"]],
        ["延べ面積が文字の数", { total_floor_area: "850.25" }, []],
        ["延べ面積が数でない", { total_floor_area: "abc" }, ["total_floor_area"]],
        ["地上階数 0（地下だけの建物）", { floor_above: 0 }, []],
        ["地上階数が文字の数", { floor_above: "3" }, []],
    ]
    for (const [label, over, want] of numCases) {
        const r = full({ soukatsu: { ...COMPLETE, ...over } })
        if (!same(ids(r.missing), want)) problems.push(`${label}: 必須は ${JSON.stringify(want)} のはずが ${JSON.stringify(ids(r.missing))}`)
    }

    // 3. 設備
    for (const [label, value] of [["0 件", []], ["名前が空の行だけ", [{ name: "", result: "指摘なし" }, { name: "  " }]], ["null", null], ["配列でない", "消火器"]]) {
        const r = full({ soukatsu: { ...COMPLETE, equipment_results: value } })
        if (r.canFinalize || !same(ids(r.missing), ["equipment"])) problems.push(`設備が${label}: 必須で止めるはずが canFinalize=${r.canFinalize} 必須=${ids(r.missing)}`)
    }
    const noProp = full({ soukatsu: { ...COMPLETE, property_id: null, equipment_results: [] } })
    if (noProp.missing[0]?.fix !== null) problems.push("物件の無い総括表で設備が 0 件: 直す画面（物件）が無いのにリンクを出している")

    // 4. 注意は止めない
    const warnCase = (label, over, wantIds, check) => {
        const r = full(over)
        if (!r.canFinalize) problems.push(`${label}: 注意なのに確定を止めている`)
        if (!same(ids(r.warnings), wantIds)) problems.push(`${label}: 注意は ${JSON.stringify(wantIds)} のはずが ${JSON.stringify(ids(r.warnings))}`)
        else if (check) check(r)
    }
    const s15 = labels["別記様式第15"]
    warnCase("別記の「否」で不良内容が空", { bekkiPayloads: { [STEP]: { ...HEAD, page1_rows: rows(26, (i) => (i === 3 ? { judgment: "否", bad_content: " " } : { judgment: "良" })), page2_rows: rows(27) } } },
        [`bekki_bad_content:${STEP}`], (r) => {
            const want = `その1「${s15.page1_rows[3]}」`
            if (r.warnings[0].details[0] !== want) problems.push(`別記の「否」で不良内容が空: 行の名前が ${JSON.stringify(r.warnings[0].details[0])}（期待 ${JSON.stringify(want)}）`)
            if (r.warnings[0].fix?.kind !== "bekki" || r.warnings[0].fix?.stepId !== STEP) problems.push("別記の「否」で不良内容が空: 直す画面がその様式でない")
        })
    warnCase("別記の「否」で不良内容あり", { bekkiPayloads: { [STEP]: { ...HEAD, page1_rows: rows(26, (i) => (i === 3 ? { judgment: "否", bad_content: "降下空間に障害物" } : { judgment: "良" })), page2_rows: rows(27) } } }, [])
    warnCase("見出し行（総合点検）に「否」", { bekkiPayloads: { [STEP]: { ...HEAD, page1_rows: rows(26), page2_rows: rows(27, (i) => (i === 23 ? { judgment: "否" } : { judgment: "良" })) } } }, [])
    warnCase("「否」の行が多い", { bekkiPayloads: { [STEP]: { ...HEAD, page1_rows: rows(26, () => ({ judgment: "否" })), page2_rows: rows(27) } } }, [`bekki_bad_content:${STEP}`], (r) => {
        if (r.warnings[0].details.length !== 6 || !/^ほか 21 件$/.test(r.warnings[0].details[5])) problems.push(`「否」の行が多い: 先頭 5 行＋「ほか 21 件」のはずが ${JSON.stringify(r.warnings[0].details.slice(5))}`)
    })
    warnCase("総括表の「要改善」で不良内容が空", { soukatsu: { ...COMPLETE, equipment_results: [{ name: "消火器", result: "指摘なし" }, { name: "避難器具", result: "要改善", bad_detail: "  " }] } },
        ["soukatsu_bad_detail"], (r) => {
            if (!same(r.warnings[0].details, ["避難器具"])) problems.push(`総括表の「要改善」: 設備名が ${JSON.stringify(r.warnings[0].details)}`)
        })
    warnCase("点検者1が空", { itiran: { inspector1: null } }, ["inspector1_name", "inspector1_license", "inspector1_phone"])
    warnCase("点検者1の資格が無い", { itiran: { inspector1: { name: "点検太郎", phone: "06-1234-5678" } } }, ["inspector1_license"])
    warnCase("点検者1の資格は点検資格者の免状", { itiran: { inspector1: { name: "点検太郎", phone: "06-1234-5678", kensa_licenses: { class1: { issue_year: "2020" } } } } }, [])
    // ★電話番号・報告年月日（2026-10-20・録音 102）。どちらも赤で目立たせる（urgent）・止めない
    warnCase("点検者1の電話番号が無い", { itiran: { inspector1: { ...ITIRAN_OK.inspector1, phone: " " } } }, ["inspector1_phone"], (r) => {
        if (r.warnings[0].urgent !== true) problems.push("点検者1の電話番号が無い: 赤で目立たせていない（urgent）")
        if (r.warnings[0].fix?.kind !== "itiran") problems.push("点検者1の電話番号が無い: 直す画面が点検者一覧表でない")
    })
    warnCase("報告年月日が空", { soukatsu: { ...COMPLETE, report_date: null } }, ["report_date"], (r) => {
        if (r.warnings[0].urgent !== true) problems.push("報告年月日が空: 赤で目立たせていない（urgent）")
        if (r.warnings[0].fix?.kind !== "soukatsu" || r.warnings[0].fix?.anchor !== "reportDate") problems.push("報告年月日が空: 直す画面が総括表の報告年月日でない")
    })
    warnCase("★赤で目立たせるのは決めた 4 つだけ（「否」の不良内容は黄色のまま）", { bekkiPayloads: { [STEP]: { ...HEAD, page1_rows: rows(26, (i) => (i === 3 ? { judgment: "否" } : { judgment: "良" })), page2_rows: rows(27) } } }, [`bekki_bad_content:${STEP}`], (r) => {
        if (r.warnings[0].urgent) problems.push("「否」の不良内容まで赤にしている（赤は点検者の氏名・資格・電話番号と報告年月日だけ）")
    })
    warnCase("★点検者一覧を渡さない（確定の前）", { itiran: undefined }, [])
    warnCase("未入力の様式", { bekkiPayloads: {} }, [`bekki_missing:${STEP}`])
    // ★判定の初期値「良」（2026-10-20・録音 102）: 確かめるまで知らせる・止めない・確かめたら消える
    warnCase("判定が初期値のまま", { bekkiPayloads: { [STEP]: { ...BEKKI_OK[STEP], judgments_defaulted: true } } }, [`bekki_defaulted:${STEP}`], (r) => {
        if (r.warnings[0].fix?.kind !== "bekki" || r.warnings[0].fix?.stepId !== STEP) problems.push("判定が初期値のまま: 直す画面がその様式でない")
    })
    warnCase("判定の初期値を確かめた", { bekkiPayloads: { [STEP]: { ...BEKKI_OK[STEP], judgments_defaulted: false } } }, [])
    warnCase("★印が文字の \"true\"（読み違えない）", { bekkiPayloads: { [STEP]: { ...BEKKI_OK[STEP], judgments_defaulted: "true" } } }, [])
    // ★点検者一覧表をあとで直しても、保存済みの別記の点検者には届かない（src/lib/inspector-sync.ts）。黄色で知らせる（止めない）
    warnCase("別記の点検者が点検者一覧表と違う", { bekkiPayloads: { [STEP]: { ...BEKKI_OK[STEP], inspector_name: "前の人" } } }, [`bekki_inspector:${STEP}`])
    warnCase("点検者一覧表の空の欄とは比べない", { bekkiPayloads: { [STEP]: { ...BEKKI_OK[STEP], inspector_company: "前の会社" } } }, [])
    warnCase("★別記を渡さない（確定の前）", { bekkiPayloads: undefined, stepIds: undefined }, [])
    const beforeFinalize = f({ soukatsu: COMPLETE })
    if (!beforeFinalize.canFinalize || beforeFinalize.warnings.length) problems.push(`確定の前（総括表だけ）: 注意 0 件で確定できるはずが ${ids(beforeFinalize.warnings)}`)

    // 5. リンク
    const href = lib.readinessFixHref
    const ctx = { soukatsuId: "s1", itiranId: "i1", propertyId: "p1" }
    const hrefs = [
        [{ kind: "soukatsu", anchor: "notifierName" }, ctx, "/inspection/s1/edit#notifierName"],
        [{ kind: "itiran" }, ctx, "/inspection/s1/itiran/i1/edit"],
        [{ kind: "itiran" }, { soukatsuId: "s1", itiranId: null }, null],
        [{ kind: "bekki", stepId: STEP }, ctx, `/inspection/s1/itiran/i1/${STEP}`],
        [{ kind: "property" }, ctx, "/properties/p1/edit"],
        [null, ctx, null],
    ]
    for (const [fix, c, want] of hrefs) {
        const got = typeof href === "function" ? href(fix, c) : undefined
        if (got !== want) problems.push(`リンク ${JSON.stringify(fix)}: ${JSON.stringify(got)}（期待 ${JSON.stringify(want)}）`)
    }
    return problems
}

function wiring(src) {
    const problems = []
    const page = src(PAGE)
    const at = (s) => page.indexOf(s)
    if (!page.includes("checkReportReadiness({ soukatsu: report })")) problems.push("総括表の確認画面が確定前の確認を総括表だけで呼んでいない（点検者・別記は確定のあとに入れるのが普通）")
    if (!page.includes("missingRequired={readiness.missing.map((m) => m.label)}")) problems.push("総括表の確認画面が空の必須を確定のボタンに渡していない（押せてしまう）")
    const preview = at("<SoukatsuPdfPreview"), box = at("<ReportReadinessBox"), button = at("<FinalizeSoukatsuButton")
    if (preview < 0 || box < 0 || button < 0 || !(preview < box && box < button)) problems.push("総括表の確認画面の並びが プレビュー → 確定前の確認 → 確定のボタン でない（内容を見る前に確定を押せる）")
    const btn = src(BUTTON)
    if (!/const blockedByReadiness = missingRequired\.length > 0/.test(btn) || !/disabled=\{blockedByReadiness\}/.test(btn)) problems.push("確定のボタンが空の必須で押せなくなっていない")
    if (!/\{open && !blockedByReadiness && \(/.test(btn)) problems.push("確定のボタン: 空の必須があっても確定の確認が開く")
    if (!/if \(blockedNotice\) return blockedNotice/.test(btn)) problems.push("確定のボタン: 解約・契約なしの案内が消えた")
    const out = src(OUTPUT)
    if (!out.includes("checkReportReadiness({ soukatsu, itiran, bekkiPayloads, stepIds: applicableStepIds })")) problems.push("出力画面が点検者・別記まで渡していない")
    // ★未確定で確定のボタンをこの画面に置くときは「確定前の確認」（2026-10-19・通しチェック D）
    if (!/<ReportReadinessBox[\s\S]*?mode=\{needsFinalizeOnOutput\(finalization\) \? "finalize" : "review"\}/.test(out)) problems.push("出力画面に出力前の確認が無い")
    if (!/min-h-11/.test(src(BOX))) problems.push("確定前の確認のリンクが押しにくい（高さ 44px 未満）")
    // ★足りない項目（urgent）は赤い枠・点滅する印で出す（2026-10-20・録音 102）
    const boxSrc = src(BOX)
    if (!boxSrc.includes("warnings.filter((w) => w.urgent)") || !/border-red-400[\s\S]*?motion-safe:animate-pulse/.test(boxSrc)) problems.push("確定前の確認: 足りない項目を赤い枠・点滅する印で出していない")
    if (!/"urgent" in item && item\.urgent \?/.test(out)) problems.push("出力画面: 足りない項目のある書類に赤い印を出していない")
    const base = src(BASE)
    if (!/useState\(\(\) => basicInfoBlank\.length > 0\)/.test(base)) problems.push("共通の別記フォーム: 基本情報が入っていても最初から開いている（判定表が下に押し出される）")
    if ((base.match(/hidden=\{!basicInfoOpen\}/g) ?? []).length !== 3) problems.push("共通の別記フォーム: 基本情報の 3 段がそろって畳まれない")
    return problems
}

const inspect = async (src) => {
    let mod
    try {
        mod = await load(src)
    } catch (e) {
        return [`${LIB} を読み込めない: ${e.message}`]
    }
    return [...behaviour(mod), ...wiring(src)]
}

if (SELF_TEST) {
    const neg = await inspect(read)
    if (neg.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of neg) console.log("   ", p)
        process.exit(1)
    }
    const swap = (file, from, to) => (p) => {
        const s = read(p)
        if (p !== file) return s
        if (!s.includes(from)) throw new Error(`注入先が ${file} に無い: ${from}`)
        return s.replace(from, to)
    }
    const mutants = [
        ["届出者の氏名を見ない", swap(LIB, `{ column: "notifier_name", label: "届出者の氏名", anchor: "notifierName", filled: (v) => text(v) !== "" },`, ""), "notifier_name が"],
        ["延べ面積 0 を通す", swap(LIB, "filled: (v) => (num(v) ?? 0) > 0", "filled: (v) => num(v) !== null"), "延べ面積 0"],
        ["「否」の不良内容を見ない", swap(LIB, `if (row.judgment !== "否" || text(row.bad_content) !== "") return`, "return"), "別記の「否」で不良内容が空"],
        ["見出し行も数える", swap(LIB, "if (isBekkiHeadingLabel(label)) return", ""), "見出し行"],
        ["確定の前にも点検者を見る", swap(LIB, "if (input.itiran !== undefined) {", "if (true) {"), "点検者一覧を渡さない"],
        ["注意で確定を止める", swap(LIB, "canFinalize: missing.length === 0", "canFinalize: missing.length === 0 && warnings.length === 0"), "注意なのに確定を止めている"],
        ["確定のボタンを止めない", swap(BUTTON, "disabled={blockedByReadiness}", "disabled={false}"), "押せなくなっていない"],
        ["プレビューを確定の下に戻す", (p) => {
            const s = read(p)
            if (p !== PAGE) return s
            const block = s.match(/\n\s*<div className="max-w-\[210mm\] mx-auto mb-6">\s*<SoukatsuPdfPreview data=\{soukatsuData\} \/>\s*<\/div>/)
            if (!block) throw new Error("プレビューの塊が見つからない")
            return s.replace(block[0], "").replace(/\n(\s*)<\/div>\n(\s*)\)\n\}\s*$/, `${block[0]}\n$1</div>\n$2)\n}\n`)
        }, "並びが"],
        ["基本情報を畳まない", swap(BASE, "useState(() => basicInfoBlank.length > 0)", "useState(() => true)"), "最初から開いている"],
    ]
    for (const [label, src, expect] of mutants) {
        let found
        try {
            found = (await inspect(src)).some((p) => p.includes(expect))
        } catch (e) {
            console.log(`自己診断: ${label} ―― ${e.message}`)
            process.exit(1)
        }
        if (!found) {
            console.log(`自己診断: ${label} → 検出できない`)
            process.exit(1)
        }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    console.log("  陰性対照: 現状（必須 9 項目・注意 4 種・リンク・画面の並びとボタン）→ 0 件")
    fs.rmSync(OUT, { recursive: true, force: true })
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const problems = await inspect(read)
fs.rmSync(OUT, { recursive: true, force: true })
console.log("確定前・出力前の不備チェックを検査: 必須 9 項目（1 つずつ空にする）・注意 4 種・リンク・画面の並びとボタン")
if (problems.length) {
    console.log("★NG:")
    for (const p of problems) console.log("   ", p)
    process.exit(1)
}
console.log("REPORT_READINESS_OK")
