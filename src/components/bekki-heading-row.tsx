import { bekkiHeadingText } from "@/lib/bekki-heading-row"

/**
 * 別記の入力画面の見出し行（src/lib/bekki-heading-row.ts）。入力欄を出さない。
 * ★紙では全幅の見出しで、route は描かない。ここで欄を出すと、入れた値が黙って消える。
 */
export function BekkiHeadingTableRow({ label }: { label: string }) {
    return (
        <tr>
            <td colSpan={5} className="p-2 border bg-slate-100 text-sm font-semibold text-slate-700">
                {bekkiHeadingText(label)}
                <span className="ml-2 text-xs font-normal text-slate-500">（見出しのため入力はありません）</span>
            </td>
        </tr>
    )
}

export function BekkiHeadingCard({ label }: { label: string }) {
    return (
        <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">
            {bekkiHeadingText(label)}
            <span className="ml-2 text-xs font-normal text-slate-500">（見出しのため入力はありません）</span>
        </div>
    )
}
