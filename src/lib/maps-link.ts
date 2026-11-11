/**
 * Google マップへのリンク（2026-09-22・9/7 の吉田さんの要望）。
 *
 * ■ ★写し（2026-09-22）
 *   mamoruinfra-web の lib/maps-link.ts（コミット 9b60055）を写した。別リポジトリなので共有できない。
 *   ★URL の形・「番地が無ければ作らない」の判断は向こうと同じに保つ。向こうを変えたらこちらも変える。
 *   点検アプリの住所は 1 本の文字列（building_address）なので、prefecture / municipality は null で渡す。
 *
 * ■ ★どこに出すか（住所が見える相手にだけ）
 *   URL に住所がそのまま入る。＝ ★住所を見せてよい相手にしか出さない。
 *   点検アプリの物件は RLS が「会社の人なら」（inspection.properties の rls_properties・20261231120000）なので、
 *   画面に住所が出る相手＝物件の持ち主の会社の人だけ。★マッチング側と同じ考え方（画面に住所が出る相手にだけ）。
 *   出す画面は scripts/check-map-link.mjs の一覧で固定している。
 *
 * ■ URL の形
 *   API キーの要らない Maps URLs（search）: https://www.google.com/maps/search/?api=1&query=<住所>
 */

export const GOOGLE_MAPS_SEARCH = "https://www.google.com/maps/search/?api=1&query="

export type AddressParts = {
    prefecture: string | null | undefined
    municipality: string | null | undefined
    /** 番地・建物名。★これが無ければリンクを作らない（府県・市区町村だけでは出さない） */
    address: string | null | undefined
}

/** 住所（府県＋市区町村＋番地）の Google マップ検索 URL。★番地が無ければ null。 */
export function googleMapsSearchUrl(parts: AddressParts): string | null {
    const address = parts.address?.trim()
    if (!address) return null
    const query = `${parts.prefecture ?? ""}${parts.municipality ?? ""}${address}`.replace(/\s+/g, " ").trim()
    return GOOGLE_MAPS_SEARCH + encodeURIComponent(query)
}

/**
 * ★現場の位置（緯度・経度）があるときの道案内（Google マップの「経路」・地図などの改善 3・2026-11-11）。
 *   ★点検アプリだけ（マッチング側には位置の列が無い）。キーの要らない Maps URLs（dir）:
 *   https://www.google.com/maps/dir/?api=1&destination=<緯度>,<経度>
 *   ★住所より確か（大きい敷地・入口が裏の建物）。日本の外・片方だけなら null（住所の検索に戻る）
 */
export const GOOGLE_MAPS_DIRECTIONS = "https://www.google.com/maps/dir/?api=1&destination="

export function googleMapsDirectionsUrl(lat: number | null | undefined, lng: number | null | undefined): string | null {
    if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
    if (lat < 20 || lat > 46 || lng < 122 || lng > 154) return null
    return `${GOOGLE_MAPS_DIRECTIONS}${lat.toFixed(6)},${lng.toFixed(6)}`
}
