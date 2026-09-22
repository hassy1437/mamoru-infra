// =============================================================
// scripts/check-equipment-default.mjs — 物件登録で選べる設備の既定が「全種」であること
//
// ■ ★なぜ要るか（2026-09-23・先行利用の前の総点検 A1）
//   既定が 7 種だけだった。端末ごとの設定（localStorage）が無い状態＝新しい端末・別のブラウザでは
//   残り 16 種のチェックボックスが物件登録に描かれず、業者は「設備が無い」で止まる。
//   直したあと、誰かが「よく使う設備だけに」と既定を戻すと同じことが再発する。＝ 既定を機械で見張る。
//
// ■ 見るもの
//   ①挙動: 設定が無い状態（localStorage 無し）で getEnabledEquipmentTypes() が ALL_EQUIPMENT_TYPES と同じ
//   ②挙動: 設定で絞ったら、その絞り込みはそのまま返る（/tool/equipment-settings は「絞り込む」画面として残す）
//   ③静的: 物件フォームは、絞り込み中でも「この物件に既に付いている設備」を描く
//          （成約から自動で作られた物件の設備が、端末の絞り込みのせいで見えなくなるのを防ぐ）
//
// 使い方: node scripts/check-equipment-default.mjs [--self-test]
// =============================================================
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import ts from "typescript"

const ROOT = process.cwd()
const LIB = path.join(ROOT, "src", "lib", "equipment-config.ts")
const FORM = path.join(ROOT, "src", "components", "property-form.tsx")

/** 物件フォームの「描く設備」の絞り込み。★enabledTypes だけでなく selectedEquipment も見ていること */
const FORM_VISIBLE_RE = /const visibleItems = cat\.items\.filter\([\s\S]*?\(enabledTypes\.includes\(name\) \|\| selectedEquipment\.includes\(name\)\)/

async function importLibFrom(sourceText, tag) {
    const outDir = path.join(ROOT, "tmp", "equipment-default")
    fs.mkdirSync(outDir, { recursive: true })
    const js = ts.transpileModule(sourceText, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
        fileName: LIB,
    }).outputText
    const out = path.join(outDir, `equipment-config.${tag}.${Date.now()}.mjs`)
    fs.writeFileSync(out, js, "utf8")
    return import(pathToFileURL(out).href)
}

/** ブラウザの localStorage を最小限に模す（値を持つとき／持たないとき） */
function withFakeWindow(stored, fn) {
    const g = globalThis
    const prev = { window: g.window, localStorage: g.localStorage }
    g.window = {}
    g.localStorage = {
        getItem: (k) => (k === "enabled_equipment_types" ? stored : null),
        setItem() {}, removeItem() {},
    }
    try { return fn() } finally {
        if (prev.window === undefined) delete g.window; else g.window = prev.window
        if (prev.localStorage === undefined) delete g.localStorage; else g.localStorage = prev.localStorage
    }
}

function behaviour(lib) {
    const problems = []
    const all = [...lib.ALL_EQUIPMENT_TYPES]
    if (all.length !== 23) problems.push(`ALL_EQUIPMENT_TYPES が 23 種でない: ${all.length}`)
    // ①設定が無い（window 無し＝SSR／localStorage に値が無い）→ 全種
    const ssr = lib.getEnabledEquipmentTypes()
    if (JSON.stringify(ssr) !== JSON.stringify(all)) problems.push(`設定が無い（SSR）とき全種でない: ${ssr.length} 種`)
    const fresh = withFakeWindow(null, () => lib.getEnabledEquipmentTypes())
    if (JSON.stringify(fresh) !== JSON.stringify(all)) problems.push(`設定が無い（新しい端末）とき全種でない: ${fresh.length} 種`)
    // ②絞ったらそのまま返る
    const narrowed = withFakeWindow(JSON.stringify(["消火器", "避難器具"]), () => lib.getEnabledEquipmentTypes())
    if (JSON.stringify(narrowed) !== JSON.stringify(["消火器", "避難器具"])) problems.push(`絞り込みが効かない: ${JSON.stringify(narrowed)}`)
    // 壊れた設定（JSON でない）→ 全種に倒れる
    const broken = withFakeWindow("{not json", () => lib.getEnabledEquipmentTypes())
    if (JSON.stringify(broken) !== JSON.stringify(all)) problems.push(`壊れた設定のとき全種に倒れない: ${broken.length} 種`)
    return problems
}

