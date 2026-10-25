import { ScanText } from "lucide-react"

import MoreInfo from "@/components/more-info"

/**
 * 銘板・ラベルの文字を手で打たずに入れる方法の案内（2026-10-23）。
 * ・端末の文字認識（iPhone のテキスト認識表示・Android の Google レンズ）を使ってもらう。
 *   写真はどこにも送らない（端末の中で読む）。費用もかからない。
 * ・AI で読み取る機能（docs/銘板・過去報告書の読み取り_設計と費用_20261020.md）ができるまでのつなぎ。
 * ★読み間違いはありうるので、貼り付けたあと見比べてもらう（製造者名・型式は法定の報告書に載る）。
 */
export default function CopyTextFromPhotoHint() {
    return (
        // ★やり方は「詳しく見る」に（2026-10-25 注意書きを短く・どの様式にも出るので 1 行に）
        <div className="text-xs text-slate-500">
            <p className="flex items-start gap-1.5">
                <ScanText className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>銘板やラベルの文字は、写真からコピーできます。</span>
            </p>
            <MoreInfo label="やり方" className="pl-5">
                <p>iPhone：写真の文字を長押し →「コピー」／Android：Google レンズ。貼り付けたら、元の文字と見比べてください。</p>
            </MoreInfo>
        </div>
    )
}
