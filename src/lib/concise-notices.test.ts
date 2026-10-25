import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { COVER_FIRE_DEPARTMENT_NOTE, COVER_REPORT_DATE_NOTE } from "@/lib/soukatsu-cover"
import { COVER_REPORT_DATE_POINT } from "@/lib/soukatsu-cover-notes"
import { SOUKATSU_NOT_PRINTED_DETAIL, SOUKATSU_NOT_PRINTED_NOTE } from "@/lib/soukatsu-not-printed"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/**
 * ★注意書きは短く・詳しくは「詳しく見る」で（2026-10-25・橋本さん「長すぎると読まなくなる」）。
 *   要点（いつも見える 1 文）が長くなって元に戻らないように見張る。
 */
describe("注意書きの要点は短い", () => {
    it("要点は 40 字以内・★印字されないこと／点検日ではないことは要点に残す", () => {
        expect(SOUKATSU_NOT_PRINTED_NOTE.length).toBeLessThanOrEqual(40)
        expect(SOUKATSU_NOT_PRINTED_NOTE).toContain("印字されません")
        expect(COVER_REPORT_DATE_POINT.length).toBeLessThanOrEqual(40)
        expect(COVER_REPORT_DATE_POINT).toContain("点検日ではありません")
        // 詳しい説明は残っている（消して短くしたのではない）
        expect(SOUKATSU_NOT_PRINTED_DETAIL).toContain("欄が無い")
        expect(COVER_REPORT_DATE_NOTE).toContain("手書き用")
    })

    it.each([
        ["src/components/soukatsu-form.tsx", "{SOUKATSU_NOT_PRINTED_DETAIL}"],
        ["src/components/soukatsu-edit-form.tsx", "{SOUKATSU_NOT_PRINTED_DETAIL}"],
        ["src/components/soukatsu-cover-inputs.tsx", "{COVER_REPORT_DATE_NOTE}"],
        ["src/components/soukatsu-cover-inputs.tsx", "{COVER_FIRE_DEPARTMENT_NOTE}"],
    ])("★配線: %s の %s は「詳しく見る」（MoreInfo）の中", (file, full) => {
        const src = read(file)
        const i = src.indexOf(full)
        expect(i).toBeGreaterThan(-1)
        expect(src.lastIndexOf("<MoreInfo", i)).toBeGreaterThan(src.lastIndexOf("</MoreInfo>", i))
        void COVER_FIRE_DEPARTMENT_NOTE
    })
})
