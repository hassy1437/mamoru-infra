// =============================================================
// check-inspector-shape.mjs — 形が欠けた inspector_data で画面が落ちないこと
//
// ■ なぜ要るか（2026-09-05・実際に落ちた）
//   inspector_data は jsonb で DB 側に形の CHECK が無い（制約 0 件・実測）。
//   {"name":"…"} だけの行が入り、点検者一覧の作成ページが
//   TypeError: Cannot read properties of undefined (reading 'toku') で白画面になった。
//   免状エディタが value.shoubou_licenses[key] を無条件に読むため、
//   キーが 1 つ欠けるとページ全体が落ちる。
//
// ■ ★この検査が本当に見張りたいもの
//   直前の不具合は「補完を 1 箇所にだけ書き、他 2 箇所に書き忘れた」ことで起きた。
//   ＝ 補完の中身が正しいかより、★読む箇所が全部そこを通っているかが本題。
//   なので 2 つ見る:
//     ① 挙動  … normalizeInspectorData が欠けた形を埋めるか（免状の種類は
//                license-editor.tsx の定義から読み取って突き合わせる＝二重管理しない）
//     ② 静的  … inspector_data / inspector1 / inspector2 を値として読むファイルを
//                ★全部列挙し、各ファイルが「通す」か「通さない理由つきの除外」かに
//                分類されていること。★新しいファイルが増えたら分類するまで落ちる。
//
// 使い方: node scripts/check-inspector-shape.mjs [--self-test]
// =============================================================
import fs from "fs"
import path from "path"
import { pathToFileURL } from "url"
import ts from "typescript"

const ROOT = process.cwd()
const SRC = path.join(ROOT, "src")
const HELPERS = path.join(SRC, "lib", "inspector-helpers.ts")
const LICENSE_EDITOR = path.join(SRC, "components", "license-editor.tsx")

/* ---------------------------------------------------------------- *
 * ★分類（②の登録簿）
 *   ★「リテラル検索で拾った分だけ」にしないため、★下の走査で見つかった
 *     ファイルがこのどちらにも無ければ落とす。
 * ---------------------------------------------------------------- */

/** 値として読むので normalizeInspectorData を通す必要があるファイル。 */
const MUST_NORMALIZE = new Map([
    ["src/components/inspector-list.tsx", "一覧の表示（name / company / phone を読む）"],
    ["src/components/inspector-master-form.tsx", "マスタの編集（免状エディタへ渡す）"],
    ["src/components/itiran-form.tsx", "一覧表の入力（初期値・自動プリフィル・マスタ選択）"],
    ["src/app/inspection/[id]/itiran/[itiranId]/edit/page.tsx", "一覧表の編集（DB → フォーム）"],
    ["src/app/api/generate-itiran-pdf/route.ts", "PDF 描画（免状の行を回す）"],
])

/**
 * 通さなくてよいファイルと、その理由。
 * ★「落ちないから」ではなく「★InspectorData として扱っていないから」を理由にする。
 */
const EXEMPT = new Map([
    ["src/types/database.ts", "型の定義そのもの。値を読まない"],
    ["src/lib/inspector-helpers.ts", "★補完の実装。ここが normalize を呼んだら循環する"],
])

/**
 * ★別記様式のページ（22枚）は inspector1 を `as { name?: string }` で受け、
 *   ★氏名しか読まない。免状には触れないので InspectorData 扱いではない。
 *   ★この形から外れたら（免状を読み始めたら）検出したいので、形も一緒に見る。
 */
const NAME_ONLY_RE = /inspector1\s+as\s+\{\s*name\?\:\s*string\s*\}/

/* ---------------------------------------------------------------- *
 * ①挙動: normalizeInspectorData を実際に呼ぶ
 * ---------------------------------------------------------------- */

/** 型 import だけの .ts を素の node から読めるように変換する（run-route-pdf.mjs と同じ手）。 */
async function importHelpers() {
    const outDir = path.join(ROOT, "tmp", "inspector-shape")
    fs.mkdirSync(outDir, { recursive: true })
    const src = fs.readFileSync(HELPERS, "utf8")
    const js = ts.transpileModule(src, {
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ES2022,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
        },
        fileName: HELPERS,
    }).outputText
    const out = path.join(outDir, `inspector-helpers.${Date.now()}.mjs`)
    fs.writeFileSync(out, js, "utf8")
    return import(pathToFileURL(out).href)
}

