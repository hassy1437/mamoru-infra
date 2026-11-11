import { notFound } from "next/navigation"

import Breadcrumb from "@/components/breadcrumb"
import FloorPlanBoard, { type BoardPlan } from "@/components/floor-plan-board"
import { getAuthenticatedClient } from "@/lib/supabase/auth-server"
import { floorsFor, isFloorPlanKind } from "@/lib/floor-plan-kinds"

/**
 * 物件の見取り図と設備の印（地図などの改善 6・2026-11-11）。
 * ★会社の人なら見られる（RLS・20261231170000）。写真は非公開の置き場から 1 時間だけの URL で出す
 */
export const metadata = { title: "消防設備プロット図 | Mamoru Infra" }

const SIGNED_URL_SECONDS = 60 * 60

export default async function FloorPlansPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ floor?: string }> }) {
    const { supabase } = await getAuthenticatedClient()
    const { id } = await params
    const { floor: wanted } = await searchParams

    const { data: property } = await supabase
        .from("properties")
        .select("id, building_name, floor_above, floor_below, equipment_types, company_id")
        .eq("id", id)
        .single()
    if (!property) return notFound()

    const { data: planRows } = await supabase
        .from("floor_plans")
        .select("id, floor, image_path, image_width, image_height")
        .eq("property_id", id)
    const rows = (planRows ?? []) as { id: string; floor: string; image_path: string; image_width: number; image_height: number }[]

    const { data: pinRows } = rows.length
        ? await supabase.from("floor_plan_pins").select("id, floor_plan_id, kind, x, y, defect").in("floor_plan_id", rows.map((r) => r.id))
        : { data: [] }
    const pins = ((pinRows ?? []) as { id: string; floor_plan_id: string; kind: string; x: number; y: number; defect: boolean | null }[]).filter((p) => isFloorPlanKind(p.kind))

    // ★写真は 1 時間だけの URL（置き場は非公開）
    const signed = rows.length
        ? (await supabase.storage.from("floor-plans").createSignedUrls(rows.map((r) => r.image_path), SIGNED_URL_SECONDS)).data ?? []
        : []
    const urlOf = new Map(signed.map((s) => [s.path, s.signedUrl]))

    const plans: BoardPlan[] = rows.map((r) => ({
        id: r.id,
        floor: r.floor,
        imagePath: r.image_path,
        imageUrl: urlOf.get(r.image_path) ?? null,
        width: r.image_width,
        height: r.image_height,
        pins: pins.filter((p) => p.floor_plan_id === r.id).map((p) => ({ id: p.id, kind: p.kind as BoardPlan["pins"][number]["kind"], x: p.x, y: p.y, defect: Boolean(p.defect) })),
    }))
    const floors = floorsFor(property.floor_above, property.floor_below, rows.map((r) => r.floor))
    const initialFloor = wanted && floors.includes(wanted) ? wanted : floors.includes("1F") ? "1F" : floors[0]

    return (
        <main className="min-h-screen bg-gray-50 pb-40 pt-6">
            <div className="mx-auto max-w-4xl space-y-4 px-4">
                <Breadcrumb items={[
                    { label: "物件一覧", href: "/properties" },
                    { label: property.building_name ?? "物件", href: `/properties/${id}` },
                    { label: "消防設備プロット図" },
                ]} />
                <FloorPlanBoard
                    propertyId={id}
                    companyId={property.company_id as string}
                    equipmentTypes={(property.equipment_types ?? []) as string[]}
                    floors={floors}
                    initialFloor={initialFloor}
                    plans={plans}
                />
            </div>
        </main>
    )
}
