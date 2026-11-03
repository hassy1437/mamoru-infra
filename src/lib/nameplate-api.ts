/**
 * 銘板の読み取り: 画面とサーバの受け渡しの形（2026-11-03）。★ブラウザとサーバの両方から読む（キーは入れない）。
 */
import type { NameplateConsensus, NameplateProvider } from "./nameplate-consensus.ts"
import type { NameplateFieldKey } from "./nameplate-reading.ts"

export type NameplatePurpose = "instrument" | "device"

export type NameplateStatusResponse = { enabled: false } | { enabled: true; used: number; cap: number }

export type NameplateReadResponse =
    | {
          ok: true
          id: string
          consensus: NameplateConsensus
          providers: { provider: NameplateProvider; label: string; ok: boolean }[]
          used: number
          cap: number
      }
    | { ok: false; error: "unauthorized" | "disabled" | "quota" | "bad_request" | "failed"; message: string }

export type NameplateConfirmRequest = { id: string; values: Partial<Record<NameplateFieldKey, string | null>> }
export type NameplateConfirmResponse = { ok: true } | { ok: false; message: string }

/** 送る写真の上限（★ブラウザで長い辺 1568px の JPEG に縮めてから送るので、ふつうは数百 KB） */
export const NAMEPLATE_UPLOAD_MAX_BYTES = 4 * 1024 * 1024
export const NAMEPLATE_MAX_SIDE = 1568
