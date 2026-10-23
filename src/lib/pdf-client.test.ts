import { PDFDocument } from "pdf-lib"
import { afterEach, describe, expect, it, vi } from "vitest"

import { buildMergedReport } from "@/lib/build-merged-report"
import { fetchPdf, parseFitWarnings } from "@/lib/pdf-client"
import { PdfRequestError, pdfErrorText } from "@/lib/pdf-request-error"

/**
 * PDF を取りに行く口（fetchPdf）と、一括出力（buildMergedReport）が
 * 成功・失敗の中身を落とさずに運ぶか。★fetch を差し替えて、ルートの返し方ごとに確かめる。
 */

const onePagePdf = async () => {
    const d = await PDFDocument.create()
    d.addPage([100, 100])
    // ★new Uint8Array で包む（pdf-lib の型は ArrayBufferLike で、Response の本文に渡せない）
    return new Uint8Array(await d.save())
}

// X-Fit-Warnings は日本語を含むので base64 の JSON
const toHeader = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64")
const WARNINGS = {
    items: [{ label: "物件名", design: 10, actual: 6, deviation: 40, text: "長い物件名" }],
    omitted: 2,
    choices: [{ label: "点検種別", text: "x", choices: ["機器", "総合"], hint: "選んで" }],
    belowMin: [{ label: "備考", size: 4.2, text: "細かい" }],
}
const FIT_BODY = {
    error: "FIT_FAILED",
    form: "総括表",
    items: [{ field: "building_name", label: "建物名", input: 40, fits: 20, over: 20, hint: "短くする" }],
}

type Reply = { status: number; headers?: Record<string, string>; body?: BodyInit | null } | "network"

/** route → 返し方。★呼ばれた route と送った本文も控える */
const stubFetch = (replies: Record<string, Reply>) => {
    const calls: { route: string; init?: RequestInit }[] = []
    vi.stubGlobal("fetch", async (route: string, init?: RequestInit) => {
        calls.push({ route, init })
        const r = replies[route]
        if (!r || r === "network") throw new TypeError("fetch failed")
        return new Response(r.body ?? null, { status: r.status, headers: r.headers })
    })
    return calls
}

afterEach(() => {
    vi.unstubAllGlobals()
})

describe("parseFitWarnings", () => {
    it("無い・壊れている・JSON でないときは null（★PDF 自体は正常なので止めない）", () => {
        expect(parseFitWarnings(null)).toBeNull()
        expect(parseFitWarnings("")).toBeNull()
        expect(parseFitWarnings("!!!")).toBeNull()
        expect(parseFitWarnings(Buffer.from("not json").toString("base64"))).toBeNull()
    })

    it("欠けた欄は空にそろえる（呼ぶ側が .length を見られるように）", () => {
        expect(parseFitWarnings(toHeader({ items: [{ label: "a" }] }))).toEqual({
            items: [{ label: "a" }],
            omitted: 0,
            choices: [],
            belowMin: [],
        })
    })
})

describe("fetchPdf", () => {
    it("成功: PDF と警告（縮小・選択肢・5pt 未満・省略数）を返し、入力を JSON で POST する", async () => {
        const pdf = await onePagePdf()
        const calls = stubFetch({
            "/api/x": { status: 200, headers: { "X-Fit-Warnings": toHeader(WARNINGS) }, body: pdf },
        })
        const r = await fetchPdf("/api/x", { a: 1 })
        expect(r.blob.size).toBe(pdf.length)
        expect(r.warnings).toEqual(WARNINGS)
        expect(calls[0].init?.method).toBe("POST")
        expect(JSON.parse(String(calls[0].init?.body))).toEqual({ a: 1 })
    })

    it("成功・警告なし: warnings は null", async () => {
        stubFetch({ "/api/x": { status: 200, body: await onePagePdf() } })
        expect((await fetchPdf("/api/x", {})).warnings).toBeNull()
    })

    it.each([
        [422, "fit", 1],
        [401, "auth", 0],
        [500, "server", 0],
    ] as const)("ルートが %i → PdfRequestError(%s)", async (status, kind, items) => {
        stubFetch({ "/api/x": { status, body: status === 422 ? JSON.stringify(FIT_BODY) : "{}" } })
        const e = await fetchPdf("/api/x", {}).catch((x: unknown) => x)
        expect(e).toBeInstanceOf(PdfRequestError)
        expect((e as PdfRequestError).failure).toMatchObject({ kind, status })
        expect((e as PdfRequestError).failure.items).toHaveLength(items)
    })

    it("★422 の文言に、どの項目が何文字超過かが入る（⑧で本文を捨てていた退行）", async () => {
        stubFetch({ "/api/x": { status: 422, body: JSON.stringify(FIT_BODY) } })
        const e = await fetchPdf("/api/x", {}).catch((x: unknown) => x)
        expect(pdfErrorText(e, "既定")).toContain("建物名: 40文字（20文字超過）")
    })

    it("通信の失敗: 分類せず生の例外のまま（pdfErrorText が「通信エラーの可能性」を添える）", async () => {
        stubFetch({ "/api/x": "network" })
        const e = await fetchPdf("/api/x", {}).catch((x: unknown) => x)
        expect(e).not.toBeInstanceOf(PdfRequestError)
        expect(pdfErrorText(e, "PDFの生成に失敗しました。")).toContain("通信エラーの可能性")
    })
})

describe("buildMergedReport（一括出力）", () => {
    it("成功した分だけ綴じ、失敗の名前・422 の中身・警告を落とさずに運ぶ", async () => {
        const pdf = await onePagePdf()
        stubFetch({
            "/api/generate-pdf": { status: 200, headers: { "X-Fit-Warnings": toHeader(WARNINGS) }, body: pdf },
            "/api/generate-soukatu-pdf": { status: 422, body: JSON.stringify(FIT_BODY) },
            "/api/generate-itiran-pdf": "network",
        })
        const r = await buildMergedReport({ soukatsuData: {}, itiranData: {}, bekkiPayloads: {}, applicableStepIds: [] })

        expect(r.failedLabels).toEqual(["総括表", "点検者一覧"])
        expect(r.fitFailures).toEqual([{ label: "総括表", items: FIT_BODY.items }])
        expect(r.shrinkWarnings).toEqual([{ label: "報告書", items: WARNINGS.items, omitted: 2 }])
        expect(r.choiceWarnings).toEqual([{ label: "報告書", items: WARNINGS.choices }])
        expect(r.belowMinWarnings).toEqual([{ label: "報告書", items: WARNINGS.belowMin }])
        const merged = await PDFDocument.load(await r.blob.arrayBuffer())
        expect(merged.getPageCount()).toBe(1)
    })

    it("全滅したら ALL_PDF_FAILED を投げる", async () => {
        stubFetch({})
        await expect(
            buildMergedReport({ soukatsuData: {}, itiranData: {}, bekkiPayloads: {}, applicableStepIds: [] }),
        ).rejects.toThrow("ALL_PDF_FAILED")
    })
})
