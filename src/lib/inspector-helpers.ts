/**
 * 点検者 (InspectorData) / 免状 (ShoubouLicense / KensaLicense) の
 * 空オブジェクト生成 helper。
 *
 * itiran-form (点検者一覧入力) と inspector-master-form (点検者マスタ管理) の
 * 双方から利用する共有 helper。元は itiran-form.tsx 内のローカル定義だったが、
 * 点検者マスタ (PR-3) でも必要になったため切り出した。振る舞いは変えていない。
 */
import type { InspectorData, ShoubouLicense, KensaLicense } from "@/types/database"

export const emptyShobouLicense = (): ShoubouLicense => ({
    issue_year: "", issue_month: "", issue_day: "",
    license_number: "", issuing_governor: "",
    training_year: "", training_month: "",
})

export const emptyKensaLicense = (): KensaLicense => ({
    issue_year: "", issue_month: "", issue_day: "",
    license_number: "",
    expiry_year: "", expiry_month: "", expiry_day: "",
})

export const emptyInspector = (): InspectorData => ({
    address: "", name: "", company: "", phone: "", equipment_names: "",
    shoubou_licenses: {
        toku: emptyShobouLicense(), class1: emptyShobouLicense(),
        class2: emptyShobouLicense(), class3: emptyShobouLicense(),
        class4: emptyShobouLicense(), class5: emptyShobouLicense(),
        class6: emptyShobouLicense(), class7: emptyShobouLicense(),
    },
    shoubou_notes: "",
    kensa_licenses: {
        toku: emptyKensaLicense(), class1: emptyKensaLicense(), class2: emptyKensaLicense(),
    },
})

/* ------------------------------------------------------------------ *
 * normalizeInspectorData — 形が欠けた inspector_data を InspectorData に整える
 *
 * ■ なぜ要るか（2026-09-05）
 *   inspector_data は jsonb で、DB 側に形の CHECK が無い（実測: 制約 0 件）。
 *   画面から登録する分は emptyInspector() 起点なので全キーが揃うが、
 *   API / SQL からは {"name":"…"} だけの行を作れる（RLS は本人の行なら通す）。
 *   実際にそれが入り、点検者一覧の作成ページが
 *   TypeError: Cannot read properties of undefined (reading 'toku') で白画面になった。
 *   → 免状エディタは value.shoubou_licenses[key] を無条件に読むため、
 *     キーが 1 つでも欠けるとページ全体が落ちる。
 *
 * ■ なぜ「読む側 1 箇所」にまとめるか
 *   直前の不具合は、同じ補完（{ ...emptyInspector(), ...raw }）を
 *   itiran-form の 1 箇所にだけ書き、他 2 箇所に書き忘れて起きた。
 *   同じ形で足していくと必ず書き忘れが出るので、補完はこの関数だけが持ち、
 *   inspector_data を値として読む箇所は全部ここを通す。
 *   （通っているかは scripts/check-inspector-shape.mjs が静的に見張る）
 *
 * ■ 決めたこと
 *   - 欠けたキーは「空」で埋める。捨てない・推測しない。
 *   - 余分なキーは残す（将来の列を、知らないという理由で消さない）。
 *   - 文字列であるべき欄が文字列でなければ空にする
 *     （null が来ると React の input が uncontrolled に落ちる）。
 *   - 免状は 1 枚ずつ作り直す ＝ 戻り値はどの階層も新しいオブジェクト。
 *     呼び出し側の structuredClone を置き換えられる（マスタと state を共有しない）。
 * ------------------------------------------------------------------ */

/** 文字列の欄。文字列でなければ空にする（null / number / undefined を弾く）。 */
const asText = (value: unknown): string => (typeof value === "string" ? value : "")

const asObject = (value: unknown): Record<string, unknown> =>
    value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {}

const normalizeShoubouLicense = (raw: unknown): ShoubouLicense => {
    const src = asObject(raw)
    const base = emptyShobouLicense()
    return {
        ...base,
        issue_year: asText(src.issue_year) || base.issue_year,
        issue_month: asText(src.issue_month) || base.issue_month,
        issue_day: asText(src.issue_day) || base.issue_day,
        license_number: asText(src.license_number) || base.license_number,
        issuing_governor: asText(src.issuing_governor) || base.issuing_governor,
        training_year: asText(src.training_year) || base.training_year,
        training_month: asText(src.training_month) || base.training_month,
    }
}

const normalizeKensaLicense = (raw: unknown): KensaLicense => {
    const src = asObject(raw)
    const base = emptyKensaLicense()
    return {
        ...base,
        issue_year: asText(src.issue_year) || base.issue_year,
        issue_month: asText(src.issue_month) || base.issue_month,
        issue_day: asText(src.issue_day) || base.issue_day,
        license_number: asText(src.license_number) || base.license_number,
        expiry_year: asText(src.expiry_year) || base.expiry_year,
        expiry_month: asText(src.expiry_month) || base.expiry_month,
        expiry_day: asText(src.expiry_day) || base.expiry_day,
    }
}

export function normalizeInspectorData(raw: unknown): InspectorData {
    const src = asObject(raw)
    const base = emptyInspector()
    const shoubouSrc = asObject(src.shoubou_licenses)
    const kensaSrc = asObject(src.kensa_licenses)

    // ★キーは emptyInspector() の形から取る（免状の種類をここに二重管理しない）。
    const shoubou_licenses = Object.fromEntries(
        Object.keys(base.shoubou_licenses).map((key) => [key, normalizeShoubouLicense(shoubouSrc[key])]),
    ) as InspectorData["shoubou_licenses"]
    const kensa_licenses = Object.fromEntries(
        Object.keys(base.kensa_licenses).map((key) => [key, normalizeKensaLicense(kensaSrc[key])]),
    ) as InspectorData["kensa_licenses"]

    return {
        // ★知らないキーは残す（先に置いて、既知の欄で上書きする）。
        ...src,
        address: asText(src.address),
        name: asText(src.name),
        company: asText(src.company),
        phone: asText(src.phone),
        equipment_names: asText(src.equipment_names),
        shoubou_notes: asText(src.shoubou_notes),
        shoubou_licenses,
        kensa_licenses,
    }
}
