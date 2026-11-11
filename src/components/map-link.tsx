import { ExternalLink, Navigation } from "lucide-react"

import { type AddressParts, googleMapsDirectionsUrl, googleMapsSearchUrl } from "@/lib/maps-link"

/**
 * 「地図で開く」リンク（Google マップ・新しいタブ）。
 * ★写し: mamoruinfra-web の components/ui/map-link.tsx（9b60055）。色だけ点検アプリの青系に合わせた。
 * ★現場の位置（lat/lng）があれば「ナビ」（経路・地図などの改善 3）。無ければ住所の検索。
 * ★address が無ければ何も描かない（位置だけでは出さない＝住所を見せてよい画面でだけ使う）。
 *   使ってよい画面は scripts/check-map-link.mjs の一覧で固定している。
 */
export default function MapLink(parts: AddressParts & { lat?: number | null; lng?: number | null; className?: string; variant?: "link" | "button" }) {
    const search = googleMapsSearchUrl(parts)
    if (!search) return null
    const nav = googleMapsDirectionsUrl(parts.lat, parts.lng)
    const href = nav ?? search
    const look =
        parts.variant === "button"
            ? "inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 text-base font-bold text-white hover:bg-blue-700"
            : "inline-flex min-h-11 items-center gap-1 text-sm font-medium text-blue-600 underline underline-offset-2 hover:no-underline"
    return (
        <a href={href} target="_blank" rel="noopener noreferrer" className={`${look} ${parts.className ?? ""}`}>
            {nav ? <Navigation className="h-4 w-4" aria-hidden="true" /> : null}
            {nav ? "ナビ" : "地図で開く"}
            {nav ? null : <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />}
            <span className="sr-only">（Google マップ・新しいタブで開きます）</span>
        </a>
    )
}
