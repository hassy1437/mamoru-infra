"use client"

import dynamic from "next/dynamic"
import { useCallback, useState } from "react"
import { useRouter } from "next/navigation"
import { Crosshair, Loader2, Map as MapIcon, MapPin, Search, X } from "lucide-react"
import { toast } from "sonner"

import MapLink from "@/components/map-link"
import { supabase } from "@/lib/supabase"
import {
    BUILDING_ZOOM,
    FALLBACK_CENTER,
    FALLBACK_ZOOM,
    HERE_ERROR,
    HERE_ROUGH_METERS,
    geocodeAddress,
    getHere,
    roundCoord,
    type LatLng,
} from "@/lib/property-location"

// ★地図はブラウザでだけ描く（Leaflet は window を使う）
const GsiMap = dynamic(() => import("@/components/gsi-map"), {
    ssr: false,
    loading: () => <div className="h-full w-full animate-pulse rounded-lg bg-slate-100" />,
})

/**
 * 物件の画面の「現場の位置」（地図などの改善 3・2026-11-11）。
 * ★使うのは現場の職人さん（作業しながら）。字は少なく、大きいボタンを押すだけ:
 *   位置が無い → 「いまここにする」（端末の位置をそのまま保存・取り消せる）／「地図で選ぶ」
 *   位置がある → 小さい地図＋「ナビ」（Google マップの経路）／「位置を直す」
 * 位置の取り方・地図は src/lib/property-location.ts。DB は inspection.properties.location_lat / location_lng。
 */
export default function PropertyLocationCard({
    propertyId,
    address,
    location,
}: {
    propertyId: string
    address: string
    location: LatLng | null
}) {
    const router = useRouter()
    const [saved, setSaved] = useState<LatLng | null>(location)
    const [busy, setBusy] = useState<"here" | "save" | "find" | null>(null)
    // ★地図を開くときの真ん中（位置があればそこ・無ければ住所から探した所・見つからなければ大阪駅のあたり）
    const [picking, setPicking] = useState<{ at: LatLng; zoom: number } | null>(null)

    const openPicker = async () => {
        if (saved) {
            setPicking({ at: saved, zoom: BUILDING_ZOOM })
            return
        }
        // ★「地図で選ぶ」を押したときだけ、住所を国土地理院の住所検索に送る
        setBusy("find")
        const at = await geocodeAddress(address)
        setBusy(null)
        if (!at) toast.message("住所から見つかりませんでした。地図を動かして選んでください")
        setPicking(at ? { at, zoom: BUILDING_ZOOM } : { at: FALLBACK_CENTER, zoom: FALLBACK_ZOOM })
    }

    /** 位置を書く（null で空に戻す）。★できたら画面の位置も替える */
    const persist = async (at: LatLng | null): Promise<boolean> => {
        const row = at ? { location_lat: roundCoord(at.lat), location_lng: roundCoord(at.lng) } : { location_lat: null, location_lng: null }
        const { error } = await supabase.from("properties").update(row).eq("id", propertyId)
        if (error) {
            toast.error("保存できませんでした。電波のある所でもう一度押してください")
            return false
        }
        setSaved(at ? { lat: row.location_lat as number, lng: row.location_lng as number } : null)
        router.refresh()
        return true
    }

    /** 保存して「取り消す」を出す（★押し間違えても 1 回で前に戻せる） */
    const save = async (at: LatLng, before: LatLng | null): Promise<boolean> => {
        const ok = await persist(at)
        if (ok) toast.success("位置を保存しました", { action: { label: "取り消す", onClick: () => void persist(before) } })
        return ok
    }

    const here = async () => {
        setBusy("here")
        const r = await getHere()
        setBusy(null)
        if (!r.ok) {
            toast.error(HERE_ERROR[r.reason])
            return
        }
        await save(r.at, saved)
        if (r.accuracy > HERE_ROUGH_METERS) toast.message(`ずれが約 ${Math.round(r.accuracy)}m あります。「位置を直す」で合わせられます`)
    }

    return (
        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6" aria-labelledby="site-location-heading">
            <h2 id="site-location-heading" className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-800">
                <MapPin className="h-5 w-5 text-red-600" aria-hidden="true" />
                現場の位置
            </h2>

            {saved ? (
                <div className="space-y-3">
                    <GsiMap key={`${saved.lat},${saved.lng}`} center={saved} zoom={BUILDING_ZOOM - 1} interactive={false} className="h-40" />
                    <div className="grid grid-cols-2 gap-2">
                        <MapLink prefecture={null} municipality={null} address={address} lat={saved.lat} lng={saved.lng} variant="button" />
                        <button
                            type="button"
                            onClick={openPicker}
                            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-base font-bold text-slate-700 hover:bg-slate-50"
                        >
                            <MapIcon className="h-5 w-5" aria-hidden="true" />
                            位置を直す
                        </button>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                        type="button"
                        onClick={here}
                        disabled={busy !== null}
                        aria-busy={busy === "here"}
                        className="inline-flex min-h-14 items-center justify-center gap-2 rounded-lg bg-red-600 px-5 text-lg font-bold text-white hover:bg-red-700 disabled:cursor-wait"
                    >
                        {busy === "here" ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Crosshair className="h-5 w-5" aria-hidden="true" />}
                        いまここにする
                    </button>
                    <button
                        type="button"
                        onClick={openPicker}
                        disabled={busy !== null}
                        aria-busy={busy === "find"}
                        className="inline-flex min-h-14 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-5 text-lg font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-wait"
                    >
                        {busy === "find" ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <MapIcon className="h-5 w-5" aria-hidden="true" />}
                        地図で選ぶ
                    </button>
                </div>
            )}

            {picking && (
                <LocationPicker
                    address={address}
                    start={picking}
                    onClose={() => setPicking(null)}
                    onPick={async (at) => {
                        setBusy("save")
                        const ok = await save(at, saved)
                        setBusy(null)
                        if (ok) setPicking(null)
                    }}
                    saving={busy === "save"}
                />
            )}
        </section>
    )
}

