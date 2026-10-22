/**
 * 免状の種類（点検者の登録画面の表の行・点検者一覧の行）。
 * ★2026-10-22: license-editor.tsx から移した。PDF 出力の警告（点検者一覧）が「どの免状の行か」を
 *   画面と同じ表記で示すのに使う（ルートからも読む）。表記の全角空白は画面の表で字をそろえるため。
 */
export const SHOUBOU_TYPES = [
    { key: "toku",   label: "甲　種　特　類" },
    { key: "class1", label: "甲・乙種　１類" },
    { key: "class2", label: "甲・乙種　２類" },
    { key: "class3", label: "甲・乙種　３類" },
    { key: "class4", label: "甲・乙種　４類" },
    { key: "class5", label: "甲・乙種　５類" },
    { key: "class6", label: "乙　種　６　類" },
    { key: "class7", label: "乙　種　７　類" },
] as const

export const KENSA_TYPES = [
    { key: "toku",   label: "特　　　種" },
    { key: "class1", label: "第　１　種" },
    { key: "class2", label: "第　２　種" },
] as const
