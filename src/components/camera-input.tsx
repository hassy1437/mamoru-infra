"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Camera, X, Trash2, StickyNote } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    savePhoto,
    getPhotos,
    deletePhoto,
    type LocalPhoto,
} from "@/lib/local-draft"

interface CameraInputProps {
    itiranId: string
}

export default function CameraInput({ itiranId }: CameraInputProps) {
    const [photos, setPhotos] = useState<LocalPhoto[]>([])
    const [showCamera, setShowCamera] = useState(false)
    const [preview, setPreview] = useState<string | null>(null)
    const videoRef = useRef<HTMLVideoElement>(null)
    const streamRef = useRef<MediaStream | null>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)

    // Load existing photos
    useEffect(() => {
        getPhotos(itiranId).then(setPhotos).catch(() => {})
    }, [itiranId])

    const startCamera = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
            })
            streamRef.current = stream
            if (videoRef.current) {
                videoRef.current.srcObject = stream
            }
            setShowCamera(true)
        } catch {
            // Fallback to file input if camera not available
            const input = document.createElement("input")
            input.type = "file"
            input.accept = "image/*"
            input.capture = "environment"
            input.onchange = async (e) => {
                const file = (e.target as HTMLInputElement).files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = () => {
                    if (typeof reader.result === "string") {
                        saveAndAddPhoto(reader.result)
                    }
                }
                reader.readAsDataURL(file)
            }
            input.click()
        }
    }, [itiranId])

    const stopCamera = useCallback(() => {
        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        setShowCamera(false)
        setPreview(null)
    }, [])

    const capture = useCallback(() => {
        const video = videoRef.current
        const canvas = canvasRef.current
        if (!video || !canvas) return

        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext("2d")
        if (!ctx) return
        ctx.drawImage(video, 0, 0)
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8)
        setPreview(dataUrl)
    }, [])

    const saveAndAddPhoto = useCallback(
        async (dataUrl: string) => {
            const photo: LocalPhoto = {
                id: `photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                itiranId,
                dataUrl,
                note: "",
                createdAt: new Date().toISOString(),
            }
            await savePhoto(photo)
            setPhotos((prev) => [...prev, photo])
        },
        [itiranId]
    )

    const confirmCapture = useCallback(async () => {
        if (!preview) return
        await saveAndAddPhoto(preview)
        setPreview(null)
    }, [preview, saveAndAddPhoto])

    const handleDeletePhoto = useCallback(async (id: string) => {
        await deletePhoto(id)
        setPhotos((prev) => prev.filter((p) => p.id !== id))
    }, [])

    const updatePhotoNote = useCallback(async (id: string, note: string) => {
        setPhotos((prev) =>
            prev.map((p) => (p.id === id ? { ...p, note } : p))
        )
        const photo = photos.find((p) => p.id === id)
        if (photo) {
            await savePhoto({ ...photo, note })
        }
    }, [photos])

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                    <Camera className="w-4 h-4" />
                    点検写真
                </h3>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={showCamera ? stopCamera : startCamera}
                    className="text-xs"
                >
                    {showCamera ? (
                        <>
                            <X className="w-3.5 h-3.5 mr-1" />
                            カメラを閉じる
                        </>
                    ) : (
                        <>
                            <Camera className="w-3.5 h-3.5 mr-1" />
                            写真を撮影
                        </>
                    )}
                </Button>
            </div>

            {/* Camera view */}
            {showCamera && (
                <div className="relative rounded-lg overflow-hidden border border-slate-200 bg-black">
                    {preview ? (
                        <>
                            <img src={preview} alt="プレビュー" className="w-full" />
                            <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-3">
                                <Button
                                    type="button"
                                    size="sm"
                                    className="bg-emerald-600 hover:bg-emerald-700"
                                    onClick={confirmCapture}
                                >
                                    保存する
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => setPreview(null)}
                                >
                                    撮り直す
                                </Button>
                            </div>
                        </>
                    ) : (
                        <>
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                muted
                                className="w-full"
                            />
                            <div className="absolute bottom-3 left-0 right-0 flex justify-center">
                                <button
                                    type="button"
                                    onClick={capture}
                                    className="w-16 h-16 rounded-full border-4 border-white bg-white/30 backdrop-blur-sm hover:bg-white/50 transition-colors"
                                    aria-label="撮影"
                                />
                            </div>
                        </>
                    )}
                    <canvas ref={canvasRef} className="hidden" />
                </div>
            )}

            {/* Photo gallery */}
            {photos.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {photos.map((photo) => (
                        <div
                            key={photo.id}
                            className="relative group rounded-lg overflow-hidden border border-slate-200 bg-slate-50"
                        >
                            <img
                                src={photo.dataUrl}
                                alt={photo.note || "点検写真"}
                                className="w-full h-32 object-cover"
                            />
                            <button
                                type="button"
                                onClick={() => handleDeletePhoto(photo.id)}
                                className="absolute top-1.5 right-1.5 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                aria-label="削除"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <div className="p-1.5">
                                <div className="flex items-center gap-1">
                                    <StickyNote className="w-3 h-3 text-slate-400 shrink-0" />
                                    <Input
                                        value={photo.note}
                                        onChange={(e) => updatePhotoNote(photo.id, e.target.value)}
                                        placeholder="メモ..."
                                        className="h-7 text-xs border-0 bg-transparent px-1 focus-visible:ring-0"
                                    />
                                </div>
                                <p className="text-[10px] text-slate-400 px-1">
                                    {new Date(photo.createdAt).toLocaleString("ja-JP")}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {photos.length === 0 && !showCamera && (
                <p className="text-xs text-slate-400 text-center py-3 border border-dashed border-slate-200 rounded-lg">
                    まだ写真がありません。「写真を撮影」ボタンで点検箇所を撮影できます。
                </p>
            )}
        </div>
    )
}
