// 設備出力設定（/tool/equipment-settings）が、読み込み前に「0 / 23」と出さず、0 種類で保存させないこと（#8・2026-10-06）。
//
// ■ なぜ要るか（2026-10-05 の通し確認）
//   選択を [] から始めていて、サーバーの HTML と読み込み前の一瞬は「0 / 23 種類を有効化中」・全部のチェックが外れて見えた
//   （実際は全種が出る設定）。また、全部外して保存すると [] が残り、物件登録に設備が 1 つも出なくなる
//   （物件に既に付いている設備だけが出る）。★どちらも端末の localStorage 次第で、画面の検査では再現しにくい種類。
//
// ■ 検査すること（静的）
//   1. 端末の設定はブラウザでだけ読む（useSyncExternalStore のサーバー側は false）・読み込み前は null
//   2. 選択を [] から始めない
//   3. 保存は 0 種類なら止める（setEnabledEquipmentTypes より前に length === 0 を見る）
//   4. 件数の表示は「読み込み中」「絞り込みなし」を言い分ける
//
// 使い方: node scripts/check-equipment-settings-page.mjs [--self-test]
import fs from "fs"

const PAGE = "src/app/tool/equipment-settings/page.tsx"

function judge(src) {
    const problems = []
    if (!/useSyncExternalStore\(\s*noopSubscribe\s*,\s*\(\)\s*=>\s*true\s*,\s*\(\)\s*=>\s*false\s*\)/.test(src)) {
        problems.push("端末の設定をブラウザでだけ読む形（useSyncExternalStore のサーバー側 false）になっていない")
    }
    if (!/const enabled: string\[\] \| null = edits \?\? \(isClient \? getEnabledEquipmentTypes\(\) : null\)/.test(src)) {
        problems.push("読み込み前の選択が null になっていない")
    }
    if (/useState<string\[\]>\(\[\]\)/.test(src)) problems.push("選択を [] から始めている（読み込み前に 0 / 23 と出る）")
    const save = src.slice(src.indexOf("const handleSave"), src.indexOf("const handleReset"))
    const guard = save.indexOf("enabled.length === 0")
    const write = save.indexOf("setEnabledEquipmentTypes(")
    if (guard < 0 || write < 0 || guard > write) problems.push("0 種類のまま保存できる（保存の前に length === 0 を見ていない）")
    if (!src.includes("設定を読み込んでいます") || !src.includes("絞り込みなし")) {
        problems.push("件数の表示が「読み込み中」「絞り込みなし」を言い分けていない")
    }
    return problems
}

const src = fs.readFileSync(PAGE, "utf8")

if (process.argv.includes("--self-test")) {
    const ok = judge(src)
    if (ok.length) {
        console.log("自己診断: 現状が既にNG（陰性対照が成立しない）")
        for (const p of ok) console.log("   ", p)
        process.exit(1)
    }
    const cases = [
        ["0 種類の止めを外す", "if (enabled.length === 0) {", "if (false) {", "0 種類のまま保存できる"],
        ["選択を [] から始める（以前の形）", "const [edits, setEdits] = useState<string[] | null>(null)", "const [edits, setEdits] = useState<string[]>([])", "[] から始めている"],
        ["サーバーでも true にする", "() => true, () => false)", "() => true, () => true)", "ブラウザでだけ読む形"],
    ]
    for (const [label, from, to, hit] of cases) {
        if (!src.includes(from)) {
            console.log(`自己診断: 注入先が無い ―― ${label}`)
            process.exit(1)
        }
        if (!judge(src.replace(from, to)).some((p) => p.includes(hit))) {
            console.log(`自己診断: ${label} → 検出できない`)
            process.exit(1)
        }
        console.log(`  陽性対照: ${label} → 検出`)
    }
    console.log("  陰性対照: いまの画面は 4 項目とも満たす")
    console.log("SELF_TEST_OK")
    process.exit(0)
}

const problems = judge(src)
console.log("設備出力設定の画面を検査: 読み込み前の表示・0 種類の保存")
if (problems.length) {
    for (const p of problems) console.log(`  NG  ${p}`)
    process.exit(1)
}
console.log("EQUIPMENT_SETTINGS_PAGE_OK")
