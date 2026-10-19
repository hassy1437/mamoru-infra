"use client"

import { useEffect } from "react"

/**
 * URL の #id がこの欄を指していたら、欄が出たときにそこまで動かす（2026-10-19・本番の通しチェック D）。
 *
 * ■ ★なぜ要るか
 *   出力の画面の「総括表の画面で確定する」（/inspection/[id]#finalize）で移っても、確定の欄まで下がらなかった。
 *   総括表の画面は読み込み中の表示（loading.tsx）を挟んで中身を後から出すので、移った瞬間には #finalize がまだ無く、
 *   ブラウザ（と Next.js）が行き先を見失う。
 *   ＝ 行き先の欄の中に置き、欄が出た（この部品が画面に付いた）ときに自分で動かす。
 */
export default function ScrollToHash({ id }: { id: string }) {
    useEffect(() => {
        if (window.location.hash !== `#${id}`) return
        // ★描き終わってから（上のプレビューの枠などの高さが決まってから）
        const raf = requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }))
        return () => cancelAnimationFrame(raf)
    }, [id])
    return null
}
