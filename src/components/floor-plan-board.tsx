"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent } from "react"
import { AlertTriangle, Camera, CloudOff, ImagePlus, Loader2, RotateCcw, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import { supabase } from "@/lib/supabase"
import {
    KIND_BY_KEY,
    clamp01,
    countByKind,
    floorPlanPath,
    kindsFor,
    type FloorPlanKind,
    type FloorPlanKindInfo,
} from "@/lib/floor-plan-kinds"
import { isOfflineError, pendingSnapshot, readPending, subscribePending, writePending, type PendingPin } from "@/lib/floor-plan-queue"

/**
 * 見取り図と設備の印（地図などの改善 6・2026-11-11）。
 * ★使うのは現場の職人さん（作業しながら）。字は打たない:
 *   階を選ぶ → 見取り図を撮る → 下の設備を選ぶ → 図をタップで印。印をタップ →「不良」「消す」
 * ★電波の無い所で置いた印は端末に覚えて、電波が戻ったら送る（src/lib/floor-plan-queue.ts）
 * 種類・階の決まりは src/lib/floor-plan-kinds.ts。DB は inspection.floor_plans / floor_plan_pins（20261231170000）。
 */

export type BoardPin = { id: string; kind: FloorPlanKind; x: number; y: number; defect: boolean; pending?: boolean }
export type BoardPlan = {
    id: string
    floor: string
    imagePath: string
    imageUrl: string | null
    width: number
    height: number
    pins: BoardPin[]
}

const MAX_SIDE = 2000
const MAX_BYTES = 5 * 1024 * 1024
const ZOOMS = [1, 2, 3] as const

/** 写真を縮める（★向きは createImageBitmap が直す・付帯情報は残らない）。src/components/nameplate-read-button.tsx と同じやり方 */
async function shrink(file: File): Promise<{ blob: Blob; width: number; height: number }> {
    let source: ImageBitmap | HTMLImageElement
    let w: number
    let h: number
    if (typeof createImageBitmap === "function") {
        const bmp = await createImageBitmap(file, { imageOrientation: "from-image" })
        source = bmp
        w = bmp.width
        h = bmp.height
    } else {
        const url = URL.createObjectURL(file)
        try {
            const img = new Image()
            img.src = url
            await img.decode()
            source = img
            w = img.naturalWidth
            h = img.naturalHeight
        } finally {
            URL.revokeObjectURL(url)
        }
    }
    const scale = Math.min(1, MAX_SIDE / Math.max(w, h))
    const width = Math.max(1, Math.round(w * scale))
    const height = Math.max(1, Math.round(h * scale))
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("canvas")
    ctx.drawImage(source, 0, 0, width, height)
    if ("close" in source) source.close()
    for (const quality of [0.82, 0.7, 0.55]) {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality))
        if (blob && blob.size <= MAX_BYTES) return { blob, width, height }
    }
    throw new Error("too_large")
}

function PinMark({ info, size = "md", defect = false, pending = false }: { info: FloorPlanKindInfo; size?: "sm" | "md"; defect?: boolean; pending?: boolean }) {
    const box = size === "sm" ? "h-6 w-6 text-[11px]" : "h-7 w-7 text-xs"
    // ★不良は赤い太い輪と「!」・送っていない印は点線の輪（色だけに頼らない）
    const ring = defect ? "ring-4 ring-red-600" : pending ? "outline-2 outline-dashed outline-slate-900" : ""
    return (
        <span className={`relative inline-flex ${box} shrink-0 items-center justify-center rounded-full border-2 border-white font-bold text-white shadow ${info.bg} ${ring}`} aria-hidden="true">
            {info.mark}
            {defect && (
                <span className="absolute -right-2 -top-2 inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-extrabold text-white">!</span>
            )}
        </span>
    )
}

