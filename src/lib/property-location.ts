/**
 * 物件の「現場の位置」（地図などの改善 3・2026-11-11）。
 *
 * ■ なぜ要るか
 *   使うのは現場の職人さん（作業しながら）。物件の画面で「いまここ」を 1 回押せば、
 *   次から地図とナビがその場所を指す（住所の検索より確か。大きい敷地・入口が裏にある建物でも迷わない）。
 * ■ 地図: 国土地理院の地図（タイル）。キー・費用・Cookie は要らない。★出典「国土地理院」を地図に出す（利用の条件）
 * ■ 住所で探す: 国土地理院の住所検索（msearch.gsi.go.jp）。★物件の住所を国土地理院に送る（押したときだけ）
 * ■ いまここ: 端末の位置（ブラウザが許可を聞く）。★押したときだけ取る。保存するのは物件の位置だけ（人の位置の記録は残さない）
 * DB: inspection.properties.location_lat / location_lng（20261231160000・日本の範囲だけ・どちらも空か、どちらも値）
 */

export type LatLng = { lat: number; lng: number }

/** 国土地理院の標準地図（ズーム 5〜18） */
export const GSI_TILE_URL = "https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png"
export const GSI_MAX_ZOOM = 18
export const GSI_ATTRIBUTION =
    '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener noreferrer">国土地理院</a>'
export const GSI_ADDRESS_SEARCH = "https://msearch.gsi.go.jp/address-search/AddressSearch?q="

/** 位置が分からないときの地図の真ん中（大阪駅のあたり・ズームは広め） */
export const FALLBACK_CENTER: LatLng = { lat: 34.7025, lng: 135.4959 }
export const FALLBACK_ZOOM = 11
/** 建物を見る大きさ */
export const BUILDING_ZOOM = 18
/** 物件の画面の小さな地図の縮尺（★2026-11-11: 17 では建物の文字が大きく、周りの道が分からなかった → 1 段引いて 16） */
export const PREVIEW_ZOOM = 16

/** DB の決まりと同じ（日本の範囲・20261231160000） */
export function isJapanLatLng(lat: unknown, lng: unknown): boolean {
    return typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng)
        && lat >= 20 && lat <= 46 && lng >= 122 && lng <= 154
}

/** 物件の行から位置を取り出す（無い・片方だけ・日本の外は null） */
export function locationOf(p: { location_lat?: number | null; location_lng?: number | null }): LatLng | null {
    return isJapanLatLng(p.location_lat, p.location_lng) ? { lat: p.location_lat as number, lng: p.location_lng as number } : null
}

/** 小数 6 けた（約 10cm）にそろえる */
export const roundCoord = (v: number) => Math.round(v * 1e6) / 1e6

/** 国土地理院の住所検索の答え（GeoJSON の Feature の並び）から、いちばん上の位置を取り出す */
export function parseGsiAddressSearch(json: unknown): LatLng | null {
    if (!Array.isArray(json) || json.length === 0) return null
    const c = (json[0] as { geometry?: { coordinates?: unknown } })?.geometry?.coordinates
    if (!Array.isArray(c) || c.length < 2) return null
    const [lng, lat] = c as [unknown, unknown]
    return isJapanLatLng(lat, lng) ? { lat: lat as number, lng: lng as number } : null
}

/** 住所 → 位置（国土地理院）。★押したときだけ呼ぶ。見つからない・つながらないときは null */
export async function geocodeAddress(address: string, signal?: AbortSignal): Promise<LatLng | null> {
    const q = address.replace(/\s+/g, " ").trim()
    if (!q) return null
    try {
        const res = await fetch(GSI_ADDRESS_SEARCH + encodeURIComponent(q), { signal }) // fetch-ok: 国土地理院の住所検索（PDF ではない・押したときだけ）
        if (!res.ok) return null
        return parseGsiAddressSearch(await res.json())
    } catch {
        return null
    }
}

export type HereResult = { ok: true; at: LatLng; accuracy: number } | { ok: false; reason: "denied" | "unavailable" | "timeout" | "unsupported" }

/** 端末の位置（いまここ）。★押したときだけ */
export function getHere(): Promise<HereResult> {
    return new Promise((resolve) => {
        if (typeof navigator === "undefined" || !navigator.geolocation) return resolve({ ok: false, reason: "unsupported" })
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ ok: true, at: { lat: pos.coords.latitude, lng: pos.coords.longitude }, accuracy: pos.coords.accuracy }),
            (err) => resolve({ ok: false, reason: err.code === 1 ? "denied" : err.code === 3 ? "timeout" : "unavailable" }),
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
        )
    })
}

/** いまここが取れないときの短い言葉 */
export const HERE_ERROR: Record<Exclude<HereResult, { ok: true }>["reason"], string> = {
    denied: "位置の使用が許可されていません（端末の設定で許可してください）",
    unavailable: "位置が取れませんでした。地図で選んでください",
    timeout: "位置が取れませんでした。もう一度押すか、地図で選んでください",
    unsupported: "この端末では位置が取れません。地図で選んでください",
}

/** この誤差（m）より大きいときは「地図で直せます」と添える */
export const HERE_ROUGH_METERS = 60
