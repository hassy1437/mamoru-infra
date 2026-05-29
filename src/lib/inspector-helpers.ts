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
