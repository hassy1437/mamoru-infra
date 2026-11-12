import Link from "next/link"
import { Wrench } from "lucide-react"

/**
 * 画面の一番上の帯（2026-11-11・橋本さん「緑をベースにかっこよく」）。
 *   深い緑の帯に「マモルインフラ」。押すとホーム（/tool）へ。スクロールすると一緒に流れる（場所を取らない）。
 *   ★印刷・PDF のプレビューでは出さない。
 */
export default function AppHeader() {
    return (
        <header className="bg-gradient-to-r from-brand-900 via-brand-800 to-brand-700 text-white print:hidden">
            <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-4">
                <Link href="/tool" className="no-3d flex items-center gap-2" aria-label="マモルインフラ ホーム">
                    <span className="grid h-7 w-7 place-items-center rounded-md bg-white/10 ring-1 ring-white/25">
                        <Wrench className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                    </span>
                    <span className="text-[15px] font-extrabold tracking-wider">マモルインフラ</span>
                </Link>
                <span className="text-[11px] font-medium tracking-wide text-brand-200">消防設備点検・報告書</span>
            </div>
        </header>
    )
}
