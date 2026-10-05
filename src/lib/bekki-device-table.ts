/**
 * 測定機器の表を「紙の表どおり」に扱う（様式11の1・11の2・#23・2026-10-06）。
 *
 * ■ なぜ要るか
 *   この2様式は測定機器の表に機器名が刷り込んである（11の1 は 7 種・11の2 は加ガス試験器）。
 *   以前は共通フォームの「機器名つき2行」を、1行目は左列の先頭（加熱試験器／加ガス試験器）、
 *   2行目は右列の先頭に必ず描いていた。入れた機器名は描かれず、加煙試験器で測っても加熱試験器の
 *   行に載り、残りの機器は入力する手段が無かった（2026-10-05 の通し確認で実測）。
 *
 * ■ 形
 *   device_table: 表の行を「左列の上から → 右列の上から」並べた配列（11の1・11の2 とも 5 行 × 2 列）。
 *   刷り込みの行の name は刷り込みの機器名、空欄の行は業者が機器名を書く。
 *   ★キーを device_*rows* にしない（"_rows" で終わるキーは点検項目の行として扱われる・pdf-fit-report の collectStrings）。
 *
 * ■ 古い保存（device1 / device2）の読み方（★画面とルートで同じこの関数を使う）
 *   機器名が刷り込みの機器と一致 → その行／一致しない機器名 → 空欄の行に名前ごと／
 *   機器名が空 → 以前と同じ行（device1 は左列の先頭・device2 は右列の先頭）。
 */

export type DeviceTableRow = { name: string; model: string; calibrated_at: string; maker: string }

/** 行ごとの刷り込みの機器名（null は空欄の行）。左列の上から → 右列の上から。雛形の実物から写した */
export const DEVICE_TABLE_PRINTED = {
    bekki11_1: [
        "加熱試験器", "加煙試験器", "外部試験器", "煙感知器用感度試験器", "減光フィルター",
        "メーターリレー試験器", "炎感知器用作動試験器", null, null, null,
    ],
    bekki11_2: [
        "加ガス試験器", null, null, null, null,
        null, null, null, null, null,
    ],
} as const satisfies Record<string, readonly (string | null)[]>

export type DeviceTableKind = keyof typeof DEVICE_TABLE_PRINTED

/** 1列の行数（左右とも 5 行） */
export const DEVICE_TABLE_COLUMN_ROWS = 5

const text = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v))
const sameName = (a: string, b: string) =>
    a.normalize("NFKC").replace(/\s+/g, "") === b.normalize("NFKC").replace(/\s+/g, "")
const hasValue = (d: Partial<Record<keyof DeviceTableRow, unknown>>) =>
    [d.name, d.model, d.calibrated_at, d.maker].some((v) => text(v).trim() !== "")

export function emptyDeviceTable(kind: DeviceTableKind): DeviceTableRow[] {
    return DEVICE_TABLE_PRINTED[kind].map((n) => ({ name: n ?? "", model: "", calibrated_at: "", maker: "" }))
}

/** 保存された payload から表の行を作る（device_table が無い古い保存は device1 / device2 を振り分ける） */
export function resolveDeviceTable(payload: unknown, kind: DeviceTableKind): DeviceTableRow[] {
    const printed = DEVICE_TABLE_PRINTED[kind]
    const p = (payload ?? {}) as Record<string, unknown>
    const rows = emptyDeviceTable(kind)

    if (Array.isArray(p.device_table)) {
        printed.forEach((n, i) => {
            const s = (p.device_table as unknown[])[i] as Partial<Record<keyof DeviceTableRow, unknown>> | undefined
            // ★刷り込みの行の名前は刷り込みに揃える（保存に何が入っていても紙の機器名が正）
            rows[i] = {
                name: n ?? text(s?.name),
                model: text(s?.model),
                calibrated_at: text(s?.calibrated_at),
                maker: text(s?.maker),
            }
        })
        return rows
    }

    const used = new Set<number>()
    const legacy: [unknown, number][] = [[p.device1, 0], [p.device2, DEVICE_TABLE_COLUMN_ROWS]]
    for (const [raw, fallback] of legacy) {
        const d = (raw ?? {}) as Partial<Record<keyof DeviceTableRow, unknown>>
        if (!hasValue(d)) continue
        const name = text(d.name).trim()
        let at = -1
        if (name) {
            at = printed.findIndex((n, i) => n !== null && !used.has(i) && sameName(n, name))
            if (at < 0) at = printed.findIndex((n, i) => n === null && !used.has(i))
        } else if (!used.has(fallback)) {
            at = fallback
        }
        // ★空欄の行は 11の1 で 3・11の2 で 9 あり、古い保存は 2 台までなので -1 にはならない
        if (at < 0) throw new Error(`測定機器の表に置く行が無い（${kind}・${name || "機器名なし"}）`)
        used.add(at)
        rows[at] = {
            name: printed[at] ?? name,
            model: text(d.model),
            calibrated_at: text(d.calibrated_at),
            maker: text(d.maker),
        }
    }
    return rows
}
