import { normalizeBekkiInspectorNameForState } from "@/lib/bekki-form-normalization"

/**
 * 点検票の点検者（氏名・所属会社・住所・TEL）と、点検者一覧表の点検者 1 を比べる（録音 102・2026-10-20）。
 * 点検票は点検者一覧表の値を「最初の値」として入れるだけで、保存済みの点検票には、あとで点検者一覧表を直しても届かない。
 * ★点検票の画面の知らせ（src/components/inspector-sync-notice.tsx）と、出力前の確認（report-readiness）で同じ比べ方を使う。
 *   ・点検者一覧表の値が空の欄は比べない（空で上書きしない）
 *   ・空白・全角半角の違いは同じとみなす。氏名は点検票と同じ整え方（「点検者」などの前置きを外す）
 */
export type InspectorFields = { name: string; company: string; address: string; tel: string }
export const INSPECTOR_FIELD_LABELS: Record<keyof InspectorFields, string> = { name: "氏名", company: "所属会社", address: "住所", tel: "TEL" }

const text = (v: unknown) => (typeof v === "string" ? v : "")
const same = (a: string, b: string) => a.normalize("NFKC").replace(/\s+/g, "") === b.normalize("NFKC").replace(/\s+/g, "")

/** 点検者一覧表の値（点検票の initial.inspector_* と同じもの）を比べられる形に */
export function itiranInspectorFields(v: Partial<Record<keyof InspectorFields, unknown>>): InspectorFields {
    return {
        name: normalizeBekkiInspectorNameForState(text(v.name)),
        company: text(v.company).trim(),
        address: text(v.address).trim(),
        tel: text(v.tel).trim(),
    }
}

/** 点検票の値が点検者一覧表と違う欄（点検者一覧表が空の欄は除く） */
export function inspectorDiff(current: Partial<Record<keyof InspectorFields, unknown>>, fromItiran: InspectorFields): (keyof InspectorFields)[] {
    return (Object.keys(INSPECTOR_FIELD_LABELS) as (keyof InspectorFields)[])
        .filter((k) => fromItiran[k] !== "" && !same(fromItiran[k], k === "name" ? normalizeBekkiInspectorNameForState(text(current[k])) : text(current[k])))
}