/** license-editor.tsx が読む免状のキーを、★定義から取る（ここに書き写さない）。 */
function licenseKeysFromEditor() {
    const src = fs.readFileSync(LICENSE_EDITOR, "utf8")
    const grab = (name) => {
        const m = src.match(new RegExp(`const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as const`))
        if (!m) throw new Error(`${name} を license-editor.tsx から読めない`)
        return [...m[1].matchAll(/key:\s*"([a-z0-9_]+)"/g)].map((x) => x[1])
    }
    return { shoubou: grab("SHOUBOU_TYPES"), kensa: grab("KENSA_TYPES") }
}

/** 免状エディタと同じ読み方をして、undefined に当たらないこと。 */
function readsLikeEditor(value, keys) {
    const missing = []
    for (const k of keys.shoubou) {
        const lic = value.shoubou_licenses?.[k]
        if (!lic) { missing.push(`shoubou_licenses.${k}`); continue }
        for (const f of ["issue_year", "issue_month", "issue_day", "license_number",
                         "issuing_governor", "training_year", "training_month"]) {
            if (typeof lic[f] !== "string") missing.push(`shoubou_licenses.${k}.${f}`)
        }
    }
    for (const k of keys.kensa) {
        const lic = value.kensa_licenses?.[k]
        if (!lic) { missing.push(`kensa_licenses.${k}`); continue }
        for (const f of ["issue_year", "issue_month", "issue_day", "license_number",
                         "expiry_year", "expiry_month", "expiry_day"]) {
            if (typeof lic[f] !== "string") missing.push(`kensa_licenses.${k}.${f}`)
        }
    }
    for (const f of ["address", "name", "company", "phone", "equipment_names", "shoubou_notes"]) {
        if (typeof value[f] !== "string") missing.push(f)
    }
    return missing
}

/** ★実際に落ちた行そのもの。★これが「作成ページが描ける」の中身。 */
const CASES = [
    ["★実際に落ちた形（名前だけ）", { name: "テスト点検者（削除予定）" }],
    ["空オブジェクト", {}],
    ["null", null],
    ["undefined", undefined],
    ["免状の一部だけ", { name: "A", shoubou_licenses: { toku: { issue_year: "2020" } } }],
    ["null が混ざる", { name: null, company: null, shoubou_licenses: null, kensa_licenses: null }],
    ["知らないキーがある", { name: "A", future_column: "残すこと" }],
    // ★2026-09-22: 名前・会社が文字列でない（API/SQL からは入れられる）。.trim() で落ちる形
    ["名前が文字列でない", { name: 123, company: { x: 1 }, phone: ["0"] }],
]

async function behaviour(normalize) {
    const keys = licenseKeysFromEditor()
    const problems = []
    for (const [label, raw] of CASES) {
        let value
        try {
            value = normalize(raw)
        } catch (e) {
            problems.push(`${label}: normalizeInspectorData が例外 ―― ${e.message}`)
            continue
        }
        const missing = readsLikeEditor(value, keys)
        if (missing.length > 0) {
            problems.push(`${label}: 免状エディタの読み方で欠ける ―― ${missing.slice(0, 4).join(", ")}`
                + (missing.length > 4 ? ` ほか${missing.length - 4}件` : ""))
        }
    }
    // ★知らないキーを消していないこと（将来の列を、知らないという理由で捨てない）
    if (normalize({ name: "A", future_column: "x" }).future_column !== "x") {
        problems.push("知らないキーを消している")
    }
    problems.push(...aliasing(normalize))
    return { problems, keys }
}

/* ---------------------------------------------------------------- *
 * ★エイリアシング: 点検側で編集しても、マスタ側のオブジェクトが変わらないこと
 *
 * ■ なぜ要るか
 *   直す前は structuredClone(master.inspector_data) で「マスタと state を切っていた」。
 *   normalizeInspectorData はそれを置き換えたので、★切れていることを引き継がないと
 *   マスタを選び直しただけで点検者マスタ側の値が書き換わる。
 *   ★画面には出ず、次に別の点検でそのマスタを使ったときに初めて分かる種類の壊れ方。
 *   ＝ 浅いスプレッド 1 回（{ ...emptyInspector(), ...raw }）では免状オブジェクトが
 *     共有されたままなので、この検査で落ちる。
 * ---------------------------------------------------------------- */
