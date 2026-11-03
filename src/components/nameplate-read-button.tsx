"use client"

import { useCallback, useEffect, useId, useRef, useState } from "react"
import { AlertTriangle, CheckCircle2, CircleHelp, Loader2, ScanLine, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CODE_INPUT_PROPS } from "@/lib/code-input-props"
import {
    NAMEPLATE_MAX_SIDE,
    NAMEPLATE_UPLOAD_MAX_BYTES,
    type NameplatePurpose,
    type NameplateReadResponse,
    type NameplateStatusResponse,
} from "@/lib/nameplate-api"
import {
    NAMEPLATE_DIALOG_FIELDS,
    nameplateConfirmValues,
    nameplateInitialValues,
    nameplateTargetSize,
    type NameplateValues,
} from "@/lib/nameplate-apply"
import { NAMEPLATE_PROVIDER_LABEL, deviceModelText, type NameplateFieldConsensus } from "@/lib/nameplate-consensus"
import { NAMEPLATE_FIELDS, type NameplateFieldKey } from "@/lib/nameplate-reading"

/**
 * 「銘板を撮って読む」（2026-11-03・docs/銘板の読み取り_使いながら学ぶ_設計_20261103.md）。
 *   1. 撮る（写真を選んでもよい）→ ブラウザで長い辺 1568px の JPEG に縮める（★撮影場所などの付帯情報は落ちる）
 *   2. サーバが 3 つの AI に読ませて多数決 → 欄ごとに 緑（そろった）／黄（割れた・確かめて）／灰（読めなかった）
 *   3. 点検者が銘板と見比べて直し、「この値で入れる」→ 欄に入る。★このときの値を答えとして記録する
 * ★スイッチ（NAMEPLATE_AI）が off の間はボタンを出さない（画面は今のまま）。
 * ★消防署へ出す書類なので、AI の値だけで欄を埋めて保存しない（必ずこの画面で確かめてから入れる）。
 */

const FIELD_LABEL = Object.fromEntries(NAMEPLATE_FIELDS.map((f) => [f.key, f.label])) as Record<NameplateFieldKey, string>
const CODE_FIELDS: readonly NameplateFieldKey[] = ["model", "approval_number", "serial_number"]

// ---- 使えるか（★画面に同じボタンが何個あっても 1 回だけ聞く） ----
let statusPromise: Promise<NameplateStatusResponse> | null = null
function loadNameplateStatus(): Promise<NameplateStatusResponse> {
    statusPromise ??= fetch("/api/nameplate/status", { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<NameplateStatusResponse>) : { enabled: false as const }))
        .catch(() => {
            statusPromise = null
            return { enabled: false as const }
        })
    return statusPromise
}

export /** 読み取りのあとに覚え直す（★あとから開いた画面が古い枚数で出さないように） */
function rememberNameplateUsage(used: number, cap: number) {
    statusPromise = Promise.resolve({ enabled: true, used, cap })
}

/** 使えるか（null = 聞いている途中・使えない）と、今月の上限に達したか */
export function useNameplateStatus(): { enabled: boolean; full: boolean; cap: number } {
    const [status, setStatus] = useState<NameplateStatusResponse | null>(null)
    useEffect(() => {
        let alive = true
        loadNameplateStatus().then((s) => {
            if (alive) setStatus(s)
        })
        return () => {
            alive = false
        }
    }, [])
    if (!status || !status.enabled) return { enabled: false, full: false, cap: 0 }
    return { enabled: true, full: status.used >= status.cap, cap: status.cap }
}

/** ★上限に達したらボタンの代わりに出す（設計 5.） */
function QuotaFullNote({ cap }: { cap: number }) {
    return <p className="text-xs text-slate-500">今月の銘板の読み取りは上限（{cap} 枚）に達しました。手で入れてください。</p>
}

