import { createClient } from "@/lib/supabase/client"
import { FINALIZE_NOT_CONTRACTED_MESSAGE, finalizeBlockedMessage, PDF_GATE_MESSAGE } from "@/lib/finalization"

/**
 * ★点検票（別記様式）の PDF をダウンロードしてよいか（K2・業務提携規約 第12条2項・3項・2026-10-17 の読み合わせ）。
 *   以前は点検票だけ確定の前でもダウンロードできた（総括表・点検者一覧は確定してから）。
 *   ダウンロードしてよければ null、だめなら案内の文を返す。
 *
 * ■ ★判定できないときは通す（canDownloadPdf と同じ fail-open）
 *   確定の仕組みが読めないときに止めると、確定しようがないのに PDF が出せない ―― 本番が止まる。
 * ■ ★プレビューは止めない（「確定する前でもプレビューで内容は確かめられる」の約束どおり）
 */
export async function soukatsuPdfGate(soukatsuId: string): Promise<string | null> {
    const supabase = createClient()
    const { data, error } = await supabase.rpc("is_finalized", { p_soukatsu_id: soukatsuId })
    if (error) {
        console.error("[soukatsuPdfGate] is_finalized failed:", error)
        return null
    }
    if (data === true) return null
    // ★確定できない理由があれば、「確定してから」ではなくその理由を出す（できないことを求めない）
    const [blocked, notContracted] = await Promise.all([
        supabase.rpc("finalize_blocked_since"),
        supabase.rpc("finalize_not_contracted"),
    ])
    const since = !blocked.error && typeof blocked.data === "string" ? blocked.data : null
    if (since) return finalizeBlockedMessage(since)
    if (!notContracted.error && notContracted.data === true) return FINALIZE_NOT_CONTRACTED_MESSAGE
    return PDF_GATE_MESSAGE
}
