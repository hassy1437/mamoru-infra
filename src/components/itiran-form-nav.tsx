import Link from "next/link"
import { ArrowRight } from "lucide-react"
import Breadcrumb from "@/components/breadcrumb"
import StepIndicator from "@/components/step-indicator"
import { INSPECTION_STEPS } from "@/lib/inspection-steps"
import {
    buildItiranInputHref,
    getItiranInputNextLabel,
    getItiranInputPageTitle,
    getNextItiranInputStep,
    type ItiranInputStepId,
} from "@/lib/itiran-input-flow"

type NavProps = {
    soukatsuId: string
    itiranId: string
    currentStepId: ItiranInputStepId
    equipmentTypes: unknown
}

/** 「次へ」の行き先（次の様式・無ければ結果出力）。上のナビと下のナビで同じものを使う */
function forwardOf(soukatsuId: string, itiranId: string, currentStepId: ItiranInputStepId, equipmentTypes: unknown) {
    const hubHref = `/inspection/${soukatsuId}/itiran/${itiranId}`
    const nextStep = getNextItiranInputStep(currentStepId, equipmentTypes)
    return {
        hubHref,
        isOutput: !nextStep,
        forwardHref: nextStep ? buildItiranInputHref(nextStep, soukatsuId, itiranId) : `${hubHref}/output`,
        forwardLabel: nextStep ? getItiranInputNextLabel(nextStep) : "結果出力へ",
    }
}

// 23様式ページ共通ナビ（#4b）。個々のページのヘッダ（戻る/次へ/タイトル）を1箇所に集約する。
//
// ★Breadcrumb の hub ノードは必ず itiranId 付き `/inspection/[id]/itiran/[itiranId]`。
//   bare `/inspection/[id]/itiran` は新規itiran生成ページ＝絶対に指さない（この共有部品に閉じ込めて23枚で担保）。
// ★「戻る」は常に別記ハブ固定。一覧(/reports)から順次でなく飛び込んでも必ず作業机(ハブ)に戻れる。
//   prev様式チェーンは廃止（順次でない着地で誤誘導するため）。forward next は維持（順次入力の利便）。
// ★ステッパーはハブと同じ3フェーズ（別記入力＝currentStep 3）を非クリックで表示（現在地の帯）。
export default function ItiranFormNav({
    soukatsuId,
    itiranId,
    currentStepId,
    equipmentTypes,
}: NavProps) {
    const { hubHref, isOutput, forwardHref, forwardLabel } = forwardOf(soukatsuId, itiranId, currentStepId, equipmentTypes)
    const title = getItiranInputPageTitle(currentStepId)

    return (
        <div className="mb-6">
            <Breadcrumb items={[
                { label: "点検", href: "/inspection" },
                { label: "総括表", href: `/inspection/${soukatsuId}` },
                // ★点検票の一覧（2026-10-21）。以前はここが「点検者」、戻るリンクが「別記ハブ」、結果出力が「別記」と、同じ画面を 3 つの名前で呼んでいた
                { label: "点検票の入力", href: hubHref },
                { label: title },
            ]} />
            <StepIndicator steps={[...INSPECTION_STEPS]} currentStep={3} />
            <div className="flex items-center justify-between gap-3 flex-wrap mt-2">
                <Link href={hubHref} className="inline-flex min-h-11 items-center text-blue-600 hover:underline text-sm">
                    &larr; 点検票の一覧に戻る
                </Link>
                <Link
                    href={forwardHref}
                    className={`inline-flex min-h-11 items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors ${
                        isOutput ? "bg-blue-600 hover:bg-blue-700" : "bg-emerald-600 hover:bg-emerald-700"
                    }`}
                >
                    {forwardLabel}
                    <ArrowRight className="w-4 h-4" />
                </Link>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mt-4">{title}</h1>
        </div>
    )
}

/**
 * 点検票のいちばん下の「次へ」（録音 102・2026-10-20）。
 * ★上のナビにしか無く、スマホでは長い点検票（第6 は約 41 画面）を最後まで入れたあと、上までスクロールし直していた。
 * ★スマホの画面下の帯（form-action-bar）に隠れないよう、帯の高さぶんの余白はここで取る（このナビがページの最後）
 */
export function ItiranFormNavBottom({ soukatsuId, itiranId, currentStepId, equipmentTypes }: NavProps) {
    const { hubHref, isOutput, forwardHref, forwardLabel } = forwardOf(soukatsuId, itiranId, currentStepId, equipmentTypes)
    return (
        <nav aria-label="次の様式へ" className="mt-8 flex flex-col gap-2 pb-24 sm:flex-row sm:items-center sm:justify-between md:pb-0">
            <Link href={hubHref} className="inline-flex min-h-11 items-center text-blue-600 hover:underline text-sm">
                &larr; 点検票の一覧に戻る
            </Link>
            <Link
                href={forwardHref}
                className={`inline-flex min-h-11 items-center justify-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors ${
                    isOutput ? "bg-blue-600 hover:bg-blue-700" : "bg-emerald-600 hover:bg-emerald-700"
                }`}
            >
                {forwardLabel}
                <ArrowRight className="w-4 h-4" />
            </Link>
        </nav>
    )
}
