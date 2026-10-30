"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { INSTRUMENT_COLUMNS, type MeasuringInstrument } from "@/lib/measuring-instruments"

export type InstrumentsState =
    | { status: "loading" }
    /** ★表がまだ無い（DB の更新前）・通信の失敗など。様式は今までどおり手で入れられる */
    | { status: "unavailable" }
    | { status: "ready"; instruments: MeasuringInstrument[] }

/**
 * 自分の測定機器の台帳を読む（RLS で自分の行だけ・2026-10-30）。
 * ★読めなくても投げない（unavailable）。様式の入力を止めない。
 * ★同じ画面の中で 2 回目からは読み直さない（1 つの様式の画面では 1 回だけ）。
 */
let cache: Promise<InstrumentsState> | null = null

function load(): Promise<InstrumentsState> {
    cache ??= (async (): Promise<InstrumentsState> => {
        try {
            const { data, error } = await supabase.from("measuring_instruments").select(INSTRUMENT_COLUMNS).order("name")
            if (error || !Array.isArray(data)) return { status: "unavailable" }
            return { status: "ready", instruments: data as MeasuringInstrument[] }
        } catch {
            return { status: "unavailable" }
        }
    })()
    return cache
}

/** 台帳を直したあと（別のタブ）に読み直す */
export function reloadMeasuringInstruments(): Promise<InstrumentsState> {
    cache = null
    return load()
}

export function useMeasuringInstruments(): [InstrumentsState, () => void] {
    const [state, setState] = useState<InstrumentsState>({ status: "loading" })
    useEffect(() => {
        let alive = true
        load().then((s) => { if (alive) setState(s) })
        return () => { alive = false }
    }, [])
    const reload = () => {
        setState({ status: "loading" })
        reloadMeasuringInstruments().then(setState)
    }
    return [state, reload]
}
