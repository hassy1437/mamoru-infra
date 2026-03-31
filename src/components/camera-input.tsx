"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Camera, ImagePlus, Trash2, StickyNote } from "lucide-react"
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
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Load existing photos
    useEffect(() => {
        getPhotos(itiranId).then(setPhotos).catch(() => {})
    }, [itiranId])

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

    const handleFileChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = () => {
                if (typeof reader.result === "string") {
                    saveAndAddPhoto(reader.result)
                }
            }
            reader.readAsDataURL(file)
            // Reset so the same file can be selected again
            e.target.value = ""
        },
        [saveAndAddPhoto]
    )

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
                <div className="flex gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            if (fileInputRef.current) {
                                fileInputRef.current.capture = "environment"
                                fileInputRef.current.click()
                            }
                        }}
                        className="text-xs"
                    >
                        <Camera className="w-3.5 h-3.5 mr-1" />
                        写真を撮影
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            if (fileInputRef.current) {
                                fileInputRef.current.removeAttribute("capture")
                                fileInputRef.current.click()
                            }
                        }}
                        className="text-xs"
                    >
                        <ImagePlus className="w-3.5 h-3.5 mr-1" />
                        ファイル選択
                    </Button>
                </div>
            </div>

            {/* Hidden file input – capture attribute is set dynamically */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
            />

            {/* Photo gallery */}
            {photos.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {photos.map((photo) => (
                        <div
                            key={photo.id}
                            className="rounded-lg border border-slate-200 bg-slate-50"
                        >
                            <img
                                src={photo.dataUrl}
                                alt={photo.note || "点検写真"}
                                className="w-full h-32 object-cover rounded-t-lg"
                            />
                            <div className="p-1.5 space-y-1">
                                <div className="flex items-center gap-1">
                                    <StickyNote className="w-3 h-3 text-slate-400 shrink-0" />
                                    <Input
                                        value={photo.note}
                                        onChange={(e) => updatePhotoNote(photo.id, e.target.value)}
                                        placeholder="メモ..."
                                        className="h-7 text-xs border-0 bg-transparent px-1 focus-visible:ring-0"
                                    />
                                </div>
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] text-slate-400 px-1">
                                        {new Date(photo.createdAt).toLocaleString("ja-JP")}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => handleDeletePhoto(photo.id)}
                                        className="flex items-center gap-0.5 text-[11px] text-red-500 hover:text-red-700 px-1"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                        削除
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {photos.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-3 border border-dashed border-slate-200 rounded-lg">
                    まだ写真がありません。「写真を撮影」ボタンで点検箇所を撮影できます。
                </p>
            )}
        </div>
    )
}