// ---- 写真を縮める（★EXIF の向きは createImageBitmap が直す。canvas から出すと付帯情報は残らない） ----
async function shrinkPhoto(file: File): Promise<Blob> {
    let source: ImageBitmap | HTMLImageElement
    let width: number
    let height: number
    if (typeof createImageBitmap === "function") {
        const bmp = await createImageBitmap(file, { imageOrientation: "from-image" })
        source = bmp
        width = bmp.width
        height = bmp.height
    } else {
        const url = URL.createObjectURL(file)
        try {
            const img = new Image()
            img.src = url
            await img.decode()
            source = img
            width = img.naturalWidth
            height = img.naturalHeight
        } finally {
            URL.revokeObjectURL(url)
        }
    }
    const size = nameplateTargetSize(width, height, NAMEPLATE_MAX_SIDE)
    const canvas = document.createElement("canvas")
    canvas.width = size.width
    canvas.height = size.height
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("canvas")
    ctx.drawImage(source, 0, 0, size.width, size.height)
    if ("close" in source) source.close()
    for (const quality of [0.85, 0.7, 0.5]) {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality))
        if (blob && blob.size <= NAMEPLATE_UPLOAD_MAX_BYTES) return blob
    }
    throw new Error("too_large")
}

type Read = Extract<NameplateReadResponse, { ok: true }>
type State =
    | { kind: "closed" }
    | { kind: "reading" }
    | { kind: "error"; message: string; retry: boolean }
    | { kind: "result"; read: Read; values: NameplateValues }

export type NameplateReadButtonProps = {
    purpose: NameplatePurpose
    /** ボタンの前に付ける機器の名前（例：「受信機」→「受信機の銘板を撮って読む」） */
    device?: string
    /** 「この値で入れる」で呼ぶ。★画面に出した欄だけが入る（空の欄も "" で渡す） */
    onApply: (values: NameplateValues) => void
    /** NameplatePairButtons の中（★上限の知らせは組で 1 つだけ出すので、ここでは出さない） */
    inGroup?: boolean
}

/**
 * 様式の「製造者名」「型式等」の組ごとのボタン（例：ポンプ・電動機）。★スイッチが off なら何も出さない（囲みも出さない）。
 * apply には 製造者名 と 型式等（「型式（型式番号）」・転記の Q2）を渡す。★空なら "" のまま渡すので、呼ぶ側で今の値を残す。
 */
export function NameplatePairButtons({ pairs }: { pairs: readonly { key: string; device: string; apply: (maker: string, model: string) => void }[] }) {
    const { enabled, full, cap } = useNameplateStatus()
    if (!enabled || pairs.length === 0) return null
    if (full) return <QuotaFullNote cap={cap} />
    return (
        <div className="flex flex-wrap gap-2">
            {pairs.map((p) => (
                <NameplateReadButton
                    key={p.key}
                    inGroup
                    purpose="device"
                    device={p.device}
                    onApply={(r) => p.apply(r.maker ?? "", deviceModelText(r.model, r.approval_number))}
                />
            ))}
        </div>
    )
}

