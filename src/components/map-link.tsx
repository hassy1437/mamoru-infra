import { ExternalLink } from "lucide-react"

import { type AddressParts, googleMapsSearchUrl } from "@/lib/maps-link"

/**
 * 「地図で開く」リンク（Google マップ・新しいタブ）。
 * ★写し: mamoruinfra-web の components/ui/map-link.tsx（9b60055）。色だけ点検アプリの青系に合わせた。
 * ★address が無ければ何も描かない。使ってよい画面は scripts/check-map-link.mjs の一覧で固定している。
 */
export default function MapLink(parts: AddressParts & { className?: string }) {
    const href = googleMapsSearchUrl(parts)
    if (!href) return null
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1 text-sm font-medium text-blue-600 underline underline-offset-2 hover:no-underline ${parts.className ?? ""}`}
        >
            地図で開く
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="sr-only">（Google マップ・新しいタブで開きます）</span>
        </a>
    )
}
