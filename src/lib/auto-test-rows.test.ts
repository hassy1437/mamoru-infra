import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
    AUTO_TEST_COLLAPSED_NOTICE,
    AUTO_TEST_UNCHECKED_NOTICE,
    EXPECTED_AUTO_TEST_ROW_COUNT,
    autoTestCheckboxNote,
} from "@/lib/auto-test-rows"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/**
 * 「受信機が自動試験機能を有する」のチェックの下の説明（2026-11-08・定期テスト 22）。
 * 以前はチェックの有無にかかわらず「自動試験機能ありのため、この23項目は点検対象外です（…）」と出ていた。
 */
describe("自動試験機能のチェックの下の説明", () => {
    it("チェックしていないときは、チェックすると何が起きるかを言う", () => {
        expect(autoTestCheckboxNote(false)).toBe(AUTO_TEST_UNCHECKED_NOTICE)
        expect(AUTO_TEST_UNCHECKED_NOTICE).toContain("チェックすると")
        expect(AUTO_TEST_UNCHECKED_NOTICE).toContain(`${EXPECTED_AUTO_TEST_ROW_COUNT}項目`)
        expect(AUTO_TEST_UNCHECKED_NOTICE).not.toContain("ありのため")
    })

    it("チェックしたときは、今までの文（畳んだ見出しと同じ）", () => {
        expect(autoTestCheckboxNote(true)).toBe(AUTO_TEST_COLLAPSED_NOTICE)
    })

    it("点検票の画面がチェックの状態で出し分けている（★チェックの下に固定の文を出さない）", () => {
        const form = read("src/components/jidou-kasai-houchi-bekki11-1-form.tsx")
        const base = read("src/components/bekki-result-form-base.tsx")
        expect(form).toMatch(/checkboxNote: autoTestCheckboxNote/)
        expect(form).not.toMatch(/placeholder: AUTO_TEST_COLLAPSED_NOTICE/)
        expect(base).toMatch(/\{field\.checkboxNote\(isExtraChecked\(extraFieldValues\[field\.key\]\)\)\}/)
        // ★畳んだ見出しの文（hiddenRowNotice）は今のまま
        expect(form.match(/hiddenRowNotice: AUTO_TEST_COLLAPSED_NOTICE/g)).toHaveLength(3)
    })
})