export default function NameplateReadButton({ purpose, device, onApply, inGroup = false }: NameplateReadButtonProps) {
    const { enabled, full, cap } = useNameplateStatus()
    const fileRef = useRef<HTMLInputElement>(null)
    const closeRef = useRef<HTMLButtonElement>(null)
    const titleId = useId()
    const [state, setState] = useState<State>({ kind: "closed" })
    const keys = NAMEPLATE_DIALOG_FIELDS[purpose]
    const title = device ? `${device}の銘板を撮って読む` : "銘板を撮って読む"

    const close = useCallback(() => setState({ kind: "closed" }), [])

    // 開いている間は後ろを動かさない・Esc で閉じる（★読んでいる途中は閉じない）
    const isOpen = state.kind !== "closed"
    const busy = state.kind === "reading"
    useEffect(() => {
        if (!isOpen) return
        const prev = document.body.style.overflow
        document.body.style.overflow = "hidden"
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !busy) close()
        }
        window.addEventListener("keydown", onKey)
        return () => {
            document.body.style.overflow = prev
            window.removeEventListener("keydown", onKey)
        }
    }, [isOpen, busy, close])
    useEffect(() => {
        if (state.kind === "result" || state.kind === "error") closeRef.current?.focus()
    }, [state.kind])

    const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        e.target.value = ""
        if (!file) return
        setState({ kind: "reading" })
        let photo: Blob
        try {
            photo = await shrinkPhoto(file)
        } catch {
            setState({ kind: "error", message: "写真を開けませんでした。別の写真で試すか、手で入れてください。", retry: true })
            return
        }
        const form = new FormData()
        form.append("purpose", purpose)
        form.append("photo", photo, "nameplate.jpg")
        let res: NameplateReadResponse
        try {
            const r = await fetch("/api/nameplate/read", { method: "POST", body: form })
            res = (await r.json()) as NameplateReadResponse
        } catch {
            setState({ kind: "error", message: "読み取りに失敗しました（電波の届く所でもう一度試すか、手で入れてください）。", retry: true })
            return
        }
        if (!res.ok) {
            // ★上限に達したら、次に開く画面で聞き直す（ボタンの代わりに知らせを出す）
            if (res.error === "quota") statusPromise = null
            // ★上限・止めてある・ログイン切れは撮り直しても同じなので「撮り直す」を出さない
            setState({ kind: "error", message: res.message, retry: res.error === "failed" || res.error === "bad_request" })
            return
        }
        rememberNameplateUsage(res.used, res.cap)
        setState({ kind: "result", read: res, values: nameplateInitialValues(res.consensus, keys) })
    }

    const apply = () => {
        if (state.kind !== "result") return
        const { read, values } = state
        onApply(Object.fromEntries(keys.map((k) => [k, (values[k] ?? "").trim()])) as NameplateValues)
        // ★答え合わせの記録は待たない（失敗しても入力は止めない）
        void fetch("/api/nameplate/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: read.id, values: nameplateConfirmValues(values, keys) }),
        }).catch(() => {})
        toast.success("読み取った値を入れました。保存の前に、もう一度見比べてください。")
        close()
    }

    const setValue = (k: NameplateFieldKey, v: string) =>
        setState((s) => (s.kind === "result" ? { ...s, values: { ...s.values, [k]: v } } : s))

    if (!enabled) return null
    if (full && !isOpen) return inGroup ? null : <QuotaFullNote cap={cap} />

    return (
        <>
            <Button
                type="button"
                variant="outline"
                className="min-h-11 gap-2 border-slate-300"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                aria-busy={busy}
            >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ScanLine className="h-4 w-4" aria-hidden="true" />}
                {title}
            </Button>
            {/* ★capture を付けない（撮るか、撮ってある写真を選ぶかを端末が聞く） */}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />

            {isOpen && (
                <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="fixed inset-0 z-[80] flex flex-col bg-white sm:bg-slate-900/40 sm:p-6">
                    <div className="flex min-h-0 flex-1 flex-col bg-white sm:mx-auto sm:w-full sm:max-w-xl sm:rounded-xl sm:shadow-xl">
                        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
                            <p id={titleId} className="min-w-0 flex-1 truncate font-medium text-slate-800">
                                {title}
                            </p>
                            {!busy && (
                                <Button ref={closeRef} type="button" variant="ghost" size="sm" className="min-h-11 px-3" onClick={close}>
                                    <X className="h-5 w-5" aria-hidden="true" />
                                    <span className="ml-1">{state.kind === "result" ? "入れずに閉じる" : "閉じる"}</span>
                                </Button>
                            )}
                        </div>

                        <div className="flex-1 overflow-auto px-4 py-4">
                            {state.kind === "reading" && (
                                <p className="flex flex-col items-center justify-center gap-3 py-16 text-center text-slate-700" role="status">
                                    <Loader2 className="h-8 w-8 animate-spin text-slate-500" aria-hidden="true" />
                                    <span>3 つの AI で読んでいます（10〜30 秒）</span>
                                </p>
                            )}
                            {state.kind === "error" && (
                                <div className="space-y-4">
                                    <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                                        {state.message}
                                    </p>
                                    {state.retry && (
                                        <Button type="button" variant="outline" className="min-h-11 gap-2" onClick={() => fileRef.current?.click()}>
                                            <ScanLine className="h-4 w-4" aria-hidden="true" />
                                            撮り直す
                                        </Button>
                                    )}
                                </div>
                            )}
                            {state.kind === "result" && (
                                <ResultBody read={state.read} values={state.values} keys={keys} onChange={setValue} />
                            )}
                        </div>

                        {state.kind === "result" && (
                            <div className="border-t border-slate-200 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                                <Button type="button" className="h-auto min-h-12 w-full text-base font-bold" onClick={apply}>
                                    この値で入れる
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    )
}

function ResultBody({
    read,
    values,
    keys,
    onChange,
}: {
    read: Read
    values: NameplateValues
    keys: readonly NameplateFieldKey[]
    onChange: (k: NameplateFieldKey, v: string) => void
}) {
    const answered = read.providers.filter((p) => p.ok).map((p) => p.label)
    const failed = read.providers.filter((p) => !p.ok).map((p) => p.label)
    const shownWarnings = read.consensus.warnings.filter((w) => keys.some((k) => w.startsWith(`${FIELD_LABEL[k]}:`)))
    return (
        <div className="space-y-5">
            <p className="text-sm font-medium text-slate-800">銘板と見比べて、違う所を直してから入れてください。</p>

            {shownWarnings.length > 0 && (
                <ul className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                    {shownWarnings.map((w) => (
                        <li key={w} className="flex items-start gap-2">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                            <span>{w}</span>
                        </li>
                    ))}
                </ul>
            )}

            {keys.map((k) => (
                <FieldRow key={k} field={k} c={read.consensus.fields[k]} value={values[k] ?? ""} onChange={(v) => onChange(k, v)} />
            ))}

            <p className="text-xs text-slate-500">
                答えた AI：{answered.length ? answered.join("・") : "なし"}
                {failed.length > 0 && `（${failed.join("・")} は答えられませんでした）`}
                ／今月 {read.used} / {read.cap} 枚
            </p>
        </div>
    )
}

function FieldRow({ field, c, value, onChange }: { field: NameplateFieldKey; c: NameplateFieldConsensus | undefined; value: string; onChange: (v: string) => void }) {
    const id = useId()
    const status = c?.status ?? "none"
    const warn = status === "split" || (c?.warning ?? false)
    const badge =
        status === "none"
            ? { text: "読めなかった", cls: "bg-slate-100 text-slate-600", Icon: CircleHelp }
            : warn
              ? { text: status === "split" ? "意見が分かれた" : "確かめて", cls: "bg-amber-100 text-amber-800", Icon: AlertTriangle }
              : { text: "そろった", cls: "bg-emerald-100 text-emerald-800", Icon: CheckCircle2 }
    const others = (c?.candidates ?? []).filter((x) => x.value.trim() !== value.trim())
    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
                <Label htmlFor={id}>{FIELD_LABEL[field]}</Label>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
                    <badge.Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {badge.text}
                </span>
            </div>
            <Input
                id={id}
                {...(CODE_FIELDS.includes(field) ? CODE_INPUT_PROPS : {})}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={warn ? "border-amber-400" : status === "agreed" ? "border-emerald-400" : undefined}
            />
            {others.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                    <span>{status === "none" ? "候補：" : "ほかの答え："}</span>
                    {others.map((x) => (
                        <button
                            key={x.value}
                            type="button"
                            onClick={() => onChange(x.value)}
                            className="min-h-9 rounded-md border border-slate-300 bg-white px-2.5 text-slate-800 hover:bg-slate-50"
                            title={x.providers.map((p) => NAMEPLATE_PROVIDER_LABEL[p]).join("・")}
                        >
                            {x.value}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
