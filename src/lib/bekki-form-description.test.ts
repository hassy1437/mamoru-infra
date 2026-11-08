import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/**
 * 点検票の画面の説明に、中のファイル名を出さない（2026-11-08・定期テスト 24）。
 * 別記 1〜4 の画面の説明が「s50_kokuji14_bekki1.pdf に転記する項目です。」だった。
 */
const FORMS: [string, number][] = [
    ["src/components/shokaki-bekki1-form.tsx", 1],
    ["src/components/shokasen-bekki2-form.tsx", 2],
    ["src/components/sprinkler-bekki3-form.tsx", 3],
    ["src/components/water-spray-bekki4-form.tsx", 4],
]

describe("点検票の画面の説明", () => {
    it.each(FORMS)("%s: ファイル名を出さず「点検票（別記様式N）に印字する項目です。」", (path, n) => {
        const src = read(path)
        expect(src).toContain(`<CardDescription>点検票（別記様式${n}）に印字する項目です。</CardDescription>`)
        expect(src).not.toMatch(/<CardDescription>[^<]*\.pdf/)
    })
})