function staticCheck(formText) {
    const problems = []
    if (!FORM_VISIBLE_RE.test(formText)) {
        problems.push("property-form.tsx: 描く設備の絞り込みが selectedEquipment を見ていない（絞り込み中、この物件に付いている設備が見えなくなる）")
    }
    return problems
}

const libText = fs.readFileSync(LIB, "utf8")
const formText = fs.readFileSync(FORM, "utf8")

if (process.argv.includes("--self-test")) {
    // ★陰性: いまの実装で問題なし（これが通らなければ陽性対照は意味を持たない）
    const lib0 = await importLibFrom(libText, "neg")
    const b0 = behaviour(lib0); const s0 = staticCheck(formText)
    if (b0.length || s0.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of [...b0, ...s0]) console.log("   ", p)
        process.exit(1)
    }
    // ★陽性①: 既定を 7 種に戻した版（直す前の形）→ ①で落ちる
    const anchor = "const DEFAULT_ENABLED: readonly string[] = ALL_EQUIPMENT_TYPES"
    if (!libText.includes(anchor)) { console.log("自己診断: 注入先（DEFAULT_ENABLED の行）が無い"); process.exit(1) }
    const seven = libText.replace(anchor,
        'const DEFAULT_ENABLED: readonly string[] = ["消火器","避難器具","屋内消火栓設備","自動火災報知設備","誘導灯及び誘導標識","スプリンクラー設備","連結送水管"]')
    if (seven === libText) { console.log("自己診断: 注入が入っていない"); process.exit(1) }
    const lib1 = await importLibFrom(seven, "pos1")
    const b1 = behaviour(lib1)
    if (!b1.some((p) => p.includes("全種でない"))) { console.log("自己診断: 既定を 7 種に戻しても落ちない"); process.exit(1) }
    // ★陽性②: 絞り込みを無視して常に全種を返す版 → ②で落ちる
    const noNarrow = libText.replace(/if \(Array\.isArray\(parsed\)\) return parsed/, "if (Array.isArray(parsed)) return [...DEFAULT_ENABLED]")
    if (noNarrow === libText) { console.log("自己診断: 注入先（絞り込みの返し）が無い"); process.exit(1) }
    const lib2 = await importLibFrom(noNarrow, "pos2")
    if (!behaviour(lib2).some((p) => p.includes("絞り込みが効かない"))) { console.log("自己診断: 絞り込みを無視しても落ちない"); process.exit(1) }
    // ★陽性③: 物件フォームが selectedEquipment を見ない版（直す前の形）→ ③で落ちる
    const formOld = formText.replace("(enabledTypes.includes(name) || selectedEquipment.includes(name))", "enabledTypes.includes(name)")
    if (formOld === formText) { console.log("自己診断: 注入先（visibleItems の条件）が無い"); process.exit(1) }
    if (staticCheck(formOld).length === 0) { console.log("自己診断: フォームが selectedEquipment を見なくても落ちない"); process.exit(1) }
    console.log(`  陰性対照: 既定 ${[...lib0.ALL_EQUIPMENT_TYPES].length} 種・絞り込み・壊れた設定・フォームの条件とも問題なし`)
    console.log("  陽性対照①: 既定を 7 種に戻す → 検出")
    console.log("  陽性対照②: 絞り込みを無視する → 検出")
    console.log("  陽性対照③: フォームが物件の設備を描かない → 検出")
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const lib = await importLibFrom(libText, "run")
const problems = [...behaviour(lib), ...staticCheck(formText)]
console.log(`設備の既定を検査: 全 ${[...lib.ALL_EQUIPMENT_TYPES].length} 種`)
if (problems.length) { for (const p of problems) console.log(`  NG  ${p}`); console.log(`\n${problems.length} 件`); process.exit(1) }
console.log("EQUIPMENT_DEFAULT_OK")
