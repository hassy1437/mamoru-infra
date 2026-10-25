import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
    ACTION_BUTTON,
    ACTION_BUTTON_FULL,
    ACTION_ROW,
    ACTION_ROW_SECONDARY,
    DOWNLOAD_BUTTON,
    PREVIEW_BUTTON,
    SAVE_BUTTON,
} from "@/lib/action-button"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/**
 * 主な操作のボタンの大きさ（2026-10-24・橋本さん「提出などのボタンをこれくらいはっきりした大きさに」）。
 * ★部品を描かずにソースで見る（このリポジトリのテストは node で回す）。
 */
describe("主な操作のボタンの形（lib/action-button.ts）", () => {
    it("スマホは横いっぱい・高さ 56px・18px の太字（既定の h-10 を外す）", () => {
        for (const c of [ACTION_BUTTON, ACTION_BUTTON_FULL]) {
            expect(c).toContain("h-auto")
            expect(c).toContain("min-h-14")
            expect(c).toContain("w-full")
            expect(c).toContain("text-lg")
            expect(c).toContain("font-bold")
        }
    })

    it("広い画面は中身に合わせる（★横いっぱいの版はそうしない）", () => {
        expect(ACTION_BUTTON).toContain("sm:w-auto")
        expect(ACTION_BUTTON_FULL).not.toContain("sm:w-auto")
    })

    it("点検票の 3 つは今までの色のまま（保存＝濃い灰・プレビュー＝青・PDF＝緑）", () => {
        expect(SAVE_BUTTON).toContain("bg-slate-700")
        expect(PREVIEW_BUTTON).toContain("bg-blue-600")
        expect(DOWNLOAD_BUTTON).toContain("bg-emerald-600")
    })

    it("確認の窓の下端: スマホは主な操作が上・キャンセルも押す場所を十分に", () => {
        expect(ACTION_ROW).toContain("flex-col-reverse")
        expect(ACTION_ROW_SECONDARY).toContain("min-h-12")
    })
})

describe("★使っている画面", () => {
    const USERS = [
        "src/components/finalize-soukatsu-button.tsx",
        "src/components/deliver-report-button.tsx",
        "src/components/combined-pdf-button.tsx",
        "src/components/property-form.tsx",
        "src/components/itiran-form.tsx",
        "src/components/soukatsu-form.tsx",
        "src/components/soukatsu-edit-form.tsx",
        "src/components/inspector-master-form.tsx",
        "src/app/login/page.tsx",
        "src/app/signup/page.tsx",
        "src/app/forgot-password/page.tsx",
        "src/app/update-password/page.tsx",
        "src/app/tool/equipment-settings/page.tsx",
        "src/app/contact/page.tsx",
    ]
    it.each(USERS)("%s", (p) => {
        expect(read(p)).toMatch(/from "@\/lib\/action-button"/)
    })

    // ★点検票（23 様式・9 部品）のいちばん下は scripts/check-iphone-input.mjs が見ている
    it("★スマホの画面下の帯は大きくしない（常に出ているので入力欄が隠れる）", () => {
        expect(read("src/components/form-action-bar.tsx")).not.toMatch(/action-button/)
    })
})
