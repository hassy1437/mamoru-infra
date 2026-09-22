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
 *   点検アプリの物件は RLS が user_id = 本人（inspection.properties の rls_properties）なので、
 *   画面に住所が出る相手＝物件の持ち主だけ。★マッチング側と同じ考え方（画面に住所が出る相手にだけ）。
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
