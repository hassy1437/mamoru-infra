/**
 * 定期テスト第11回（2026-11-16）の 80〜82 の見張り。79 は judgment-change.test.ts と scripts/check-report-readiness.mjs。
 *   80: 結果出力の画面で、確定したあとに「確定済み」と最終確定の日時を出す
 *   81: 別記の基本情報・備考と、免状の表の入力欄に読み上げの名前がある
 *   82: 入力例に実在の人の名前を使わない
 */
import { readFileSync } from "fs"
import path from "path"
import { describe, expect, it } from "vitest"
import { finalizedNoticeText, type FinalizationRow, type FinalizationState } from "./finalization"
import { formatJstDateTime } from "./date-utils"

const ROOT = path.resolve(__dirname, "../..")
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8")

const row = (acted_at: string): FinalizationRow => ({
    id: acted_at, acted_at, actor_id: "u", equipment_codes: ["消火器"], billable_codes: ["消火器"], unit_price_yen: 100, duplicate_confirmed: false,
})
const state = (finalized: FinalizationRow[]): FinalizationState => ({
    available: true, preview: null, finalized, duplicates: [], blockedSince: null, notContracted: false, identityChanged: false,
})

describe("80: 確定済みの表示", () => {
    it("確定が 1 回なら日時だけ（JST・総括表の確認の画面と同じ書き方）", () => {
        expect(finalizedNoticeText(state([row("2026-11-15T21:10:00Z")]), formatJstDateTime)).toBe("確定済みです（最終確定 2026/11/16 6:10:00）。PDF の一括出力ができます。")
    })
    it("2 回以上なら回数も出し、並びに関係なくいちばん新しい日時", () => {
        const t = finalizedNoticeText(state([row("2026-11-16T03:00:00Z"), row("2026-11-15T21:10:00Z")]), formatJstDateTime)
        expect(t).toBe("確定済みです（最終確定 2026/11/16 12:00:00・2 回確定）。PDF の一括出力ができます。")
    })
    it("確定が無い・判定できないときは出さない", () => {
        expect(finalizedNoticeText(state([]), formatJstDateTime)).toBeNull()
        expect(finalizedNoticeText({ available: false, reason: "error" }, formatJstDateTime)).toBeNull()
        expect(finalizedNoticeText({ available: false, reason: "missing" }, formatJstDateTime)).toBeNull()
    })
    it("finalization.ts に実行時の import を足さない（検査のスクリプトが単体で読み込む）", () => {
        expect(read("src/lib/finalization.ts")).not.toMatch(/^import (?!type )/m)
    })
    it("結果出力の画面が使っている", () => {
        const src = read("src/app/inspection/[id]/itiran/[itiranId]/output/page.tsx")
        expect(src).toContain("finalizedNoticeText(finalization, formatJstDateTime)")
        expect(src).toContain('role="status"')
    })
})

describe("81: 入力欄の読み上げの名前", () => {
    const FORMS = [
        "bekki-result-form-base", "shokaki-bekki1-form", "shokasen-bekki2-form", "sprinkler-bekki3-form", "water-spray-bekki4-form",
        "foam-bekki5-form", "inert-gas-bekki6-form", "halogen-bekki7-form", "powder-bekki8-form",
    ]
    it.each(FORMS)("%s: <Label> のすぐ下の入力欄に名前が無いものが無い", (name) => {
        const src = read(`src/components/${name}.tsx`)
        const bare = [...src.matchAll(/<Label>([^<{}]+)<\/Label>\s*<(Input|Textarea) (?![^>]*(?:aria-label|\bid=))/g)].map((m) => m[1])
        expect(bare).toEqual([])
        expect(src).toContain('aria-label="備考"')
        expect(src).toContain('aria-label="点検者の電話番号"')
    })
    it("免状の表: 入力欄すべてに名前（免状の種類＋欄）", () => {
        const src = read("src/components/license-editor.tsx")
        const inputs = [...src.matchAll(/<Input\b[^>]*/g)].map((m) => m[0])
        const inTables = inputs.filter((s) => /issueDate|expiryDate|trainingMonth|license_number|issuing_governor/.test(s))
        expect(inTables.length).toBe(14)
        for (const s of inTables) expect(s).toMatch(/aria-label=\{`(消防設備士|点検資格者) \$\{plainLabel\(label\)\} /)
        // ★交付番号は {...CODE_INPUT_PROPS} を先頭に置いたまま（scripts/check-iphone-input.mjs が見ている）
        expect(inTables.filter((s) => s.startsWith("<Input {...CODE_INPUT_PROPS} aria-label=")).length).toBe(4)
    })
})

describe("82: 入力例に実在の人の名前を使わない", () => {
    it("点検者の登録画面の入力例", () => {
        const src = read("src/components/inspector-master-form.tsx")
        expect(src).not.toMatch(/placeholder="[^"]*(橋本|拓也)/)
        expect(src).toContain('placeholder="例：山田 太郎、事務 佐藤（一覧での表示名）"')
    })
})
