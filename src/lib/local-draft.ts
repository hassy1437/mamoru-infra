// IndexedDB wrapper for offline draft storage and photo storage

const DB_NAME = "mamoru-infra"
const DB_VERSION = 1
const DRAFT_STORE = "drafts"
const PHOTO_STORE = "photos"

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION)
        req.onupgradeneeded = () => {
            const db = req.result
            if (!db.objectStoreNames.contains(DRAFT_STORE)) {
                db.createObjectStore(DRAFT_STORE)
            }
            if (!db.objectStoreNames.contains(PHOTO_STORE)) {
                db.createObjectStore(PHOTO_STORE, { keyPath: "id" })
            }
        }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
    })
}

// --- Draft storage ---

export async function saveDraftLocal(key: string, payload: unknown): Promise<void> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DRAFT_STORE, "readwrite")
        tx.objectStore(DRAFT_STORE).put(
            { payload, savedAt: new Date().toISOString() },
            key
        )
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
    })
}

export async function loadDraftLocal(key: string): Promise<{ payload: unknown; savedAt: string } | null> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DRAFT_STORE, "readonly")
        const req = tx.objectStore(DRAFT_STORE).get(key)
        req.onsuccess = () => resolve(req.result ?? null)
        req.onerror = () => reject(req.error)
    })
}

export async function deleteDraftLocal(key: string): Promise<void> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DRAFT_STORE, "readwrite")
        tx.objectStore(DRAFT_STORE).delete(key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
    })
}

// --- Photo storage ---

export interface LocalPhoto {
    id: string
    itiranId: string
    dataUrl: string
    note: string
    createdAt: string
}

export async function savePhoto(photo: LocalPhoto): Promise<void> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(PHOTO_STORE, "readwrite")
        tx.objectStore(PHOTO_STORE).put(photo)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
    })
}

export async function getPhotos(itiranId: string): Promise<LocalPhoto[]> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(PHOTO_STORE, "readonly")
        const req = tx.objectStore(PHOTO_STORE).getAll()
        req.onsuccess = () => {
            const all = (req.result ?? []) as LocalPhoto[]
            resolve(all.filter((p) => p.itiranId === itiranId))
        }
        req.onerror = () => reject(req.error)
    })
}

export async function deletePhoto(id: string): Promise<void> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(PHOTO_STORE, "readwrite")
        tx.objectStore(PHOTO_STORE).delete(id)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
    })
}