function aliasing(normalize) {
    const problems = []
    // ★マスタを模す。免状・未知キーまで入れて、どの階層でも共有しないことを見る。
    const master = {
        name: "元の名前", company: "元の会社",
        shoubou_licenses: { toku: { issue_year: "2020", license_number: "A-1" } },
        kensa_licenses: { toku: { issue_year: "2019" } },
    }
    const snapshot = JSON.stringify(master)

    // ★壊れた実装（自己診断の陽性対照）を渡されても、この検査自身は落ちない。
    //   形が足りずに書けなかった場合は「見られなかった」として報告する。
    try {
        const state = normalize(master)
        // ★点検側の画面でやる操作をなぞる（基本情報・消防設備士・点検資格者）
        state.name = "点検側で変えた"
        state.company = "点検側の会社"
        state.shoubou_licenses.toku.issue_year = "9999"
        state.shoubou_licenses.toku.license_number = "書き換え"
        state.shoubou_licenses.class3.license_number = "空だった欄に書いた"
        state.kensa_licenses.toku.issue_year = "8888"
    } catch (e) {
        return [`★形が足りずエイリアシングを見られない ―― ${e.message}`]
    }

    if (JSON.stringify(master) !== snapshot) {
        problems.push("★点検側の編集がマスタ側のオブジェクトに漏れている"
            + `（元: ${snapshot} → いま: ${JSON.stringify(master)}）`)
    }
    // ★逆向き: 同じマスタから 2 人ぶん作ったとき、片方の編集がもう片方に出ないこと
    //   （点検者1 と 点検者2 に同じマスタを選ぶ操作。実際にできる）
    try {
        const first = normalize(master)
        const second = normalize(master)
        first.shoubou_licenses.class1.issue_day = "1"
        if (second.shoubou_licenses.class1.issue_day !== "") {
            problems.push("★同じマスタから作った 2 つが互いに繋がっている（点検者1の編集が点検者2に出る）")
        }
    } catch (e) {
        problems.push(`★形が足りず 2 人ぶんの独立を見られない ―― ${e.message}`)
    }
    return problems
}

/* ---------------------------------------------------------------- *
 * ②静的: 読むファイルを全部列挙 → 分類されているか
 * ---------------------------------------------------------------- */

function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) walk(p, out)
        else if (/\.tsx?$/.test(e.name)) out.push(p)
    }
    return out
}

