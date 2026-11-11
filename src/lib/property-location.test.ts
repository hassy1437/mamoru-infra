import { describe, expect, it } from "vitest"

import { googleMapsDirectionsUrl } from "./maps-link"
import { GSI_ATTRIBUTION, GSI_TILE_URL, isJapanLatLng, locationOf, parseGsiAddressSearch, roundCoord } from "./property-location"

describe("現場の位置（地図などの改善 3）", () => {
    it("日本の範囲だけ（DB の決まり 20261231160000 と同じ）", () => {
        expect(isJapanLatLng(34.698402, 135.499878)).toBe(true)
        expect(isJapanLatLng(51.5, -0.12)).toBe(false)
        expect(isJapanLatLng(34.7, null)).toBe(false)
        expect(isJapanLatLng(Number.NaN, 135)).toBe(false)
    })
    it("物件の行から位置を取り出す（片方だけ・空は null）", () => {
        expect(locationOf({ location_lat: 34.7, location_lng: 135.5 })).toEqual({ lat: 34.7, lng: 135.5 })
        expect(locationOf({ location_lat: 34.7, location_lng: null })).toBeNull()
        expect(locationOf({})).toBeNull()
    })
    it("小数 6 けたにそろえる", () => {
        expect(roundCoord(34.69840234)).toBe(34.698402)
    })
    it("国土地理院の住所検索の答え（経度・緯度の順）からいちばん上を取る", () => {
        const json = [
            { geometry: { coordinates: [135.499878, 34.698402], type: "Point" }, type: "Feature", properties: { title: "大阪府大阪市北区梅田一丁目１番３号" } },
            { geometry: { coordinates: [135.5, 34.7], type: "Point" }, type: "Feature", properties: { title: "ほか" } },
        ]
        expect(parseGsiAddressSearch(json)).toEqual({ lat: 34.698402, lng: 135.499878 })
        expect(parseGsiAddressSearch([])).toBeNull()
        expect(parseGsiAddressSearch({})).toBeNull()
        expect(parseGsiAddressSearch([{ geometry: { coordinates: [0, 0] } }])).toBeNull()
    })
    it("★地図は国土地理院・出典を出す", () => {
        expect(GSI_TILE_URL).toMatch(/^https:\/\/cyberjapandata\.gsi\.go\.jp\/xyz\/std\//)
        expect(GSI_ATTRIBUTION).toContain("国土地理院")
    })
    it("位置があれば経路の URL（キー無し）・日本の外や片方だけは null", () => {
        expect(googleMapsDirectionsUrl(34.698402, 135.499878)).toBe("https://www.google.com/maps/dir/?api=1&destination=34.698402,135.499878")
        expect(googleMapsDirectionsUrl(51.5, -0.12)).toBeNull()
        expect(googleMapsDirectionsUrl(34.7, undefined)).toBeNull()
    })
})
