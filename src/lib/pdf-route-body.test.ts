import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import { PdfBodyError, readPdfBody } from "@/lib/pdf-route-body"

/**
 * PDF のルートに、空・壊れた本文が届いたときの扱い（docs/BACKLOG.md「Unexpected end of JSON input」）。
 *
 * ■ なぜ要るか
 *   プレビュー中にページを閉じると、本文を送り切る前に接続が切れ、ルートには空の本文が届く。
 *   以前はどのルートも req.json() の例外を「サーバの失敗（500）」として返し、
 *   ログに SyntaxError が残っていた（2026-09-23 に 1 回）。★サーバは壊れていない＝ 400 で返す。
 */

const ROUTES_DIR = path.join(process.cwd(), "src", "app", "api")
const ROUTES = fs
    .readdirSync(ROUTES_DIR)
    .filter((d) => d.startsWith("generate-") && fs.existsSync(path.join(ROUTES_DIR, d, "route.ts")))
    .sort()

const post = (body: string) =>
    new Request("http://localhost/api/x", { method: "POST", headers: { "Content-Type": "application/json" }, body })

describe("readPdfBody", () => {
    it.each([
        ["空", ""],
        ["空白だけ", "  \n"],
        ["JSON でない", "{"],
        ["null", "null"],
        ["配列", "[]"],
        ["数", "1"],
    ])("%s → PdfBodyError", async (_, text) => {
        await expect(readPdfBody(post(text))).rejects.toBeInstanceOf(PdfBodyError)
    })

    it("オブジェクトならそのまま返す", async () => {
        await expect(readPdfBody(post('{"a":1}'))).resolves.toEqual({ a: 1 })
    })
})

describe("★全ルート: 空の本文は 400（500 にしない）", () => {
    it("★走査が空振りしていない", () => {
        expect(ROUTES.length).toBeGreaterThanOrEqual(26)
    })

    it.each(ROUTES)("%s", async (dir) => {
        const { POST } = await import(`@/app/api/${dir}/route`)
        const res: Response = await POST(post(""))
        expect(res.status).toBe(400)
        expect(await res.json()).toEqual({ error: "INVALID_BODY" })
    })
})
