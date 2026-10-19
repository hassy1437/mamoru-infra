import { isBekkiHeadingLabel } from "@/lib/bekki-heading-row"
import { PDF_MERGE_CONFIG } from "@/lib/pdf-merge-config"

/**
 * 様式まるごとの「空欄をすべて良にする」（2026-10-19・打合せ録音 #101 で決定）。
 *
 * ■ なぜ要るか
 *   「この表の空欄を良にする」は表（その1・その2…）ごとのボタンで、異常の無い様式でも表の数だけ押す必要があった。
 *   押し忘れた表は判定が空のまま納品される（blank-judgment-sections.ts の 306 行の件）。
 *
 * ■ 決めたこと（★表ごとのボタンと同じ規則を様式全体にかける）
 *   ・判定が空（""）の行だけ「良」にする。入力済みの良・否は変えない
 *   ・見出し行（紙では全幅の見出し・route は描かない）には入れない
 *   ・画面で畳んでいる行（自動試験機能ありの※行など）には入れない（業者が見ていない行に○を付けない）
 *   ・★点検種別が「機器点検」だけのときは、総合点検の行に入れない（していない点検に○を付けない）
 *   ・行ごとに「良」を入れる。「一式 異常なし」のようにまとめない（紙は行ごとに○が要る）
 *
 * ★表ごとのボタン（各フォームの markAllGood）は従来どおり。総合点検の表で押したときは業者の意思なので入れる。
 * ★scripts/check-bekki-bulk-good.mjs が、23 様式の配線と総合点検の行の数を見張る。
 */

/** ボタンの文言（★23 様式で同じ。scripts/check-bekki-bulk-good.mjs が探す） */
export const BULK_GOOD_BUTTON_LABEL = "この様式の空欄をすべて良にする"

/**
 * 点検種別が「機器点検」だけか。
 * ★PDF の○と同じ読み方をする（drawChoiceCircle は「機器」を含めば機器に○、「総合」を含めば総合に○）。
 *   空欄は route が「機器・総合」（両方に○）に倒すので、機器点検だけではない。
 */
export function isKikiOnlyInspection(inspectionType: string | null | undefined): boolean {
    const t = (inspectionType ?? "").trim()
    return t.includes("機器") && !t.includes("総合")
}

/**
 * 行ラベルからは総合点検と分からない表（★紙では「総合点検」の見出しの下にある）。
 *   値は「この添字から表の終わりまでが総合点検」。
 *   雛形（public/PDF/s50_kokuji14_bekki*.pdf）の「総合点検」の見出しの位置で確かめた（2026-10-19）。
 *   ・別記2 その3: 見出しは 22 行目の上。29〜31 行目（高架水槽方式 放水圧力 など）はラベルに「総合点検」が無い
 *   ・別記3 その4・その5: その4 の頭に見出し。その5（補助散水栓の起動性能等）はその続き
 *   ・別記7・8 その4／別記12 その2／別記14 その3: 頁の頭に見出し（入力画面には見出し行が無い）
 * ★ここに無い様式は、行ラベル（見出し行「総合点検」より下・「総合点検」で始まる行）だけで決まる。
 */
export const SOGO_FROM_INDEX: Readonly<Record<string, Readonly<Record<string, number>>>> = {
    "別記様式第2": { page3_rows: 22 },
    "別記様式第3": { page4_rows: 0, page5_rows: 0 },
    "別記様式第7": { page4_rows: 0 },
    "別記様式第8": { page4_rows: 0 },
    "別記様式第12": { page2_rows: 0 },
    "別記様式第14": { page3_rows: 0 },
}

/** その表の総合点検の行の添字（見出し行は含めない） */
export function sogoRowIndexes(form: string, key: string, labels: readonly string[]): Set<number> {
    const from = SOGO_FROM_INDEX[form]?.[key]
    const out = new Set<number>()
    let inSogo = false
    labels.forEach((label, i) => {
        if (isBekkiHeadingLabel(label)) {
            inSogo = label.startsWith("総合点検")
            return
        }
        if (inSogo || label.startsWith("総合点検") || (from !== undefined && i >= from)) out.add(i)
    })
    return out
}