export default function FloorPlanBoard({
    propertyId,
    companyId,
    equipmentTypes,
    floors,
    initialFloor,
    plans: initialPlans,
}: {
    propertyId: string
    companyId: string
    equipmentTypes: string[]
    floors: string[]
    initialFloor: string
    plans: BoardPlan[]
}) {
    const [plans, setPlans] = useState<BoardPlan[]>(initialPlans)
    const [floor, setFloor] = useState(initialFloor)
    const [kind, setKind] = useState<FloorPlanKind | null>(null)
    const [zoom, setZoom] = useState<(typeof ZOOMS)[number]>(1)
    const [busy, setBusy] = useState(false)
    const [openPin, setOpenPin] = useState<string | null>(null)
    const [showMore, setShowMore] = useState(false)
    const camera = useRef<HTMLInputElement>(null)
    const library = useRef<HTMLInputElement>(null)
    const surface = useRef<HTMLDivElement>(null)
    const [sending, setSending] = useState(false)

    // ★端末に覚えている（まだ送れていない）印。localStorage が変わったら描き直す
    const planIds = useMemo(() => plans.map((p) => p.id), [plans])
    const snapshot = useSyncExternalStore(subscribePending, () => pendingSnapshot(planIds), () => "[]")
    const pendingByPlan = useMemo(() => {
        const out = new Map<string, PendingPin[]>()
        if (snapshot === "[]") return out
        for (const id of planIds) {
            const list = readPending(id)
            if (list.length) out.set(id, list)
        }
        return out
    }, [snapshot, planIds])
    const pendingCount = [...pendingByPlan.values()].reduce((n, l) => n + l.length, 0)

    const plan = plans.find((p) => p.floor === floor) ?? null
    const shownPins: BoardPin[] = plan
        ? [...plan.pins, ...(pendingByPlan.get(plan.id) ?? []).map((q) => ({ id: q.tempId, kind: q.kind, x: q.x, y: q.y, defect: q.defect, pending: true }))]
        : []
    const { main, more } = kindsFor(equipmentTypes)
    const palette = showMore ? [...main, ...more] : main
    const counts = countByKind(shownPins)
    const pinCount = (f: string) => plans.find((p) => p.floor === f)?.pins.length ?? 0

    const updatePins = (planId: string, fn: (pins: BoardPin[]) => BoardPin[]) =>
        setPlans((prev) => prev.map((p) => (p.id === planId ? { ...p, pins: fn(p.pins) } : p)))

    /** 覚えている印を送る（電波が戻ったとき・開いたとき・「いま送る」） */
    const flush = useCallback(async (manual = false) => {
        const ids = plans.map((p) => p.id)
        const all = ids.flatMap((id) => readPending(id))
        if (all.length === 0) return
        setSending(true)
        let sent = 0
        let dropped = 0
        for (const q of all) {
            const { data, error } = await supabase
                .from("floor_plan_pins")
                .insert({ floor_plan_id: q.planId, kind: q.kind, x: q.x, y: q.y, defect: q.defect })
                .select("id")
                .single()
            if (error || !data) {
                if (isOfflineError(error)) break
                // ★電波でない理由（見取り図が消された・権限が無い）→ 捨てて知らせる
                dropped += 1
            } else {
                sent += 1
                const saved: BoardPin = { id: data.id as string, kind: q.kind, x: q.x, y: q.y, defect: q.defect }
                setPlans((prev) => prev.map((p) => (p.id === q.planId ? { ...p, pins: [...p.pins, saved] } : p)))
            }
            writePending(q.planId, readPending(q.planId).filter((r) => r.tempId !== q.tempId))
        }
        setSending(false)
        if (sent) toast.success(`覚えていた印を ${sent} 個 送りました`)
        if (dropped) toast.error(`送れなかった印が ${dropped} 個ありました（見取り図が撮り直された・消された など）`)
        if (manual && !sent && !dropped) toast.error("まだ電波がありません")
    }, [plans])

    // ★電波が戻ったら送る・開いたときにも 1 回送る。
    //   いちばん新しい flush を ref で呼ぶ（開いたときの flush は見取り図がまだ無い一覧を持っていて、
    //   あとで撮った階の印を送れなかった・2026-11-11 に手元で再現）
    const flushRef = useRef(flush)
    useEffect(() => {
        flushRef.current = flush
    }, [flush])
    useEffect(() => {
        const onOnline = () => void flushRef.current()
        window.addEventListener("online", onOnline)
        const t = window.setTimeout(() => void flushRef.current(), 500)
        return () => {
            window.removeEventListener("online", onOnline)
            window.clearTimeout(t)
        }
    }, [])

    const chooseFloor = (f: string) => {
        setFloor(f)
        setOpenPin(null)
        setZoom(1)
        // ★開き直しても同じ階に戻れるように（履歴は増やさない）
        window.history.replaceState(null, "", `?floor=${encodeURIComponent(f)}`)
    }

    /** 撮った写真を入れる（★撮り直しは、新しい写真を置いてから古いものと印を消す＝電波が切れても前のが残る） */
    const onFile = async (file: File | undefined) => {
        if (!file) return
        const old = plan
        const oldCount = old ? old.pins.length + (pendingByPlan.get(old.id)?.length ?? 0) : 0
        if (old && oldCount > 0 && !window.confirm(`この階の印 ${oldCount} 個も消えます。撮り直しますか？`)) return
        setBusy(true)
        try {
            const { blob, width, height } = await shrink(file)
            const path = floorPlanPath(companyId, propertyId, floor, crypto.randomUUID())
            const up = await supabase.storage.from("floor-plans").upload(path, blob, { contentType: "image/jpeg", upsert: false })
            if (up.error) throw up.error
            let planId: string
            if (old) {
                const { error } = await supabase.from("floor_plans").update({ image_path: path, image_width: width, image_height: height }).eq("id", old.id)
                if (error) {
                    await supabase.storage.from("floor-plans").remove([path])
                    throw error
                }
                await supabase.from("floor_plan_pins").delete().eq("floor_plan_id", old.id)
                await supabase.storage.from("floor-plans").remove([old.imagePath])
                writePending(old.id, []) // ★撮り直したら、覚えていた印も捨てる（位置が合わない）
                planId = old.id
            } else {
                const { data, error } = await supabase
                    .from("floor_plans")
                    .insert({ property_id: propertyId, floor, image_path: path, image_width: width, image_height: height })
                    .select("id")
                    .single()
                if (error || !data) {
                    await supabase.storage.from("floor-plans").remove([path])
                    throw error ?? new Error("insert")
                }
                planId = data.id as string
            }
            const next: BoardPlan = { id: planId, floor, imagePath: path, imageUrl: URL.createObjectURL(blob), width, height, pins: [] }
            setPlans((prev) => [...prev.filter((p) => p.floor !== floor), next])
            setZoom(1)
            toast.success("入れました。下の設備を選んで、図をタップ")
        } catch {
            toast.error("入れられませんでした。電波のある所でもう一度")
        } finally {
            setBusy(false)
        }
    }

    const removePin = async (planId: string, pin: BoardPin) => {
        setOpenPin(null)
        if (pin.pending) {
            writePending(planId, readPending(planId).filter((q) => q.tempId !== pin.id))
            return
        }
        updatePins(planId, (pins) => pins.filter((p) => p.id !== pin.id))
        const { error } = await supabase.from("floor_plan_pins").delete().eq("id", pin.id)
        if (error) {
            updatePins(planId, (pins) => [...pins, pin])
            toast.error("消せませんでした。電波のある所でもう一度")
        }
    }

    /** 不良の目印を付ける・外す */
    const toggleDefect = async (planId: string, pin: BoardPin) => {
        const next = !pin.defect
        if (pin.pending) {
            writePending(planId, readPending(planId).map((q) => (q.tempId === pin.id ? { ...q, defect: next } : q)))
            return
        }
        updatePins(planId, (pins) => pins.map((p) => (p.id === pin.id ? { ...p, defect: next } : p)))
        const { error } = await supabase.from("floor_plan_pins").update({ defect: next }).eq("id", pin.id)
        if (error) {
            updatePins(planId, (pins) => pins.map((p) => (p.id === pin.id ? { ...p, defect: pin.defect } : p)))
            toast.error("変えられませんでした。電波のある所でもう一度")
        }
    }

    const addPin = async (e: MouseEvent<HTMLDivElement>) => {
        if (openPin) {
            setOpenPin(null)
            return
        }
        if (!plan) return
        if (!kind) {
            toast.message("下の設備を選んでから、図をタップ")
            return
        }
        const rect = surface.current?.getBoundingClientRect()
        if (!rect || rect.width === 0 || rect.height === 0) return
        const x = clamp01((e.clientX - rect.left) / rect.width)
        const y = clamp01((e.clientY - rect.top) / rect.height)
        const temp: BoardPin = { id: `tmp-${crypto.randomUUID()}`, kind, x, y, defect: false }
        const planId = plan.id
        updatePins(planId, (pins) => [...pins, temp])
        const { data, error } = await supabase.from("floor_plan_pins").insert({ floor_plan_id: planId, kind, x, y }).select("id").single()
        if (error || !data) {
            updatePins(planId, (pins) => pins.filter((p) => p.id !== temp.id))
            // ★電波が無い → 端末に覚えて、あとで送る（書けなければ「もう一度」）
            if (isOfflineError(error) && writePending(planId, [...readPending(planId), { tempId: temp.id, planId, kind, x, y, defect: false }])) {
                toast(`電波なし: ${KIND_BY_KEY[kind].label}を覚えました（あとで送ります）`, { duration: 2500 })
                return
            }
            toast.error("置けませんでした。電波のある所でもう一度")
            return
        }
        const saved: BoardPin = { ...temp, id: data.id as string }
        updatePins(planId, (pins) => pins.map((p) => (p.id === temp.id ? saved : p)))
        toast(`${KIND_BY_KEY[kind].label}を置きました`, {
            duration: 2500,
            action: { label: "取り消す", onClick: () => void removePin(planId, saved) },
        })
    }

    return (
        <div className="space-y-3">
            <h1 className="text-xl font-bold text-slate-900">見取り図</h1>

            {/* 階（★横に流して選ぶ・印がある階は数を出す） */}
            <div className="-mx-4 overflow-x-auto px-4" role="group" aria-label="階">
                <div className="flex gap-2 pb-1">
                    {floors.map((f) => {
                        const n = pinCount(f)
                        const has = plans.some((p) => p.floor === f)
                        return (
                            <button
                                key={f}
                                type="button"
                                aria-pressed={floor === f}
                                onClick={() => chooseFloor(f)}
                                className={`inline-flex min-h-12 min-w-14 shrink-0 items-center justify-center gap-1 rounded-full border px-4 text-base font-bold transition-colors ${
                                    floor === f
                                        ? "border-blue-600 bg-blue-600 text-white"
                                        : has
                                            ? "border-blue-300 bg-blue-50 text-blue-800"
                                            : "border-slate-300 bg-white text-slate-600"
                                }`}
                            >
                                {f}
                                {n > 0 && <span className={`rounded-full px-1.5 text-xs ${floor === f ? "bg-white/25" : "bg-blue-100"}`}>{n}</span>}
                            </button>
                        )
                    })}
                </div>
            </div>

            <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = "" }} />
            <input ref={library} type="file" accept="image/*" className="hidden" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = "" }} />

            {!plan ? (
                <div className="space-y-3 rounded-xl border-2 border-dashed border-slate-300 bg-white p-6 text-center">
                    <p className="text-base font-bold text-slate-700">{floor} の見取り図はまだありません</p>
                    <p className="text-sm text-slate-500">階の避難経路図などを撮る</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                        <button
                            type="button"
                            onClick={() => camera.current?.click()}
                            disabled={busy}
                            aria-busy={busy}
                            className="inline-flex min-h-14 items-center justify-center gap-2 rounded-lg bg-red-600 px-5 text-lg font-bold text-white hover:bg-red-700 disabled:cursor-wait"
                        >
                            {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Camera className="h-5 w-5" aria-hidden="true" />}
                            撮る
                        </button>
                        <button
                            type="button"
                            onClick={() => library.current?.click()}
                            disabled={busy}
                            className="inline-flex min-h-14 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-5 text-lg font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-wait"
                        >
                            <ImagePlus className="h-5 w-5" aria-hidden="true" />
                            写真から
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    {pendingCount > 0 && (
                        <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900" role="status">
                            <span className="flex items-center gap-2">
                                <CloudOff className="h-5 w-5 shrink-0" aria-hidden="true" />
                                まだ送っていない印 {pendingCount} 個
                            </span>
                            <button
                                type="button"
                                onClick={() => void flush(true)}
                                disabled={sending}
                                aria-busy={sending}
                                className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-amber-600 px-3 text-white disabled:cursor-wait"
                            >
                                {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                                いま送る
                            </button>
                        </div>
                    )}
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex gap-1" role="group" aria-label="大きさ">
                            {ZOOMS.map((z) => (
                                <button
                                    key={z}
                                    type="button"
                                    aria-pressed={zoom === z}
                                    onClick={() => setZoom(z)}
                                    className={`min-h-11 rounded-lg border px-3 text-sm font-bold ${zoom === z ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300 bg-white text-slate-700"}`}
                                >
                                    {z === 1 ? "全体" : `${z}倍`}
                                </button>
                            ))}
                        </div>
                        <button
                            type="button"
                            onClick={() => camera.current?.click()}
                            disabled={busy}
                            aria-busy={busy}
                            className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-wait"
                        >
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RotateCcw className="h-4 w-4" aria-hidden="true" />}
                            撮り直す
                        </button>
                    </div>

                    <div className="max-h-[65vh] overflow-auto rounded-lg border border-slate-200 bg-white">
                        {/* ★幅を倍にして拡大（印は 0〜1 の位置なので一緒に動く） */}
                        <div
                            ref={surface}
                            onClick={addPin}
                            className={`relative select-none ${kind ? "cursor-crosshair" : ""}`}
                            style={{ width: `${zoom * 100}%`, aspectRatio: `${plan.width} / ${plan.height}` }}
                        >
                            {plan.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element -- 非公開の置き場の期限つき URL（next/image の最適化に通さない）
                                <img src={plan.imageUrl} alt={`${floor} の見取り図`} draggable={false} className="pointer-events-none h-full w-full object-contain" />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center bg-slate-100 text-sm text-slate-500">写真を読み込めませんでした（撮り直してください）</div>
                            )}
                            {shownPins.map((p) => {
                                const info = KIND_BY_KEY[p.kind]
                                const open = openPin === p.id
                                return (
                                    <div key={p.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}>
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); setOpenPin(open ? null : p.id) }}
                                            className={`flex h-10 w-10 items-center justify-center rounded-full ${p.id.startsWith("tmp-") && !p.pending ? "opacity-60" : ""}`}
                                            aria-label={`${info.label}の印${p.defect ? "（不良）" : ""}${p.pending ? "（まだ送っていない）" : ""}`}
                                        >
                                            <PinMark info={info} defect={p.defect} pending={p.pending} />
                                        </button>
                                        {open && (
                                            <div className="absolute left-1/2 top-full z-10 mt-1 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                                                <span className="px-2 text-sm font-bold text-slate-700">{info.label}</span>
                                                <button
                                                    type="button"
                                                    aria-pressed={p.defect}
                                                    onClick={(e) => { e.stopPropagation(); void toggleDefect(plan.id, p) }}
                                                    className={`inline-flex min-h-11 items-center gap-1 rounded-md px-3 text-sm font-bold ${
                                                        p.defect ? "bg-red-600 text-white" : "border border-red-300 bg-white text-red-700"
                                                    }`}
                                                >
                                                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                                                    不良
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); void removePin(plan.id, p) }}
                                                    className="inline-flex min-h-11 items-center gap-1 rounded-md bg-red-50 px-3 text-sm font-bold text-red-700"
                                                >
                                                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                                                    消す
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); setOpenPin(null) }}
                                                    className="inline-flex h-11 w-11 items-center justify-center rounded-md text-slate-500"
                                                    aria-label="閉じる"
                                                >
                                                    <X className="h-4 w-4" aria-hidden="true" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* 設備のボタン（★画面の下に固定・押したものが選ばれたまま＝続けて置ける） */}
                    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur">
                        <p className="px-4 pb-1 text-center text-sm font-bold text-slate-700" aria-live="polite">
                            {kind ? `図をタップして「${KIND_BY_KEY[kind].label}」を置く` : "設備を選んで、図をタップ"}
                        </p>
                        <div className="overflow-x-auto px-3">
                            {/* ★右に余白（右下の相談ボタンに最後のボタンが隠れないよう、横に送って出せるように） */}
                            <div className="mx-auto flex w-max gap-2 pr-16" role="group" aria-label="設備">
                                {palette.map((k) => (
                                    <button
                                        key={k.key}
                                        type="button"
                                        aria-pressed={kind === k.key}
                                        onClick={() => setKind(kind === k.key ? null : k.key)}
                                        className={`relative flex min-h-16 w-[4.5rem] shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 px-1 text-xs font-bold ${
                                            kind === k.key ? "border-slate-900 bg-slate-100 text-slate-900" : "border-slate-200 bg-white text-slate-700"
                                        }`}
                                    >
                                        <PinMark info={k} />
                                        <span className="leading-tight">{k.label}</span>
                                        {counts[k.key] ? (
                                            <span className="absolute right-1 top-1 rounded-full bg-slate-800 px-1.5 text-[11px] text-white">{counts[k.key]}</span>
                                        ) : null}
                                    </button>
                                ))}
                                {more.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setShowMore((v) => !v)}
                                        className="flex min-h-16 w-[4.5rem] shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white text-sm font-bold text-slate-600"
                                    >
                                        {showMore ? "閉じる" : "ほか"}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