function staticCheck() {
    const problems = []
    const rel = (p) => path.relative(ROOT, p).replace(/\\/g, "/")
    const readers = []

    for (const file of walk(SRC)) {
        const src = fs.readFileSync(file, "utf8")
        // ★型注釈だけの行は除く（値として読んでいるかを見たい）
        const touches = /inspector_data|\binspector1\b|\binspector2\b/.test(src)
        if (!touches) continue
        readers.push(rel(file))
    }

    for (const r of readers) {
        if (EXEMPT.has(r)) continue
        const src = fs.readFileSync(path.join(ROOT, r), "utf8")
        if (MUST_NORMALIZE.has(r)) {
            if (!/normalizeInspectorData\s*\(/.test(src)) {
                problems.push(`${r}: inspector_data を読むのに normalizeInspectorData を通していない`)
            }
            if (/structuredClone\s*\(\s*[A-Za-z0-9_.[\]]*inspector_data/.test(src)) {
                problems.push(`${r}: structuredClone(...inspector_data) が残っている（補完を素通りする）`)
            }
            if (/\(\s*itiran\.inspector[12]\s*\?\?\s*\{\}\s*\)\s*as\s+InspectorData/.test(src)) {
                problems.push(`${r}: (inspectorN ?? {}) as InspectorData が残っている（型で嘘をつく）`)
            }
            /*
              ★生の値からプロパティを直接読む行（2026-09-22 に足した）。
                「ファイルのどこかで normalize を 1 回呼んでいれば合格」だと、同じファイルの
                別の読み取りが素通りする。実際 itiran-form.tsx のマスタ名の表示
                （m.inspector_data?.name?.trim()）がそうだった ―― 名前が文字列でない行で
                作成ページが落ちる。★読み取りは 1 行ずつ見る。
                inspector_data の直後に . / ?. が続くもの＝生の値の中身を読んでいる。
                （normalizeInspectorData(x.inspector_data) や payload の inspector_data: は該当しない）
            */
            src.split(/\r?\n/).forEach((line, i) => {
                if (/^\s*(\/\/|\*|\/\*)/.test(line)) return
                if (/\binspector_data\s*\??\.\s*[A-Za-z_]/.test(line)) {
                    problems.push(`${r}:${i + 1}: 生の inspector_data から直接読んでいる（normalizeInspectorData を通すこと）`)
                }
            })
            continue
        }
        // ★別記様式のページ: 氏名だけ読む形か
        if (NAME_ONLY_RE.test(src)) {
            if (/shoubou_licenses|kensa_licenses/.test(src)) {
                problems.push(`${r}: 氏名だけの形なのに免状を読んでいる（分類し直すこと）`)
            }
            continue
        }
        problems.push(`${r}: inspector_data / inspectorN を読んでいるが分類されていない`
            + "（MUST_NORMALIZE か EXEMPT に、理由つきで足すこと）")
    }

    // ★補完を他所に書き写していないこと（今回の不具合の形）
    for (const file of walk(SRC)) {
        const r = rel(file)
        if (r === "src/lib/inspector-helpers.ts") continue
        const src = fs.readFileSync(file, "utf8")
        if (/\{\s*\.\.\.emptyInspector\(\)\s*,\s*\.\.\./.test(src)) {
            problems.push(`${r}: { ...emptyInspector(), ...x } を書いている（補完は normalizeInspectorData 1 本）`)
        }
    }
    return { problems, readers }
}

/* ---------------------------------------------------------------- *
 * 実行
 * ---------------------------------------------------------------- */
const mod = await importHelpers()
const normalize = mod.normalizeInspectorData
if (typeof normalize !== "function") {
    console.log("★normalizeInspectorData が src/lib/inspector-helpers.ts から export されていない")
    process.exit(1)
}

if (process.argv.includes("--self-test")) {
    // ★陰性対照: いまの実装で①②とも問題なし
    const b = await behaviour(normalize)
    const s = staticCheck()
    if (b.problems.length || s.problems.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of [...b.problems, ...s.problems]) console.log("   ", p)
        process.exit(1)
    }
    // ★陽性対照①: 補完を素通りさせる（＝不具合当時の実装）と、挙動の検査が落ちる
    const passthrough = (raw) => (raw ?? {})
    const broken = await behaviour(passthrough)
    if (broken.problems.length === 0) {
        console.log("自己診断: 補完を外しても挙動の検査が落ちない（対象を捉えていない）")
        process.exit(1)
    }
    /*
      ★陽性対照③: 補完を「浅いスプレッド 1 回」にすると、★エイリアシングだけが落ちる。
        ★形は埋まる（①は通る）ので、★共有を見ている検査が別に要ることの裏取りになる。
    */
    const shallow = (raw) => ({ ...mod.emptyInspector(), ...(raw && typeof raw === "object" ? raw : {}) })
    const shallowAlias = aliasing(shallow)
    if (shallowAlias.length === 0) {
        console.log("自己診断: 浅いスプレッドにしてもエイリアシングの検査が落ちない（共有を捉えていない）")
        process.exit(1)
    }
    /*
      ★陽性対照④: ★形は完全に埋めるが、免状オブジェクトだけ元を共有する版。
        ★①（形）は 0 件で通り、★エイリアシングだけが落ちる。
        ＝ 「形が欠けているから落ちた」のではなく★共有そのものを見ていることの裏取り。
    */
    const sharing = (raw) => {
        const src = raw && typeof raw === "object" ? raw : {}
        const base = mod.emptyInspector()
        return {
            ...base, ...src,
            shoubou_licenses: { ...base.shoubou_licenses, ...(src.shoubou_licenses ?? {}) },
            kensa_licenses: { ...base.kensa_licenses, ...(src.kensa_licenses ?? {}) },
        }
    }
    const sharingShape = (await behaviour(sharing)).problems.filter((p) => !p.startsWith("★点検側") && !p.startsWith("★同じマスタ") && !p.startsWith("★形が足りず"))
    const sharingAlias = aliasing(sharing)
    if (sharingAlias.length === 0) {
        console.log("自己診断: 形を埋めても共有したままの版で、エイリアシングの検査が落ちない")
        process.exit(1)
    }
    // ★陽性対照②: 読む側が normalize を呼ばなくなったら、静的の検査が落ちる
    const target = "src/components/itiran-form.tsx"
    const original = fs.readFileSync(path.join(ROOT, target), "utf8")
    let staticCaught = false
    try {
        fs.writeFileSync(path.join(ROOT, target),
            original.replace(/normalizeInspectorData\s*\(/g, "structuredCloneShim("), "utf8")
        staticCaught = staticCheck().problems.some((p) => p.startsWith(target))
    } finally {
        fs.writeFileSync(path.join(ROOT, target), original, "utf8")
    }
    if (!staticCaught) {
        console.log("自己診断: 読む側の呼び出しを消しても静的の検査が落ちない")
        process.exit(1)
    }
    /*
      ★陽性対照⑤（2026-09-22）: 同じファイルで normalize を別の場所では呼んだまま、
        1 か所だけ生の値から読む形に戻す（＝マスタ名の表示が漏れていた形）。
        ★「ファイルに normalize が 1 回あれば合格」では捕まらなかったもの。
        ★注入が入ったことを先に確かめる（入っていなければ自己診断を落とす）。
    */
    const leakFrom = "normalizeInspectorData(m.inspector_data).name.trim()"
    const leakTo = "m.inspector_data?.name?.trim()"
    let leakCaught = false
    try {
        if (!original.includes(leakFrom)) {
            console.log(`自己診断: 注入先（${leakFrom}）が ${target} に無い。陽性対照⑤が成立しない`)
            process.exit(1)
        }
        const injected = original.replace(leakFrom, leakTo)
        fs.writeFileSync(path.join(ROOT, target), injected, "utf8")
        if (!fs.readFileSync(path.join(ROOT, target), "utf8").includes(leakTo)) {
            console.log("自己診断: 注入が書き込まれていない")
            process.exit(1)
        }
        const s5 = staticCheck()
        leakCaught = s5.problems.some((p) => p.startsWith(`${target}:`) && p.includes("生の inspector_data"))
            // ★他の検査（normalize を呼んでいない）では捕まらないこと＝この規則が効いていること
            && !s5.problems.some((p) => p.includes("normalizeInspectorData を通していない"))
    } finally {
        fs.writeFileSync(path.join(ROOT, target), original, "utf8")
    }
    if (!leakCaught) {
        console.log("自己診断: 1 か所だけ生の値から読む形に戻しても静的の検査が落ちない")
        process.exit(1)
    }
    console.log(`  陰性対照: ${CASES.length} 通りの欠けた形すべてで、免状エディタの読み方が undefined に当たらない`)
    console.log(`            ＋ 点検側の編集がマスタ側に漏れない・同じマスタから作った2つが繋がらない`)
    console.log(`  陽性対照①: 補完を素通りにする → ${broken.problems.length} 件を検出`)
    console.log(`  陽性対照②: ${target} の normalizeInspectorData 呼び出しを消す → 検出`)
    console.log(`  陽性対照⑤: ${target} の 1 か所だけ生の値から読む形に戻す（他は normalize のまま）→ 行で検出`)
    console.log(`  陽性対照③: 浅いスプレッド1回（＝不具合当時の書き方）にする → 共有を ${shallowAlias.length} 件検出`)
    console.log(`  陽性対照④: 免状の入れ物だけ埋めて中身は元を共有する版 → 形の欠け ${sharingShape.length} 件`
        + ` ＋ ★共有を ${sharingAlias.length} 件検出（形の検査とは別に共有を見ている）`)
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const b = await behaviour(normalize)
const s = staticCheck()
console.log(`形の補完を検査: 欠けた形 ${CASES.length} 通り / inspector_data を読むファイル ${s.readers.length} 本`)
console.log(`  免状の種類（license-editor.tsx から読んだ）: 消防設備士 ${b.keys.shoubou.length} / 点検資格者 ${b.keys.kensa.length}`)
const problems = [...b.problems, ...s.problems]
if (problems.length > 0) {
    for (const p of problems) console.log(`  NG  ${p}`)
    console.log(`\n${problems.length} 件`)
    process.exit(1)
}
console.log("INSPECTOR_SHAPE_OK")
