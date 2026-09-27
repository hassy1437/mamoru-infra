import type { ReactNode } from "react"
import WorkMinuteMarker from "@/components/work-minute-marker"

/**
 * /inspection/[id]/ 以下（総括表・一覧・別記・出力）の共通の枠。
 * ★作業中の 1 分ごとの印を置くためだけのもの（画面には何も足さない）。
 *   ★layout なので、一覧 → 別記と移っても印の部品は作り直されず、60 秒ごとの見張りが続く。
 *   ★総括表の持ち主かどうかは DB の口（inspection.mark_work_minute）が見る。違えば黙って捨てる。
 */
export default async function InspectionReportLayout({
    children,
    params,
}: {
    children: ReactNode
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    return (
        <>
            {children}
            <WorkMinuteMarker soukatsuId={id} />
        </>
    )
}
