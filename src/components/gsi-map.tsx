"use client"

import "leaflet/dist/leaflet.css"

import { useEffect, useRef } from "react"
import type { Map as LeafletMap } from "leaflet"
import { MapPin } from "lucide-react"

import { GSI_ATTRIBUTION, GSI_MAX_ZOOM, GSI_TILE_URL, type LatLng } from "@/lib/property-location"

/**
 * 国土地理院の地図（Leaflet・地図などの改善 3）。
 * ★ピンは地図の真ん中に固定（地図を動かして合わせる）。指で小さい印をつまむより、手袋でも合わせやすい。
 * ★出典「国土地理院」を右下に出す（利用の条件）。Leaflet の名前は出さない（字を減らす）。
 * jump の seq が変わったら、その場所へ移る（いまここ・住所で探す）。
 */
export default function GsiMap({
    center,
    zoom,
    interactive = true,
    jump,
    onCenterChange,
    className = "",
}: {
    center: LatLng
    zoom: number
    interactive?: boolean
    jump?: { at: LatLng; zoom?: number; seq: number } | null
    onCenterChange?: (c: LatLng) => void
    className?: string
}) {
    const box = useRef<HTMLDivElement>(null)
    const map = useRef<LeafletMap | null>(null)
    const onChange = useRef(onCenterChange)
    // ★最新の受け手を覚えておく（地図は 1 回だけ作るので、作ったときの受け手に縛られないように）
    useEffect(() => {
        onChange.current = onCenterChange
    }, [onCenterChange])

    useEffect(() => {
        let gone = false
        import("leaflet").then((L) => {
            if (gone || !box.current || map.current) return
            const m = L.map(box.current, {
                center: [center.lat, center.lng],
                zoom,
                zoomControl: interactive,
                dragging: interactive,
                touchZoom: interactive,
                doubleClickZoom: interactive,
                scrollWheelZoom: interactive,
                boxZoom: false,
                keyboard: interactive,
                attributionControl: true,
            })
            m.attributionControl.setPrefix(false)
            L.tileLayer(GSI_TILE_URL, { maxZoom: GSI_MAX_ZOOM, minZoom: 5, attribution: GSI_ATTRIBUTION }).addTo(m)
            m.on("moveend", () => {
                const c = m.getCenter()
                onChange.current?.({ lat: c.lat, lng: c.lng })
            })
            map.current = m
        })
        return () => {
            gone = true
            map.current?.remove()
            map.current = null
        }
        // ★地図は最初の 1 回だけ作る（真ん中の移動は jump で）
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        if (!jump || !map.current) return
        map.current.setView([jump.at.lat, jump.at.lng], jump.zoom ?? map.current.getZoom())
    }, [jump])

    return (
        // ★isolate: Leaflet の重なり順（z-index 400 など）を地図の中に閉じ込める。閉じ込めないと、
        //   物件の画面の小さい地図のピンが、全画面の地図（z-50）の上に透けて出る（2026-11-11 に手元で再現）
        <div className={`relative isolate overflow-hidden rounded-lg border border-slate-200 bg-slate-100 ${className}`}>
            <div ref={box} className="absolute inset-0 z-0" />
            {/* ★真ん中のピン（先が地図の真ん中を指す） */}
            <div className="pointer-events-none absolute left-1/2 top-1/2 z-[500] -translate-x-1/2 -translate-y-full" aria-hidden="true">
                <MapPin className="h-10 w-10 fill-red-600 text-white drop-shadow" strokeWidth={1.5} />
            </div>
        </div>
    )
}