/** 全画面の地図（真ん中のピンに合わせて「この場所にする」） */
function LocationPicker({
    address,
    start,
    onClose,
    onPick,
    saving,
}: {
    address: string
    start: { at: LatLng; zoom: number }
    onClose: () => void
    onPick: (at: LatLng) => void
    saving: boolean
}) {
    const [center, setCenter] = useState<LatLng>(start.at)
    const [jump, setJump] = useState<{ at: LatLng; zoom?: number; seq: number } | null>(null)
    const [busy, setBusy] = useState<"here" | "address" | null>(null)

    const goTo = (at: LatLng) => setJump((j) => ({ at, zoom: BUILDING_ZOOM, seq: (j?.seq ?? 0) + 1 }))

    const fromAddress = useCallback(async () => {
        setBusy("address")
        const at = await geocodeAddress(address)
        setBusy(null)
        if (!at) {
            toast.error("住所から見つかりませんでした。地図を動かして選んでください")
            return
        }
        goTo(at)
    }, [address])

    const fromHere = async () => {
        setBusy("here")
        const r = await getHere()
        setBusy(null)
        if (!r.ok) {
            toast.error(HERE_ERROR[r.reason])
            return
        }
        goTo(r.at)
    }

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-white" role="dialog" aria-modal="true" aria-label="現場の位置を選ぶ">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
                <p className="text-sm font-bold text-slate-700">地図を動かして、ピンを入口に合わせる</p>
                <button type="button" onClick={onClose} className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-slate-100" aria-label="閉じる">
                    <X className="h-6 w-6" aria-hidden="true" />
                </button>
            </div>
            <GsiMap center={start.at} zoom={start.zoom} jump={jump} onCenterChange={setCenter} className="min-h-0 flex-1 rounded-none border-0" />
            <div className="space-y-2 border-t border-slate-200 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <div className="grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        onClick={fromHere}
                        disabled={busy !== null}
                        aria-busy={busy === "here"}
                        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-base font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-wait"
                    >
                        {busy === "here" ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Crosshair className="h-5 w-5" aria-hidden="true" />}
                        いまここ
                    </button>
                    <button
                        type="button"
                        onClick={fromAddress}
                        disabled={busy !== null || !address.trim()}
                        aria-busy={busy === "address"}
                        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-base font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-wait"
                    >
                        {busy === "address" ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Search className="h-5 w-5" aria-hidden="true" />}
                        住所の場所
                    </button>
                </div>
                <button
                    type="button"
                    onClick={() => onPick(center)}
                    disabled={saving}
                    aria-busy={saving}
                    className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-5 text-lg font-bold text-white hover:bg-red-700 disabled:cursor-wait"
                >
                    {saving ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <MapPin className="h-5 w-5" aria-hidden="true" />}
                    この場所にする
                </button>
            </div>
        </div>
    )
}