/** route の API パス → 「別記様式第N」（BEKKI_ROW_LABELS のキー）。共通ベースは apiPath しか持たないため */
export function bekkiFormNameOfApiRoute(apiRoute: string): string | null {
    const config = Object.values(PDF_MERGE_CONFIG).find((c) => c.apiRoute === apiRoute)
    return config ? `別記様式第${String(config.formNo).replace(".", "の")}` : null
}

export type BulkGoodSection = {
    key: string
    labels: readonly string[]
    rows: readonly { judgment?: string }[]
    /** 画面で畳んでいる行（共通ベースの hiddenRow）。入れない */
    hiddenRow?: (label: string, idx: number) => boolean
}

export type BulkGoodPlan = {
    /** 表ごとの「良」にする行の添字 */
    targets: Record<string, number[]>
    /** 「良」にする行の数 */
    count: number
    /** 機器点検だけなので空欄のまま残す総合点検の行の数 */
    skippedSogo: number
    kikiOnly: boolean
}

/** 何行を「良」にするかを決める（★描かない・書き換えない。確認の文言と適用の両方がこれを使う） */
export function planBulkGood(
    form: string,
    inspectionType: string | null | undefined,
    sections: readonly BulkGoodSection[],
): BulkGoodPlan {
    const kikiOnly = isKikiOnlyInspection(inspectionType)
    const targets: Record<string, number[]> = {}
    let count = 0
    let skippedSogo = 0
    for (const s of sections) {
        const sogo = sogoRowIndexes(form, s.key, s.labels)
        const idx: number[] = []
        s.labels.forEach((label, i) => {
            if (isBekkiHeadingLabel(label)) return
            if (s.hiddenRow?.(label, i)) return
            if ((s.rows[i]?.judgment ?? "") !== "") return
            if (kikiOnly && sogo.has(i)) {
                skippedSogo += 1
                return
            }
            idx.push(i)
        })
        targets[s.key] = idx
        count += idx.length
    }
    return { targets, count, skippedSogo, kikiOnly }
}

/**
 * 決めた行を「良」にする。★適用の時点でも判定が空の行だけ（確認の間に入れた良・否を上書きしない）。
 * targets が無ければ同じ配列を返す（再描画を起こさない）。
 */
export function applyBulkGood<R extends { judgment: string }>(rows: R[], targets: readonly number[] | undefined): R[] {
    if (!targets || targets.length === 0) return rows
    const set = new Set(targets)
    return rows.map((row, i) => (set.has(i) && row.judgment === "" ? { ...row, judgment: "良" } : row))
}

/** 確認の文言 */
export function bulkGoodConfirmText(plan: BulkGoodPlan): string {
    const lines = [
        `この様式の判定が空欄の ${plan.count} 行を「良」にします。`,
        "・入力済みの良・否は変えません",
    ]
    if (plan.skippedSogo > 0) lines.push(`・点検種別が機器点検なので、総合点検の ${plan.skippedSogo} 行は空欄のままにします`)
    lines.push("", "よろしいですか？")
    return lines.join("\n")
}

/** 適用後の知らせ（count 0 のときは「何もしなかった理由」） */
export function bulkGoodResultText(plan: BulkGoodPlan): string {
    if (plan.count === 0) {
        return plan.skippedSogo > 0
            ? `判定が空欄の行はありません（総合点検の ${plan.skippedSogo} 行は、点検種別が機器点検のため入れません）`
            : "判定が空欄の行はありません"
    }
    const rest = plan.skippedSogo > 0 ? `（総合点検の ${plan.skippedSogo} 行は空欄のまま）` : ""
    return `${plan.count} 行を「良」にしました${rest}`
}
